import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

abstract class AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at_utc', type: 'timestamptz' })
  createdAtUtc!: Date;

  @UpdateDateColumn({
    name: 'updated_at_utc',
    type: 'timestamptz',
    nullable: true,
  })
  updatedAtUtc!: Date | null;
}

@Entity({ schema: 'accounting', name: 'users' })
export class User extends AuditableEntity {
  @Column({ length: 320 })
  email!: string;

  @Index({ unique: true })
  @Column({ name: 'normalized_email', length: 320 })
  normalizedEmail!: string;

  @Column({ name: 'password_hash', length: 1000 })
  passwordHash!: string;

  @Column({ name: 'full_name', length: 160 })
  fullName!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'disabled_at_utc', type: 'timestamptz', nullable: true })
  disabledAtUtc!: Date | null;

  @Column({ name: 'disabled_reason', type: 'text', nullable: true })
  disabledReason!: string | null;

  @Column({ name: 'disabled_by_user_id', type: 'uuid', nullable: true })
  disabledByUserId!: string | null;

  @Column({ name: 'email_verified', default: false })
  emailVerified!: boolean;

  @Column({ name: 'is_platform_admin', default: false })
  isPlatformAdmin!: boolean;

  @Column({ name: 'last_login_at_utc', type: 'timestamptz', nullable: true })
  lastLoginAtUtc!: Date | null;

  @OneToMany(() => OrganizationMembership, (membership) => membership.user)
  memberships!: OrganizationMembership[];

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens!: RefreshToken[];
}

@Entity({ schema: 'accounting', name: 'organizations' })
export class Organization extends AuditableEntity {
  @Column({ length: 200 })
  name!: string;

  @Index({ unique: true })
  @Column({ length: 120 })
  slug!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'suspended_at_utc', type: 'timestamptz', nullable: true })
  suspendedAtUtc!: Date | null;

  @Column({ name: 'suspension_reason', type: 'text', nullable: true })
  suspensionReason!: string | null;

  @Column({ name: 'suspended_by_user_id', type: 'uuid', nullable: true })
  suspendedByUserId!: string | null;

  @OneToMany(() => Role, (role) => role.organization)
  roles!: Role[];

  @OneToMany(
    () => OrganizationMembership,
    (membership) => membership.organization,
  )
  memberships!: OrganizationMembership[];
}

export enum SaasBillingCycle {
  Monthly = 'MENSUEL',
  Annual = 'ANNUEL',
}

export enum SaasSubscriptionStatus {
  Trialing = 'ESSAI',
  Active = 'ACTIF',
  PastDue = 'IMPAYE',
  Suspended = 'SUSPENDU',
  Cancelled = 'ANNULE',
}

export enum SaasInvoiceStatus {
  Draft = 'BROUILLON',
  Open = 'A_PAYER',
  Paid = 'PAYEE',
  Void = 'ANNULEE',
}

@Entity({ schema: 'accounting', name: 'saas_plans' })
export class SaasPlan extends AuditableEntity {
  @Index({ unique: true })
  @Column({ length: 50 })
  code!: string;

  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    name: 'monthly_price_tnd',
    type: 'numeric',
    precision: 12,
    scale: 3,
  })
  monthlyPriceTnd!: string;

  @Column({
    name: 'annual_price_tnd',
    type: 'numeric',
    precision: 12,
    scale: 3,
  })
  annualPriceTnd!: string;

  @Column({ name: 'max_collaborators', type: 'integer' })
  maxCollaborators!: number;

  @Column({ name: 'max_active_dossiers', type: 'integer' })
  maxActiveDossiers!: number;

  @Column({ name: 'max_storage_bytes', type: 'bigint' })
  maxStorageBytes!: string;

  @Column({ name: 'monthly_ocr_documents', type: 'integer' })
  monthlyOcrDocuments!: number;

  @Column({ name: 'monthly_ttn_submissions', type: 'integer' })
  monthlyTtnSubmissions!: number;

  @Column({
    name: 'features_json',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  featuresJson!: Record<string, boolean>;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'is_public', default: true })
  isPublic!: boolean;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder!: number;
}

@Entity({ schema: 'accounting', name: 'organization_subscriptions' })
@Unique(['organizationId'])
export class OrganizationSubscription extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @OneToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @ManyToOne(() => SaasPlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan!: SaasPlan;

  @Column({
    type: 'varchar',
    length: 20,
    default: SaasSubscriptionStatus.Trialing,
  })
  status!: SaasSubscriptionStatus;

  @Column({
    name: 'billing_cycle',
    type: 'varchar',
    length: 20,
    default: SaasBillingCycle.Monthly,
  })
  billingCycle!: SaasBillingCycle;

  @Column({ name: 'trial_ends_at_utc', type: 'timestamptz', nullable: true })
  trialEndsAtUtc!: Date | null;

  @Column({ name: 'current_period_start_utc', type: 'timestamptz' })
  currentPeriodStartUtc!: Date;

  @Column({ name: 'current_period_end_utc', type: 'timestamptz' })
  currentPeriodEndUtc!: Date;

  @Column({ name: 'grace_ends_at_utc', type: 'timestamptz', nullable: true })
  graceEndsAtUtc!: Date | null;

  @Column({ name: 'cancel_at_period_end', default: false })
  cancelAtPeriodEnd!: boolean;
}

@Entity({ schema: 'accounting', name: 'saas_subscription_invoices' })
export class SaasSubscriptionInvoice extends AuditableEntity {
  @Index({ unique: true })
  @Column({ length: 60 })
  number!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @ManyToOne(() => OrganizationSubscription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_id' })
  subscription!: OrganizationSubscription;

  @Column({ name: 'period_start_utc', type: 'timestamptz' })
  periodStartUtc!: Date;

  @Column({ name: 'period_end_utc', type: 'timestamptz' })
  periodEndUtc!: Date;

  @Column({ name: 'amount_tnd', type: 'numeric', precision: 12, scale: 3 })
  amountTnd!: string;

  @Column({ name: 'due_at_utc', type: 'timestamptz' })
  dueAtUtc!: Date;

  @Column({
    type: 'varchar',
    length: 20,
    default: SaasInvoiceStatus.Draft,
  })
  status!: SaasInvoiceStatus;

  @Column({ name: 'paid_at_utc', type: 'timestamptz', nullable: true })
  paidAtUtc!: Date | null;

  @Column({
    name: 'payment_reference',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  paymentReference!: string | null;
}

@Entity({ schema: 'accounting', name: 'roles' })
@Unique(['organizationId', 'normalizedName'])
export class Role extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, (organization) => organization.roles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ length: 100 })
  name!: string;

  @Column({ name: 'normalized_name', length: 100 })
  normalizedName!: string;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;

  @OneToMany(() => RolePermission, (permission) => permission.role, {
    cascade: true,
  })
  rolePermissions!: RolePermission[];
}

@Entity({ schema: 'accounting', name: 'permissions' })
export class Permission {
  @PrimaryColumn({ length: 100 })
  name!: string;

  @Column({ length: 250 })
  description!: string;
}

@Entity({ schema: 'accounting', name: 'role_permissions' })
export class RolePermission {
  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @PrimaryColumn({ name: 'permission_name', length: 100 })
  permissionName!: string;

  @ManyToOne(() => Role, (role) => role.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @ManyToOne(() => Permission, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'permission_name' })
  permission!: Permission;
}

@Entity({ schema: 'accounting', name: 'organization_memberships' })
@Unique(['organizationId', 'userId'])
export class OrganizationMembership extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, (organization) => organization.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @ManyToOne(() => Role, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}

@Entity({ schema: 'accounting', name: 'refresh_tokens' })
export class RefreshToken extends AuditableEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Index({ unique: true })
  @Column({ name: 'token_hash', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at_utc', type: 'timestamptz' })
  expiresAtUtc!: Date;

  @Column({ name: 'revoked_at_utc', type: 'timestamptz', nullable: true })
  revokedAtUtc!: Date | null;

  @Column({ name: 'replaced_by_token_id', type: 'uuid', nullable: true })
  replacedByTokenId!: string | null;
}

@Entity({ schema: 'accounting', name: 'password_reset_tokens' })
@Index(['userId', 'usedAtUtc'])
export class PasswordResetToken extends AuditableEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Index({ unique: true })
  @Column({ name: 'token_hash', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at_utc', type: 'timestamptz' })
  expiresAtUtc!: Date;

  @Column({ name: 'used_at_utc', type: 'timestamptz', nullable: true })
  usedAtUtc!: Date | null;

  @Column({ name: 'requested_ip', type: 'varchar', length: 80, nullable: true })
  requestedIp!: string | null;
}

@Entity({ schema: 'accounting', name: 'organization_invitations' })
@Index(['organizationId', 'normalizedEmail'])
export class OrganizationInvitation extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @ManyToOne(() => Role, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @Column({ length: 320 })
  email!: string;

  @Column({ name: 'normalized_email', length: 320 })
  normalizedEmail!: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', length: 64 })
  tokenHash!: string;

  @Column({ name: 'invited_by_user_id', type: 'uuid' })
  invitedByUserId!: string;

  @Column({ name: 'expires_at_utc', type: 'timestamptz' })
  expiresAtUtc!: Date;

  @Column({ name: 'accepted_at_utc', type: 'timestamptz', nullable: true })
  acceptedAtUtc!: Date | null;

  @Column({ name: 'revoked_at_utc', type: 'timestamptz', nullable: true })
  revokedAtUtc!: Date | null;

  @Column({
    name: 'delivery_status',
    type: 'varchar',
    length: 20,
    default: 'EN_ATTENTE',
  })
  deliveryStatus!: 'EN_ATTENTE' | 'ENVOYEE' | 'ECHEC';

  @Column({ name: 'delivery_attempts', type: 'integer', default: 0 })
  deliveryAttempts!: number;

  @Column({ name: 'sent_at_utc', type: 'timestamptz', nullable: true })
  sentAtUtc!: Date | null;

  @Column({ name: 'delivery_error', type: 'text', nullable: true })
  deliveryError!: string | null;
}

@Entity({ schema: 'accounting', name: 'email_delivery_logs' })
@Index(['status', 'createdAtUtc'])
@Index(['recipient'])
export class EmailDeliveryLog extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 40 })
  category!: 'INVITATION' | 'ADMIN_TEST' | 'SYSTEM';

  @Column({ type: 'varchar', length: 80, default: 'smtp' })
  provider!: string;

  @Column({ length: 320 })
  recipient!: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  sender!: string | null;

  @Column({ type: 'varchar', length: 500 })
  subject!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: 'ENVOYE' | 'ECHEC';

  @Column({ name: 'provider_message_id', type: 'varchar', length: 500, nullable: true })
  providerMessageId!: string | null;

  @Column({ name: 'smtp_response', type: 'text', nullable: true })
  smtpResponse!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({
    name: 'metadata_json',
    type: 'jsonb',
    nullable: true,
  })
  metadataJson!: Record<string, unknown> | null;
}

@Entity({ schema: 'accounting', name: 'audit_logs' })
@Index(['organizationId', 'createdAtUtc'])
export class AuditLog extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ length: 120 })
  action!: string;

  @Column({ name: 'entity_type', length: 120 })
  entityType!: string;

  @Column({ name: 'entity_id', length: 100 })
  entityId!: string;

  @Column({ name: 'details_json', type: 'jsonb', nullable: true })
  detailsJson!: Record<string, unknown> | null;
}

@Entity({ schema: 'accounting', name: 'company_profiles' })
export class CompanyProfile extends AuditableEntity {
  @Index({ unique: true })
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @OneToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'legal_name', length: 200 })
  legalName!: string;

  @Column({
    name: 'trading_name',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  tradingName!: string | null;

  @Column({
    name: 'tax_identifier',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  taxIdentifier!: string | null;

  @Column({
    name: 'registration_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  registrationNumber!: string | null;

  @Column({ name: 'country_code', length: 2 })
  countryCode!: string;

  @Column({ name: 'base_currency_code', length: 3 })
  baseCurrencyCode!: string;

  @Column({
    name: 'address_line_1',
    type: 'varchar',
    length: 250,
    nullable: true,
  })
  addressLine1!: string | null;

  @Column({
    name: 'address_line_2',
    type: 'varchar',
    length: 250,
    nullable: true,
  })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 30, nullable: true })
  postalCode!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;
}

export enum DossierLegalForm {
  Sarl = 'SARL',
  Suarl = 'SUARL',
  Sa = 'SA',
  PhysicalPerson = 'PERSONNE_PHYSIQUE',
  Association = 'ASSOCIATION',
  Other = 'AUTRE',
}

export enum DossierTaxRegime {
  Real = 'REEL',
  SimplifiedReal = 'REEL_SIMPLIFIE',
  FlatRate = 'FORFAITAIRE',
  Other = 'AUTRE',
}

export enum DossierStatus {
  Active = 'ACTIF',
  Suspended = 'SUSPENDU',
  Archived = 'ARCHIVE',
}

export enum BillingFrequency {
  Monthly = 'MENSUELLE',
  Quarterly = 'TRIMESTRIELLE',
  Annual = 'ANNUELLE',
  PerService = 'PAR_SERVICE',
}

@Entity({ schema: 'accounting', name: 'client_dossiers' })
@Index(['organizationId', 'status'])
@Index(['organizationId', 'normalizedTaxIdentifier'], { unique: true })
@Check(`"employee_count" >= 0`)
@Check(`"fiscal_year_start_month" BETWEEN 1 AND 12`)
@Check(`"fiscal_year_start_day" BETWEEN 1 AND 31`)
export class ClientDossier extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'legal_name', length: 200 })
  legalName!: string;

  @Column({ name: 'trade_name', type: 'varchar', length: 200, nullable: true })
  tradeName!: string | null;

  @Column({
    name: 'tax_identifier',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  taxIdentifier!: string | null;

  @Column({
    name: 'normalized_tax_identifier',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  normalizedTaxIdentifier!: string | null;

  @Column({
    name: 'rne_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  rneNumber!: string | null;

  @Column({
    name: 'vat_code',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  vatCode!: string | null;

  @Column({
    name: 'customs_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  customsCode!: string | null;

  @Column({ name: 'legal_form', type: 'varchar', length: 40 })
  legalForm!: DossierLegalForm;

  @Column({ name: 'tax_regime', type: 'varchar', length: 40 })
  taxRegime!: DossierTaxRegime;

  @Column({ name: 'is_vat_subject', default: false })
  isVatSubject!: boolean;

  @Column({ name: 'has_vat_suspension', default: false })
  hasVatSuspension!: boolean;

  @Column({ name: 'is_totally_exporting', default: false })
  isTotallyExporting!: boolean;

  @Column({
    name: 'activity_sector',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  activitySector!: string | null;

  @Column({
    name: 'cnss_employer_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  cnssEmployerNumber!: string | null;

  @Column({ name: 'employee_count', type: 'integer', default: 0 })
  employeeCount!: number;

  @Column({ name: 'fiscal_year_start_month', type: 'smallint', default: 1 })
  fiscalYearStartMonth!: number;

  @Column({ name: 'fiscal_year_start_day', type: 'smallint', default: 1 })
  fiscalYearStartDay!: number;

  @Column({
    name: 'monthly_fee',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  monthlyFee!: string | null;

  @Column({
    name: 'annual_fee',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  annualFee!: string | null;

  @Column({
    name: 'billing_frequency',
    type: 'varchar',
    length: 30,
    default: BillingFrequency.Monthly,
  })
  billingFrequency!: BillingFrequency;

  @Column({
    name: 'internal_notes',
    type: 'text',
    nullable: true,
  })
  internalNotes!: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  tags!: string[];

  @Column({
    type: 'varchar',
    length: 20,
    default: DossierStatus.Active,
  })
  status!: DossierStatus;

  @Column({ name: 'archived_at_utc', type: 'timestamptz', nullable: true })
  archivedAtUtc!: Date | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @OneToMany(() => DossierContact, (contact) => contact.dossier)
  contacts!: DossierContact[];

  @OneToMany(() => DossierAssignment, (assignment) => assignment.dossier)
  assignments!: DossierAssignment[];
}

@Entity({ schema: 'accounting', name: 'dossier_contacts' })
@Index(['organizationId', 'dossierId'])
export class DossierContact extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, (dossier) => dossier.contacts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'full_name', length: 160 })
  fullName!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  role!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({
    name: 'whatsapp_number',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  whatsappNumber!: string | null;

  @Column({ name: 'is_primary', default: false })
  isPrimary!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}

export enum DossierAssignmentRole {
  Responsible = 'RESPONSABLE',
  Support = 'SUPPORT',
}

@Entity({ schema: 'accounting', name: 'dossier_assignments' })
@Unique(['dossierId', 'membershipId'])
@Index(['organizationId', 'membershipId', 'isActive'])
export class DossierAssignment extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, (dossier) => dossier.assignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membership_id' })
  membership!: OrganizationMembership;

  @Column({ name: 'assignment_role', type: 'varchar', length: 20 })
  assignmentRole!: DossierAssignmentRole;

  @Column({ name: 'assigned_by_user_id', type: 'uuid' })
  assignedByUserId!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({
    name: 'monthly_time_budget_minutes',
    type: 'integer',
    nullable: true,
  })
  monthlyTimeBudgetMinutes!: number | null;
}

export enum MemberCompensationType {
  Hourly = 'HORAIRE',
  Monthly = 'MENSUELLE',
}

@Entity({ schema: 'accounting', name: 'cabinet_member_cost_rates' })
@Unique(['membershipId', 'effectiveFrom'])
@Index(['organizationId', 'membershipId', 'effectiveFrom', 'effectiveTo'])
export class CabinetMemberCostRate extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membership_id' })
  membership!: OrganizationMembership;

  @Column({ name: 'compensation_type', type: 'varchar', length: 20 })
  compensationType!: MemberCompensationType;

  @Column({ name: 'pay_rate_amount', type: 'decimal', precision: 15, scale: 3 })
  payRateAmount!: string;

  @Column({
    name: 'employer_cost_rate_amount',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  employerCostRateAmount!: string;

  @Column({ name: 'monthly_target_minutes', type: 'integer', default: 9600 })
  monthlyTargetMinutes!: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;
}

export enum ObligationFrequency {
  Monthly = 'MENSUELLE',
  Quarterly = 'TRIMESTRIELLE',
  Annual = 'ANNUELLE',
}

export interface ObligationApplicability {
  legalForms?: DossierLegalForm[];
  taxRegimes?: DossierTaxRegime[];
  requiresVat?: boolean;
  requiresEmployees?: boolean;
}

@Entity({ schema: 'accounting', name: 'obligation_templates' })
@Index(['organizationId', 'isActive'])
@Index(['code', 'version'])
@Check(`"due_day" BETWEEN 1 AND 31`)
@Check(`"due_month_offset" BETWEEN 0 AND 12`)
@Check(`"annual_due_month" IS NULL OR "annual_due_month" BETWEEN 1 AND 12`)
export class ObligationTemplate extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  @Column({ length: 80 })
  code!: string;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @Column({ length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 30 })
  frequency!: ObligationFrequency;

  @Column({ name: 'due_day', type: 'smallint' })
  dueDay!: number;

  @Column({ name: 'due_month_offset', type: 'smallint', default: 1 })
  dueMonthOffset!: number;

  @Column({
    name: 'annual_due_month',
    type: 'smallint',
    nullable: true,
  })
  annualDueMonth!: number | null;

  @Column({
    name: 'physical_person_due_day',
    type: 'smallint',
    nullable: true,
  })
  physicalPersonDueDay!: number | null;

  @Column({
    name: 'totally_exporting_due_day',
    type: 'smallint',
    nullable: true,
  })
  totallyExportingDueDay!: number | null;

  @Column({ name: 'applicability_json', type: 'jsonb', default: '{}' })
  applicability!: ObligationApplicability;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({
    name: 'source_label',
    type: 'varchar',
    length: 250,
    nullable: true,
  })
  sourceLabel!: string | null;

  @Column({ name: 'source_url', type: 'varchar', length: 1000, nullable: true })
  sourceUrl!: string | null;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @OneToMany(() => ObligationInstance, (instance) => instance.template)
  instances!: ObligationInstance[];
}

export enum ObligationStatus {
  NotStarted = 'NON_COMMENCEE',
  InProgress = 'EN_COURS',
  ReadyForReview = 'PRETE_POUR_REVISION',
  Validated = 'VALIDEE',
  Filed = 'DEPOSEE',
  Paid = 'PAYEE',
}

@Entity({ schema: 'accounting', name: 'obligation_instances' })
@Unique(['dossierId', 'templateId', 'periodStartsOn'])
@Index(['organizationId', 'dueOn', 'status'])
@Index(['dossierId', 'periodYear', 'periodMonth'])
export class ObligationInstance extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId!: string;

  @ManyToOne(() => ObligationTemplate, (template) => template.instances, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'template_id' })
  template!: ObligationTemplate;

  @Column({ name: 'period_year', type: 'integer' })
  periodYear!: number;

  @Column({ name: 'period_month', type: 'smallint', nullable: true })
  periodMonth!: number | null;

  @Column({ name: 'period_quarter', type: 'smallint', nullable: true })
  periodQuarter!: number | null;

  @Column({ name: 'period_starts_on', type: 'date' })
  periodStartsOn!: string;

  @Column({ name: 'period_ends_on', type: 'date' })
  periodEndsOn!: string;

  @Column({ name: 'due_on', type: 'date' })
  dueOn!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: ObligationStatus.NotStarted,
  })
  status!: ObligationStatus;

  @Column({ name: 'assigned_membership_id', type: 'uuid', nullable: true })
  assignedMembershipId!: string | null;

  @Column({ name: 'validated_at_utc', type: 'timestamptz', nullable: true })
  validatedAtUtc!: Date | null;

  @Column({ name: 'validated_by_user_id', type: 'uuid', nullable: true })
  validatedByUserId!: string | null;

  @Column({ name: 'filed_at_utc', type: 'timestamptz', nullable: true })
  filedAtUtc!: Date | null;

  @Column({ name: 'filed_by_user_id', type: 'uuid', nullable: true })
  filedByUserId!: string | null;

  @Column({
    name: 'amount_due',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  amountDue!: string | null;

  @Column({
    name: 'amount_paid',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  amountPaid!: string | null;

  @Column({
    name: 'payment_reference',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  paymentReference!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'last_comment', type: 'text', nullable: true })
  lastComment!: string | null;
}

export enum WorkTaskType {
  Obligation = 'OBLIGATION',
  Manual = 'MANUELLE',
}

export enum WorkTaskStatus {
  Todo = 'A_FAIRE',
  InProgress = 'EN_COURS',
  ReadyForReview = 'PRETE_POUR_REVISION',
  Completed = 'TERMINEE',
  Cancelled = 'ANNULEE',
}

export enum WorkTaskPriority {
  Low = 'BASSE',
  Normal = 'NORMALE',
  High = 'HAUTE',
  Urgent = 'URGENTE',
}

@Entity({ schema: 'accounting', name: 'work_tasks' })
@Index(['organizationId', 'dueOn', 'status'])
@Index(['dossierId', 'status'])
@Index(['assigneeMembershipId', 'status'])
export class WorkTask extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Index({ unique: true })
  @Column({ name: 'obligation_id', type: 'uuid', nullable: true })
  obligationId!: string | null;

  @OneToOne(() => ObligationInstance, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'obligation_id' })
  obligation!: ObligationInstance | null;

  @Column({ type: 'varchar', length: 20 })
  type!: WorkTaskType;

  @Column({ length: 250 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'due_on', type: 'date' })
  dueOn!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: WorkTaskPriority.Normal,
  })
  priority!: WorkTaskPriority;

  @Column({
    type: 'varchar',
    length: 30,
    default: WorkTaskStatus.Todo,
  })
  status!: WorkTaskStatus;

  @Column({ name: 'assignee_membership_id', type: 'uuid', nullable: true })
  assigneeMembershipId!: string | null;

  @ManyToOne(() => OrganizationMembership, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'assignee_membership_id' })
  assigneeMembership!: OrganizationMembership | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'completed_at_utc', type: 'timestamptz', nullable: true })
  completedAtUtc!: Date | null;

  @Column({ name: 'completed_by_user_id', type: 'uuid', nullable: true })
  completedByUserId!: string | null;

  @Column({ name: 'last_comment', type: 'text', nullable: true })
  lastComment!: string | null;

  @OneToMany(() => TaskChecklistItem, (item) => item.task)
  checklistItems!: TaskChecklistItem[];

  @OneToMany(() => TaskComment, (comment) => comment.task)
  comments!: TaskComment[];
}

@Entity({ schema: 'accounting', name: 'task_checklist_items' })
@Index(['taskId', 'position'])
export class TaskChecklistItem extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @ManyToOne(() => WorkTask, (task) => task.checklistItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'task_id' })
  task!: WorkTask;

  @Column({ length: 300 })
  label!: string;

  @Column({ type: 'integer', default: 0 })
  position!: number;

  @Column({ name: 'is_completed', default: false })
  isCompleted!: boolean;

  @Column({ name: 'completed_at_utc', type: 'timestamptz', nullable: true })
  completedAtUtc!: Date | null;

  @Column({ name: 'completed_by_user_id', type: 'uuid', nullable: true })
  completedByUserId!: string | null;
}

@Entity({ schema: 'accounting', name: 'task_comments' })
@Index(['taskId', 'createdAtUtc'])
export class TaskComment extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @ManyToOne(() => WorkTask, (task) => task.comments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'task_id' })
  task!: WorkTask;

  @Column({ name: 'author_user_id', type: 'uuid' })
  authorUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'author_user_id' })
  author!: User;

  @Column({ type: 'text' })
  body!: string;
}

export enum TimeEntryStatus {
  Draft = 'BROUILLON',
  Submitted = 'SOUMIS',
  Approved = 'APPROUVE',
  Rejected = 'REJETE',
}

export enum TimeEntrySource {
  Manual = 'MANUEL',
  Automatic = 'AUTOMATIQUE',
}

export enum WorkSessionStatus {
  Active = 'ACTIVE',
  Paused = 'EN_PAUSE',
  Completed = 'TERMINEE',
}

@Entity({ schema: 'accounting', name: 'work_sessions' })
@Index(['organizationId', 'membershipId', 'status'])
@Index(['organizationId', 'dossierId', 'startedAtUtc'])
export class WorkSession extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membership_id' })
  membership!: OrganizationMembership;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId!: string | null;

  @ManyToOne(() => WorkTask, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'task_id' })
  task!: WorkTask | null;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ default: true })
  billable!: boolean;

  @Column({ type: 'varchar', length: 20, default: WorkSessionStatus.Active })
  status!: WorkSessionStatus;

  @Column({ name: 'started_at_utc', type: 'timestamptz' })
  startedAtUtc!: Date;

  @Column({ name: 'last_heartbeat_at_utc', type: 'timestamptz' })
  lastHeartbeatAtUtc!: Date;

  @Column({ name: 'stopped_at_utc', type: 'timestamptz', nullable: true })
  stoppedAtUtc!: Date | null;

  @Column({ name: 'active_seconds', type: 'integer', default: 0 })
  activeSeconds!: number;

  @Column({ name: 'inactive_seconds', type: 'integer', default: 0 })
  inactiveSeconds!: number;

  @Column({ name: 'heartbeat_count', type: 'integer', default: 0 })
  heartbeatCount!: number;

  @Column({ name: 'idle_timeout_seconds', type: 'integer', default: 120 })
  idleTimeoutSeconds!: number;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;
}

@Entity({ schema: 'accounting', name: 'time_entries' })
@Index(['organizationId', 'dossierId', 'workDate', 'status'])
@Index(['organizationId', 'membershipId', 'workDate', 'status'])
export class TimeEntry extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membership_id' })
  membership!: OrganizationMembership;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId!: string | null;

  @ManyToOne(() => WorkTask, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'task_id' })
  task!: WorkTask | null;

  @Column({ name: 'work_date', type: 'date' })
  workDate!: string;

  @Column({ name: 'duration_minutes', type: 'integer' })
  durationMinutes!: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: TimeEntrySource.Manual,
  })
  source!: TimeEntrySource;

  @Column({ name: 'source_session_id', type: 'uuid', nullable: true })
  sourceSessionId!: string | null;

  @OneToOne(() => WorkSession, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'source_session_id' })
  sourceSession!: WorkSession | null;

  @Column({ name: 'started_at_utc', type: 'timestamptz', nullable: true })
  startedAtUtc!: Date | null;

  @Column({ name: 'stopped_at_utc', type: 'timestamptz', nullable: true })
  stoppedAtUtc!: Date | null;

  @Column({ name: 'original_duration_minutes', type: 'integer', nullable: true })
  originalDurationMinutes!: number | null;

  @Column({ name: 'correction_reason', type: 'text', nullable: true })
  correctionReason!: string | null;

  @Column({ name: 'requires_review', default: false })
  requiresReview!: boolean;

  @Column({ name: 'anomaly_code', type: 'varchar', length: 50, nullable: true })
  anomalyCode!: string | null;

  @Column({ default: true })
  billable!: boolean;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'varchar', length: 20, default: TimeEntryStatus.Draft })
  status!: TimeEntryStatus;

  @Column({ name: 'submitted_at_utc', type: 'timestamptz', nullable: true })
  submittedAtUtc!: Date | null;

  @Column({ name: 'reviewed_at_utc', type: 'timestamptz', nullable: true })
  reviewedAtUtc!: Date | null;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;
}

export enum FiscalYearStatus {
  Open = 'Open',
  Closed = 'Closed',
}

@Entity({ schema: 'accounting', name: 'fiscal_years' })
@Unique(['dossierId', 'name'])
@Index(['organizationId', 'dossierId', 'startsOn', 'endsOn'])
export class FiscalYear extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ length: 100 })
  name!: string;

  @Column({ name: 'starts_on', type: 'date' })
  startsOn!: string;

  @Column({ name: 'ends_on', type: 'date' })
  endsOn!: string;

  @Column({ type: 'varchar', length: 20, default: FiscalYearStatus.Open })
  status!: FiscalYearStatus;

  @Column({ name: 'closed_at_utc', type: 'timestamptz', nullable: true })
  closedAtUtc!: Date | null;

  @Column({ name: 'closed_by_user_id', type: 'uuid', nullable: true })
  closedByUserId!: string | null;
}

export enum LedgerAccountType {
  Asset = 'Asset',
  Liability = 'Liability',
  Equity = 'Equity',
  Revenue = 'Revenue',
  Expense = 'Expense',
  OffBalanceSheet = 'OffBalanceSheet',
}

export enum NormalBalance {
  Debit = 'Debit',
  Credit = 'Credit',
}

@Entity({ schema: 'accounting', name: 'ledger_accounts' })
@Unique(['dossierId', 'normalizedCode'])
@Index(['organizationId', 'dossierId', 'isActive'])
export class LedgerAccount extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ length: 30 })
  code!: string;

  @Column({ name: 'normalized_code', length: 30 })
  normalizedCode!: string;

  @Column({ length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 30 })
  type!: LedgerAccountType;

  @Column({ name: 'normal_balance', type: 'varchar', length: 10 })
  normalBalance!: NormalBalance;

  @Column({ name: 'parent_account_id', type: 'uuid', nullable: true })
  parentAccountId!: string | null;

  @ManyToOne(() => LedgerAccount, (account) => account.children, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'parent_account_id' })
  parentAccount!: LedgerAccount | null;

  @OneToMany(() => LedgerAccount, (account) => account.parentAccount)
  children!: LedgerAccount[];

  @Column({ name: 'allows_posting', default: true })
  allowsPosting!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}

export enum DocumentCategory {
  Inbox = 'BOITE_RECEPTION',
  Purchases = 'FACTURES_ACHATS',
  Sales = 'FACTURES_VENTES',
  Bank = 'RELEVES_BANCAIRES',
  Contracts = 'CONTRATS',
  Declarations = 'DECLARATIONS',
  Payroll = 'PAIE',
  Legal = 'JURIDIQUE',
  Other = 'DIVERS',
}

export enum DocumentProcessingStatus {
  ToProcess = 'A_TRAITER',
  Processed = 'TRAITE',
}

export enum ExtractionStatus {
  NotRequested = 'NON_DEMANDEE',
  Pending = 'EN_ATTENTE',
  Processing = 'EN_COURS',
  Completed = 'TERMINEE',
  Failed = 'ECHEC',
  Validated = 'VALIDEE',
}

export enum MalwareScanStatus {
  NotScanned = 'NON_ANALYSE',
  Clean = 'SAIN',
  Infected = 'INFECTE',
  Failed = 'ERREUR',
}

export enum DocumentRequestStatus {
  Requested = 'DEMANDEE',
  Received = 'RECUE',
  Validated = 'VALIDEE',
  Rejected = 'REJETEE',
  Cancelled = 'ANNULEE',
}

@Entity({ schema: 'accounting', name: 'accounting_documents' })
@Index(['organizationId', 'dossierId', 'periodYear', 'periodMonth'])
@Index(['organizationId', 'category', 'processingStatus'])
export class AccountingDocument extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId!: string | null;

  @ManyToOne(() => WorkTask, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'task_id' })
  task!: WorkTask | null;

  @Column({ name: 'obligation_id', type: 'uuid', nullable: true })
  obligationId!: string | null;

  @ManyToOne(() => ObligationInstance, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'obligation_id' })
  obligation!: ObligationInstance | null;

  @Column({ name: 'original_name', length: 300 })
  originalName!: string;

  @Column({ name: 'object_key', length: 1000, unique: true })
  objectKey!: string;

  @Column({ name: 'mime_type', length: 150 })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: string;

  @Column({ type: 'varchar', length: 40 })
  category!: DocumentCategory;

  @Column({ name: 'period_year', type: 'integer', nullable: true })
  periodYear!: number | null;

  @Column({ name: 'period_month', type: 'smallint', nullable: true })
  periodMonth!: number | null;

  @Column({
    name: 'processing_status',
    type: 'varchar',
    length: 20,
    default: DocumentProcessingStatus.ToProcess,
  })
  processingStatus!: DocumentProcessingStatus;

  @Column({
    name: 'extraction_status',
    type: 'varchar',
    length: 20,
    default: ExtractionStatus.NotRequested,
  })
  extractionStatus!: ExtractionStatus;

  @Column({ name: 'extracted_data', type: 'jsonb', nullable: true })
  extractedData!: Record<string, unknown> | null;

  @Column({
    name: 'malware_scan_status',
    type: 'varchar',
    length: 20,
    default: MalwareScanStatus.NotScanned,
  })
  malwareScanStatus!: MalwareScanStatus;

  @Column({
    name: 'malware_signature',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  malwareSignature!: string | null;

  @Column({
    name: 'malware_scanned_at_utc',
    type: 'timestamptz',
    nullable: true,
  })
  malwareScannedAtUtc!: Date | null;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @Column({ name: 'replaces_document_id', type: 'uuid', nullable: true })
  replacesDocumentId!: string | null;

  @ManyToOne(() => AccountingDocument, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'replaces_document_id' })
  replacesDocument!: AccountingDocument | null;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid' })
  uploadedByUserId!: string;

  @Column({ name: 'is_client_visible', default: false })
  isClientVisible!: boolean;

  @Column({ name: 'deleted_at_utc', type: 'timestamptz', nullable: true })
  deletedAtUtc!: Date | null;
}

@Entity({ schema: 'accounting', name: 'missing_document_expectations' })
@Unique(['dossierId', 'periodYear', 'periodMonth', 'label'])
@Index(['organizationId', 'dossierId', 'periodYear', 'periodMonth'])
export class MissingDocumentExpectation extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'period_year', type: 'integer' })
  periodYear!: number;

  @Column({ name: 'period_month', type: 'smallint' })
  periodMonth!: number;

  @Column({ length: 250 })
  label!: string;

  @Column({ type: 'varchar', length: 40 })
  category!: DocumentCategory;

  @Column({ name: 'due_on', type: 'date', nullable: true })
  dueOn!: string | null;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: DocumentRequestStatus.Requested,
  })
  status!: DocumentRequestStatus;

  @Column({ name: 'requested_by_user_id', type: 'uuid', nullable: true })
  requestedByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'requested_by_user_id' })
  requestedByUser!: User | null;

  @Column({ name: 'requested_at_utc', type: 'timestamptz', nullable: true })
  requestedAtUtc!: Date | null;

  @Column({ name: 'received_document_id', type: 'uuid', nullable: true })
  receivedDocumentId!: string | null;

  @ManyToOne(() => AccountingDocument, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'received_document_id' })
  receivedDocument!: AccountingDocument | null;

  @Column({ name: 'validated_by_user_id', type: 'uuid', nullable: true })
  validatedByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'validated_by_user_id' })
  validatedByUser!: User | null;

  @Column({ name: 'validated_at_utc', type: 'timestamptz', nullable: true })
  validatedAtUtc!: Date | null;

  @Column({ name: 'rejected_by_user_id', type: 'uuid', nullable: true })
  rejectedByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'rejected_by_user_id' })
  rejectedByUser!: User | null;

  @Column({ name: 'rejected_at_utc', type: 'timestamptz', nullable: true })
  rejectedAtUtc!: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'cancelled_at_utc', type: 'timestamptz', nullable: true })
  cancelledAtUtc!: Date | null;
}

export enum NotificationChannel {
  InApp = 'IN_APP',
  Email = 'EMAIL',
}

@Entity({ schema: 'accounting', name: 'notifications' })
@Index(['recipientUserId', 'readAtUtc', 'createdAtUtc'])
@Index(['organizationId', 'deduplicationKey'], { unique: true })
export class Notification extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'recipient_user_id', type: 'uuid' })
  recipientUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_user_id' })
  recipientUser!: User;

  @Column({ length: 80 })
  type!: string;

  @Column({ length: 250 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 80, nullable: true })
  entityType!: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: NotificationChannel.InApp,
  })
  channel!: NotificationChannel;

  @Column({ name: 'deduplication_key', length: 300 })
  deduplicationKey!: string;

  @Column({ name: 'read_at_utc', type: 'timestamptz', nullable: true })
  readAtUtc!: Date | null;
}

export enum MonthlyDeclarationStatus {
  Draft = 'BROUILLON',
  ReadyForReview = 'PRETE_POUR_REVISION',
  Rejected = 'REJETEE',
  Validated = 'VALIDEE',
  Filed = 'DEPOSEE',
}

export enum MonthlyDeclarationCalculationMode {
  Automatic = 'AUTOMATIQUE',
  Adjusted = 'AJUSTEE',
}

@Entity({ schema: 'accounting', name: 'monthly_tax_declarations' })
@Unique(['dossierId', 'periodYear', 'periodMonth'])
@Index(['organizationId', 'periodYear', 'periodMonth', 'status'])
export class MonthlyTaxDeclaration extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'obligation_id', type: 'uuid', nullable: true })
  obligationId!: string | null;

  @ManyToOne(() => ObligationInstance, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'obligation_id' })
  obligation!: ObligationInstance | null;

  @Column({ name: 'period_year', type: 'integer' })
  periodYear!: number;

  @Column({ name: 'period_month', type: 'smallint' })
  periodMonth!: number;

  @Column({ name: 'vat_collected', type: 'decimal', precision: 15, scale: 3 })
  vatCollected!: string;

  @Column({ name: 'vat_deductible', type: 'decimal', precision: 15, scale: 3 })
  vatDeductible!: string;

  @Column({
    name: 'vat_credit_previous',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  vatCreditPrevious!: string;

  @Column({ name: 'vat_due', type: 'decimal', precision: 15, scale: 3 })
  vatDue!: string;

  @Column({ name: 'vat_credit_next', type: 'decimal', precision: 15, scale: 3 })
  vatCreditNext!: string;

  @Column({ name: 'withholding_tax', type: 'decimal', precision: 15, scale: 3 })
  withholdingTax!: string;

  @Column({
    name: 'withholding_base',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  withholdingBase!: string | null;

  @Column({
    name: 'withholding_nature',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  withholdingNature!: string | null;

  @Column({
    name: 'withholding_rate',
    type: 'decimal',
    precision: 8,
    scale: 5,
    nullable: true,
  })
  withholdingRate!: string | null;

  @Column({ name: 'tfp_base', type: 'decimal', precision: 15, scale: 3 })
  tfpBase!: string;

  @Column({ name: 'tfp_rate', type: 'decimal', precision: 8, scale: 5 })
  tfpRate!: string;

  @Column({ name: 'tfp_due', type: 'decimal', precision: 15, scale: 3 })
  tfpDue!: string;

  @Column({ name: 'foprolos_base', type: 'decimal', precision: 15, scale: 3 })
  foprolosBase!: string;

  @Column({ name: 'foprolos_rate', type: 'decimal', precision: 8, scale: 5 })
  foprolosRate!: string;

  @Column({ name: 'foprolos_due', type: 'decimal', precision: 15, scale: 3 })
  foprolosDue!: string;

  @Column({ name: 'tcl_base', type: 'decimal', precision: 15, scale: 3 })
  tclBase!: string;

  @Column({ name: 'tcl_rate', type: 'decimal', precision: 8, scale: 5 })
  tclRate!: string;

  @Column({ name: 'tcl_due', type: 'decimal', precision: 15, scale: 3 })
  tclDue!: string;

  @Column({ name: 'stamp_duty', type: 'decimal', precision: 15, scale: 3 })
  stampDuty!: string;

  @Column({ name: 'total_due', type: 'decimal', precision: 15, scale: 3 })
  totalDue!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: MonthlyDeclarationStatus.Draft,
  })
  status!: MonthlyDeclarationStatus;

  @Column({ name: 'snapshot_json', type: 'jsonb', nullable: true })
  snapshotJson!: Record<string, unknown> | null;

  @Column({ name: 'parameter_snapshot', type: 'jsonb', nullable: true })
  parameterSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'source_snapshot', type: 'jsonb', nullable: true })
  sourceSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'checks_json', type: 'jsonb', nullable: true })
  checksJson!: Record<string, unknown> | null;

  @Column({
    name: 'calculation_mode',
    type: 'varchar',
    length: 20,
    default: MonthlyDeclarationCalculationMode.Automatic,
  })
  calculationMode!: MonthlyDeclarationCalculationMode;

  @Column({ name: 'adjustment_reason', type: 'text', nullable: true })
  adjustmentReason!: string | null;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @Column({ name: 'reviewed_at_utc', type: 'timestamptz', nullable: true })
  reviewedAtUtc!: Date | null;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment!: string | null;

  @Column({ name: 'validated_by_user_id', type: 'uuid', nullable: true })
  validatedByUserId!: string | null;

  @Column({ name: 'validated_at_utc', type: 'timestamptz', nullable: true })
  validatedAtUtc!: Date | null;

  @Column({ name: 'filed_at_utc', type: 'timestamptz', nullable: true })
  filedAtUtc!: Date | null;

  @Column({ name: 'filed_by_user_id', type: 'uuid', nullable: true })
  filedByUserId!: string | null;

  @Column({
    name: 'filing_reference',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  filingReference!: string | null;

  @Column({ name: 'receipt_document_id', type: 'uuid', nullable: true })
  receiptDocumentId!: string | null;

  @ManyToOne(() => AccountingDocument, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'receipt_document_id' })
  receiptDocument!: AccountingDocument | null;
}

export enum JournalType {
  Purchases = 'ACHATS',
  Sales = 'VENTES',
  Bank = 'BANQUE',
  Cash = 'CAISSE',
  Miscellaneous = 'OPERATIONS_DIVERSES',
  Payroll = 'PAIE',
}

@Entity({ schema: 'accounting', name: 'accounting_journals' })
@Unique(['dossierId', 'code'])
export class AccountingJournal extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ length: 20 })
  code!: string;

  @Column({ length: 150 })
  name!: string;

  @Column({ type: 'varchar', length: 30 })
  type!: JournalType;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}

export enum JournalEntryStatus {
  Draft = 'BROUILLON',
  PendingReview = 'A_VALIDER',
  Rejected = 'REJETEE',
  Posted = 'COMPTABILISEE',
  Reversed = 'EXTOURNEE',
}

@Entity({ schema: 'accounting', name: 'journal_entries' })
@Index(['organizationId', 'dossierId', 'entryDate', 'status'])
export class JournalEntry extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'journal_id', type: 'uuid' })
  journalId!: string;

  @ManyToOne(() => AccountingJournal, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'journal_id' })
  journal!: AccountingJournal;

  @Column({ name: 'entry_date', type: 'date' })
  entryDate!: string;

  @Column({ name: 'piece_reference', length: 100 })
  pieceReference!: string;

  @Column({ length: 300 })
  description!: string;

  @Column({ type: 'varchar', length: 20, default: JournalEntryStatus.Draft })
  status!: JournalEntryStatus;

  @Column({ name: 'total_debit', type: 'decimal', precision: 15, scale: 3 })
  totalDebit!: string;

  @Column({ name: 'total_credit', type: 'decimal', precision: 15, scale: 3 })
  totalCredit!: string;

  @Column({ name: 'source_document_id', type: 'uuid', nullable: true })
  sourceDocumentId!: string | null;

  @ManyToOne(() => AccountingDocument, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'source_document_id' })
  sourceDocument!: AccountingDocument | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'posted_by_user_id', type: 'uuid', nullable: true })
  postedByUserId!: string | null;

  @Column({ name: 'posted_at_utc', type: 'timestamptz', nullable: true })
  postedAtUtc!: Date | null;

  @Column({ name: 'submitted_by_user_id', type: 'uuid', nullable: true })
  submittedByUserId!: string | null;

  @Column({ name: 'submitted_at_utc', type: 'timestamptz', nullable: true })
  submittedAtUtc!: Date | null;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @Column({ name: 'reviewed_at_utc', type: 'timestamptz', nullable: true })
  reviewedAtUtc!: Date | null;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment!: string | null;

  @Column({ name: 'reversal_entry_id', type: 'uuid', nullable: true })
  reversalEntryId!: string | null;

  @OneToMany(() => JournalEntryLine, (line) => line.entry)
  lines!: JournalEntryLine[];
}

@Entity({ schema: 'accounting', name: 'journal_entry_lines' })
@Index(['organizationId', 'accountId'])
export class JournalEntryLine extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'entry_id', type: 'uuid' })
  entryId!: string;

  @ManyToOne(() => JournalEntry, (entry) => entry.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'entry_id' })
  entry!: JournalEntry;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account!: LedgerAccount;

  @Column({ length: 300 })
  label!: string;

  @Column({ type: 'decimal', precision: 15, scale: 3, default: 0 })
  debit!: string;

  @Column({ type: 'decimal', precision: 15, scale: 3, default: 0 })
  credit!: string;

  @Column({
    name: 'third_party_name',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  thirdPartyName!: string | null;

  @Column({ name: 'reconciliation_id', type: 'uuid', nullable: true })
  reconciliationId!: string | null;

  @ManyToOne(() => AccountReconciliation, (item) => item.lines, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'reconciliation_id' })
  reconciliation!: AccountReconciliation | null;

  @Column({ name: 'letter_code', type: 'varchar', length: 30, nullable: true })
  letterCode!: string | null;

  @Column({ name: 'reconciled_at_utc', type: 'timestamptz', nullable: true })
  reconciledAtUtc!: Date | null;
}

@Entity({ schema: 'accounting', name: 'account_reconciliations' })
@Unique(['dossierId', 'code'])
@Index(['organizationId', 'dossierId', 'accountId', 'reconciliationDate'])
export class AccountReconciliation extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account!: LedgerAccount;

  @Column({ length: 30 })
  code!: string;

  @Column({ name: 'reconciliation_date', type: 'date' })
  reconciliationDate!: string;

  @Column({ name: 'total_debit', type: 'decimal', precision: 15, scale: 3 })
  totalDebit!: string;

  @Column({ name: 'total_credit', type: 'decimal', precision: 15, scale: 3 })
  totalCredit!: string;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @OneToMany(() => JournalEntryLine, (line) => line.reconciliation)
  lines!: JournalEntryLine[];
}

export enum InvoiceStatus {
  Draft = 'BROUILLON',
  Sent = 'ENVOYEE',
  PartiallyPaid = 'PARTIELLEMENT_PAYEE',
  Paid = 'PAYEE',
  Overdue = 'EN_RETARD',
  Cancelled = 'ANNULEE',
}

@Entity({ schema: 'accounting', name: 'cabinet_invoices' })
@Unique(['organizationId', 'number'])
@Index(['organizationId', 'dossierId', 'status'])
export class CabinetInvoice extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ length: 50 })
  number!: string;

  @Column({ name: 'issue_date', type: 'date' })
  issueDate!: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  @Column({ length: 300 })
  description!: string;

  @Column({ name: 'net_amount', type: 'decimal', precision: 15, scale: 3 })
  netAmount!: string;

  @Column({ name: 'vat_rate', type: 'decimal', precision: 8, scale: 5 })
  vatRate!: string;

  @Column({ name: 'vat_amount', type: 'decimal', precision: 15, scale: 3 })
  vatAmount!: string;

  @Column({ name: 'stamp_duty', type: 'decimal', precision: 15, scale: 3 })
  stampDuty!: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 15, scale: 3 })
  totalAmount!: string;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 15, scale: 3 })
  paidAmount!: string;

  @Column({ type: 'varchar', length: 30, default: InvoiceStatus.Draft })
  status!: InvoiceStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;
}

@Entity({ schema: 'accounting', name: 'cabinet_payments' })
@Index(['organizationId', 'invoiceId', 'paymentDate'])
export class CabinetPayment extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId!: string;

  @ManyToOne(() => CabinetInvoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice!: CabinetInvoice;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate!: string;

  @Column({ type: 'decimal', precision: 15, scale: 3 })
  amount!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference!: string | null;

  @Column({ name: 'recorded_by_user_id', type: 'uuid' })
  recordedByUserId!: string;
}

@Entity({ schema: 'accounting', name: 'employees' })
@Index(['organizationId', 'dossierId', 'isActive'])
export class Employee extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'full_name', length: 180 })
  fullName!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cin!: string | null;

  @Column({
    name: 'cnss_number',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  cnssNumber!: string | null;

  @Column({ name: 'hire_date', type: 'date' })
  hireDate!: string;

  @Column({ name: 'contract_type', length: 50 })
  contractType!: string;

  @Column({ name: 'gross_salary', type: 'decimal', precision: 15, scale: 3 })
  grossSalary!: string;

  @Column({ name: 'is_higher_education_graduate', default: false })
  isHigherEducationGraduate!: boolean;

  @Column({ name: 'employer_support_eligible', default: false })
  employerSupportEligible!: boolean;

  @Column({ name: 'employer_support_start_date', type: 'date', nullable: true })
  employerSupportStartDate!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}

export enum PayrollRunStatus {
  Draft = 'BROUILLON',
  Validated = 'VALIDEE',
}

@Entity({ schema: 'accounting', name: 'payroll_runs' })
@Unique(['dossierId', 'periodYear', 'periodMonth'])
export class PayrollRun extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'period_year', type: 'integer' })
  periodYear!: number;

  @Column({ name: 'period_month', type: 'smallint' })
  periodMonth!: number;

  @Column({ name: 'employee_rate', type: 'decimal', precision: 8, scale: 5 })
  employeeRate!: string;

  @Column({ name: 'employer_rate', type: 'decimal', precision: 8, scale: 5 })
  employerRate!: string;

  @Column({ name: 'income_tax_rate', type: 'decimal', precision: 8, scale: 5 })
  incomeTaxRate!: string;

  @Column({ name: 'total_gross', type: 'decimal', precision: 15, scale: 3 })
  totalGross!: string;

  @Column({ name: 'total_net', type: 'decimal', precision: 15, scale: 3 })
  totalNet!: string;

  @Column({
    name: 'total_employer_cost',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  totalEmployerCost!: string;

  @Column({
    name: 'total_employer_support',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  totalEmployerSupport!: string;

  @Column({ type: 'varchar', length: 20, default: PayrollRunStatus.Draft })
  status!: PayrollRunStatus;

  @Column({ name: 'parameter_snapshot', type: 'jsonb', nullable: true })
  parameterSnapshot!: Record<string, unknown> | null;

  @OneToMany(() => PayrollLine, (line) => line.run)
  lines!: PayrollLine[];
}

@Entity({ schema: 'accounting', name: 'payroll_lines' })
export class PayrollLine extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId!: string;

  @ManyToOne(() => PayrollRun, (run) => run.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run!: PayrollRun;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'gross_salary', type: 'decimal', precision: 15, scale: 3 })
  grossSalary!: string;

  @Column({ name: 'employee_cnss', type: 'decimal', precision: 15, scale: 3 })
  employeeCnss!: string;

  @Column({ name: 'income_tax', type: 'decimal', precision: 15, scale: 3 })
  incomeTax!: string;

  @Column({ name: 'net_salary', type: 'decimal', precision: 15, scale: 3 })
  netSalary!: string;

  @Column({ name: 'employer_cnss', type: 'decimal', precision: 15, scale: 3 })
  employerCnss!: string;

  @Column({
    name: 'employer_cnss_gross',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  employerCnssGross!: string;

  @Column({
    name: 'employer_support_rate',
    type: 'decimal',
    precision: 8,
    scale: 5,
    default: 0,
  })
  employerSupportRate!: string;

  @Column({
    name: 'employer_support_amount',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  employerSupportAmount!: string;
}

export enum FiscalParameterValueType {
  Rate = 'TAUX',
  Amount = 'MONTANT',
}

export enum FiscalParameterCode {
  TfpIndustryRate = 'TFP_TAUX_INDUSTRIE',
  TfpOtherRate = 'TFP_TAUX_AUTRES',
  FoprolosRate = 'FOPROLOS_TAUX',
  TclRate = 'TCL_TAUX',
  StampDuty = 'TIMBRE_MONTANT',
  CnssEmployeeRsna = 'CNSS_RSNA_SALARIE',
  CnssEmployerRsna = 'CNSS_RSNA_EMPLOYEUR',
}

@Entity({ schema: 'accounting', name: 'fiscal_parameters' })
@Unique(['organizationId', 'code', 'effectiveFrom'])
@Index(['organizationId', 'code', 'effectiveFrom', 'effectiveTo'])
export class FiscalParameter extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  @Column({ type: 'varchar', length: 80 })
  code!: FiscalParameterCode;

  @Column({ length: 200 })
  label!: string;

  @Column({ name: 'value_type', type: 'varchar', length: 20 })
  valueType!: FiscalParameterValueType;

  @Column({ type: 'decimal', precision: 15, scale: 5 })
  value!: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({
    name: 'source_label',
    type: 'varchar',
    length: 250,
    nullable: true,
  })
  sourceLabel!: string | null;

  @Column({
    name: 'source_url',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  sourceUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;
}

@Entity({ schema: 'accounting', name: 'vat_rates' })
@Unique(['organizationId', 'code', 'effectiveFrom'])
@Index(['organizationId', 'effectiveFrom', 'effectiveTo'])
export class VatRate extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ length: 30 })
  code!: string;

  @Column({ length: 160 })
  label!: string;

  @Column({ type: 'decimal', precision: 8, scale: 5 })
  rate!: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({
    name: 'source_label',
    type: 'varchar',
    length: 250,
    nullable: true,
  })
  sourceLabel!: string | null;

  @Column({
    name: 'source_url',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  sourceUrl!: string | null;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;
}

@Entity({ schema: 'accounting', name: 'withholding_tax_rates' })
@Unique(['organizationId', 'natureCode', 'effectiveFrom'])
@Index(['organizationId', 'natureCode', 'effectiveFrom', 'effectiveTo'])
export class WithholdingTaxRate extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'nature_code', length: 80 })
  natureCode!: string;

  @Column({ length: 200 })
  label!: string;

  @Column({ type: 'decimal', precision: 8, scale: 5 })
  rate!: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({
    name: 'source_label',
    type: 'varchar',
    length: 250,
    nullable: true,
  })
  sourceLabel!: string | null;

  @Column({
    name: 'source_url',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  sourceUrl!: string | null;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;
}

@Entity({ schema: 'accounting', name: 'income_tax_brackets' })
@Unique(['organizationId', 'effectiveFrom', 'lowerBound'])
@Index(['organizationId', 'effectiveFrom', 'effectiveTo'])
export class IncomeTaxBracket extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({
    name: 'lower_bound',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  lowerBound!: string;

  @Column({
    name: 'upper_bound',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  upperBound!: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 5 })
  rate!: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({
    name: 'source_label',
    type: 'varchar',
    length: 250,
    nullable: true,
  })
  sourceLabel!: string | null;

  @Column({
    name: 'source_url',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  sourceUrl!: string | null;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;
}

export enum RegulatoryRuleStatus {
  Active = 'ACTIVE',
  ActionRequired = 'ACTION_REQUISE',
  PendingImplementation = 'TEXTE_APPLICATION_ATTENDU',
  Informational = 'INFORMATION',
}

@Entity({ schema: 'accounting', name: 'regulatory_rules' })
@Unique(['code', 'effectiveFrom'])
@Index(['effectiveFrom', 'effectiveTo', 'status'])
export class RegulatoryRule extends AuditableEntity {
  @Column({ type: 'varchar', length: 80 })
  code!: string;

  @Column({ type: 'varchar', length: 80 })
  category!: string;

  @Column({ type: 'varchar', length: 240 })
  title!: string;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ name: 'article_reference', type: 'varchar', length: 80 })
  articleReference!: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({ type: 'varchar', length: 40 })
  status!: RegulatoryRuleStatus;

  @Column({ name: 'impacted_modules', type: 'jsonb', default: () => "'[]'" })
  impactedModules!: string[];

  @Column({ name: 'applicability', type: 'jsonb', default: () => "'{}'" })
  applicability!: Record<string, unknown>;

  @Column({ name: 'source_label', type: 'varchar', length: 250 })
  sourceLabel!: string;

  @Column({ name: 'source_url', type: 'varchar', length: 1000 })
  sourceUrl!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}

export enum BusinessInvoiceType {
  Purchase = 'ACHAT',
  Sale = 'VENTE',
}

export enum BusinessInvoiceNature {
  Goods = 'BIENS',
  Services = 'SERVICES',
  Mixed = 'MIXTE',
}

export enum ThirdPartyType {
  Customer = 'CLIENT',
  Supplier = 'FOURNISSEUR',
  Both = 'CLIENT_ET_FOURNISSEUR',
}

@Entity({ schema: 'accounting', name: 'third_parties' })
@Unique(['dossierId', 'type', 'name'])
@Index(['organizationId', 'dossierId', 'isActive'])
export class ThirdParty extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ type: 'varchar', length: 30 })
  type!: ThirdPartyType;

  @Column({ length: 200 })
  name!: string;

  @Column({
    name: 'tax_identifier',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  taxIdentifier!: string | null;

  @Column({ name: 'rne_number', type: 'varchar', length: 100, nullable: true })
  rneNumber!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'receivable_account_id', type: 'uuid', nullable: true })
  receivableAccountId!: string | null;

  @Column({ name: 'payable_account_id', type: 'uuid', nullable: true })
  payableAccountId!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}

export enum CommercialDocumentDirection {
  Purchase = 'ACHAT',
  Sale = 'VENTE',
}

export enum CommercialDocumentKind {
  Quote = 'DEVIS',
  Order = 'COMMANDE',
  DeliveryNote = 'BON_LIVRAISON',
  ReceiptNote = 'BON_RECEPTION',
}

export enum CommercialDocumentStatus {
  Draft = 'BROUILLON',
  Confirmed = 'CONFIRME',
  Converted = 'CONVERTI',
  Cancelled = 'ANNULE',
}

@Entity({ schema: 'accounting', name: 'commercial_documents' })
@Unique(['dossierId', 'direction', 'kind', 'number'])
@Index(['organizationId', 'dossierId', 'issueDate', 'kind'])
export class CommercialDocument extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ type: 'varchar', length: 20 })
  direction!: CommercialDocumentDirection;

  @Column({ type: 'varchar', length: 30 })
  kind!: CommercialDocumentKind;

  @Column({ type: 'varchar', length: 25 })
  status!: CommercialDocumentStatus;

  @Column({ length: 80 })
  number!: string;

  @Column({ name: 'issue_date', type: 'date' })
  issueDate!: string;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil!: string | null;

  @Column({ name: 'third_party_id', type: 'uuid' })
  thirdPartyId!: string;

  @ManyToOne(() => ThirdParty, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'third_party_id' })
  thirdParty!: ThirdParty;

  @Column({ name: 'currency_code', type: 'varchar', length: 3, default: 'TND' })
  currencyCode!: string;

  @Column({ name: 'net_amount', type: 'decimal', precision: 15, scale: 3 })
  netAmount!: string;

  @Column({ name: 'vat_amount', type: 'decimal', precision: 15, scale: 3 })
  vatAmount!: string;

  @Column({ name: 'gross_amount', type: 'decimal', precision: 15, scale: 3 })
  grossAmount!: string;

  @Column({ name: 'source_document_id', type: 'uuid', nullable: true })
  sourceDocumentId!: string | null;

  @Column({ name: 'converted_to_document_id', type: 'uuid', nullable: true })
  convertedToDocumentId!: string | null;

  @Column({ name: 'business_invoice_id', type: 'uuid', nullable: true })
  businessInvoiceId!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'confirmed_by_user_id', type: 'uuid', nullable: true })
  confirmedByUserId!: string | null;

  @Column({ name: 'confirmed_at_utc', type: 'timestamptz', nullable: true })
  confirmedAtUtc!: Date | null;

  @OneToMany(() => CommercialDocumentLine, (line) => line.document)
  lines!: CommercialDocumentLine[];
}

@Entity({ schema: 'accounting', name: 'commercial_document_lines' })
@Index(['organizationId', 'documentId'])
export class CommercialDocumentLine extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => CommercialDocument, (document) => document.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document!: CommercialDocument;

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId!: string | null;

  @ManyToOne(() => LedgerAccount, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'account_id' })
  account!: LedgerAccount | null;

  @Column({ length: 300 })
  description!: string;

  @Column({ type: 'decimal', precision: 15, scale: 3 })
  quantity!: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 3 })
  unitPrice!: string;

  @Column({
    name: 'discount_rate',
    type: 'decimal',
    precision: 8,
    scale: 5,
  })
  discountRate!: string;

  @Column({ name: 'vat_code', type: 'varchar', length: 30, nullable: true })
  vatCode!: string | null;

  @Column({ name: 'vat_rate', type: 'decimal', precision: 8, scale: 5 })
  vatRate!: string;

  @Column({ name: 'net_amount', type: 'decimal', precision: 15, scale: 3 })
  netAmount!: string;

  @Column({ name: 'vat_amount', type: 'decimal', precision: 15, scale: 3 })
  vatAmount!: string;

  @Column({ name: 'gross_amount', type: 'decimal', precision: 15, scale: 3 })
  grossAmount!: string;
}

export enum BusinessInvoiceKind {
  Invoice = 'FACTURE',
  CreditNote = 'AVOIR',
}

export enum InvoiceSettlementStatus {
  Unpaid = 'NON_REGLEE',
  PartiallyPaid = 'PARTIELLEMENT_REGLEE',
  Paid = 'REGLEE',
}

export enum BusinessInvoiceStatus {
  Draft = 'BROUILLON',
  Validated = 'VALIDEE',
  Posted = 'COMPTABILISEE',
  Cancelled = 'ANNULEE',
}

@Entity({ schema: 'accounting', name: 'business_invoices' })
@Unique(['dossierId', 'type', 'kind', 'number'])
@Index(['organizationId', 'dossierId', 'invoiceDate', 'type'])
export class BusinessInvoice extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ type: 'varchar', length: 20 })
  type!: BusinessInvoiceType;

  @Column({
    type: 'varchar',
    length: 20,
    default: BusinessInvoiceNature.Mixed,
  })
  nature!: BusinessInvoiceNature;

  @Column({
    type: 'varchar',
    length: 20,
    default: BusinessInvoiceKind.Invoice,
  })
  kind!: BusinessInvoiceKind;

  @Column({ length: 80 })
  number!: string;

  @Column({ name: 'invoice_date', type: 'date' })
  invoiceDate!: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: string | null;

  @Column({ name: 'third_party_name', length: 200 })
  thirdPartyName!: string;

  @Column({
    name: 'third_party_tax_identifier',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  thirdPartyTaxIdentifier!: string | null;

  @Column({ name: 'third_party_id', type: 'uuid', nullable: true })
  thirdPartyId!: string | null;

  @ManyToOne(() => ThirdParty, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'third_party_id' })
  thirdParty!: ThirdParty | null;

  @Column({ name: 'original_invoice_id', type: 'uuid', nullable: true })
  originalInvoiceId!: string | null;

  @Column({ name: 'journal_id', type: 'uuid' })
  journalId!: string;

  @ManyToOne(() => AccountingJournal, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'journal_id' })
  journal!: AccountingJournal;

  @Column({ name: 'third_party_account_id', type: 'uuid' })
  thirdPartyAccountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'third_party_account_id' })
  thirdPartyAccount!: LedgerAccount;

  @Column({ name: 'vat_account_id', type: 'uuid', nullable: true })
  vatAccountId!: string | null;

  @Column({ name: 'stamp_account_id', type: 'uuid', nullable: true })
  stampAccountId!: string | null;

  @Column({ name: 'withholding_account_id', type: 'uuid', nullable: true })
  withholdingAccountId!: string | null;

  @Column({ name: 'net_amount', type: 'decimal', precision: 15, scale: 3 })
  netAmount!: string;

  @Column({ name: 'vat_amount', type: 'decimal', precision: 15, scale: 3 })
  vatAmount!: string;

  @Column({ name: 'stamp_duty', type: 'decimal', precision: 15, scale: 3 })
  stampDuty!: string;

  @Column({
    name: 'withholding_base',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  withholdingBase!: string;

  @Column({
    name: 'withholding_rate',
    type: 'decimal',
    precision: 8,
    scale: 5,
    nullable: true,
  })
  withholdingRate!: string | null;

  @Column({
    name: 'withholding_amount',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  withholdingAmount!: string;

  @Column({ name: 'gross_amount', type: 'decimal', precision: 15, scale: 3 })
  grossAmount!: string;

  @Column({ name: 'net_payable', type: 'decimal', precision: 15, scale: 3 })
  netPayable!: string;

  @Column({
    name: 'paid_amount',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  paidAmount!: string;

  @Column({
    name: 'credited_amount',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  creditedAmount!: string;

  @Column({
    name: 'outstanding_amount',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  outstandingAmount!: string;

  @Column({
    name: 'settlement_status',
    type: 'varchar',
    length: 30,
    default: InvoiceSettlementStatus.Unpaid,
  })
  settlementStatus!: InvoiceSettlementStatus;

  @Column({
    type: 'varchar',
    length: 25,
    default: BusinessInvoiceStatus.Draft,
  })
  status!: BusinessInvoiceStatus;

  @Column({ name: 'source_document_id', type: 'uuid', nullable: true })
  sourceDocumentId!: string | null;

  @Column({
    name: 'source_commercial_document_id',
    type: 'uuid',
    nullable: true,
  })
  sourceCommercialDocumentId!: string | null;

  @ManyToOne(() => CommercialDocument, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'source_commercial_document_id' })
  sourceCommercialDocument!: CommercialDocument | null;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId!: string | null;

  @Column({ name: 'tax_snapshot', type: 'jsonb', nullable: true })
  taxSnapshot!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'validated_by_user_id', type: 'uuid', nullable: true })
  validatedByUserId!: string | null;

  @Column({ name: 'validated_at_utc', type: 'timestamptz', nullable: true })
  validatedAtUtc!: Date | null;

  @OneToMany(() => BusinessInvoiceLine, (line) => line.invoice)
  lines!: BusinessInvoiceLine[];
}

@Entity({ schema: 'accounting', name: 'business_invoice_lines' })
@Index(['organizationId', 'invoiceId'])
export class BusinessInvoiceLine extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId!: string;

  @ManyToOne(() => BusinessInvoice, (invoice) => invoice.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'invoice_id' })
  invoice!: BusinessInvoice;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account!: LedgerAccount;

  @Column({ length: 300 })
  description!: string;

  @Column({ type: 'decimal', precision: 15, scale: 3 })
  quantity!: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 3 })
  unitPrice!: string;

  @Column({
    name: 'discount_rate',
    type: 'decimal',
    precision: 8,
    scale: 5,
  })
  discountRate!: string;

  @Column({ name: 'vat_code', type: 'varchar', length: 30, nullable: true })
  vatCode!: string | null;

  @Column({ name: 'vat_rate', type: 'decimal', precision: 8, scale: 5 })
  vatRate!: string;

  @Column({ name: 'net_amount', type: 'decimal', precision: 15, scale: 3 })
  netAmount!: string;

  @Column({ name: 'vat_amount', type: 'decimal', precision: 15, scale: 3 })
  vatAmount!: string;

  @Column({ name: 'gross_amount', type: 'decimal', precision: 15, scale: 3 })
  grossAmount!: string;
}

export enum PaymentDirection {
  Receipt = 'ENCAISSEMENT',
  Disbursement = 'DECAISSEMENT',
}

export enum ThirdPartyPaymentStatus {
  Draft = 'BROUILLON',
  Posted = 'COMPTABILISE',
  Cancelled = 'ANNULE',
}

@Entity({ schema: 'accounting', name: 'third_party_payments' })
@Index(['organizationId', 'dossierId', 'paymentDate', 'status'])
export class ThirdPartyPayment extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ name: 'third_party_id', type: 'uuid' })
  thirdPartyId!: string;

  @ManyToOne(() => ThirdParty, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'third_party_id' })
  thirdParty!: ThirdParty;

  @Column({ type: 'varchar', length: 20 })
  direction!: PaymentDirection;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate!: string;

  @Column({ type: 'decimal', precision: 15, scale: 3 })
  amount!: string;

  @Column({ length: 50 })
  method!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reference!: string | null;

  @Column({ name: 'journal_id', type: 'uuid' })
  journalId!: string;

  @Column({ name: 'cash_account_id', type: 'uuid' })
  cashAccountId!: string;

  @Column({ name: 'third_party_account_id', type: 'uuid' })
  thirdPartyAccountId!: string;

  @Column({ name: 'journal_entry_id', type: 'uuid' })
  journalEntryId!: string;

  @Column({
    type: 'varchar',
    length: 25,
    default: ThirdPartyPaymentStatus.Draft,
  })
  status!: ThirdPartyPaymentStatus;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'posted_by_user_id', type: 'uuid', nullable: true })
  postedByUserId!: string | null;

  @Column({ name: 'posted_at_utc', type: 'timestamptz', nullable: true })
  postedAtUtc!: Date | null;

  @OneToMany(() => PaymentAllocation, (allocation) => allocation.payment)
  allocations!: PaymentAllocation[];
}

@Entity({ schema: 'accounting', name: 'payment_allocations' })
@Unique(['paymentId', 'invoiceId'])
export class PaymentAllocation extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @ManyToOne(() => ThirdPartyPayment, (payment) => payment.allocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'payment_id' })
  payment!: ThirdPartyPayment;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId!: string;

  @ManyToOne(() => BusinessInvoice, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'invoice_id' })
  invoice!: BusinessInvoice;

  @Column({ type: 'decimal', precision: 15, scale: 3 })
  amount!: string;
}

export enum BankStatementStatus {
  Imported = 'IMPORTE',
  PartiallyMatched = 'PARTIELLEMENT_RAPPROCHE',
  Ready = 'PRET_A_VALIDER',
  Reconciled = 'RAPPROCHE',
}

export enum BankTransactionStatus {
  Unmatched = 'NON_RAPPROCHEE',
  DraftEntry = 'ECRITURE_BROUILLON',
  Matched = 'RAPPROCHEE',
}

export enum BankMatchType {
  Automatic = 'AUTOMATIQUE',
  Payment = 'REGLEMENT',
  JournalEntry = 'ECRITURE',
  GeneratedEntry = 'ECRITURE_GENEREE',
}

export enum BankRuleMatchType {
  Contains = 'CONTIENT',
  StartsWith = 'COMMENCE_PAR',
  Exact = 'EXACT',
}

export enum BankRuleDirection {
  Any = 'TOUS',
  Debit = 'DEBIT',
  Credit = 'CREDIT',
}

@Entity({ schema: 'accounting', name: 'bank_accounts' })
@Unique(['dossierId', 'name'])
@Index(['organizationId', 'dossierId', 'isActive'])
export class BankAccount extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ length: 150 })
  name!: string;

  @Column({ name: 'bank_name', length: 150 })
  bankName!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  iban!: string | null;

  @Column({ name: 'ledger_account_id', type: 'uuid' })
  ledgerAccountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ledger_account_id' })
  ledgerAccount!: LedgerAccount;

  @Column({ name: 'journal_id', type: 'uuid' })
  journalId!: string;

  @ManyToOne(() => AccountingJournal, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'journal_id' })
  journal!: AccountingJournal;

  @Column({ length: 3, default: 'TND' })
  currency!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}

@Entity({ schema: 'accounting', name: 'bank_statements' })
@Unique(['bankAccountId', 'periodStart', 'periodEnd'])
@Index(['organizationId', 'dossierId', 'periodStart', 'periodEnd'])
export class BankStatement extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'bank_account_id', type: 'uuid' })
  bankAccountId!: string;

  @ManyToOne(() => BankAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount!: BankAccount;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: string;

  @Column({ name: 'opening_balance', type: 'decimal', precision: 15, scale: 3 })
  openingBalance!: string;

  @Column({ name: 'closing_balance', type: 'decimal', precision: 15, scale: 3 })
  closingBalance!: string;

  @Column({
    name: 'book_closing_balance',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  bookClosingBalance!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 3, nullable: true })
  difference!: string | null;

  @Column({ name: 'source_file_name', length: 300 })
  sourceFileName!: string;

  @Column({ name: 'row_count', type: 'integer' })
  rowCount!: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: BankStatementStatus.Imported,
  })
  status!: BankStatementStatus;

  @Column({ name: 'imported_by_user_id', type: 'uuid' })
  importedByUserId!: string;

  @Column({ name: 'reconciled_by_user_id', type: 'uuid', nullable: true })
  reconciledByUserId!: string | null;

  @Column({ name: 'reconciled_at_utc', type: 'timestamptz', nullable: true })
  reconciledAtUtc!: Date | null;

  @OneToMany(() => BankTransaction, (transaction) => transaction.statement)
  transactions!: BankTransaction[];
}

@Entity({ schema: 'accounting', name: 'bank_transactions' })
@Unique(['bankAccountId', 'fingerprint'])
@Index(['organizationId', 'dossierId', 'transactionDate', 'status'])
export class BankTransaction extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ name: 'bank_account_id', type: 'uuid' })
  bankAccountId!: string;

  @ManyToOne(() => BankAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount!: BankAccount;

  @Column({ name: 'statement_id', type: 'uuid' })
  statementId!: string;

  @ManyToOne(() => BankStatement, (statement) => statement.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'statement_id' })
  statement!: BankStatement;

  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate!: string;

  @Column({ name: 'value_date', type: 'date', nullable: true })
  valueDate!: string | null;

  @Column({ length: 500 })
  description!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  reference!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 3 })
  amount!: string;

  @Column({ type: 'decimal', precision: 15, scale: 3, nullable: true })
  balance!: string | null;

  @Column({ length: 64 })
  fingerprint!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: BankTransactionStatus.Unmatched,
  })
  status!: BankTransactionStatus;

  @Column({ name: 'match_type', type: 'varchar', length: 30, nullable: true })
  matchType!: BankMatchType | null;

  @Column({ name: 'match_confidence', type: 'smallint', nullable: true })
  matchConfidence!: number | null;

  @Column({ name: 'matched_payment_id', type: 'uuid', nullable: true })
  matchedPaymentId!: string | null;

  @ManyToOne(() => ThirdPartyPayment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'matched_payment_id' })
  matchedPayment!: ThirdPartyPayment | null;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId!: string | null;

  @ManyToOne(() => JournalEntry, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry | null;

  @Column({ name: 'matched_by_user_id', type: 'uuid', nullable: true })
  matchedByUserId!: string | null;

  @Column({ name: 'matched_at_utc', type: 'timestamptz', nullable: true })
  matchedAtUtc!: Date | null;
}

@Entity({ schema: 'accounting', name: 'bank_reconciliation_rules' })
@Unique(['dossierId', 'label'])
@Index(['organizationId', 'dossierId', 'isActive'])
export class BankReconciliationRule extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ length: 150 })
  label!: string;

  @Column({ type: 'varchar', length: 500 })
  pattern!: string;

  @Column({
    name: 'match_type',
    type: 'varchar',
    length: 30,
    default: BankRuleMatchType.Contains,
  })
  matchType!: BankRuleMatchType;

  @Column({
    type: 'varchar',
    length: 20,
    default: BankRuleDirection.Any,
  })
  direction!: BankRuleDirection;

  @Column({ name: 'suggested_account_id', type: 'uuid' })
  suggestedAccountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'suggested_account_id' })
  suggestedAccount!: LedgerAccount;

  @Column({ name: 'suggested_third_party_id', type: 'uuid', nullable: true })
  suggestedThirdPartyId!: string | null;

  @ManyToOne(() => ThirdParty, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'suggested_third_party_id' })
  suggestedThirdParty!: ThirdParty | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'last_used_at_utc', type: 'timestamptz', nullable: true })
  lastUsedAtUtc!: Date | null;
}

export enum DepreciationMethod {
  StraightLine = 'LINEAIRE',
  DecliningBalance = 'DEGRESSIF',
}

export enum FixedAssetStatus {
  Active = 'ACTIVE',
  FullyDepreciated = 'TOTALEMENT_AMORTIE',
  Disposed = 'CEDEE',
  Retired = 'MISE_AU_REBUT',
}

export enum DepreciationPeriodStatus {
  Planned = 'PLANIFIEE',
  Posted = 'COMPTABILISEE',
}

export enum DepreciationYearStatus {
  Open = 'OUVERTE',
  Validated = 'VALIDEE',
}

@Entity({ schema: 'accounting', name: 'fixed_asset_categories' })
@Unique(['dossierId', 'code'])
@Index(['organizationId', 'dossierId', 'isActive'])
export class FixedAssetCategory extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ length: 30 })
  code!: string;

  @Column({ length: 180 })
  name!: string;

  @Column({ name: 'asset_account_id', type: 'uuid' })
  assetAccountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'asset_account_id' })
  assetAccount!: LedgerAccount;

  @Column({ name: 'accumulated_depreciation_account_id', type: 'uuid' })
  accumulatedDepreciationAccountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'accumulated_depreciation_account_id' })
  accumulatedDepreciationAccount!: LedgerAccount;

  @Column({ name: 'depreciation_expense_account_id', type: 'uuid' })
  depreciationExpenseAccountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'depreciation_expense_account_id' })
  depreciationExpenseAccount!: LedgerAccount;

  @Column({ name: 'default_method', type: 'varchar', length: 20 })
  defaultMethod!: DepreciationMethod;

  @Column({ name: 'default_useful_life_months', type: 'integer' })
  defaultUsefulLifeMonths!: number;

  @Column({
    name: 'default_declining_rate',
    type: 'decimal',
    precision: 8,
    scale: 5,
    nullable: true,
  })
  defaultDecliningRate!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}

@Entity({ schema: 'accounting', name: 'fixed_assets' })
@Unique(['dossierId', 'code'])
@Index(['organizationId', 'dossierId', 'status', 'serviceDate'])
export class FixedAsset extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @ManyToOne(() => FixedAssetCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category!: FixedAssetCategory;

  @Column({ length: 50 })
  code!: string;

  @Column({ length: 220 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'acquisition_date', type: 'date' })
  acquisitionDate!: string;

  @Column({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  @Column({ name: 'purchase_invoice_id', type: 'uuid', nullable: true })
  purchaseInvoiceId!: string | null;

  @ManyToOne(() => BusinessInvoice, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'purchase_invoice_id' })
  purchaseInvoice!: BusinessInvoice | null;

  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId!: string | null;

  @ManyToOne(() => ThirdParty, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier!: ThirdParty | null;

  @Column({
    name: 'acquisition_cost',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  acquisitionCost!: string;

  @Column({ name: 'residual_value', type: 'decimal', precision: 15, scale: 3 })
  residualValue!: string;

  @Column({
    name: 'depreciable_base',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  depreciableBase!: string;

  @Column({ name: 'accounting_method', type: 'varchar', length: 20 })
  accountingMethod!: DepreciationMethod;

  @Column({ name: 'useful_life_months', type: 'integer' })
  usefulLifeMonths!: number;

  @Column({
    name: 'accounting_declining_rate',
    type: 'decimal',
    precision: 8,
    scale: 5,
    nullable: true,
  })
  accountingDecliningRate!: string | null;

  @Column({ name: 'fiscal_method', type: 'varchar', length: 20 })
  fiscalMethod!: DepreciationMethod;

  @Column({ name: 'fiscal_useful_life_months', type: 'integer' })
  fiscalUsefulLifeMonths!: number;

  @Column({
    name: 'fiscal_declining_rate',
    type: 'decimal',
    precision: 8,
    scale: 5,
    nullable: true,
  })
  fiscalDecliningRate!: string | null;

  @Column({
    name: 'opening_accounting_depreciation',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  openingAccountingDepreciation!: string;

  @Column({
    name: 'opening_fiscal_depreciation',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  openingFiscalDepreciation!: string;

  @Column({
    name: 'posted_accounting_depreciation',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  postedAccountingDepreciation!: string;

  @Column({ name: 'net_book_value', type: 'decimal', precision: 15, scale: 3 })
  netBookValue!: string;

  @Column({ name: 'asset_account_id', type: 'uuid' })
  assetAccountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'asset_account_id' })
  assetAccount!: LedgerAccount;

  @Column({ name: 'accumulated_depreciation_account_id', type: 'uuid' })
  accumulatedDepreciationAccountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'accumulated_depreciation_account_id' })
  accumulatedDepreciationAccount!: LedgerAccount;

  @Column({ name: 'depreciation_expense_account_id', type: 'uuid' })
  depreciationExpenseAccountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'depreciation_expense_account_id' })
  depreciationExpenseAccount!: LedgerAccount;

  @Column({ type: 'varchar', length: 30, default: FixedAssetStatus.Active })
  status!: FixedAssetStatus;

  @Column({ name: 'disposal_date', type: 'date', nullable: true })
  disposalDate!: string | null;

  @Column({
    name: 'disposal_proceeds',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  disposalProceeds!: string | null;

  @Column({
    name: 'disposal_gain_loss',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  disposalGainLoss!: string | null;

  @Column({ name: 'disposal_journal_entry_id', type: 'uuid', nullable: true })
  disposalJournalEntryId!: string | null;

  @ManyToOne(() => JournalEntry, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'disposal_journal_entry_id' })
  disposalJournalEntry!: JournalEntry | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @OneToMany(() => AssetDepreciationPeriod, (period) => period.asset)
  depreciationPeriods!: AssetDepreciationPeriod[];
}

@Entity({ schema: 'accounting', name: 'asset_depreciation_periods' })
@Unique(['assetId', 'periodYear', 'periodMonth'])
@Index(['organizationId', 'dossierId', 'periodYear', 'periodMonth', 'status'])
export class AssetDepreciationPeriod extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @ManyToOne(() => FixedAsset, (asset) => asset.depreciationPeriods, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'asset_id' })
  asset!: FixedAsset;

  @Column({ name: 'period_year', type: 'integer' })
  periodYear!: number;

  @Column({ name: 'period_month', type: 'smallint' })
  periodMonth!: number;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: string;

  @Column({
    name: 'accounting_amount',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  accountingAmount!: string;

  @Column({ name: 'fiscal_amount', type: 'decimal', precision: 15, scale: 3 })
  fiscalAmount!: string;

  @Column({
    name: 'temporary_difference',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  temporaryDifference!: string;

  @Column({
    name: 'accumulated_accounting',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  accumulatedAccounting!: string;

  @Column({
    name: 'accumulated_fiscal',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  accumulatedFiscal!: string;

  @Column({ name: 'net_book_value', type: 'decimal', precision: 15, scale: 3 })
  netBookValue!: string;

  @Column({
    type: 'varchar',
    length: 25,
    default: DepreciationPeriodStatus.Planned,
  })
  status!: DepreciationPeriodStatus;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId!: string | null;

  @ManyToOne(() => JournalEntry, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry | null;

  @Column({ name: 'posted_by_user_id', type: 'uuid', nullable: true })
  postedByUserId!: string | null;

  @Column({ name: 'posted_at_utc', type: 'timestamptz', nullable: true })
  postedAtUtc!: Date | null;
}

@Entity({ schema: 'accounting', name: 'asset_depreciation_years' })
@Unique(['dossierId', 'periodYear'])
export class AssetDepreciationYear extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'period_year', type: 'integer' })
  periodYear!: number;

  @Column({
    name: 'total_accounting',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  totalAccounting!: string;

  @Column({ name: 'total_fiscal', type: 'decimal', precision: 15, scale: 3 })
  totalFiscal!: string;

  @Column({
    name: 'temporary_difference',
    type: 'decimal',
    precision: 15,
    scale: 3,
  })
  temporaryDifference!: string;

  @Column({ type: 'varchar', length: 20, default: DepreciationYearStatus.Open })
  status!: DepreciationYearStatus;

  @Column({ name: 'validated_by_user_id', type: 'uuid', nullable: true })
  validatedByUserId!: string | null;

  @Column({ name: 'validated_at_utc', type: 'timestamptz', nullable: true })
  validatedAtUtc!: Date | null;
}

export enum AccountingPeriodStatus {
  Open = 'OUVERTE',
  Locked = 'VERROUILLEE',
  Closed = 'CLOTUREE',
}

@Entity({ schema: 'accounting', name: 'accounting_periods' })
@Unique(['dossierId', 'periodYear', 'periodMonth'])
@Index(['organizationId', 'dossierId', 'periodYear', 'periodMonth', 'status'])
export class AccountingPeriod extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'period_year', type: 'integer' })
  periodYear!: number;

  @Column({ name: 'period_month', type: 'smallint' })
  periodMonth!: number;

  @Column({ name: 'starts_on', type: 'date' })
  startsOn!: string;

  @Column({ name: 'ends_on', type: 'date' })
  endsOn!: string;

  @Column({ type: 'varchar', length: 20, default: AccountingPeriodStatus.Open })
  status!: AccountingPeriodStatus;

  @Column({ name: 'locked_by_user_id', type: 'uuid', nullable: true })
  lockedByUserId!: string | null;

  @Column({ name: 'locked_at_utc', type: 'timestamptz', nullable: true })
  lockedAtUtc!: Date | null;

  @Column({ name: 'reopened_by_user_id', type: 'uuid', nullable: true })
  reopenedByUserId!: string | null;

  @Column({ name: 'reopened_at_utc', type: 'timestamptz', nullable: true })
  reopenedAtUtc!: Date | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;
}

export enum ClosingAdjustmentType {
  AccruedExpense = 'CHARGE_A_PAYER',
  AccruedIncome = 'PRODUIT_A_RECEVOIR',
  PrepaidExpense = 'CHARGE_CONSTATEE_AVANCE',
  DeferredIncome = 'PRODUIT_CONSTATE_AVANCE',
  Provision = 'PROVISION',
  Other = 'AUTRE',
}

@Entity({ schema: 'accounting', name: 'closing_adjustments' })
@Index(['organizationId', 'dossierId', 'entryDate'])
export class ClosingAdjustment extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ type: 'varchar', length: 40 })
  type!: ClosingAdjustmentType;

  @Column({ name: 'entry_date', type: 'date' })
  entryDate!: string;

  @Column({ length: 300 })
  description!: string;

  @Column({ name: 'journal_entry_id', type: 'uuid' })
  journalEntryId!: string;

  @ManyToOne(() => JournalEntry, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry;

  @Column({ name: 'reversal_date', type: 'date', nullable: true })
  reversalDate!: string | null;

  @Column({ name: 'reversal_entry_id', type: 'uuid', nullable: true })
  reversalEntryId!: string | null;

  @ManyToOne(() => JournalEntry, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reversal_entry_id' })
  reversalEntry!: JournalEntry | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;
}

export enum AccountingYearClosingStatus {
  Closed = 'CLOTUREE',
}

@Entity({ schema: 'accounting', name: 'accounting_year_closings' })
@Unique(['dossierId', 'periodYear'])
@Index(['organizationId', 'dossierId', 'periodYear'])
export class AccountingYearClosing extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'period_year', type: 'integer' })
  periodYear!: number;

  @Column({ name: 'starts_on', type: 'date' })
  startsOn!: string;

  @Column({ name: 'ends_on', type: 'date' })
  endsOn!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: AccountingYearClosingStatus;

  @Column({ name: 'net_result', type: 'decimal', precision: 15, scale: 3 })
  netResult!: string;

  @Column({ name: 'result_account_id', type: 'uuid' })
  resultAccountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'result_account_id' })
  resultAccount!: LedgerAccount;

  @Column({ name: 'closing_journal_entry_id', type: 'uuid', nullable: true })
  closingJournalEntryId!: string | null;

  @ManyToOne(() => JournalEntry, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'closing_journal_entry_id' })
  closingJournalEntry!: JournalEntry | null;

  @Column({ name: 'opening_journal_entry_id', type: 'uuid', nullable: true })
  openingJournalEntryId!: string | null;

  @ManyToOne(() => JournalEntry, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'opening_journal_entry_id' })
  openingJournalEntry!: JournalEntry | null;

  @Column({ name: 'closed_by_user_id', type: 'uuid' })
  closedByUserId!: string;

  @Column({ name: 'closed_at_utc', type: 'timestamptz' })
  closedAtUtc!: Date;
}

export enum FinancialStatementSection {
  BalanceIntangibleAssets = 'BILAN_IMMOB_INCORPORELLES',
  BalanceTangibleAssets = 'BILAN_IMMOB_CORPORELLES',
  BalanceFinancialAssets = 'BILAN_IMMOB_FINANCIERES',
  BalanceOtherNonCurrentAssets = 'BILAN_AUTRES_ACTIFS_NON_COURANTS',
  BalanceInventories = 'BILAN_STOCKS',
  BalanceCustomers = 'BILAN_CLIENTS',
  BalanceOtherCurrentAssets = 'BILAN_AUTRES_ACTIFS_COURANTS',
  BalanceShortTermInvestments = 'BILAN_PLACEMENTS_COURT_TERME',
  BalanceCash = 'BILAN_LIQUIDITES',
  BalanceCapital = 'BILAN_CAPITAL',
  BalanceReserves = 'BILAN_RESERVES',
  BalanceOtherEquity = 'BILAN_AUTRES_CAPITAUX_PROPRES',
  BalanceRetainedEarnings = 'BILAN_RESULTATS_REPORTES',
  BalanceCurrentResult = 'BILAN_RESULTAT_EXERCICE',
  BalanceBorrowings = 'BILAN_EMPRUNTS',
  BalanceOtherNonCurrentLiabilities = 'BILAN_AUTRES_PASSIFS_NON_COURANTS',
  BalanceProvisions = 'BILAN_PROVISIONS',
  BalanceSuppliers = 'BILAN_FOURNISSEURS',
  BalanceOtherCurrentLiabilities = 'BILAN_AUTRES_PASSIFS_COURANTS',
  BalanceBankOverdrafts = 'BILAN_CONCOURS_BANCAIRES',
  IncomeRevenue = 'RESULTAT_REVENUS',
  IncomeOtherOperatingIncome = 'RESULTAT_AUTRES_PRODUITS_EXPLOITATION',
  IncomeCapitalizedProduction = 'RESULTAT_PRODUCTION_IMMOBILISEE',
  IncomeInventoryChange = 'RESULTAT_VARIATION_STOCKS',
  IncomeGoodsPurchases = 'RESULTAT_ACHATS_MARCHANDISES',
  IncomeSuppliesPurchases = 'RESULTAT_ACHATS_APPROVISIONNEMENTS',
  IncomePersonnel = 'RESULTAT_CHARGES_PERSONNEL',
  IncomeDepreciationProvisions = 'RESULTAT_DOTATIONS',
  IncomeOtherOperatingExpense = 'RESULTAT_AUTRES_CHARGES_EXPLOITATION',
  IncomeFinancialExpense = 'RESULTAT_CHARGES_FINANCIERES',
  IncomeInvestmentIncome = 'RESULTAT_PRODUITS_PLACEMENTS',
  IncomeOtherOrdinaryGain = 'RESULTAT_AUTRES_GAINS_ORDINAIRES',
  IncomeOtherOrdinaryLoss = 'RESULTAT_AUTRES_PERTES_ORDINAIRES',
  IncomeTax = 'RESULTAT_IMPOT_BENEFICES',
  IncomeExtraordinary = 'RESULTAT_ELEMENTS_EXTRAORDINAIRES',
  IncomeAccountingChanges = 'RESULTAT_MODIFICATIONS_COMPTABLES',
}

export enum CashFlowCategory {
  Cash = 'TRESORERIE',
  OperatingCustomers = 'EXPLOITATION_CLIENTS',
  OperatingSuppliersPersonnel = 'EXPLOITATION_FOURNISSEURS_PERSONNEL',
  OperatingInterest = 'EXPLOITATION_INTERETS',
  OperatingIncomeTax = 'EXPLOITATION_IMPOT_BENEFICES',
  InvestingTangibleIntangible = 'INVESTISSEMENT_IMMOB_CORP_INCORP',
  InvestingFinancial = 'INVESTISSEMENT_IMMOB_FINANCIERES',
  FinancingEquity = 'FINANCEMENT_CAPITAUX_PROPRES',
  FinancingDividends = 'FINANCEMENT_DIVIDENDES',
  FinancingBorrowings = 'FINANCEMENT_EMPRUNTS',
  ExchangeEffect = 'EFFET_CHANGE',
  OtherOperating = 'EXPLOITATION_AUTRE',
}

@Entity({ schema: 'accounting', name: 'financial_statement_mappings' })
@Unique(['dossierId', 'accountId'])
@Index(['organizationId', 'dossierId'])
export class FinancialStatementMapping extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => LedgerAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account!: LedgerAccount;

  @Column({
    name: 'statement_section',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  statementSection!: FinancialStatementSection | null;

  @Column({
    name: 'cash_flow_category',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  cashFlowCategory!: CashFlowCategory | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid' })
  updatedByUserId!: string;
}

export enum FinancialStatementNotesStatus {
  Draft = 'BROUILLON',
  ReadyForReview = 'PRETES_POUR_REVISION',
  Validated = 'VALIDEES',
}

export enum FinancialStatementNoteSource {
  Manual = 'MANUELLE',
  Automatic = 'AUTOMATIQUE',
  Mixed = 'MIXTE',
}

@Entity({ schema: 'accounting', name: 'financial_statement_note_sets' })
@Unique(['dossierId', 'periodYear'])
@Index(['organizationId', 'dossierId', 'periodYear', 'status'])
export class FinancialStatementNoteSet extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'period_year', type: 'integer' })
  periodYear!: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: FinancialStatementNotesStatus.Draft,
  })
  status!: FinancialStatementNotesStatus;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'submitted_by_user_id', type: 'uuid', nullable: true })
  submittedByUserId!: string | null;

  @Column({ name: 'submitted_at_utc', type: 'timestamptz', nullable: true })
  submittedAtUtc!: Date | null;

  @Column({ name: 'validated_by_user_id', type: 'uuid', nullable: true })
  validatedByUserId!: string | null;

  @Column({ name: 'validated_at_utc', type: 'timestamptz', nullable: true })
  validatedAtUtc!: Date | null;

  @OneToMany(() => FinancialStatementNoteSection, (section) => section.noteSet)
  sections!: FinancialStatementNoteSection[];
}

@Entity({ schema: 'accounting', name: 'financial_statement_note_sections' })
@Unique(['noteSetId', 'code'])
@Unique(['noteSetId', 'noteNumber'])
@Index(['organizationId', 'dossierId', 'noteSetId', 'displayOrder'])
export class FinancialStatementNoteSection extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ name: 'note_set_id', type: 'uuid' })
  noteSetId!: string;

  @ManyToOne(() => FinancialStatementNoteSet, (noteSet) => noteSet.sections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'note_set_id' })
  noteSet!: FinancialStatementNoteSet;

  @Column({ length: 80 })
  code!: string;

  @Column({ name: 'note_number', type: 'smallint' })
  noteNumber!: number;

  @Column({ length: 250 })
  title!: string;

  @Column({ type: 'varchar', length: 20 })
  source!: FinancialStatementNoteSource;

  @Column({ type: 'text', default: '' })
  content!: string;

  @Column({ name: 'auto_data_json', type: 'jsonb', default: '[]' })
  autoDataJson!: Record<string, unknown>[];

  @Column({ name: 'statement_line_codes', type: 'jsonb', default: '[]' })
  statementLineCodes!: string[];

  @Column({ name: 'is_required', default: false })
  isRequired!: boolean;

  @Column({ name: 'display_order', type: 'smallint' })
  displayOrder!: number;

  @Column({ name: 'updated_by_user_id', type: 'uuid' })
  updatedByUserId!: string;

  @OneToMany(
    () => FinancialStatementNoteDocument,
    (document) => document.section,
  )
  documents!: FinancialStatementNoteDocument[];
}

@Entity({ schema: 'accounting', name: 'financial_statement_note_documents' })
@Unique(['sectionId', 'documentId'])
@Index(['organizationId', 'dossierId', 'sectionId'])
export class FinancialStatementNoteDocument extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ name: 'section_id', type: 'uuid' })
  sectionId!: string;

  @ManyToOne(
    () => FinancialStatementNoteSection,
    (section) => section.documents,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'section_id' })
  section!: FinancialStatementNoteSection;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => AccountingDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: AccountingDocument;

  @Column({ name: 'attached_by_user_id', type: 'uuid' })
  attachedByUserId!: string;
}

export enum FinancialStatementSnapshotStatus {
  Draft = 'BROUILLON',
  Final = 'DEFINITIF',
}

@Entity({ schema: 'accounting', name: 'financial_statement_snapshots' })
@Unique(['dossierId', 'periodYear', 'version'])
@Index(['organizationId', 'dossierId', 'periodYear', 'status'])
export class FinancialStatementSnapshot extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'period_year', type: 'integer' })
  periodYear!: number;

  @Column({ name: 'starts_on', type: 'date' })
  startsOn!: string;

  @Column({ name: 'ends_on', type: 'date' })
  endsOn!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'varchar', length: 20 })
  status!: FinancialStatementSnapshotStatus;

  @Column({ name: 'payload_json', type: 'jsonb' })
  payloadJson!: Record<string, unknown>;

  @Column({ name: 'source_hash', type: 'varchar', length: 64 })
  sourceHash!: string;

  @Column({ name: 'accounting_year_closing_id', type: 'uuid', nullable: true })
  accountingYearClosingId!: string | null;

  @ManyToOne(() => AccountingYearClosing, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'accounting_year_closing_id' })
  accountingYearClosing!: AccountingYearClosing | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'finalized_by_user_id', type: 'uuid', nullable: true })
  finalizedByUserId!: string | null;

  @Column({ name: 'finalized_at_utc', type: 'timestamptz', nullable: true })
  finalizedAtUtc!: Date | null;
}

export enum TradeDirection {
  Import = 'IMPORT',
  Export = 'EXPORT',
}

export enum ForeignTradeStatus {
  Draft = 'BROUILLON',
  Posted = 'COMPTABILISEE',
  Settled = 'REGLEE',
  Cancelled = 'ANNULEE',
}

@Entity({ schema: 'accounting', name: 'currency_exchange_rates' })
@Unique(['organizationId', 'currencyCode', 'effectiveDate'])
@Index(['organizationId', 'currencyCode', 'effectiveDate'])
export class CurrencyExchangeRate extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 3 })
  currencyCode!: string;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate!: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  rate!: string;

  @Column({ name: 'source_label', type: 'varchar', length: 250 })
  sourceLabel!: string;

  @Column({ name: 'source_url', type: 'varchar', length: 1000, nullable: true })
  sourceUrl!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;
}

export enum VatSuspensionStatus {
  Active = 'ACTIVE',
  Exhausted = 'EPUISEE',
  Expired = 'EXPIREE',
  Cancelled = 'ANNULEE',
}

@Entity({ schema: 'accounting', name: 'vat_suspension_certificates' })
@Unique(['dossierId', 'number'])
@Index(['organizationId', 'dossierId', 'validFrom', 'validTo'])
export class VatSuspensionCertificate extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ type: 'varchar', length: 120 })
  number!: string;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom!: string;

  @Column({ name: 'valid_to', type: 'date' })
  validTo!: string;

  @Column({ name: 'authorized_base', type: 'decimal', precision: 15, scale: 3 })
  authorizedBase!: string;

  @Column({
    name: 'used_base',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  usedBase!: string;

  @Column({ type: 'varchar', length: 20, default: VatSuspensionStatus.Active })
  status!: VatSuspensionStatus;

  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;
}

@Entity({ schema: 'accounting', name: 'foreign_trade_operations' })
@Unique(['dossierId', 'reference'])
@Index(['organizationId', 'dossierId', 'operationDate', 'status'])
export class ForeignTradeOperation extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ type: 'varchar', length: 10 })
  direction!: TradeDirection;

  @Column({ type: 'varchar', length: 120 })
  reference!: string;

  @Column({ name: 'operation_date', type: 'date' })
  operationDate!: string;

  @Column({ name: 'third_party_name', type: 'varchar', length: 200 })
  thirdPartyName!: string;

  @Column({ name: 'country_code', type: 'varchar', length: 2 })
  countryCode!: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 3 })
  currencyCode!: string;

  @Column({ name: 'foreign_amount', type: 'decimal', precision: 18, scale: 3 })
  foreignAmount!: string;

  @Column({ name: 'exchange_rate', type: 'decimal', precision: 18, scale: 8 })
  exchangeRate!: string;

  @Column({ name: 'local_amount', type: 'decimal', precision: 15, scale: 3 })
  localAmount!: string;

  @Column({
    name: 'freight_amount',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  freightAmount!: string;

  @Column({
    name: 'insurance_amount',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  insuranceAmount!: string;

  @Column({
    name: 'customs_duties',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  customsDuties!: string;

  @Column({
    name: 'import_vat',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  importVat!: string;

  @Column({
    name: 'other_costs',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
  })
  otherCosts!: string;

  @Column({ name: 'landed_cost', type: 'decimal', precision: 15, scale: 3 })
  landedCost!: string;

  @Column({ name: 'incoterm', type: 'varchar', length: 10, nullable: true })
  incoterm!: string | null;

  @Column({
    name: 'customs_declaration_number',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  customsDeclarationNumber!: string | null;

  @Column({ name: 'customs_declaration_date', type: 'date', nullable: true })
  customsDeclarationDate!: string | null;

  @Column({
    name: 'vat_suspension_certificate_id',
    type: 'uuid',
    nullable: true,
  })
  vatSuspensionCertificateId!: string | null;

  @ManyToOne(() => VatSuspensionCertificate, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'vat_suspension_certificate_id' })
  vatSuspensionCertificate!: VatSuspensionCertificate | null;

  @Column({ name: 'journal_id', type: 'uuid' })
  journalId!: string;

  @ManyToOne(() => AccountingJournal, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'journal_id' })
  journal!: AccountingJournal;

  @Column({ name: 'trade_account_id', type: 'uuid' })
  tradeAccountId!: string;

  @Column({ name: 'third_party_account_id', type: 'uuid' })
  thirdPartyAccountId!: string;

  @Column({ name: 'vat_account_id', type: 'uuid', nullable: true })
  vatAccountId!: string | null;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId!: string | null;

  @Column({
    name: 'settlement_rate',
    type: 'decimal',
    precision: 18,
    scale: 8,
    nullable: true,
  })
  settlementRate!: string | null;

  @Column({
    name: 'settled_local_amount',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  settledLocalAmount!: string | null;

  @Column({
    name: 'exchange_difference',
    type: 'decimal',
    precision: 15,
    scale: 3,
    nullable: true,
  })
  exchangeDifference!: string | null;

  @Column({ name: 'settlement_entry_id', type: 'uuid', nullable: true })
  settlementEntryId!: string | null;

  @Column({ name: 'repatriation_date', type: 'date', nullable: true })
  repatriationDate!: string | null;

  @Column({
    name: 'repatriation_bank_reference',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  repatriationBankReference!: string | null;

  @Column({
    name: 'repatriation_proof_document_id',
    type: 'uuid',
    nullable: true,
  })
  repatriationProofDocumentId!: string | null;

  @Column({ type: 'varchar', length: 25, default: ForeignTradeStatus.Draft })
  status!: ForeignTradeStatus;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'posted_by_user_id', type: 'uuid', nullable: true })
  postedByUserId!: string | null;

  @Column({ name: 'posted_at_utc', type: 'timestamptz', nullable: true })
  postedAtUtc!: Date | null;
}

export enum TtnEnvironment {
  Simulation = 'SIMULATION',
  Test = 'TEST',
  Production = 'PRODUCTION',
}

export enum TtnSubmissionStatus {
  Ready = 'PRETE',
  Submitted = 'SOUMISE',
  Accepted = 'ACCEPTEE',
  Rejected = 'REJETEE',
  Failed = 'ECHEC',
}

@Entity({ schema: 'accounting', name: 'ttn_einvoice_configurations' })
@Unique(['dossierId'])
export class TtnEInvoiceConfiguration extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ type: 'varchar', length: 20, default: TtnEnvironment.Simulation })
  environment!: TtnEnvironment;

  @Column({ name: 'issuer_tax_identifier', type: 'varchar', length: 100 })
  issuerTaxIdentifier!: string;

  @Column({
    name: 'schema_version',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  schemaVersion!: string | null;

  @Column({
    name: 'certificate_reference',
    type: 'varchar',
    length: 250,
    nullable: true,
  })
  certificateReference!: string | null;

  @Column({
    name: 'connection_reference',
    type: 'varchar',
    length: 250,
    nullable: true,
  })
  connectionReference!: string | null;

  @Column({ name: 'is_enabled', default: true })
  isEnabled!: boolean;

  @Column({ name: 'updated_by_user_id', type: 'uuid' })
  updatedByUserId!: string;
}

@Entity({ schema: 'accounting', name: 'ttn_einvoice_submissions' })
@Unique(['invoiceId'])
@Index(['organizationId', 'dossierId', 'status'])
export class TtnEInvoiceSubmission extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId!: string;

  @ManyToOne(() => BusinessInvoice, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'invoice_id' })
  invoice!: BusinessInvoice;

  @Column({ type: 'varchar', length: 20 })
  environment!: TtnEnvironment;

  @Column({ name: 'schema_version', type: 'varchar', length: 40 })
  schemaVersion!: string;

  @Column({ name: 'payload_xml', type: 'text' })
  payloadXml!: string;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash!: string;

  @Column({ name: 'signature_mode', type: 'varchar', length: 30 })
  signatureMode!: string;

  @Column({ type: 'varchar', length: 20, default: TtnSubmissionStatus.Ready })
  status!: TtnSubmissionStatus;

  @Column({
    name: 'external_reference',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  externalReference!: string | null;

  @Column({
    name: 'response_code',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  responseCode!: string | null;

  @Column({ name: 'response_message', type: 'text', nullable: true })
  responseMessage!: string | null;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ name: 'last_attempt_at_utc', type: 'timestamptz', nullable: true })
  lastAttemptAtUtc!: Date | null;

  @Column({ name: 'accepted_at_utc', type: 'timestamptz', nullable: true })
  acceptedAtUtc!: Date | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;
}

@Entity({ schema: 'accounting', name: 'client_portal_messages' })
@Index(['organizationId', 'dossierId', 'createdAtUtc'])
export class ClientPortalMessage extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'sender_user_id', type: 'uuid' })
  senderUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sender_user_id' })
  sender!: User;

  @Column({ name: 'sender_role', type: 'varchar', length: 100 })
  senderRole!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'client_read_at_utc', type: 'timestamptz', nullable: true })
  clientReadAtUtc!: Date | null;

  @Column({ name: 'cabinet_read_at_utc', type: 'timestamptz', nullable: true })
  cabinetReadAtUtc!: Date | null;
}

export enum ClientApprovalResourceType {
  TaxDeclaration = 'DECLARATION_FISCALE',
  FinancialStatements = 'ETATS_FINANCIERS',
  PayrollSummary = 'SYNTHESE_PAIE',
  OtherDocument = 'AUTRE_DOCUMENT',
}

export enum ClientApprovalDecision {
  Approved = 'APPROUVE',
  Rejected = 'REJETE',
}

@Entity({ schema: 'accounting', name: 'client_portal_approvals' })
@Unique(['dossierId', 'userId', 'resourceType', 'resourceId', 'version'])
@Index(['organizationId', 'dossierId', 'createdAtUtc'])
export class ClientPortalApproval extends AuditableEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ClientDossier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ClientDossier;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'resource_type', type: 'varchar', length: 40 })
  resourceType!: ClientApprovalResourceType;

  @Column({ name: 'resource_id', type: 'varchar', length: 120 })
  resourceId!: string;

  @Column({ type: 'varchar', length: 80, default: '1' })
  version!: string;

  @Column({ length: 300 })
  label!: string;

  @Column({ type: 'varchar', length: 20 })
  decision!: ClientApprovalDecision;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 80, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;
}

@Entity({ schema: 'accounting', name: 'client_notification_preferences' })
@Unique(['userId'])
export class ClientNotificationPreference extends AuditableEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'email_messages', default: true })
  emailMessages!: boolean;

  @Column({ name: 'email_deadlines', default: true })
  emailDeadlines!: boolean;

  @Column({ name: 'email_documents', default: true })
  emailDocuments!: boolean;

  @Column({ name: 'weekly_summary', default: true })
  weeklySummary!: boolean;

  @Column({
    name: 'preferred_language',
    type: 'varchar',
    length: 5,
    default: 'fr',
  })
  preferredLanguage!: string;
}

export const ENTITIES = [
  User,
  Organization,
  SaasPlan,
  OrganizationSubscription,
  SaasSubscriptionInvoice,
  Role,
  Permission,
  RolePermission,
  OrganizationMembership,
  RefreshToken,
  PasswordResetToken,
  OrganizationInvitation,
  EmailDeliveryLog,
  AuditLog,
  CompanyProfile,
  ClientDossier,
  DossierContact,
  DossierAssignment,
  CabinetMemberCostRate,
  ObligationTemplate,
  ObligationInstance,
  WorkTask,
  TaskChecklistItem,
  TaskComment,
  WorkSession,
  TimeEntry,
  FiscalYear,
  LedgerAccount,
  AccountingDocument,
  MissingDocumentExpectation,
  Notification,
  MonthlyTaxDeclaration,
  AccountingJournal,
  JournalEntry,
  JournalEntryLine,
  AccountReconciliation,
  CabinetInvoice,
  CabinetPayment,
  Employee,
  PayrollRun,
  PayrollLine,
  FiscalParameter,
  VatRate,
  WithholdingTaxRate,
  IncomeTaxBracket,
  RegulatoryRule,
  ThirdParty,
  CommercialDocument,
  CommercialDocumentLine,
  BusinessInvoice,
  BusinessInvoiceLine,
  ThirdPartyPayment,
  PaymentAllocation,
  BankAccount,
  BankStatement,
  BankTransaction,
  BankReconciliationRule,
  FixedAssetCategory,
  FixedAsset,
  AssetDepreciationPeriod,
  AssetDepreciationYear,
  AccountingPeriod,
  ClosingAdjustment,
  AccountingYearClosing,
  FinancialStatementMapping,
  FinancialStatementNoteSet,
  FinancialStatementNoteSection,
  FinancialStatementNoteDocument,
  FinancialStatementSnapshot,
  CurrencyExchangeRate,
  VatSuspensionCertificate,
  ForeignTradeOperation,
  TtnEInvoiceConfiguration,
  TtnEInvoiceSubmission,
  ClientPortalMessage,
  ClientPortalApproval,
  ClientNotificationPreference,
];
