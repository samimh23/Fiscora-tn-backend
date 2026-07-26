import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import {
  Employee,
  FiscalParameterCode,
  PayrollLine,
  PayrollRun,
  PayrollRunStatus,
} from '../database/entities';
import { DossiersService } from '../dossiers/dossiers.service';
import { fromMillimes, multiplyRate, toMillimes } from '../common/money';
import { FiscalSettingsService } from '../fiscal-settings/fiscal-settings.service';
import { CreateEmployeeDto, GeneratePayrollDto } from './dto';

@Injectable()
export class PayrollService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(PayrollRun)
    private readonly runs: Repository<PayrollRun>,
    private readonly dossiers: DossiersService,
    private readonly fiscalSettings: FiscalSettingsService,
  ) {}

  async listEmployees(
    organizationId: string,
    dossierId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.employees.find({
      where: { organizationId, dossierId, isActive: true },
      order: { fullName: 'ASC' },
    });
  }

  async createEmployee(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: CreateEmployeeDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.employees.save(
      this.employees.create({
        organizationId,
        dossierId,
        fullName: dto.fullName.trim(),
        cin: dto.cin?.trim() || null,
        cnssNumber: dto.cnssNumber?.trim() || null,
        hireDate: dto.hireDate,
        contractType: dto.contractType.trim(),
        grossSalary: fromMillimes(toMillimes(dto.grossSalary)),
        isHigherEducationGraduate: dto.isHigherEducationGraduate,
        employerSupportEligible: dto.employerSupportEligible,
        employerSupportStartDate: dto.employerSupportEligible
          ? (dto.employerSupportStartDate ?? dto.hireDate)
          : null,
        isActive: true,
      }),
    );
  }

  async listRuns(organizationId: string, dossierId: string, userId: string) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    return this.runs.find({
      where: { organizationId, dossierId },
      relations: { lines: { employee: true } },
      order: { periodYear: 'DESC', periodMonth: 'DESC' },
    });
  }

  async generate(
    organizationId: string,
    dossierId: string,
    userId: string,
    dto: GeneratePayrollDto,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    if (
      await this.runs.existsBy({
        organizationId,
        dossierId,
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
      })
    )
      throw new ConflictException(
        'Le traitement de paie existe déjà pour cette période.',
      );

    const periodEnd = new Date(Date.UTC(dto.periodYear, dto.periodMonth, 0))
      .toISOString()
      .slice(0, 10);
    const employees = await this.employees.find({
      where: {
        organizationId,
        dossierId,
        isActive: true,
        hireDate: LessThanOrEqual(periodEnd),
      },
      order: { fullName: 'ASC' },
    });
    if (!employees.length)
      throw new NotFoundException('Aucun salarié actif pour cette période.');

    const employeeSetting = dto.employeeRate
      ? null
      : await this.fiscalSettings.resolveParameter(
          organizationId,
          FiscalParameterCode.CnssEmployeeRsna,
          periodEnd,
        );
    const employerSetting = dto.employerRate
      ? null
      : await this.fiscalSettings.resolveParameter(
          organizationId,
          FiscalParameterCode.CnssEmployerRsna,
          periodEnd,
        );
    const employeeRate = dto.employeeRate ?? employeeSetting!.value;
    const employerRate = dto.employerRate ?? employerSetting!.value;

    let totalGross = 0n;
    let totalTaxable = 0n;
    let totalIncomeTax = 0n;
    let totalNet = 0n;
    let totalEmployerCost = 0n;
    let totalEmployerSupport = 0n;
    let appliedBrackets: unknown[] = [];
    const calculated = await Promise.all(
      employees.map(async (employee) => {
        const gross = toMillimes(employee.grossSalary);
        const employeeCnss = multiplyRate(gross, employeeRate);
        const taxable = gross - employeeCnss;
        let incomeTax: bigint;
        if (dto.incomeTaxRate) {
          incomeTax = multiplyRate(taxable, dto.incomeTaxRate);
        } else {
          const annual = await this.fiscalSettings.annualIncomeTax(
            organizationId,
            taxable * 12n,
            periodEnd,
          );
          incomeTax = (annual.amount + 6n) / 12n;
          appliedBrackets = annual.brackets.map((bracket) => ({
            lowerBound: bracket.lowerBound,
            upperBound: bracket.upperBound,
            rate: bracket.rate,
            effectiveFrom: bracket.effectiveFrom,
            effectiveTo: bracket.effectiveTo,
            sourceLabel: bracket.sourceLabel,
            sourceUrl: bracket.sourceUrl,
          }));
        }
        const net = gross - employeeCnss - incomeTax;
        const employerCnssGross = multiplyRate(gross, employerRate);
        const employerSupportRate = this.employerSupportRate(
          employee,
          periodEnd,
        );
        const employerSupport = multiplyRate(
          employerCnssGross,
          employerSupportRate,
        );
        const employerCnss = employerCnssGross - employerSupport;
        totalGross += gross;
        totalTaxable += taxable;
        totalIncomeTax += incomeTax;
        totalNet += net;
        totalEmployerCost += gross + employerCnss;
        totalEmployerSupport += employerSupport;
        return {
          employee,
          gross,
          employeeCnss,
          incomeTax,
          net,
          employerCnss,
          employerCnssGross,
          employerSupportRate,
          employerSupport,
        };
      }),
    );

    const storedIncomeTaxRate =
      dto.incomeTaxRate ?? this.effectiveRate(totalIncomeTax, totalTaxable);
    const parameterSnapshot = {
      applicableOn: periodEnd,
      employeeCnss: employeeSetting
        ? this.parameterSnapshot(employeeSetting)
        : {
            code: FiscalParameterCode.CnssEmployeeRsna,
            value: employeeRate,
            source: 'SAISIE_MANUELLE',
          },
      employerCnss: employerSetting
        ? this.parameterSnapshot(employerSetting)
        : {
            code: FiscalParameterCode.CnssEmployerRsna,
            value: employerRate,
            source: 'SAISIE_MANUELLE',
          },
      incomeTax: dto.incomeTaxRate
        ? { value: dto.incomeTaxRate, source: 'SAISIE_MANUELLE' }
        : { method: 'BAREME_PROGRESSIF_ANNUALISE', brackets: appliedBrackets },
      employerContributionSupport: {
        legalReference: 'Loi de finances 2026 — article 13',
        rates: ['1.00000', '0.80000', '0.60000', '0.40000', '0.20000'],
        eligibilityConfirmedPerEmployee: true,
      },
    };

    return this.dataSource.transaction(async (manager) => {
      const run = await manager.save(
        manager.create(PayrollRun, {
          organizationId,
          dossierId,
          periodYear: dto.periodYear,
          periodMonth: dto.periodMonth,
          employeeRate,
          employerRate,
          incomeTaxRate: storedIncomeTaxRate,
          totalGross: fromMillimes(totalGross),
          totalNet: fromMillimes(totalNet),
          totalEmployerCost: fromMillimes(totalEmployerCost),
          totalEmployerSupport: fromMillimes(totalEmployerSupport),
          status: PayrollRunStatus.Draft,
          parameterSnapshot,
        }),
      );
      await manager.save(
        calculated.map((line) =>
          manager.create(PayrollLine, {
            organizationId,
            runId: run.id,
            employeeId: line.employee.id,
            grossSalary: fromMillimes(line.gross),
            employeeCnss: fromMillimes(line.employeeCnss),
            incomeTax: fromMillimes(line.incomeTax),
            netSalary: fromMillimes(line.net),
            employerCnss: fromMillimes(line.employerCnss),
            employerCnssGross: fromMillimes(line.employerCnssGross),
            employerSupportRate: line.employerSupportRate,
            employerSupportAmount: fromMillimes(line.employerSupport),
          }),
        ),
      );
      return manager.findOneOrFail(PayrollRun, {
        where: { id: run.id },
        relations: { lines: { employee: true } },
      });
    });
  }

  async validate(
    organizationId: string,
    dossierId: string,
    runId: string,
    userId: string,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const run = await this.runs.findOneBy({
      id: runId,
      organizationId,
      dossierId,
    });
    if (!run) throw new NotFoundException('Le traitement est introuvable.');
    if (run.status !== PayrollRunStatus.Draft)
      throw new ConflictException('Le traitement est déjà validé.');
    run.status = PayrollRunStatus.Validated;
    return this.runs.save(run);
  }

  async cnssQuarter(
    organizationId: string,
    dossierId: string,
    userId: string,
    year: number,
    quarter: number,
  ) {
    await this.dossiers.getAccessibleEntity(organizationId, dossierId, userId);
    const fromMonth = (quarter - 1) * 3 + 1;
    const rows = await this.dataSource.query<
      Array<{
        employeeId: string;
        fullName: string;
        cnssNumber: string | null;
        grossSalary: string;
        employeeCnss: string;
        employerCnss: string;
      }>
    >(
      `SELECT e.id AS "employeeId", e.full_name AS "fullName", e.cnss_number AS "cnssNumber",
        COALESCE(SUM(l.gross_salary),0)::numeric(15,3) AS "grossSalary",
        COALESCE(SUM(l.employee_cnss),0)::numeric(15,3) AS "employeeCnss",
        COALESCE(SUM(l.employer_cnss),0)::numeric(15,3) AS "employerCnss"
       FROM accounting.payroll_lines l
       JOIN accounting.payroll_runs r ON r.id=l.run_id AND r.status='VALIDEE'
       JOIN accounting.employees e ON e.id=l.employee_id
       WHERE r.organization_id=$1 AND r.dossier_id=$2 AND r.period_year=$3
         AND r.period_month BETWEEN $4 AND $5
       GROUP BY e.id,e.full_name,e.cnss_number ORDER BY e.full_name`,
      [organizationId, dossierId, year, fromMonth, fromMonth + 2],
    );
    return { year, quarter, employees: rows };
  }

  private effectiveRate(amount: bigint, base: bigint) {
    if (base <= 0n) return '0.00000';
    const scaled = (amount * 100000n + base / 2n) / base;
    return `${scaled / 100000n}.${(scaled % 100000n)
      .toString()
      .padStart(5, '0')}`;
  }

  private employerSupportRate(employee: Employee, periodEnd: string) {
    if (
      !employee.isHigherEducationGraduate ||
      !employee.employerSupportEligible ||
      !employee.employerSupportStartDate ||
      employee.employerSupportStartDate < '2026-01-01' ||
      periodEnd < employee.employerSupportStartDate
    )
      return '0.00000';
    const start = new Date(`${employee.employerSupportStartDate}T00:00:00Z`);
    const end = new Date(`${periodEnd}T00:00:00Z`);
    let completedYears = end.getUTCFullYear() - start.getUTCFullYear();
    if (
      end.getUTCMonth() < start.getUTCMonth() ||
      (end.getUTCMonth() === start.getUTCMonth() &&
        end.getUTCDate() < start.getUTCDate())
    )
      completedYears -= 1;
    return (
      ['1.00000', '0.80000', '0.60000', '0.40000', '0.20000'][completedYears] ??
      '0.00000'
    );
  }

  private parameterSnapshot(item: {
    code: string;
    value: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    sourceLabel: string | null;
    sourceUrl: string | null;
  }) {
    return {
      code: item.code,
      value: item.value,
      effectiveFrom: item.effectiveFrom,
      effectiveTo: item.effectiveTo,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.sourceUrl,
    };
  }
}
