import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  AuditLog,
  BillingFrequency,
  ClientDossier,
  DossierAssignment,
  DossierContact,
  DossierStatus,
  OrganizationMembership,
} from '../database/entities';
import { PermissionNames } from '../database/permissions';
import {
  CreateDossierContactDto,
  CreateDossierDto,
  DossierQueryDto,
  UpdateDossierContactDto,
  UpdateDossierDto,
  UpsertDossierAssignmentDto,
} from './dto';

@Injectable()
export class DossiersService {
  constructor(
    @InjectRepository(ClientDossier)
    private readonly dossiers: Repository<ClientDossier>,
    @InjectRepository(DossierContact)
    private readonly contacts: Repository<DossierContact>,
    @InjectRepository(DossierAssignment)
    private readonly assignments: Repository<DossierAssignment>,
    @InjectRepository(OrganizationMembership)
    private readonly memberships: Repository<OrganizationMembership>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
  ) {}

  async list(organizationId: string, userId: string, query: DossierQueryDto) {
    const access = await this.getAccess(organizationId, userId);
    const builder = this.dossiers
      .createQueryBuilder('dossier')
      .where('dossier.organization_id = :organizationId', { organizationId });

    if (!access.canSeeAll) {
      builder
        .innerJoin(
          'dossier.assignments',
          'assignment',
          'assignment.membership_id = :membershipId AND assignment.is_active = true',
          { membershipId: access.membership.id },
        )
        .distinct(true);
    }

    if (query.status) {
      builder.andWhere('dossier.status = :status', { status: query.status });
    } else {
      builder.andWhere('dossier.status != :archived', {
        archived: DossierStatus.Archived,
      });
    }

    const search = query.search?.trim();
    if (search) {
      builder.andWhere(
        new Brackets((where) => {
          where
            .where('dossier.legal_name ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('dossier.trade_name ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('dossier.tax_identifier ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('dossier.rne_number ILIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    const [items, total] = await builder
      .orderBy('dossier.legalName', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();

    return {
      items: items.map((item) => this.toDossier(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateDossierDto,
  ) {
    await this.ensureTaxIdentifierAvailable(
      organizationId,
      null,
      dto.taxIdentifier,
    );
    const dossier = await this.dossiers.save(
      this.dossiers.create({
        organizationId,
        ...this.dossierValues(dto),
        status: DossierStatus.Active,
        archivedAtUtc: null,
        createdByUserId: actorUserId,
      }),
    );
    await this.addAudit(
      organizationId,
      actorUserId,
      'dossier.created',
      'ClientDossier',
      dossier.id,
      {
        legalName: dossier.legalName,
        taxIdentifier: dossier.taxIdentifier,
      },
    );
    return this.toDossier(dossier);
  }

  async get(organizationId: string, dossierId: string, userId: string) {
    return this.toDossier(
      await this.getAccessibleEntity(organizationId, dossierId, userId),
    );
  }

  async update(
    organizationId: string,
    dossierId: string,
    actorUserId: string,
    dto: UpdateDossierDto,
  ) {
    const dossier = await this.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    this.ensureEditable(dossier);
    if (dto.taxIdentifier !== undefined) {
      await this.ensureTaxIdentifierAvailable(
        organizationId,
        dossierId,
        dto.taxIdentifier,
      );
    }
    Object.assign(dossier, this.dossierValues(dto, true));
    await this.dossiers.save(dossier);
    await this.addAudit(
      organizationId,
      actorUserId,
      'dossier.updated',
      'ClientDossier',
      dossier.id,
      {
        legalName: dossier.legalName,
        status: dossier.status,
      },
    );
    return this.toDossier(dossier);
  }

  async archive(
    organizationId: string,
    dossierId: string,
    actorUserId: string,
  ) {
    const dossier = await this.dossiers.findOneBy({
      id: dossierId,
      organizationId,
    });
    if (!dossier) throw new NotFoundException('Le dossier est introuvable.');
    if (dossier.status === DossierStatus.Archived) {
      throw new ConflictException('Le dossier est déjà archivé.');
    }
    dossier.status = DossierStatus.Archived;
    dossier.archivedAtUtc = new Date();
    await this.dossiers.save(dossier);
    await this.addAudit(
      organizationId,
      actorUserId,
      'dossier.archived',
      'ClientDossier',
      dossier.id,
      { legalName: dossier.legalName },
    );
    return this.toDossier(dossier);
  }

  async getContacts(organizationId: string, dossierId: string, userId: string) {
    await this.getAccessibleEntity(organizationId, dossierId, userId);
    const contacts = await this.contacts.find({
      where: { organizationId, dossierId },
      order: { isPrimary: 'DESC', fullName: 'ASC' },
    });
    return contacts.map((contact) => this.toContact(contact));
  }

  async createContact(
    organizationId: string,
    dossierId: string,
    actorUserId: string,
    dto: CreateDossierContactDto,
  ) {
    const dossier = await this.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    this.ensureEditable(dossier);
    if (dto.isPrimary)
      await this.clearPrimaryContact(organizationId, dossierId);
    const contact = await this.contacts.save(
      this.contacts.create({
        organizationId,
        dossierId,
        fullName: dto.fullName.trim(),
        role: this.clean(dto.role),
        phone: this.clean(dto.phone),
        email: this.clean(dto.email),
        whatsappNumber: this.clean(dto.whatsappNumber),
        isPrimary: dto.isPrimary ?? false,
        isActive: true,
      }),
    );
    await this.addAudit(
      organizationId,
      actorUserId,
      'dossier_contact.created',
      'DossierContact',
      contact.id,
      { dossierId, fullName: contact.fullName },
    );
    return this.toContact(contact);
  }

  async updateContact(
    organizationId: string,
    dossierId: string,
    contactId: string,
    actorUserId: string,
    dto: UpdateDossierContactDto,
  ) {
    const dossier = await this.getAccessibleEntity(
      organizationId,
      dossierId,
      actorUserId,
    );
    this.ensureEditable(dossier);
    const contact = await this.contacts.findOneBy({
      id: contactId,
      organizationId,
      dossierId,
    });
    if (!contact) throw new NotFoundException('Le contact est introuvable.');
    if (dto.isPrimary)
      await this.clearPrimaryContact(organizationId, dossierId);
    if (dto.fullName !== undefined) contact.fullName = dto.fullName.trim();
    if (dto.role !== undefined) contact.role = this.clean(dto.role);
    if (dto.phone !== undefined) contact.phone = this.clean(dto.phone);
    if (dto.email !== undefined) contact.email = this.clean(dto.email);
    if (dto.whatsappNumber !== undefined) {
      contact.whatsappNumber = this.clean(dto.whatsappNumber);
    }
    if (dto.isPrimary !== undefined) contact.isPrimary = dto.isPrimary;
    if (dto.isActive !== undefined) contact.isActive = dto.isActive;
    await this.contacts.save(contact);
    await this.addAudit(
      organizationId,
      actorUserId,
      'dossier_contact.updated',
      'DossierContact',
      contact.id,
      { dossierId, isActive: contact.isActive },
    );
    return this.toContact(contact);
  }

  async getAssignments(organizationId: string, dossierId: string) {
    await this.ensureDossierExists(organizationId, dossierId);
    const assignments = await this.assignments.find({
      where: { organizationId, dossierId },
      relations: { membership: { user: true, role: true } },
      order: { createdAtUtc: 'ASC' },
    });
    return assignments.map((assignment) => this.toAssignment(assignment));
  }

  async upsertAssignment(
    organizationId: string,
    dossierId: string,
    membershipId: string,
    actorUserId: string,
    dto: UpsertDossierAssignmentDto,
  ) {
    const dossier = await this.ensureDossierExists(organizationId, dossierId);
    this.ensureEditable(dossier);
    const membership = await this.memberships.findOne({
      where: { id: membershipId, organizationId, isActive: true },
      relations: { user: true, role: true },
    });
    if (!membership) {
      throw new NotFoundException(
        'Le collaborateur actif est introuvable dans ce cabinet.',
      );
    }
    let assignment = await this.assignments.findOneBy({
      organizationId,
      dossierId,
      membershipId,
    });
    assignment ??= this.assignments.create({
      organizationId,
      dossierId,
      membershipId,
      assignedByUserId: actorUserId,
    });
    assignment.assignmentRole = dto.assignmentRole;
    assignment.isActive = dto.isActive ?? true;
    if (dto.monthlyTimeBudgetMinutes !== undefined) {
      assignment.monthlyTimeBudgetMinutes = dto.monthlyTimeBudgetMinutes;
    }
    assignment.assignedByUserId = actorUserId;
    assignment.membership = membership;
    await this.assignments.save(assignment);
    await this.addAudit(
      organizationId,
      actorUserId,
      'dossier_assignment.updated',
      'DossierAssignment',
      assignment.id,
      {
        dossierId,
        membershipId,
        assignmentRole: assignment.assignmentRole,
        isActive: assignment.isActive,
        monthlyTimeBudgetMinutes: assignment.monthlyTimeBudgetMinutes,
      },
    );
    return this.toAssignment(assignment);
  }

  private async getAccess(organizationId: string, userId: string) {
    const membership = await this.memberships.findOne({
      where: {
        organizationId,
        userId,
        isActive: true,
        organization: { isActive: true },
      },
      relations: { organization: true, role: { rolePermissions: true } },
    });
    if (!membership) {
      throw new ForbiddenException("Vous n'appartenez pas à ce cabinet.");
    }
    const permissions = new Set(
      membership.role.rolePermissions.map((item) => item.permissionName),
    );
    return {
      membership,
      canSeeAll: permissions.has(PermissionNames.DossiersAssign),
    };
  }

  async getAccessibleEntity(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    const access = await this.getAccess(organizationId, userId);
    if (access.canSeeAll) {
      return this.ensureDossierExists(organizationId, dossierId);
    }
    const dossier = await this.dossiers
      .createQueryBuilder('dossier')
      .innerJoin(
        'dossier.assignments',
        'assignment',
        'assignment.membership_id = :membershipId AND assignment.is_active = true',
        { membershipId: access.membership.id },
      )
      .where('dossier.id = :dossierId', { dossierId })
      .andWhere('dossier.organization_id = :organizationId', { organizationId })
      .getOne();
    if (!dossier) {
      throw new NotFoundException(
        'Le dossier est introuvable ou ne vous est pas affecté.',
      );
    }
    return dossier;
  }

  private async ensureDossierExists(organizationId: string, dossierId: string) {
    const dossier = await this.dossiers.findOneBy({
      id: dossierId,
      organizationId,
    });
    if (!dossier) throw new NotFoundException('Le dossier est introuvable.');
    return dossier;
  }

  private ensureEditable(dossier: ClientDossier) {
    if (dossier.status === DossierStatus.Archived) {
      throw new ConflictException(
        'Un dossier archivé est en lecture seule et ne peut plus être modifié.',
      );
    }
  }

  private async ensureTaxIdentifierAvailable(
    organizationId: string,
    dossierId: string | null,
    taxIdentifier?: string | null,
  ) {
    const normalizedTaxIdentifier = this.normalizeTaxIdentifier(taxIdentifier);
    if (!normalizedTaxIdentifier) return;
    const query = this.dossiers
      .createQueryBuilder('dossier')
      .where('dossier.organization_id = :organizationId', { organizationId })
      .andWhere(
        'dossier.normalized_tax_identifier = :normalizedTaxIdentifier',
        {
          normalizedTaxIdentifier,
        },
      );
    if (dossierId) {
      query.andWhere('dossier.id != :dossierId', { dossierId });
    }
    if (await query.getExists()) {
      throw new ConflictException(
        'Un dossier utilise déjà ce matricule fiscal dans ce cabinet.',
      );
    }
  }

  private dossierValues(
    dto: Partial<CreateDossierDto & UpdateDossierDto>,
    onlyDefined = false,
  ) {
    const values: Record<string, unknown> = {};
    const set = (key: string, value: unknown) => {
      if (!onlyDefined || value !== undefined) values[key] = value;
    };
    set('legalName', dto.legalName?.trim());
    set('tradeName', this.clean(dto.tradeName));
    set('taxIdentifier', this.clean(dto.taxIdentifier));
    set(
      'normalizedTaxIdentifier',
      this.normalizeTaxIdentifier(dto.taxIdentifier),
    );
    set('rneNumber', this.clean(dto.rneNumber));
    set('vatCode', this.clean(dto.vatCode));
    set('customsCode', this.clean(dto.customsCode));
    set('legalForm', dto.legalForm);
    set('taxRegime', dto.taxRegime);
    set('isVatSubject', dto.isVatSubject);
    set('hasVatSuspension', dto.hasVatSuspension);
    set('isTotallyExporting', dto.isTotallyExporting);
    set('activitySector', this.clean(dto.activitySector));
    set('cnssEmployerNumber', this.clean(dto.cnssEmployerNumber));
    set(
      'employeeCount',
      onlyDefined ? dto.employeeCount : (dto.employeeCount ?? 0),
    );
    set(
      'fiscalYearStartMonth',
      onlyDefined ? dto.fiscalYearStartMonth : (dto.fiscalYearStartMonth ?? 1),
    );
    set(
      'fiscalYearStartDay',
      onlyDefined ? dto.fiscalYearStartDay : (dto.fiscalYearStartDay ?? 1),
    );
    set('monthlyFee', this.clean(dto.monthlyFee));
    set('annualFee', this.clean(dto.annualFee));
    set(
      'billingFrequency',
      onlyDefined
        ? dto.billingFrequency
        : (dto.billingFrequency ?? BillingFrequency.Monthly),
    );
    set('internalNotes', this.clean(dto.internalNotes));
    set(
      'tags',
      dto.tags?.map((tag) => tag.trim()).filter(Boolean) ??
        (onlyDefined ? dto.tags : []),
    );
    if ('status' in dto) set('status', dto.status);
    return values;
  }

  private async clearPrimaryContact(organizationId: string, dossierId: string) {
    await this.contacts.update(
      { organizationId, dossierId, isPrimary: true },
      { isPrimary: false },
    );
  }

  private toDossier(item: ClientDossier) {
    return {
      id: item.id,
      organizationId: item.organizationId,
      legalName: item.legalName,
      tradeName: item.tradeName,
      taxIdentifier: item.taxIdentifier,
      rneNumber: item.rneNumber,
      vatCode: item.vatCode,
      customsCode: item.customsCode,
      legalForm: item.legalForm,
      taxRegime: item.taxRegime,
      isVatSubject: item.isVatSubject,
      hasVatSuspension: item.hasVatSuspension,
      isTotallyExporting: item.isTotallyExporting,
      activitySector: item.activitySector,
      cnssEmployerNumber: item.cnssEmployerNumber,
      employeeCount: item.employeeCount,
      fiscalYearStartMonth: item.fiscalYearStartMonth,
      fiscalYearStartDay: item.fiscalYearStartDay,
      monthlyFee: item.monthlyFee,
      annualFee: item.annualFee,
      billingFrequency: item.billingFrequency,
      internalNotes: item.internalNotes,
      tags: item.tags,
      status: item.status,
      archivedAtUtc: item.archivedAtUtc,
      createdAtUtc: item.createdAtUtc,
      updatedAtUtc: item.updatedAtUtc,
    };
  }

  private toContact(item: DossierContact) {
    return {
      id: item.id,
      fullName: item.fullName,
      role: item.role,
      phone: item.phone,
      email: item.email,
      whatsappNumber: item.whatsappNumber,
      isPrimary: item.isPrimary,
      isActive: item.isActive,
    };
  }

  private toAssignment(item: DossierAssignment) {
    return {
      id: item.id,
      membershipId: item.membershipId,
      userId: item.membership.userId,
      fullName: item.membership.user.fullName,
      email: item.membership.user.email,
      cabinetRole: item.membership.role.name,
      assignmentRole: item.assignmentRole,
      isActive: item.isActive,
      monthlyTimeBudgetMinutes: item.monthlyTimeBudgetMinutes,
    };
  }

  private normalizeTaxIdentifier(value?: string | null) {
    return (
      value
        ?.trim()
        .replace(/[\s./-]/g, '')
        .toUpperCase() || null
    );
  }

  private clean(value?: string | null) {
    return value?.trim() || null;
  }

  private async addAudit(
    organizationId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    detailsJson: Record<string, unknown>,
  ) {
    await this.auditLogs.save(
      this.auditLogs.create({
        organizationId,
        actorUserId,
        action,
        entityType,
        entityId,
        detailsJson,
      }),
    );
  }
}
