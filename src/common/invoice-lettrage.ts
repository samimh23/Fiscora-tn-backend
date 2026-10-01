import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager, In } from 'typeorm';
import {
  AccountReconciliation,
  AuditLog,
  BusinessInvoice,
  BusinessInvoiceKind,
  BusinessInvoiceStatus,
  JournalEntryLine,
  JournalEntryStatus,
  PaymentAllocation,
  ThirdPartyPaymentStatus,
} from '../database/entities';
import { PeriodLockService } from '../period-closing/period-lock.service';
import { fromMillimes, toMillimes } from './money';

/** Conservative: exact settlement, one invoice per payment, same party/account.
 * Ambiguous/imported/previously lettered cases remain available for manual review.
 * Must run inside the posting transaction, after saving the payment/credit note.
 */
export async function autoLetterInvoice(
  manager: EntityManager,
  invoice: BusinessInvoice,
  userId: string,
  periodLocks: PeriodLockService,
) {
  if (
    !invoice.journalEntryId ||
    !invoice.thirdPartyId ||
    invoice.kind !== BusinessInvoiceKind.Invoice ||
    invoice.status !== BusinessInvoiceStatus.Posted ||
    toMillimes(invoice.outstandingAmount) !== 0n
  )
    return;
  await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `lettrage:${invoice.dossierId}`,
  ]);
  const allocations = await manager.find(PaymentAllocation, {
    where: { organizationId: invoice.organizationId, invoiceId: invoice.id },
    relations: { payment: { allocations: true } },
  });
  const payments = allocations
    .map((item) => item.payment)
    .filter((payment) => payment.status === ThirdPartyPaymentStatus.Posted);
  if (
    payments.some(
      (payment) =>
        payment.organizationId !== invoice.organizationId ||
        payment.dossierId !== invoice.dossierId ||
        payment.thirdPartyId !== invoice.thirdPartyId ||
        payment.thirdPartyAccountId !== invoice.thirdPartyAccountId ||
        payment.allocations.length !== 1 ||
        payment.allocations[0].invoiceId !== invoice.id,
    )
  )
    return;
  const credits = await manager.find(BusinessInvoice, {
    where: {
      organizationId: invoice.organizationId,
      dossierId: invoice.dossierId,
      originalInvoiceId: invoice.id,
      kind: BusinessInvoiceKind.CreditNote,
      status: BusinessInvoiceStatus.Posted,
    },
  });
  if (
    credits.some(
      (credit) =>
        !credit.journalEntryId ||
        credit.thirdPartyId !== invoice.thirdPartyId ||
        credit.thirdPartyAccountId !== invoice.thirdPartyAccountId,
    )
  )
    return;
  const entryIds = [
    ...new Set([
      invoice.journalEntryId,
      ...payments.map((payment) => payment.journalEntryId),
      ...credits.map((credit) => credit.journalEntryId!),
    ]),
  ];
  if (entryIds.length < 2) return;
  const lines = await manager.find(JournalEntryLine, {
    where: {
      organizationId: invoice.organizationId,
      accountId: invoice.thirdPartyAccountId,
      entryId: In(entryIds),
    },
    relations: { entry: true },
  });
  if (
    new Set(lines.map((line) => line.entryId)).size !== entryIds.length ||
    lines.some(
      (line) =>
        line.entry.dossierId !== invoice.dossierId ||
        line.entry.status !== JournalEntryStatus.Posted ||
        line.reconciliationId ||
        line.thirdPartyName !== invoice.thirdPartyName,
    )
  )
    return;
  const debit = lines.reduce((sum, line) => sum + toMillimes(line.debit), 0n);
  const credit = lines.reduce((sum, line) => sum + toMillimes(line.credit), 0n);
  if (debit === 0n || debit !== credit) return;
  // An old closed period must not make a valid current payment fail to post.
  try {
    for (const date of new Set(lines.map((line) => line.entry.entryDate)))
      await periodLocks.assertDateOpen(
        invoice.organizationId,
        invoice.dossierId,
        date,
        manager,
      );
  } catch (error) {
    if (error instanceof ConflictException) return;
    throw error;
  }
  const date = lines
    .map((line) => line.entry.entryDate)
    .sort()
    .at(-1)!;
  const reconciliation = await manager.save(
    manager.create(AccountReconciliation, {
      organizationId: invoice.organizationId,
      dossierId: invoice.dossierId,
      accountId: invoice.thirdPartyAccountId,
      code: `LET-${date.slice(0, 4)}-AUTO-${randomUUID().slice(0, 8)}`,
      reconciliationDate: date,
      totalDebit: fromMillimes(debit),
      totalCredit: fromMillimes(credit),
      createdByUserId: userId,
    }),
  );
  const now = new Date();
  for (const line of lines) {
    line.reconciliationId = reconciliation.id;
    line.letterCode = reconciliation.code;
    line.reconciledAtUtc = now;
  }
  await manager.save(lines);
  await manager.save(
    manager.create(AuditLog, {
      organizationId: invoice.organizationId,
      actorUserId: userId,
      action: 'account_reconciliation.auto_created',
      entityType: 'AccountReconciliation',
      entityId: reconciliation.id,
      detailsJson: {
        dossierId: invoice.dossierId,
        invoiceId: invoice.id,
        code: reconciliation.code,
        lineIds: lines.map((line) => line.id),
        total: fromMillimes(debit),
      },
    }),
  );
}

/** Clear the whole group before reversing one of its entries; never leave
 * the invoice falsely marked as settled. Covers automatic and manual groups.
 */
export async function releaseEntryLettrage(
  manager: EntityManager,
  organizationId: string,
  dossierId: string,
  lines: JournalEntryLine[],
  userId: string,
  periodLocks: PeriodLockService,
) {
  const ids = [
    ...new Set(
      lines
        .map((line) => line.reconciliationId)
        .filter((id): id is string => !!id),
    ),
  ];
  if (!ids.length) return;
  await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `lettrage:${dossierId}`,
  ]);
  for (const id of ids) {
    const group = await manager.findOne(AccountReconciliation, {
      where: { id, organizationId, dossierId },
      relations: { lines: { entry: true } },
    });
    if (!group)
      throw new ConflictException(
        'Le lettrage lié à cette écriture est introuvable.',
      );
    for (const line of group.lines) {
      await periodLocks.assertDateOpen(
        organizationId,
        dossierId,
        line.entry.entryDate,
        manager,
      );
      line.reconciliationId = null;
      line.letterCode = null;
      line.reconciledAtUtc = null;
    }
    await manager.save(group.lines);
    await manager.remove(group);
    await manager.save(
      manager.create(AuditLog, {
        organizationId,
        actorUserId: userId,
        action: 'account_reconciliation.released_for_correction',
        entityType: 'AccountReconciliation',
        entityId: id,
        detailsJson: {
          dossierId,
          code: group.code,
          lineIds: group.lines.map((line) => line.id),
        },
      }),
    );
  }
}
