import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CabinetInvoice,
  CabinetPayment,
  InvoiceStatus,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { fromMillimes, multiplyRate, toMillimes } from '../common/money';
import { CreateInvoiceDto, RecordPaymentDto } from './dto';

@Injectable()
export class BillingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CabinetInvoice)
    private readonly invoices: Repository<CabinetInvoice>,
    @InjectRepository(CabinetPayment)
    private readonly payments: Repository<CabinetPayment>,
    private readonly dossiers: DossiersService,
  ) {}

  async list(organizationId: string, dossierId: string, userId: string) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const items = await this.invoices.find({
      where: { organizationId, dossierId },
      order: { issueDate: 'DESC', createdAtUtc: 'DESC' },
    });
    const today = new Date().toISOString().slice(0, 10);
    for (const item of items) {
      if (
        item.dueDate < today &&
        ![InvoiceStatus.Paid, InvoiceStatus.Cancelled].includes(item.status)
      )
        item.status = InvoiceStatus.Overdue;
    }
    return items;
  }

  async create(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateInvoiceDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    if (dto.dueDate < dto.issueDate)
      throw new BadRequestException(
        'L’échéance ne peut pas précéder la date de facture.',
      );
    const net = toMillimes(dto.netAmount);
    const vat = multiplyRate(net, dto.vatRate);
    const stamp = toMillimes(dto.stampDuty);
    const year = dto.issueDate.slice(0, 4);
    const count = await this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.organization_id = :organizationId', { organizationId })
      .andWhere('invoice.issue_date BETWEEN :from AND :to', {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
      })
      .getCount();
    return this.invoices.save(
      this.invoices.create({
        organizationId,
        dossierId,
        number: `HON-${year}-${String(count + 1).padStart(5, '0')}`,
        issueDate: dto.issueDate,
        dueDate: dto.dueDate,
        description: dto.description.trim(),
        netAmount: fromMillimes(net),
        vatRate: dto.vatRate,
        vatAmount: fromMillimes(vat),
        stampDuty: fromMillimes(stamp),
        totalAmount: fromMillimes(net + vat + stamp),
        paidAmount: '0.000',
        status: InvoiceStatus.Draft,
        notes: dto.notes?.trim() || null,
        createdByUserId: userId,
      }),
    );
  }

  async send(
    organizationId: string,
    dossierId: string,
    invoiceId: string,
    userId: string,
  ) {
    const item = await this.find(organizationId, dossierId, invoiceId, userId);
    if (item.status !== InvoiceStatus.Draft)
      throw new ConflictException('La facture n’est plus en brouillon.');
    item.status = InvoiceStatus.Sent;
    return this.invoices.save(item);
  }

  async recordPayment(
    organizationId: string,
    dossierId: string,
    invoiceId: string,
    userId: string,
    dto: RecordPaymentDto,
  ) {
    const item = await this.find(organizationId, dossierId, invoiceId, userId);
    if ([InvoiceStatus.Cancelled, InvoiceStatus.Draft].includes(item.status))
      throw new ConflictException(
        'La facture doit être envoyée avant son règlement.',
      );
    const amount = toMillimes(dto.amount);
    if (amount <= 0n)
      throw new BadRequestException('Le montant doit être positif.');
    const total = toMillimes(item.totalAmount);
    const paid = toMillimes(item.paidAmount);
    if (paid + amount > total)
      throw new BadRequestException(
        'Le règlement dépasse le solde de la facture.',
      );
    return this.dataSource.transaction(async (manager) => {
      await manager.save(
        manager.create(CabinetPayment, {
          organizationId,
          invoiceId,
          paymentDate: dto.paymentDate,
          amount: fromMillimes(amount),
          reference: dto.reference?.trim() || null,
          recordedByUserId: userId,
        }),
      );
      item.paidAmount = fromMillimes(paid + amount);
      item.status =
        paid + amount === total
          ? InvoiceStatus.Paid
          : InvoiceStatus.PartiallyPaid;
      return manager.save(item);
    });
  }

  async summary(organizationId: string, userId: string) {
    const accessible = await this.dossiers.list(organizationId, userId, {
      page: 1,
      pageSize: 100,
    });
    const ids = accessible.items.map((item) => item.id);
    if (!ids.length)
      return { billed: '0.000', paid: '0.000', outstanding: '0.000' };
    const result = await this.dataSource.query<
      Array<{ billed: string; paid: string }>
    >(
      `SELECT COALESCE(SUM(total_amount),0)::numeric(15,3) AS billed,
        COALESCE(SUM(paid_amount),0)::numeric(15,3) AS paid
       FROM accounting.cabinet_invoices
       WHERE organization_id=$1 AND dossier_id=ANY($2::uuid[]) AND status <> 'ANNULEE'`,
      [organizationId, ids],
    );
    const billed = toMillimes(result[0].billed);
    const paid = toMillimes(result[0].paid);
    return {
      billed: fromMillimes(billed),
      paid: fromMillimes(paid),
      outstanding: fromMillimes(billed - paid),
    };
  }

  private async find(
    organizationId: string,
    dossierId: string,
    id: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const item = await this.invoices.findOneBy({
      id,
      organizationId,
      dossierId,
    });
    if (!item) throw new NotFoundException('La facture est introuvable.');
    return item;
  }
}
