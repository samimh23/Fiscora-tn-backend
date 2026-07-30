import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BusinessInvoice,
  BusinessInvoiceStatus,
  BusinessInvoiceType,
  TtnEInvoiceConfiguration,
  TtnEInvoiceSubmission,
  TtnEnvironment,
  TtnSubmissionStatus,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { PrepareTtnInvoiceDto, SaveTtnConfigurationDto } from './dto';
import { buildNeutralTtnPayload, sha256 } from './ttn-xml';

const ADAPTER_SCHEMA = 'COMPTA-TN-ADAPTER-1.0';

@Injectable()
export class ElectronicInvoicesService {
  constructor(
    @InjectRepository(TtnEInvoiceConfiguration)
    private readonly configurations: Repository<TtnEInvoiceConfiguration>,
    @InjectRepository(TtnEInvoiceSubmission)
    private readonly submissions: Repository<TtnEInvoiceSubmission>,
    @InjectRepository(BusinessInvoice)
    private readonly invoices: Repository<BusinessInvoice>,
    private readonly dossiers: DossiersService,
  ) {}

  async getConfiguration(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const configuration = await this.configurations.findOneBy({
      organizationId,
      dossierId,
    });
    return {
      configuration,
      readiness: this.readiness(dossier, configuration),
    };
  }

  async saveConfiguration(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: SaveTtnConfigurationDto,
  ) {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    if (!dossier.taxIdentifier)
      throw new BadRequestException(
        'Renseignez d’abord la matricule fiscale du dossier.',
      );
    if (dto.environment !== TtnEnvironment.Simulation && !dto.schemaVersion)
      throw new BadRequestException(
        'La version du schÃ©ma officiel fournie par TTN est obligatoire hors simulation.',
      );
    const existing = await this.configurations.findOneBy({
      organizationId,
      dossierId,
    });
    const configuration = await this.configurations.save(
      Object.assign(
        existing ?? this.configurations.create({ organizationId, dossierId }),
        {
          environment: dto.environment,
          issuerTaxIdentifier: dto.issuerTaxIdentifier.trim(),
          schemaVersion: dto.schemaVersion?.trim() || null,
          certificateReference: dto.certificateReference?.trim() || null,
          connectionReference: dto.connectionReference?.trim() || null,
          isEnabled: dto.isEnabled,
          updatedByUserId: userId,
        },
      ),
    );
    return { configuration, readiness: this.readiness(dossier, configuration) };
  }

  async list(organizationId: string, dossierId: string, userId: string) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.submissions.find({
      where: { organizationId, dossierId },
      relations: { invoice: true },
      order: { createdAtUtc: 'DESC' },
    });
  }

  async eligibleInvoices(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const invoices = await this.invoices.find({
      where: {
        organizationId,
        dossierId,
        type: BusinessInvoiceType.Sale,
        status: BusinessInvoiceStatus.Posted,
      },
      order: { invoiceDate: 'DESC' },
    });
    const submitted = await this.submissions.find({
      where: { organizationId, dossierId },
      select: { invoiceId: true },
    });
    const ids = new Set(submitted.map((item) => item.invoiceId));
    return invoices.filter((invoice) => !ids.has(invoice.id));
  }

  async prepare(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: PrepareTtnInvoiceDto,
  ) {
    const dossier = await this.dossiers.getAccessibleEntity(
      organizationId,
      dossierId,
      userId,
    );
    const configuration = await this.configurations.findOneBy({
      organizationId,
      dossierId,
      isEnabled: true,
    });
    if (!configuration)
      throw new ConflictException(
        'Configurez et activez d’abord le raccordement TTN.',
      );
    const invoice = await this.invoices.findOne({
      where: { id: dto.invoiceId, organizationId, dossierId },
      relations: { lines: true, thirdParty: true },
    });
    if (!invoice) throw new NotFoundException('La facture est introuvable.');
    if (
      invoice.type !== BusinessInvoiceType.Sale ||
      invoice.status !== BusinessInvoiceStatus.Posted
    )
      throw new ConflictException(
        'Seule une facture de vente comptabilisÃ©e peut Ãªtre prÃ©parÃ©e.',
      );
    const errors = this.invoiceChecks(dossier, invoice, configuration);
    if (errors.length) throw new BadRequestException(errors);
    const existing = await this.submissions.findOneBy({
      invoiceId: invoice.id,
    });
    if (existing && existing.status === TtnSubmissionStatus.Accepted)
      return existing;
    const schemaVersion = configuration.schemaVersion || ADAPTER_SCHEMA;
    const payloadXml = buildNeutralTtnPayload(dossier, invoice, schemaVersion);
    return this.submissions.save(
      Object.assign(
        existing ??
          this.submissions.create({
            organizationId,
            dossierId,
            invoiceId: invoice.id,
            createdByUserId: userId,
          }),
        {
          environment: configuration.environment,
          schemaVersion,
          payloadXml,
          payloadHash: sha256(payloadXml),
          signatureMode: 'EMPREINTE_SIMULATION',
          status: TtnSubmissionStatus.Ready,
          externalReference: null,
          responseCode: null,
          responseMessage: null,
          attemptCount: existing?.attemptCount ?? 0,
          lastAttemptAtUtc: null,
          acceptedAtUtc: null,
        },
      ),
    );
  }

  async submit(
    organizationId: string,
    dossierId: string,
    submissionId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const submission = await this.findSubmission(
      organizationId,
      dossierId,
      submissionId,
    );
    if (submission.status === TtnSubmissionStatus.Accepted) return submission;
    if (submission.environment !== TtnEnvironment.Simulation)
      throw new ConflictException(
        'Le connecteur TTN rÃ©el n’est pas activÃ©. Installez le certificat, les accÃ¨s de test et le schÃ©ma officiel TTN avant toute transmission hors simulation.',
      );

    submission.status = TtnSubmissionStatus.Submitted;
    submission.attemptCount += 1;
    submission.lastAttemptAtUtc = new Date();
    await this.submissions.save(submission);

    const rejected = submission.invoice.number.toUpperCase().includes('REJET');
    submission.status = rejected
      ? TtnSubmissionStatus.Rejected
      : TtnSubmissionStatus.Accepted;
    submission.externalReference = rejected
      ? null
      : `TTN-SIM-${submission.payloadHash.slice(0, 16).toUpperCase()}`;
    submission.responseCode = rejected ? 'SIM-REJECTED' : 'SIM-ACCEPTED';
    submission.responseMessage = rejected
      ? 'Rejet simulÃ© demandÃ© par le numÃ©ro de facture.'
      : 'Transmission simulÃ©e avec succÃ¨s. Aucune facture n’a Ã©tÃ© envoyÃ©e Ã  TTN.';
    submission.acceptedAtUtc = rejected ? null : new Date();
    return this.submissions.save(submission);
  }

  async payload(
    organizationId: string,
    dossierId: string,
    submissionId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.findSubmission(organizationId, dossierId, submissionId);
  }

  private readiness(
    dossier: { legalName: string; taxIdentifier: string | null },
    configuration: TtnEInvoiceConfiguration | null,
  ) {
    const simulation = configuration?.environment === TtnEnvironment.Simulation;
    const checks = [
      {
        code: 'DOSSIER_IDENTITY',
        label: 'Raison sociale et matricule fiscale du dossier',
        ok: Boolean(dossier.legalName && dossier.taxIdentifier),
      },
      {
        code: 'CONFIGURATION',
        label: 'Configuration TTN active pour le dossier',
        ok: Boolean(configuration?.isEnabled),
      },
      {
        code: 'OFFICIAL_SCHEMA',
        label: 'Version du schÃ©ma officiel communiquÃ©e par TTN',
        ok: Boolean(configuration?.schemaVersion),
      },
      {
        code: 'CERTIFICATE',
        label: 'RÃ©fÃ©rence du cachet Ã©lectronique de l’entreprise',
        ok: Boolean(configuration?.certificateReference),
      },
      {
        code: 'TTN_ACCESS',
        label: 'RÃ©fÃ©rence du compte ou raccordement TTN',
        ok: Boolean(configuration?.connectionReference),
      },
      {
        code: 'LIVE_CONNECTOR',
        label: 'Connecteur TTN officiel homologuÃ© activÃ©',
        ok: false,
      },
    ];
    return {
      mode: configuration?.environment ?? TtnEnvironment.Simulation,
      simulationReady: Boolean(configuration?.isEnabled && simulation),
      liveReady: false,
      checks,
      warning: simulation
        ? 'Mode simulation : aucune valeur juridique et aucune transmission Ã  TTN.'
        : 'Mode rÃ©el bloquÃ© tant que le connecteur officiel, le certificat et les accÃ¨s TTN ne sont pas installÃ©s.',
    };
  }

  private invoiceChecks(
    dossier: { taxIdentifier: string | null },
    invoice: BusinessInvoice,
    configuration: TtnEInvoiceConfiguration,
  ) {
    const errors: string[] = [];
    if (!dossier.taxIdentifier)
      errors.push('Matricule fiscale de l’Ã©metteur manquante.');
    if (configuration.issuerTaxIdentifier !== dossier.taxIdentifier)
      errors.push(
        'La matricule fiscale configurÃ©e ne correspond pas au dossier.',
      );
    if (!invoice.thirdPartyTaxIdentifier)
      errors.push('Matricule fiscale du destinataire manquante.');
    if (!invoice.thirdParty?.address)
      errors.push('Adresse du destinataire manquante dans la fiche tiers.');
    if (!invoice.lines.length)
      errors.push('La facture ne contient aucune ligne.');
    return errors;
  }

  private async findSubmission(
    organizationId: string,
    dossierId: string,
    submissionId: string,
  ) {
    const submission = await this.submissions.findOne({
      where: { id: submissionId, organizationId, dossierId },
      relations: { invoice: true },
    });
    if (!submission)
      throw new NotFoundException('La transmission est introuvable.');
    return submission;
  }
}
