# Backend NestJS de la plateforme comptable

Cette version réimplémente le backend comptable en NestJS et TypeScript. Le projet .NET original reste intact dans le dossier voisin `accounting-backend`.

## Technologies

- NestJS 11 et TypeScript
- PostgreSQL 17
- TypeORM 0.3 avec migrations
- JWT, rotation des jetons de renouvellement et mots de passe bcrypt
- Swagger/OpenAPI
- Jest et Supertest
- Docker Compose
- Interface HTML/CSS/JavaScript sans framework

MongoDB n’est pas nécessaire pour le moment. PostgreSQL couvre les données relationnelles, l’audit et les futurs résultats d’extraction au format `jsonb`.

## Fonctionnalités disponibles

- Inscription du premier administrateur et création d’une organisation
- Connexion, renouvellement, révocation et acceptation d’invitation
- Organisations multi-tenant
- Rôles `Administrateur`, `Comptable`, `Client` et rôles personnalisés
- Permissions stockées en base et contrôlées sur chaque endpoint
- Membres, invitations et protection du dernier administrateur
- Journal d’audit
- Dossiers clients tunisiens avec matricule fiscal, RNE, régime fiscal,
  TVA, CNSS, honoraires, notes et tags
- Contacts multiples par dossier
- Affectation des collaborateurs comme responsable ou support
- Isolation des dossiers : un collaborateur voit uniquement ses affectations
- Moteur d’obligations fiscales avec modèles versionnés et sources officielles
- Génération mensuelle et trimestrielle sans doublons
- Déclaration mensuelle avec échéance 15/28 selon la forme juridique
- Calendrier CNSS trimestriel pour les dossiers employeurs
- Workflow : non commencée, en cours, révision, validée, déposée et payée
- Validation et dépôt réservés au propriétaire
- Détection dynamique des obligations en retard
- Tâches créées automatiquement pour chaque obligation fiscale
- Tâches manuelles avec priorité, échéance et collaborateur responsable
- Checklist obligatoire avant validation
- Commentaires par tâche et motif de rejet
- Vue globale du cabinet et filtres par statut, priorité, responsable et date
- Isolation des tâches par dossiers affectés
- Profil légal de la société
- Exercices comptables sans chevauchement
- Plan comptable hiérarchique
- Valeurs comptables exposées en français
- Gestion documentaire sur MinIO : classement, versions, boîte de réception,
  liens vers tâches/obligations et suivi des documents manquants
- Centre de notifications avec alertes J-7/J-3/J-1, retards, affectations et
  demandes de révision
- Feuille de déclaration mensuelle tunisienne avec calcul TVA, RS, TFP,
  FOPROLOS, TCL, timbre, validation et snapshot immuable
- Journaux et écritures comptables en partie double, brouillon,
  comptabilisation et extourne
- Rapports : balance générale, grand livre, balance âgée et synthèse
  bilan/résultat
- Facturation des honoraires, statut, règlement partiel ou total et encours
- Salariés, traitement mensuel de paie et synthèse CNSS trimestrielle
- Paramètres fiscaux et sociaux versionnés par date et par organisation
- Taux CNSS RSNA de référence avec source officielle
- Barème IRPP progressif 2025+ avec source officielle et calcul annualisé
- Taux TVA et retenues à la source versionnés, avec surcharge par cabinet
- Snapshot des paramètres utilisés sur chaque déclaration et traitement de paie
- Factures d’achat et de vente avec plusieurs lignes, quantité, remise et TVA
- Calcul automatique HT, TVA, timbre, retenue, TTC et net à payer
- Validation des factures avec génération automatique d’une écriture équilibrée
- Comptabilisation dans les journaux d’achats et de ventes avec comptes tiers,
  produit/charge, TVA, timbre et retenue
- Répertoire des clients et fournisseurs avec matricule fiscal, RNE, contacts,
  comptes comptables et soldes débiteurs/créditeurs
- Avoirs clients et fournisseurs rattachés à une facture originale, avec
  inversion automatique de l’écriture et réduction du solde
- Encaissements et décaissements en banque ou caisse, génération d’écriture,
  affectation aux factures et suivi non réglé/partiel/réglé
- Comptes bancaires reliés au plan comptable et aux journaux de banque
- Import de relevés CSV/XLSX avec formats français, contrôle des soldes et
  détection des opérations déjà importées
- Rapprochement automatique avec les règlements, rapprochement manuel avec une
  écriture et génération des écritures manquantes en brouillon
- Validation mensuelle seulement lorsque toutes les opérations sont rapprochées
  et que le solde bancaire correspond au solde comptable
- Registre des immobilisations avec catégories et comptes comptables dédiés
- Plans d’amortissement comptable et fiscal indépendants, linéaires ou
  dégressifs, avec calcul exact en millimes
- Comptabilisation chronologique des dotations dans un journal d’opérations
  diverses et mise à jour automatique de la valeur nette comptable
- Rapport annuel des écarts comptables/fiscaux et clôture d’exercice verrouillée
- Cession ou mise au rebut avec écriture automatique et calcul de la plus-value
  ou moins-value comptable
- Verrouillage mensuel des périodes par dossier avec contrôle des brouillons,
  amortissements et rapprochements bancaires
- Blocage transversal des écritures issues de la tenue, des factures, des
  règlements, de la banque et des immobilisations dans une période verrouillée
- Écritures de régularisation : charges à payer, produits à recevoir,
  charges/produits constatés d’avance, provisions et extourne automatique
- Clôture annuelle avec solde des charges et produits, calcul du résultat et
  génération automatique du report à nouveau
- États financiers conformes à la structure générale NC 01 : bilan, état de
  résultat par nature et état des flux de trésorerie par méthode directe
- Comparaison automatique N / N-1 selon les dates d’exercice du dossier
- Mapping NC 01 proposé depuis les codes de comptes tunisiens, modifiable pour
  chaque dossier et chaque compte
- Contrôles d’équilibre du bilan, de rapprochement de trésorerie, de flux non
  classés et de comptes non mappés
- Exports professionnels PDF et Excel avec références, contrôles et piste
  d’audit
- Snapshot définitif, horodaté et empreinté SHA-256, figé uniquement après la
  clôture comptable de l’exercice
- Notes annexes NC 01 avec dix sections numérotées, commentaires manuels,
  rubriques liées et pièces justificatives documentaires
- Tableaux automatiques des immobilisations, clients, fournisseurs, taxes,
  paie et provisions, actualisables avant validation
- Workflow des annexes : brouillon, révision par le cabinet, validation par le
  propriétaire et inclusion dans le snapshot définitif, le PDF et Excel
- Affectation d’un budget temps mensuel à chaque collaborateur par dossier
- Saisie des temps facturables ou non facturables, avec lien facultatif vers
  une tâche et contrôle du maximum journalier
- Workflow des temps : brouillon, soumission, approbation ou rejet motivé
- Rémunérations du cabinet versionnées : mode horaire ou mensuel, montant versé,
  coût total employeur et objectif mensuel
- Rapport confidentiel de rentabilité par client et par collaborateur : heures,
  budget, taux facturable, honoraires HT facturés et encaissés, coût affecté et
  marge
- Répartition transparente du revenu client entre collaborateurs selon leurs
  heures facturables approuvées, sans score automatique de performance

Les calculs de paie et de déclaration sont un moteur MVP paramétrable. Les taux
doivent être confirmés et versionnés selon la législation tunisienne applicable
avant une utilisation de production.

Dans **Modules métier**, la section **Paramètres fiscaux et sociaux** permet de
créer une nouvelle version datée d’un taux ou d’un montant. Les champs de taux
de la déclaration et de la paie peuvent rester vides : le moteur sélectionne
alors automatiquement la version applicable à la période. Une saisie manuelle
reste possible et est signalée dans le snapshot.

Pour tester les factures métier, créez d’abord dans **Comptabilité** les comptes
nécessaires et les journaux `ACHATS` / `VENTES`. Configurez ensuite les codes de
TVA dans **Paramètres fiscaux et sociaux**, puis utilisez le formulaire
**Clients et fournisseurs**, puis **Factures d’achat et de vente** dans
**Modules métier**. La validation crée l’écriture en brouillon et le bouton
**Comptabiliser** la rend définitive. Créez aussi un journal `BANQUE` ou
`CAISSE` pour tester **Règlements et lettrage**.

Pour tester le rapprochement, créez un compte dans **Comptes bancaires**, puis
importez le fichier disponible via **Télécharger un exemple CSV**. Le fichier
doit contenir `Date`, `Libellé` et `Montant`, ou `Débit` et `Crédit`. Lancez
ensuite le rapprochement automatique. Une opération inconnue peut être associée
manuellement à une écriture ou produire une nouvelle écriture brouillon.

Pour tester les immobilisations, créez un journal de type
`OPERATIONS_DIVERSES` et trois comptes distincts : immobilisation,
amortissements cumulés et charge de dotation. Dans **Modules métier**, créez la
catégorie puis l’immobilisation, générez son plan et comptabilisez les périodes
dans l’ordre. Le rapport compare le plan comptable au plan fiscal. La clôture
annuelle est réservée au propriétaire et exige que toutes les dotations
comptables de l’exercice soient comptabilisées.

Pour tester la clôture, créez un journal `OPERATIONS_DIVERSES` et un compte
mouvementable de type `CapitauxPropres` pour le résultat. Dans **Modules
métier**, utilisez **Écriture de régularisation**, puis verrouillez chaque mois.
Le contrôle annuel indique les brouillons, dotations et relevés bancaires qui
restent à traiter. La clôture définitive, réservée au propriétaire, solde les
comptes de charges et produits et crée l’écriture d’ouverture du lendemain.
Une période clôturée ne peut plus être rouverte.

Pour tester les états financiers, ouvrez **États financiers tunisiens · NC
01** dans **Modules métier**. Chargez le mapping, vérifiez ou adaptez les
rubriques, puis générez l’exercice. Le PDF et le fichier Excel sont disponibles
immédiatement. Le bouton **Valider et figer** est réservé au propriétaire,
nécessite une clôture annuelle terminée et refuse tout contrôle en anomalie.
Après validation, les consultations et exports utilisent le snapshot définitif
immuable plutôt que les données en temps réel.

Avant de figer les états, utilisez **Notes aux états financiers · Annexes NC
01** dans le même panneau. Générez les dix notes, remplacez les textes d’aide
des quatre sections obligatoires par les informations du client (ou `Néant`),
adaptez les liens vers les rubriques et joignez les justificatifs utiles.
Envoyez ensuite en révision puis validez avec un compte propriétaire. La
validation définitive des états est refusée tant que les annexes ne sont pas
validées.

Pour tester le pilotage du cabinet, chargez les membres puis utilisez
**Affectation et budget temps** sur le dossier sélectionné. Le propriétaire
configure ensuite la rémunération dans **Rémunération et coût employeur**. Le
collaborateur saisit ses heures dans **Temps passé sur le client**, les soumet,
puis le propriétaire les approuve. **Rentabilité clients et équipe** compare les
honoraires nets du cabinet avec le coût employeur affecté. Les salaires et les
marges sont protégés par des permissions réservées au propriétaire ou à un rôle
personnalisé explicitement autorisé.

## Démarrage recommandé

Le développement hybride est le plus rapide :

```text
NestJS : local avec Node.js
PostgreSQL : Docker
```

### 1. Démarrer PostgreSQL

```powershell
docker compose up -d postgres
```

### 2. Appliquer les migrations

```powershell
npm run migration:run
```

### 3. Démarrer NestJS

```powershell
npm run start:dev
```

Ouvrir ensuite :

- Interface de test : `http://localhost:3000`
- Swagger : `http://localhost:3000/docs`
- Santé : `http://localhost:3000/health`

Dans l’interface, ouvrez **Dossiers clients** après la connexion pour créer
un dossier, le sélectionner et ajouter ses contacts.

Ouvrez ensuite **Obligations fiscales** pour générer le calendrier annuel,
consulter les règles appliquées et tester le workflow de validation.

## Tout exécuter avec Docker

```powershell
docker compose up -d --build
```

Dans ce mode, les migrations sont appliquées automatiquement au démarrage.

## Commandes utiles

```powershell
npm run build
npm test
npm run test:e2e
npm run lint
npm run migration:run
npm run migration:revert
```

Pour créer une nouvelle migration :

```powershell
npm run migration:generate -- src/database/migrations/nom-migration -d src/database/data-source.ts
```

## Ports

- API NestJS : `3000`
- PostgreSQL NestJS : `5435`
- API MinIO : `9000`
- Console MinIO : `9001`
- Ancienne API .NET : `8081`
- PostgreSQL .NET : `5434`

Les deux backends peuvent ainsi fonctionner côte à côte.

## Sécurité

Les secrets présents dans `.env` et `compose.yaml` sont uniquement destinés au développement. En production, utilisez des secrets longs et uniques, un gestionnaire de secrets et une connexion PostgreSQL chiffrée.
# Cycle commercial

Le dossier client dispose d'un cycle commercial relié à la comptabilité :

- vente : devis → commande → bon de livraison → facture ;
- achat : commande → bon de réception → facture ;
- confirmation et conversion contrôlées sans ressaisie des lignes ;
- reprise du tiers, des quantités, des prix, des remises et de la TVA ;
- liaison unique entre la livraison/réception et la facture comptable ;
- génération de l'écriture comptable par le workflow de facture existant.

Les endpoints sont exposés sous
`/api/organizations/:organizationId/dossiers/:dossierId/commercial-documents`.
Ils utilisent les permissions de consultation et de gestion des factures
commerciales.

## Observabilité locale

L’API expose désormais des métriques Prometheus sur `GET /metrics` :

- volume, codes de réponse et durée des requêtes HTTP ;
- nombre de requêtes actives ;
- disponibilité et durée de contrôle PostgreSQL ;
- CPU, mémoire, event loop et autres métriques Node.js standards.

La stack Docker démarre également Prometheus et Grafana. La source de données
et le tableau de bord **Fiscora · Vue opérationnelle** sont provisionnés depuis
les fichiers versionnés dans `monitoring/`.

```powershell
docker compose up -d --build
```

- Prometheus : `http://localhost:9090`
- Grafana : `http://localhost:3001`
- compte Grafana local : `admin`
- mot de passe local par défaut : `fiscora_dev`

Définissez `GRAFANA_ADMIN_PASSWORD` dans `.env` avant tout environnement
partagé. Consultez `monitoring/README.md` pour les règles d’alerte et les
précautions de production.
