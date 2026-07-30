# Abonnements SaaS Fiscora

## Modèle commercial

L'entité facturée par Fiscora est le **cabinet comptable** (`Organization`).
Un dossier client (`ClientDossier`) n'est jamais abonné directement à Fiscora.

- Les factures `CabinetInvoice` restent les honoraires émis par le cabinet vers
  ses clients.
- Les factures `SaasSubscriptionInvoice` sont émises par Fiscora vers le
  cabinet.

Ces deux flux sont volontairement séparés dans le modèle, les API et
l'interface.

## Cycle de vie

Un nouveau cabinet reçoit automatiquement l'offre `PRO` en essai pendant
30 jours. Les statuts disponibles sont :

- `ESSAI`
- `ACTIF`
- `IMPAYE` avec une période de grâce de 7 jours
- `SUSPENDU`
- `ANNULE`

Les prix des offres préchargées sont des paramètres commerciaux de départ. Ils
doivent être validés avant la commercialisation et peuvent être modifiés par
l'administration plateforme.

## Limites suivies

- collaborateurs actifs ;
- dossiers actifs ;
- stockage documentaire ;
- documents OCR du cycle courant ;
- transmissions TTN du cycle courant.

La première version mesure et affiche les dépassements. Elle ne bloque pas
automatiquement la production comptable afin d'éviter une interruption brutale
du travail du cabinet.

## Paiement

La version locale permet de créer une facture et d'enregistrer manuellement une
référence de paiement. Le modèle reste indépendant du prestataire. Une
passerelle de paiement et ses webhooks pourront être ajoutés sans mélanger la
facturation SaaS avec les honoraires clients.
