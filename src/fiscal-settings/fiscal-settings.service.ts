import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, IsNull, Repository } from 'typeorm';
import {
  FiscalParameter,
  FiscalParameterCode,
  IncomeTaxBracket,
  RegulatoryRule,
  VatRate,
  WithholdingTaxRate,
} from '../database/entities';
import { fromMillimes, multiplyRate, toMillimes } from '../common/money';
import {
  CreateFiscalParameterDto,
  CreateIncomeTaxScaleDto,
  CreateVatRateDto,
  CreateWithholdingRateDto,
} from './dto';

@Injectable()
export class FiscalSettingsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(FiscalParameter)
    private readonly parameters: Repository<FiscalParameter>,
    @InjectRepository(VatRate)
    private readonly vatRates: Repository<VatRate>,
    @InjectRepository(WithholdingTaxRate)
    private readonly withholdingRates: Repository<WithholdingTaxRate>,
    @InjectRepository(IncomeTaxBracket)
    private readonly incomeTaxBrackets: Repository<IncomeTaxBracket>,
    @InjectRepository(RegulatoryRule)
    private readonly regulatoryRules: Repository<RegulatoryRule>,
  ) {}

  listRegulatoryUpdates(date?: string) {
    const query = this.regulatoryRules
      .createQueryBuilder('rule')
      .orderBy('rule.effective_from', 'DESC')
      .addOrderBy('rule.article_reference', 'ASC');
    if (date) {
      this.validateDate(date);
      query
        .where('rule.effective_from <= :date', { date })
        .andWhere('(rule.effective_to IS NULL OR rule.effective_to >= :date)', {
          date,
        });
    }
    return query.getMany();
  }

  async snapshot(organizationId: string, date: string) {
    this.validateDate(date);
    const parameters = await Promise.all(
      Object.values(FiscalParameterCode).map(async (code) => {
        const item = await this.resolveParameter(
          organizationId,
          code,
          date,
          false,
        );
        return item ? this.parameterResponse(item) : null;
      }),
    );
    return {
      date,
      parameters: parameters.filter(Boolean),
      vatRates: await this.resolveVatRates(organizationId, date),
      withholdingRates: await this.resolveWithholdingRates(
        organizationId,
        date,
      ),
      incomeTaxBrackets: await this.resolveIncomeTaxBrackets(
        organizationId,
        date,
      ),
    };
  }

  listParameters(organizationId: string) {
    return this.parameters.find({
      where: [{ organizationId }, { organizationId: IsNull() }],
      order: { code: 'ASC', effectiveFrom: 'DESC' },
    });
  }

  listVatRates(organizationId: string) {
    return this.vatRates.find({
      where: [{ organizationId }, { organizationId: IsNull() }],
      order: { code: 'ASC', effectiveFrom: 'DESC' },
    });
  }

  listWithholdingRates(organizationId: string) {
    return this.withholdingRates.find({
      where: [{ organizationId }, { organizationId: IsNull() }],
      order: { natureCode: 'ASC', effectiveFrom: 'DESC' },
    });
  }

  listIncomeTaxBrackets(organizationId: string) {
    return this.incomeTaxBrackets.find({
      where: [{ organizationId }, { organizationId: IsNull() }],
      order: { effectiveFrom: 'DESC', lowerBound: 'ASC' },
    });
  }

  async createParameter(
    organizationId: string,
    userId: string,
    dto: CreateFiscalParameterDto,
  ) {
    await this.ensureNoOverlap(
      this.parameters,
      organizationId,
      'code',
      dto.code,
      dto.effectiveFrom,
      dto.effectiveTo ?? null,
    );
    return this.parameters.save(
      this.parameters.create({
        organizationId,
        ...dto,
        label: dto.label.trim(),
        effectiveTo: dto.effectiveTo ?? null,
        sourceLabel: dto.sourceLabel?.trim() || null,
        sourceUrl: dto.sourceUrl?.trim() || null,
        notes: dto.notes?.trim() || null,
        isSystem: false,
        createdByUserId: userId,
      }),
    );
  }

  async createVatRate(organizationId: string, dto: CreateVatRateDto) {
    const code = dto.code.trim().toUpperCase();
    await this.ensureNoOverlap(
      this.vatRates,
      organizationId,
      'code',
      code,
      dto.effectiveFrom,
      dto.effectiveTo ?? null,
    );
    return this.vatRates.save(
      this.vatRates.create({
        organizationId,
        code,
        label: dto.label.trim(),
        rate: dto.rate,
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo ?? null,
        sourceLabel: dto.sourceLabel?.trim() || null,
        sourceUrl: dto.sourceUrl?.trim() || null,
        isSystem: false,
      }),
    );
  }

  async createWithholdingRate(
    organizationId: string,
    dto: CreateWithholdingRateDto,
  ) {
    const natureCode = dto.natureCode.trim().toUpperCase();
    await this.ensureNoOverlap(
      this.withholdingRates,
      organizationId,
      'natureCode',
      natureCode,
      dto.effectiveFrom,
      dto.effectiveTo ?? null,
    );
    return this.withholdingRates.save(
      this.withholdingRates.create({
        organizationId,
        natureCode,
        label: dto.label.trim(),
        rate: dto.rate,
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo ?? null,
        sourceLabel: dto.sourceLabel?.trim() || null,
        sourceUrl: dto.sourceUrl?.trim() || null,
        isSystem: false,
      }),
    );
  }

  async createIncomeTaxScale(
    organizationId: string,
    dto: CreateIncomeTaxScaleDto,
  ) {
    const sorted = [...dto.brackets].sort((a, b) =>
      toMillimes(a.lowerBound) < toMillimes(b.lowerBound) ? -1 : 1,
    );
    this.validateBrackets(sorted);
    const overlap = await this.incomeTaxBrackets
      .createQueryBuilder('bracket')
      .where('bracket.organization_id = :organizationId', { organizationId })
      .andWhere('bracket.effective_from <= :end', {
        end: dto.effectiveTo ?? '9999-12-31',
      })
      .andWhere(
        '(bracket.effective_to IS NULL OR bracket.effective_to >= :start)',
        { start: dto.effectiveFrom },
      )
      .getExists();
    if (overlap)
      throw new ConflictException(
        'Un barème IRPP du cabinet couvre déjà cette période.',
      );
    return this.dataSource.transaction((manager) =>
      manager.save(
        sorted.map((bracket) =>
          manager.create(IncomeTaxBracket, {
            organizationId,
            lowerBound: bracket.lowerBound,
            upperBound: bracket.upperBound ?? null,
            rate: bracket.rate,
            effectiveFrom: dto.effectiveFrom,
            effectiveTo: dto.effectiveTo ?? null,
            sourceLabel: dto.sourceLabel?.trim() || null,
            sourceUrl: dto.sourceUrl?.trim() || null,
            isSystem: false,
          }),
        ),
      ),
    );
  }

  async resolveParameter(
    organizationId: string,
    code: FiscalParameterCode,
    date: string,
    required = true,
  ) {
    const item = await this.parameters
      .createQueryBuilder('parameter')
      .where('parameter.code = :code', { code })
      .andWhere(
        new Brackets((where) =>
          where
            .where('parameter.organization_id = :organizationId', {
              organizationId,
            })
            .orWhere('parameter.organization_id IS NULL'),
        ),
      )
      .andWhere('parameter.effective_from <= :date', { date })
      .andWhere(
        '(parameter.effective_to IS NULL OR parameter.effective_to >= :date)',
        { date },
      )
      .orderBy(
        'CASE WHEN parameter.organization_id IS NULL THEN 1 ELSE 0 END',
        'ASC',
      )
      .addOrderBy('parameter.effective_from', 'DESC')
      .getOne();
    if (!item && required)
      throw new NotFoundException(
        `Le paramètre ${code} n’est pas configuré pour le ${date}.`,
      );
    return item;
  }

  async resolveWithholdingRate(
    organizationId: string,
    natureCode: string,
    date: string,
  ) {
    const item = await this.withholdingRates
      .createQueryBuilder('rate')
      .where('rate.nature_code = :natureCode', {
        natureCode: natureCode.toUpperCase(),
      })
      .andWhere(
        new Brackets((where) =>
          where
            .where('rate.organization_id = :organizationId', {
              organizationId,
            })
            .orWhere('rate.organization_id IS NULL'),
        ),
      )
      .andWhere('rate.effective_from <= :date', { date })
      .andWhere('(rate.effective_to IS NULL OR rate.effective_to >= :date)', {
        date,
      })
      .orderBy(
        'CASE WHEN rate.organization_id IS NULL THEN 1 ELSE 0 END',
        'ASC',
      )
      .addOrderBy('rate.effective_from', 'DESC')
      .getOne();
    if (!item)
      throw new NotFoundException(
        `Aucun taux de retenue n’est configuré pour ${natureCode}.`,
      );
    return item;
  }

  async resolveVatRate(organizationId: string, code: string, date: string) {
    const item = await this.vatRates
      .createQueryBuilder('rate')
      .where('rate.code = :code', { code: code.trim().toUpperCase() })
      .andWhere(
        new Brackets((where) =>
          where
            .where('rate.organization_id = :organizationId', {
              organizationId,
            })
            .orWhere('rate.organization_id IS NULL'),
        ),
      )
      .andWhere('rate.effective_from <= :date', { date })
      .andWhere('(rate.effective_to IS NULL OR rate.effective_to >= :date)', {
        date,
      })
      .orderBy(
        'CASE WHEN rate.organization_id IS NULL THEN 1 ELSE 0 END',
        'ASC',
      )
      .addOrderBy('rate.effective_from', 'DESC')
      .getOne();
    if (!item)
      throw new NotFoundException(
        `Aucun taux de TVA n’est configuré pour le code ${code}.`,
      );
    return item;
  }

  async resolveIncomeTaxBrackets(organizationId: string, date: string) {
    const custom = await this.incomeTaxBrackets.find({
      where: {
        organizationId,
      },
      order: { effectiveFrom: 'DESC', lowerBound: 'ASC' },
    });
    const customDate = custom.find(
      (item) =>
        item.effectiveFrom <= date &&
        (!item.effectiveTo || item.effectiveTo >= date),
    )?.effectiveFrom;
    const source = customDate
      ? custom.filter((item) => item.effectiveFrom === customDate)
      : await this.incomeTaxBrackets.find({
          where: { organizationId: IsNull() },
          order: { effectiveFrom: 'DESC', lowerBound: 'ASC' },
        });
    const effectiveFrom = source.find(
      (item) =>
        item.effectiveFrom <= date &&
        (!item.effectiveTo || item.effectiveTo >= date),
    )?.effectiveFrom;
    const result = effectiveFrom
      ? source.filter((item) => item.effectiveFrom === effectiveFrom)
      : [];
    if (!result.length)
      throw new NotFoundException(
        `Aucun barème IRPP n’est configuré pour le ${date}.`,
      );
    return result;
  }

  async annualIncomeTax(
    organizationId: string,
    taxableAnnual: bigint,
    date: string,
  ) {
    const brackets = await this.resolveIncomeTaxBrackets(organizationId, date);
    let tax = 0n;
    for (const bracket of brackets) {
      const lower = toMillimes(bracket.lowerBound);
      const upper = bracket.upperBound
        ? toMillimes(bracket.upperBound)
        : taxableAnnual;
      if (taxableAnnual <= lower) continue;
      const taxableInBracket =
        (taxableAnnual < upper ? taxableAnnual : upper) - lower;
      if (taxableInBracket > 0n)
        tax += multiplyRate(taxableInBracket, bracket.rate);
    }
    return {
      amount: tax,
      brackets,
      formattedAmount: fromMillimes(tax),
    };
  }

  private async resolveVatRates(organizationId: string, date: string) {
    const items = await this.vatRates
      .createQueryBuilder('rate')
      .where(
        '(rate.organization_id = :organizationId OR rate.organization_id IS NULL)',
        { organizationId },
      )
      .andWhere('rate.effective_from <= :date', { date })
      .andWhere('(rate.effective_to IS NULL OR rate.effective_to >= :date)', {
        date,
      })
      .orderBy('rate.code', 'ASC')
      .addOrderBy(
        'CASE WHEN rate.organization_id IS NULL THEN 1 ELSE 0 END',
        'ASC',
      )
      .addOrderBy('rate.effective_from', 'DESC')
      .getMany();
    return [...new Map(items.map((item) => [item.code, item])).values()];
  }

  private async resolveWithholdingRates(organizationId: string, date: string) {
    const items = await this.withholdingRates
      .createQueryBuilder('rate')
      .where(
        '(rate.organization_id = :organizationId OR rate.organization_id IS NULL)',
        { organizationId },
      )
      .andWhere('rate.effective_from <= :date', { date })
      .andWhere('(rate.effective_to IS NULL OR rate.effective_to >= :date)', {
        date,
      })
      .orderBy('rate.nature_code', 'ASC')
      .addOrderBy(
        'CASE WHEN rate.organization_id IS NULL THEN 1 ELSE 0 END',
        'ASC',
      )
      .addOrderBy('rate.effective_from', 'DESC')
      .getMany();
    return [...new Map(items.map((item) => [item.natureCode, item])).values()];
  }

  private validateBrackets(
    brackets: Array<{
      lowerBound: string;
      upperBound?: string | null;
      rate: string;
    }>,
  ) {
    if (toMillimes(brackets[0].lowerBound) !== 0n)
      throw new BadRequestException('Le barème IRPP doit commencer à 0 TND.');
    for (let index = 0; index < brackets.length; index++) {
      const current = brackets[index];
      const upper = current.upperBound ? toMillimes(current.upperBound) : null;
      if (upper !== null && upper <= toMillimes(current.lowerBound))
        throw new BadRequestException('Une tranche IRPP est invalide.');
      const next = brackets[index + 1];
      if (next && (!upper || upper !== toMillimes(next.lowerBound)))
        throw new BadRequestException(
          'Les tranches IRPP doivent être continues et sans chevauchement.',
        );
      if (!next && upper !== null)
        throw new BadRequestException(
          'La dernière tranche IRPP doit être sans plafond.',
        );
    }
  }

  private async ensureNoOverlap<T extends object>(
    repository: Repository<T>,
    organizationId: string,
    property: string,
    value: string,
    effectiveFrom: string,
    effectiveTo: string | null,
  ) {
    const tableProperty = property === 'natureCode' ? 'nature_code' : property;
    const overlap = await repository
      .createQueryBuilder('item')
      .where('item.organization_id = :organizationId', { organizationId })
      .andWhere(`item.${tableProperty} = :value`, { value })
      .andWhere('item.effective_from <= :end', {
        end: effectiveTo ?? '9999-12-31',
      })
      .andWhere('(item.effective_to IS NULL OR item.effective_to >= :start)', {
        start: effectiveFrom,
      })
      .getExists();
    if (overlap)
      throw new ConflictException(
        'Une version du même paramètre couvre déjà cette période.',
      );
  }

  private parameterResponse(item: FiscalParameter) {
    return {
      code: item.code,
      label: item.label,
      valueType: item.valueType,
      value: item.value,
      effectiveFrom: item.effectiveFrom,
      effectiveTo: item.effectiveTo,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.sourceUrl,
      isSystem: item.isSystem,
    };
  }

  private validateDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new BadRequestException('La date doit respecter YYYY-MM-DD.');
  }
}
