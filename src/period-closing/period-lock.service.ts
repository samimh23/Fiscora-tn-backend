import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AccountingPeriod, AccountingPeriodStatus } from '../database/entities';

@Injectable()
export class PeriodLockService {
  constructor(
    @InjectRepository(AccountingPeriod)
    private readonly periods: Repository<AccountingPeriod>,
  ) {}

  async assertDateOpen(
    organizationId: string,
    dossierId: string,
    entryDate: string,
    manager?: EntityManager,
  ) {
    const { year, month } = this.parseDate(entryDate);
    const repository = manager
      ? manager.getRepository(AccountingPeriod)
      : this.periods;
    const period = await repository.findOneBy({
      organizationId,
      dossierId,
      periodYear: year,
      periodMonth: month,
    });
    if (period && period.status !== AccountingPeriodStatus.Open) {
      throw new ConflictException(
        `La période ${String(month).padStart(2, '0')}/${year} est ${
          period.status === AccountingPeriodStatus.Closed
            ? 'clôturée'
            : 'verrouillée'
        }. Aucune écriture ne peut y être créée ou modifiée.`,
      );
    }
  }

  private parseDate(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new ConflictException('La date comptable est invalide.');
    return { year: Number(match[1]), month: Number(match[2]) };
  }
}
