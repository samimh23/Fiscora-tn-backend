# Permanent dossier deletion

The dossier list exposes `Supprimer` only to the active cabinet owner with
`dossiers.delete`. The backend additionally verifies the active owner membership;
granting this permission to a collaborator does not permit deletion.

`DELETE /api/organizations/:organizationId/dossiers/:dossierId` requires:

```json
{
  "confirmationName": "Exact dossier legal name",
  "acknowledgePermanentDeletion": true
}
```

The transaction locks the dossier, validates cabinet ownership and the typed
name, and removes dossier-scoped business rows (including invoices, payments,
accounting, bank statements, documents, tasks, contacts, declarations, payroll,
AI jobs/history and training consent). Database foreign keys remain enabled.
Cross-dossier references or inconsistent cabinet/file scopes cause rollback.
Dependent rows without their own dossier key are removed through their existing
foreign-key cascades; restrictive foreign keys are handled by retrying parents
after their scoped children. An unresolved restriction rolls back the deletion.

Original document keys, including old/soft-deleted versions, enter a durable
cleanup queue in the same transaction. A worker removes those files only after
commit. Failed storage calls retry after five minutes; deleting an already absent
object is harmless. The existing training cleanup worker retires copies/examples
and exports after their consent disappears; export downloads check current consent.

The cabinet, user accounts, unrelated dossiers, immutable audit history, backups,
and copies already downloaded by a user are not deleted. This action is not a
backup-erasure mechanism. The dialog communicates these limits before confirmation.

Regression checks:

- `src/dossiers/dossier-deletion.service.spec.ts`: authorization, DTO confirmation,
  storage scope, rollback and durable cleanup behavior.
- `scripts/verify-dossier-deletion.cjs`: real PostgreSQL constraints, accounting and
  banking fixtures, dossier isolation and retries. Hard restricted to
  `fiscora_migration_test` on localhost. CI runs it after the full migration chain.
- Frontend `e2e/dossier-deletion.spec.ts`: owner/collaborator UI, exact name,
  acknowledgment, cancellation, failure and global selection on desktop/mobile.

Never test this endpoint against a live dossier unless its owner explicitly
intends to delete it.
