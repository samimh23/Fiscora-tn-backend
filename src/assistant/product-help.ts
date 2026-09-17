export interface ProductHelpEntry {
  id: string;
  title: string;
  path: string;
  permission?: string;
  keywords: string[];
  summary: string;
  steps: string[];
  notes?: string[];
}

export interface ProductHelpMatch {
  entry: ProductHelpEntry;
  score: number;
}

const entries: ProductHelpEntry[] = [
  {
    id: 'cabinet-dashboard',
    title: 'Traiter la journée du cabinet',
    path: '/',
    keywords: [
      'ma journée',
      'tableau de bord',
      'file de travail',
      'priorité',
      'retard',
      'validation',
    ],
    summary:
      'La page Ma journée regroupe les actions prioritaires du cabinet par dossier.',
    steps: [
      'Ouvrez Ma journée dans le menu principal.',
      'Choisissez une file: urgences, validations, collecte ou suivi.',
      'Ouvrez l’action proposée pour aller directement au dossier concerné.',
    ],
  },
  {
    id: 'dossiers-list',
    title: 'Rechercher ou créer un dossier client',
    path: '/dossiers',
    permission: 'dossiers.view',
    keywords: [
      'dossier',
      'client',
      'rechercher dossier',
      'nouveau dossier',
      'créer dossier',
      'archiver dossier',
    ],
    summary:
      'La liste des dossiers permet de rechercher, ouvrir et, avec la permission requise, créer un dossier client.',
    steps: [
      'Ouvrez Dossiers clients.',
      'Utilisez la recherche ou les filtres pour retrouver le client.',
      'Ouvrez sa fiche; pour un nouveau dossier, utilisez Créer puis Nouveau dossier.',
    ],
  },
  {
    id: 'dossier-overview',
    title: 'Configurer et suivre un dossier client',
    path: '/dossiers/:dossierId',
    permission: 'dossiers.view',
    keywords: [
      'fiche dossier',
      'configuration dossier',
      'matricule fiscal',
      'contact',
      'équipe dossier',
      'collecte',
      'suivi dossier',
    ],
    summary:
      'La fiche dossier centralise la configuration, les contacts, la collecte, la production, le fiscal et le suivi.',
    steps: [
      'Ouvrez le dossier depuis Dossiers clients ou la recherche globale.',
      'Choisissez l’espace voulu: Vue d’ensemble, Collecte, Production, Fiscal & social ou Suivi.',
      'Utilisez Modifier pour les données juridiques et fiscales du dossier.',
    ],
  },
  {
    id: 'document-collection',
    title: 'Déposer, classer et faire lire un document par l’IA',
    path: '/documents',
    permission: 'documents.view',
    keywords: [
      'document',
      'pièce',
      'déposer',
      'upload',
      'téléverser',
      'facture reçue',
      'classer',
      'lire avec ia',
      'extraire',
    ],
    summary:
      'L’espace Documents sert à recevoir les pièces, terminer leur classement puis lancer l’extraction IA.',
    steps: [
      'Choisissez le dossier client.',
      'Cliquez sur Déposer un document et sélectionnez le fichier.',
      'Complétez le classement si le document reste dans la Boîte de réception.',
      'Cliquez sur Lire avec l’IA, puis vérifiez les données proposées avant toute validation.',
    ],
    notes: [
      'Une extraction IA n’est jamais comptabilisée sans contrôle humain.',
    ],
  },
  {
    id: 'document-review',
    title: 'Contrôler une extraction IA',
    path: '/documents',
    permission: 'documents.validate',
    keywords: [
      'vérifier données',
      'contrôler extraction',
      'extraction ia',
      'approuver valeurs',
      'relevé bancaire',
      'facture extraite',
    ],
    summary:
      'Le contrôle compare le document original aux champs et lignes détectés par l’IA.',
    steps: [
      'Ouvrez le document portant le statut Contrôle requis.',
      'Cliquez sur Vérifier les données.',
      'Comparez chaque valeur avec l’image originale et corrigez les erreurs.',
      'Ajoutez une note si nécessaire, puis approuvez ou rejetez les valeurs.',
    ],
  },
  {
    id: 'document-request-public-link',
    title: 'Demander une pièce à un client sans compte Fiscora',
    path: '/documents',
    permission: 'documents.upload',
    keywords: [
      'demander pièce',
      'client sans compte',
      'lien sécurisé',
      'envoyer demande email',
      'document manquant',
      'renvoyer lien',
    ],
    summary:
      'Le cabinet peut envoyer par e-mail un lien sécurisé permettant au client de déposer une pièce dans le bon dossier sans créer de compte.',
    steps: [
      'Choisissez le dossier et ouvrez Collecte puis Documents.',
      'Dans Documents demandés au client, cliquez sur Nouvelle demande.',
      'Renseignez la pièce, la période et l’adresse e-mail du destinataire.',
      'Envoyez la demande; le lien personnel reste valable sept jours et accepte un seul fichier.',
      'Suivez le statut d’envoi dans la demande et utilisez Renvoyer le lien si nécessaire.',
    ],
    notes: [
      'Le fichier est analysé par l’antivirus puis classé automatiquement dans la période, la catégorie et le dossier de la demande.',
    ],
  },
  {
    id: 'assistant',
    title: 'Utiliser l’Assistant Fiscora',
    path: '/assistant',
    permission: 'documents.validate',
    keywords: [
      'assistant fiscora',
      'chatbot',
      'question document',
      'source validée',
      'actualiser sources',
      'guide fiscora',
    ],
    summary:
      'L’Assistant Fiscora explique les pages de l’application et répond aux questions sur les pièces validées du dossier sélectionné.',
    steps: [
      'Pour une procédure, décrivez la tâche ou demandez à quoi sert la page actuelle.',
      'Pour une question comptable, choisissez d’abord le dossier concerné.',
      'Actualisez les sources après avoir approuvé de nouvelles extractions.',
      'Utilisez les citations pour contrôler l’origine de la réponse.',
    ],
    notes: [
      'L’assistant guide et explique; il ne clique pas, ne valide pas et ne comptabilise rien à votre place.',
    ],
  },
  {
    id: 'accounting',
    title: 'Saisir et consulter la comptabilité',
    path: '/comptabilite',
    permission: 'accounting.view',
    keywords: [
      'comptabilité',
      'écriture',
      'journal',
      'grand livre',
      'balance',
      'lettrage',
      'clôture',
      'plan comptable',
    ],
    summary:
      'L’espace Comptabilité regroupe les écritures, journaux, comptes, balances, lettrages et travaux de clôture.',
    steps: [
      'Choisissez le dossier client.',
      'Ouvrez l’onglet correspondant au travail à réaliser.',
      'Contrôlez l’équilibre et les pièces justificatives avant de soumettre ou comptabiliser une écriture.',
    ],
  },
  {
    id: 'invoices',
    title: 'Contrôler les factures et règlements',
    path: '/factures',
    permission: 'business_invoices.view',
    keywords: [
      'facture achat',
      'facture comptable',
      'avoir',
      'client fournisseur',
      'tiers',
      'règlement',
      'paiement',
      'solde facture',
    ],
    summary:
      'Factures & règlements est l’espace du cabinet pour contrôler les pièces reçues, les comptabiliser et suivre leur règlement.',
    steps: [
      'Choisissez le dossier puis le sous-espace Factures ou Règlements.',
      'Créez ou sélectionnez le tiers concerné.',
      'Contrôlez le document reçu, les taxes et les totaux, puis comptabilisez-le selon vos permissions.',
    ],
  },
  {
    id: 'banking',
    title: 'Importer et rapprocher un relevé bancaire',
    path: '/banque',
    permission: 'bank_reconciliation.view',
    keywords: [
      'banque',
      'relevé bancaire',
      'ofx',
      'csv',
      'xlsx',
      'transaction',
      'rapprochement',
      'règle bancaire',
    ],
    summary:
      'L’espace Banque importe les relevés et rapproche leurs mouvements avec les paiements ou écritures du dossier.',
    steps: [
      'Choisissez le dossier et configurez le compte bancaire si nécessaire.',
      'Importez le relevé OFX, CSV ou XLSX.',
      'Examinez les suggestions et appliquez ou créez une règle réutilisable.',
      'Validez le rapprochement seulement lorsque le solde et l’écart sont cohérents.',
    ],
  },
  {
    id: 'migration',
    title: 'Migrer les données d’un ancien logiciel',
    path: '/migration',
    permission: 'accounting.view',
    keywords: [
      'migration',
      'sage',
      'ciel',
      'import comptes',
      'import journaux',
      'tiers',
      'soldes ouverture',
    ],
    summary:
      'L’assistant de migration importe les journaux, comptes, tiers et soldes d’ouverture depuis des exports existants.',
    steps: [
      'Choisissez le dossier et le type de données à importer.',
      'Téléversez le fichier puis contrôlez l’aperçu et les avertissements.',
      'Corrigez les lignes invalides avant de confirmer l’import.',
    ],
  },
  {
    id: 'tasks',
    title: 'Créer, affecter et valider une tâche',
    path: '/taches',
    permission: 'tasks.view',
    keywords: [
      'tâche',
      'affecter',
      'collaborateur',
      'checklist',
      'commentaire',
      'valider tâche',
      'travail',
    ],
    summary:
      'Les tâches organisent le travail par dossier, responsable, échéance et checklist.',
    steps: [
      'Choisissez le dossier puis créez ou ouvrez une tâche.',
      'Renseignez la priorité, l’échéance, le responsable et la checklist.',
      'Le collaborateur prépare le travail; un valideur contrôle ensuite le résultat si le workflow l’exige.',
    ],
  },
  {
    id: 'obligations',
    title: 'Suivre le calendrier fiscal',
    path: '/obligations',
    permission: 'obligations.view',
    keywords: [
      'obligation',
      'calendrier fiscal',
      'échéance',
      'retard',
      'déposer',
      'déclaration fiscale',
    ],
    summary:
      'Le calendrier fiscal suit les obligations, leurs échéances, validations et preuves de dépôt.',
    steps: [
      'Choisissez le dossier et la période.',
      'Ouvrez l’obligation à préparer.',
      'Faites valider les données, puis enregistrez le dépôt et sa référence ou son justificatif.',
    ],
  },
  {
    id: 'monthly-declarations',
    title: 'Préparer une déclaration mensuelle',
    path: '/declarations',
    permission: 'declarations.view',
    keywords: [
      'déclaration mensuelle',
      'tva',
      'retenue',
      'tfp',
      'foprolos',
      'tcl',
      'timbre',
      'valider déclaration',
    ],
    summary:
      'Les déclarations mensuelles sont préparées à partir des factures comptabilisées et de la paie.',
    steps: [
      'Choisissez le dossier et la période fiscale.',
      'Générez ou recalculez la déclaration depuis les données comptabilisées.',
      'Traitez les contrôles et justifiez tout ajustement.',
      'Validez puis enregistrez le dépôt et le reçu.',
    ],
  },
  {
    id: 'annual-tax',
    title: 'Préparer la fiscalité annuelle et la liasse',
    path: '/fiscal-annuel',
    permission: 'declarations.view',
    keywords: [
      'fiscal annuel',
      'is annuel',
      'acomptes provisionnels',
      'liasse fiscale',
      'tej',
      'régime forfaitaire',
    ],
    summary:
      'Fiscal annuel regroupe l’IS, les acomptes, la liasse et les contrôles annuels du dossier.',
    steps: [
      'Choisissez le dossier et l’exercice.',
      'Vérifiez que la comptabilité et les périodes nécessaires sont prêtes.',
      'Préparez le calcul, traitez les contrôles puis exportez ou validez selon le workflow.',
    ],
  },
  {
    id: 'payroll',
    title: 'Préparer la paie et les exports sociaux',
    path: '/paie',
    permission: 'payroll.view',
    keywords: [
      'paie',
      'salarié',
      'bulletin',
      'payslip pdf',
      'cnss',
      'export cnss',
      'salaire',
    ],
    summary:
      'La Paie gère les salariés, les traitements mensuels, les bulletins PDF et les exports CNSS.',
    steps: [
      'Choisissez le dossier et complétez les salariés.',
      'Créez le traitement de la période et contrôlez les variables.',
      'Validez la paie avant de générer les bulletins ou l’export CNSS.',
    ],
  },
  {
    id: 'fixed-assets',
    title: 'Gérer les immobilisations et amortissements',
    path: '/immobilisations',
    permission: 'fixed_assets.view',
    keywords: [
      'immobilisation',
      'amortissement',
      'cession',
      'registre immobilisations',
      'dotation',
    ],
    summary:
      'Le registre des immobilisations prépare les plans, dotations et écritures d’amortissement.',
    steps: [
      'Choisissez le dossier et ajoutez ou importez l’immobilisation.',
      'Contrôlez la date, la base, la durée et la méthode d’amortissement.',
      'Préparez puis validez la dotation avant comptabilisation.',
    ],
  },
  {
    id: 'financial-statements',
    title: 'Préparer et exporter les états financiers',
    path: '/etats-financiers',
    permission: 'financial_statements.view',
    keywords: [
      'états financiers',
      'bilan',
      'état résultat',
      'flux trésorerie',
      'notes',
      'export états',
    ],
    summary:
      'Les états financiers produisent le bilan, le résultat, les flux et les exports à partir de la comptabilité.',
    steps: [
      'Choisissez le dossier et l’exercice.',
      'Contrôlez le mapping des comptes et les anomalies signalées.',
      'Préparez, validez puis exportez la version définitive.',
    ],
  },
  {
    id: 'fiscal-settings',
    title: 'Consulter les paramètres fiscaux et sociaux',
    path: '/fiscalite',
    permission: 'fiscal_settings.view',
    keywords: [
      'paramètre fiscal',
      'taux tva',
      'retenue source',
      'tfp',
      'foprolos',
      'tcl',
      'version taux',
    ],
    summary:
      'Les paramètres fiscaux versionnent les taux utilisés par les calculs de la plateforme.',
    steps: [
      'Ouvrez Paramètres fiscaux.',
      'Choisissez la famille de taux et vérifiez sa période d’effet.',
      'Seuls les utilisateurs autorisés doivent créer une nouvelle version; ne modifiez pas rétroactivement un taux utilisé.',
    ],
  },
  {
    id: 'foreign-trade',
    title: 'Gérer le commerce extérieur',
    path: '/commerce-exterieur',
    permission: 'foreign_trade.view',
    keywords: [
      'commerce extérieur',
      'devise',
      'taux change',
      'import export',
      'écart change',
      'attestation',
    ],
    summary:
      'Commerce extérieur suit les devises, opérations, attestations et écarts de change.',
    steps: [
      'Choisissez le dossier et la période.',
      'Enregistrez le taux et l’opération avec ses justificatifs.',
      'Contrôlez l’écart de change avant toute comptabilisation.',
    ],
  },
  {
    id: 'electronic-invoices',
    title: 'Préparer une facture électronique TTN',
    path: '/facturation-electronique',
    permission: 'electronic_invoices.view',
    keywords: [
      'facturation électronique',
      'ttn',
      'el facture',
      'transmettre facture',
      'connecteur ttn',
    ],
    summary:
      'Facturation TTN prépare, contrôle et transmet les factures électroniques selon la configuration du dossier.',
    steps: [
      'Choisissez le dossier et vérifiez la configuration TTN.',
      'Préparez la facture puis corrigez les contrôles bloquants.',
      'Simulez ou transmettez uniquement avec la permission correspondante.',
    ],
  },
  {
    id: 'billing',
    title: 'Gérer les honoraires du cabinet',
    path: '/honoraires',
    permission: 'billing.view',
    keywords: [
      'honoraires',
      'facture cabinet',
      'abonnement client',
      'règlement honoraires',
      'impayé',
    ],
    summary:
      'Honoraires suit les prestations facturées par le cabinet, leurs échéances et règlements.',
    steps: [
      'Choisissez le dossier ou la vue cabinet.',
      'Créez la facture d’honoraires avec sa période et son échéance.',
      'Enregistrez le règlement pour mettre à jour le solde.',
    ],
  },
  {
    id: 'time-tracking',
    title: 'Saisir et faire approuver le temps de travail',
    path: '/temps',
    permission: 'time_tracking.view',
    keywords: [
      'temps de travail',
      'chronomètre',
      'timer',
      'saisir temps',
      'approuver temps',
      'oublié arrêter',
    ],
    summary:
      'Temps de travail suit les sessions par dossier et tâche, avec anomalies et validation.',
    steps: [
      'Sélectionnez le dossier et, si possible, la tâche avant de démarrer.',
      'Arrêtez ou mettez en pause la session lorsque le travail s’interrompt.',
      'Corrigez une anomalie avec un motif, puis soumettez le temps à validation.',
    ],
  },
  {
    id: 'profitability',
    title: 'Analyser la rentabilité',
    path: '/rentabilite',
    permission: 'profitability.view',
    keywords: [
      'rentabilité',
      'marge',
      'coût collaborateur',
      'temps dossier',
      'honoraires',
      'budget temps',
    ],
    summary:
      'Rentabilité compare les honoraires, le temps validé et les coûts du cabinet par dossier ou collaborateur.',
    steps: [
      'Choisissez la période et le niveau d’analyse.',
      'Vérifiez que les temps sont approuvés et les coûts correctement configurés.',
      'Analysez les écarts entre budget, coût et honoraires.',
    ],
  },
  {
    id: 'quality',
    title: 'Traiter les contrôles d’assurance qualité',
    path: '/qualite',
    permission: 'quality_assurance.view',
    keywords: [
      'qualité',
      'assurance qualité',
      'anomalie',
      'contrôle dossier',
      'risque',
      'qa',
    ],
    summary:
      'Assurance qualité regroupe les incohérences et contrôles à traiter avant validation ou clôture.',
    steps: [
      'Filtrez par dossier, période ou niveau de gravité.',
      'Ouvrez le contrôle pour accéder à sa source.',
      'Corrigez la donnée métier puis relancez le contrôle; ne masquez pas une anomalie sans justification.',
    ],
  },
  {
    id: 'team-access',
    title: 'Inviter un membre et gérer ses accès',
    path: '/equipe',
    permission: 'users.view',
    keywords: [
      'équipe',
      'inviter',
      'collaborateur',
      'rôle',
      'permission',
      'accès',
      'suspendre membre',
      'journal audit',
    ],
    summary:
      'Équipe & accès gère les invitations, membres, rôles, permissions et le journal d’audit.',
    steps: [
      'Ouvrez Équipe & accès puis Membres.',
      'Invitez l’adresse e-mail et choisissez le rôle approprié.',
      'Affectez ensuite le membre aux dossiers nécessaires; appliquez le principe du moindre privilège.',
    ],
  },
  {
    id: 'subscription',
    title: 'Consulter l’abonnement Fiscora',
    path: '/abonnement',
    permission: 'organization.manage',
    keywords: [
      'abonnement',
      'plan fiscora',
      'quota',
      'stockage',
      'ocr',
      'facture abonnement',
    ],
    summary:
      'Abonnement Fiscora affiche le plan, les quotas, l’usage et les factures de la plateforme.',
    steps: [
      'Ouvrez Abonnement Fiscora.',
      'Contrôlez les consommations et les dates de période.',
      'Consultez les factures ou adaptez le plan lorsque les limites approchent.',
    ],
  },
  {
    id: 'portal-dashboard',
    title: 'Comprendre le tableau de bord client',
    path: '/portail',
    permission: 'client_portal.view',
    keywords: [
      'portail client',
      'tableau de bord client',
      'action client',
      'pièce demandée',
      'échéance client',
    ],
    summary:
      'Le tableau de bord client présente les pièces demandées, échéances, paiements et validations qui nécessitent une action.',
    steps: [
      'Ouvrez Mon tableau de bord.',
      'Sélectionnez une action pour rejoindre le dossier et l’onglet concernés.',
      'Utilisez Mes dossiers pour consulter tout le contenu autorisé.',
    ],
  },
  {
    id: 'portal-dossiers',
    title: 'Consulter les dossiers accessibles dans le portail',
    path: '/portail/dossiers',
    permission: 'client_portal.view',
    keywords: [
      'mes dossiers',
      'liste dossiers client',
      'changer dossier',
      'ouvrir dossier portail',
    ],
    summary:
      'Mes dossiers affiche les sociétés auxquelles le client connecté a accès.',
    steps: [
      'Ouvrez Mes dossiers dans le menu.',
      'Sélectionnez la société concernée.',
      'Utilisez ensuite ses onglets pour les documents, échéances, déclarations, factures, honoraires, états financiers ou messages.',
    ],
  },
  {
    id: 'portal-dossier-overview',
    title: 'Naviguer dans un dossier du portail client',
    path: '/portail/dossiers/:dossierId',
    permission: 'client_portal.view',
    keywords: [
      'dossier portail',
      'onglet portail',
      'vue ensemble client',
      'échéances client',
      'déclarations client',
      'factures client',
      'états financiers client',
    ],
    summary:
      'Un dossier du portail regroupe les informations que le cabinet a rendues visibles au client.',
    steps: [
      'Ouvrez Mes dossiers puis choisissez la société.',
      'Utilisez les onglets Vue d’ensemble, Documents, Échéances, Déclarations, Factures, Honoraires, États financiers, Messages ou Ventes & facturation.',
      'Si une information attendue est absente, contactez le cabinet depuis Messages.',
    ],
  },
  {
    id: 'portal-sales',
    title: 'Créer un devis ou une facture depuis le portail client',
    path: '/portail/dossiers/:dossierId?tab=sales',
    permission: 'commercial_documents.view',
    keywords: [
      'créer devis',
      'créer facture client',
      'facturation client',
      'bon de livraison',
      'cycle commercial client',
      'émettre facture',
    ],
    summary:
      'Ventes & facturation appartient au client. Il permet de gérer ses clients et de transformer un devis en commande, livraison puis facture.',
    steps: [
      'Ouvrez le dossier puis l’onglet Ventes & facturation.',
      'Ajoutez d’abord le client dans le sous-onglet Clients si nécessaire.',
      'Créez directement une facture ou démarrez par un devis, puis confirmez et convertissez chaque étape.',
      'Cliquez sur Émettre pour finaliser la facture. Le PDF est alors transmis automatiquement dans les Documents reçus du cabinet.',
      'Le paiement n’est pas requis pour transmettre la facture; le cabinet effectue ensuite le contrôle comptable.',
    ],
  },
  {
    id: 'portal-documents',
    title: 'Envoyer un document depuis le portail client',
    path: '/portail/dossiers/:dossierId',
    permission: 'client_portal.view',
    keywords: [
      'client déposer document',
      'portail envoyer facture',
      'répondre demande pièce',
      'document client',
      'télécharger document',
    ],
    summary:
      'Dans le portail, le client peut envoyer une pièce au bon dossier et répondre à une demande du cabinet.',
    steps: [
      'Ouvrez Mes dossiers puis le dossier concerné.',
      'Ouvrez l’onglet Documents.',
      'Pour une demande précise, ouvrez cette demande avant de déposer le fichier; sinon utilisez Déposer des pièces.',
      'Choisissez la catégorie et la période lorsqu’elles sont demandées, puis confirmez l’envoi.',
    ],
  },
  {
    id: 'portal-messages',
    title: 'Échanger avec le cabinet depuis le portail',
    path: '/portail/dossiers/:dossierId?tab=messages',
    permission: 'client_portal.message',
    keywords: [
      'message cabinet',
      'conversation client',
      'contacter comptable',
      'portail message',
    ],
    summary:
      'L’onglet Messages conserve les échanges liés au dossier dans le portail sécurisé.',
    steps: [
      'Ouvrez Mes dossiers puis le dossier concerné.',
      'Ouvrez l’onglet Messages.',
      'Rédigez le message et joignez une pièce via Documents si elle doit être classée ou traitée.',
    ],
  },
  {
    id: 'portal-notifications',
    title: 'Consulter les notifications du portail',
    path: '/portail/notifications',
    permission: 'notifications.view',
    keywords: [
      'notification client',
      'alerte',
      'marquer comme lu',
      'portail notifications',
    ],
    summary:
      'Les notifications signalent les demandes, échéances et mises à jour du cabinet.',
    steps: [
      'Ouvrez Notifications.',
      'Sélectionnez la notification pour rejoindre l’élément concerné.',
      'Marquez-la comme lue lorsque l’action a été comprise ou traitée.',
    ],
  },
  {
    id: 'portal-settings',
    title: 'Gérer le compte du portail client',
    path: '/portail/parametres',
    permission: 'client_portal.view',
    keywords: [
      'mon compte',
      'profil',
      'mot de passe',
      'paramètre portail',
      'sécurité compte',
    ],
    summary:
      'Mon compte permet de consulter les informations personnelles et les paramètres de sécurité disponibles.',
    steps: [
      'Ouvrez Mon compte.',
      'Mettez à jour les informations autorisées.',
      'Utilisez un mot de passe unique et ne partagez jamais votre accès.',
    ],
  },
];

const stopWords = new Set([
  'a',
  'ai',
  'au',
  'aux',
  'avec',
  'ce',
  'ces',
  'comment',
  'dans',
  'de',
  'des',
  'du',
  'en',
  'est',
  'et',
  'faire',
  'je',
  'la',
  'le',
  'les',
  'ma',
  'mes',
  'mon',
  'nous',
  'on',
  'ou',
  'pour',
  'que',
  'quel',
  'quelle',
  'qui',
  'sur',
  'un',
  'une',
  'vous',
  'the',
  'how',
  'to',
  'where',
  'what',
  'i',
  'my',
  'is',
]);

export function normalizeHelpText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: string) {
  return new Set(
    normalizeHelpText(value)
      .split(' ')
      .filter((token) => token.length > 1 && !stopWords.has(token)),
  );
}

function pathMatches(pattern: string, currentPath: string) {
  const cleanPattern = pattern.split('?')[0];
  const cleanPath = currentPath.split('?')[0];
  if (cleanPattern === '/') return cleanPath === '/';
  const expression = cleanPattern
    .split('/')
    .map((segment) =>
      segment.startsWith(':')
        ? '[^/]+'
        : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/');
  return new RegExp(`^${expression}/?$`).test(cleanPath);
}

export function findProductHelp(
  question: string,
  currentPath: string | undefined,
  permissions: ReadonlySet<string>,
  limit = 4,
): ProductHelpMatch[] {
  const normalizedQuestion = normalizeHelpText(question);
  const questionTokens = tokens(question);
  return entries
    .filter((entry) => !entry.permission || permissions.has(entry.permission))
    .map((entry) => {
      const titleTokens = tokens(entry.title);
      const contentTokens = tokens(
        [entry.title, entry.summary, ...entry.keywords, ...entry.steps].join(
          ' ',
        ),
      );
      let score = 0;
      for (const token of questionTokens) {
        if (titleTokens.has(token)) score += 4;
        else if (contentTokens.has(token)) score += 1.5;
      }
      for (const keyword of entry.keywords) {
        if (normalizedQuestion.includes(normalizeHelpText(keyword))) score += 5;
      }
      // “À quoi sert cette page ?” contains almost no domain vocabulary, so
      // the current route must be a strong signal. Explicit task keywords still
      // outweigh this boost for questions about another page.
      if (currentPath && pathMatches(entry.path, currentPath)) score += 6;
      return { entry, score };
    })
    .filter((match) => match.score >= 3)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function isProductHelpQuestion(
  question: string,
  matches: ProductHelpMatch[],
) {
  const normalized = normalizeHelpText(question);
  const asksHow =
    /\b(comment|ou|page|menu|bouton|clic|navig|utilis|fiscora|site|workflow|etape|how|where)\b/.test(
      normalized,
    );
  return Boolean(matches.length && (asksHow || matches[0].score >= 9));
}

export function buildProductHelpContext(matches: ProductHelpMatch[]) {
  return matches
    .map(({ entry }, index) => {
      const notes = entry.notes?.length
        ? `\nPrécautions:\n${entry.notes.map((note) => `- ${note}`).join('\n')}`
        : '';
      return [
        `[S${index + 1}] GUIDE_FISCORA`,
        `Titre: ${entry.title}`,
        `Page: ${entry.path}`,
        `Résumé: ${entry.summary}`,
        `Étapes:\n${entry.steps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`).join('\n')}${notes}`,
      ].join('\n');
    })
    .join('\n\n');
}

export const productHelpEntries = entries;
