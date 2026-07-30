# Administration de la plateforme Fiscora

L'administration de la plateforme est réservée à l'opérateur de Fiscora.
Elle est distincte du rôle `Propriétaire` d'un cabinet :

- un propriétaire administre uniquement son cabinet, ses dossiers et son équipe ;
- un administrateur de plateforme supervise le service Fiscora dans son ensemble ;
- aucun rôle de cabinet ne donne automatiquement accès à l'administration Fiscora.

## Premier accès du propriétaire de Fiscora

Après la création normale du compte, accorder le rôle de plateforme depuis un
terminal de confiance :

```powershell
docker compose exec api npm run platform-admin:grant -- proprietaire@example.tn
```

La commande vérifie que le compte existe, active le droit
`is_platform_admin` et enregistre l'opération dans le journal d'audit.
Déconnectez-vous puis reconnectez-vous si la session était déjà ouverte.

Ne transformez pas l'inscription publique en création automatique
d'administrateurs de plateforme.

## Endpoints

Tous les endpoints exigent un JWT valide et `isPlatformAdmin = true`.

- `GET /api/platform-admin/overview` : indicateurs, alertes et état des services ;
- `GET /api/platform-admin/organizations` : vue agrégée des cabinets ;
- `PATCH /api/platform-admin/organizations/:organizationId/status` :
  suspension ou réactivation motivée d'un cabinet ;
- `GET /api/platform-admin/users` : comptes et accès généraux ;
- `PATCH /api/platform-admin/users/:userId/status` : désactivation ou
  réactivation motivée d'un compte ;
- `POST /api/platform-admin/users/:userId/revoke-sessions` : révocation de
  toutes les sessions renouvelables d'un utilisateur ;
- `GET /api/platform-admin/jobs` : état agrégé des extractions, invitations
  et transmissions TTN ;
- `GET /api/platform-admin/audit-logs` : dernières actions d'audit sans le contenu
  métier détaillé.

Les actions sensibles exigent une confirmation explicite et une justification
d'au moins huit caractères. La justification et l'acteur sont enregistrés dans
le journal d'audit. Le dernier administrateur actif ne peut pas être désactivé
et un administrateur ne peut pas désactiver son propre compte.

La désactivation d'un utilisateur révoque immédiatement tous ses jetons de
renouvellement. Les mots de passe et le contenu comptable des clients ne sont
jamais exposés dans l'administration de plateforme.

## Sauvegardes

L'état « sauvegardes configurées » est déclaré avec :

```env
BACKUP_ENABLED=true
```

Ce marqueur ne remplace pas un contrôle réel de restauration. En production,
il doit être activé seulement après la mise en place et le test du plan de
sauvegarde.

## Interface

L'interface React est disponible sur :

```text
/administration-plateforme
```

Le lien « Administration Fiscora » apparaît uniquement pour un administrateur
de plateforme authentifié.
