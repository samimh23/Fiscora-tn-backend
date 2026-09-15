export interface TejField {
  code: string;
  label: string;
  type: string;
  formula: Array<{ code: string; sign: 1 | -1 }> | null;
}

export const TEJ_FIELDS: Record<string, TejField[]> = {
  F6001: [
    {
      code: 'F60010001',
      label: 'Actifs non courants (Brut)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60010002',
          sign: 1,
        },
        {
          code: 'F60010031',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60010002',
      label: 'Actifs immobilises (Brut)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60010003',
          sign: 1,
        },
        {
          code: 'F60010012',
          sign: 1,
        },
        {
          code: 'F60010021',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60010003',
      label: 'Immobilisations Incorporelles (Brut)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60010004',
          sign: 1,
        },
        {
          code: 'F60010005',
          sign: 1,
        },
        {
          code: 'F60010006',
          sign: 1,
        },
        {
          code: 'F60010007',
          sign: 1,
        },
        {
          code: 'F60010008',
          sign: 1,
        },
        {
          code: 'F60010009',
          sign: 1,
        },
        {
          code: 'F60010010',
          sign: 1,
        },
        {
          code: 'F60010011',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60010004',
      label: 'Investissement recherche et developpement (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010005',
      label: 'Concess. marque,brevet,licence,marque (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010006',
      label: 'Logiciels (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010007',
      label: 'Fonds commercial (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010008',
      label: 'Droit au bail (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010009',
      label: 'Autres Immobilisations Incorporelles (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010010',
      label: 'Immobilisations Incorporelles en cours (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010011',
      label: 'Av. et Ac. Verses/Cmde.Immob.Incorp. (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010012',
      label: 'Immobilisations corporelles (Brut)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60010013',
          sign: 1,
        },
        {
          code: 'F60010014',
          sign: 1,
        },
        {
          code: 'F60010015',
          sign: 1,
        },
        {
          code: 'F60010016',
          sign: 1,
        },
        {
          code: 'F60010017',
          sign: 1,
        },
        {
          code: 'F60010018',
          sign: 1,
        },
        {
          code: 'F60010019',
          sign: 1,
        },
        {
          code: 'F60010020',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60010013',
      label: 'Terrains (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010014',
      label: 'Constructions (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010015',
      label: 'Inst. Tech., materiel et outillages Industriels (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010016',
      label: 'Materiel de transport  (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010017',
      label: 'Autres Immobilisations Corporelles  (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010018',
      label: 'Immob. Corporelles en cours (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010019',
      label: 'Av. et Ac. Verses/Commande Immob.Corp. (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010020',
      label: 'Immob. a statut juridique particulier (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010021',
      label: 'Immobilisations Financieres (Brut)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60010022',
          sign: 1,
        },
        {
          code: 'F60010023',
          sign: 1,
        },
        {
          code: 'F60010024',
          sign: 1,
        },
        {
          code: 'F60010025',
          sign: 1,
        },
        {
          code: 'F60010026',
          sign: 1,
        },
        {
          code: 'F60010027',
          sign: 1,
        },
        {
          code: 'F60010028',
          sign: 1,
        },
        {
          code: 'F60010029',
          sign: 1,
        },
        {
          code: 'F60010030',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60010022',
      label: 'Actions (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010023',
      label: 'Autres creances rattach. a des participat. (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010024',
      label: 'Creances rattach. a des stes en participat. (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010025',
      label: 'Vers.a eff./titre de participation non liberes (Brut)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60010026',
      label: 'Titres immobilises (droit de propriete) (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010027',
      label: 'Titres immobilises (droit de creance) (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010028',
      label: 'Depots et cautionnements verses (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010029',
      label: 'Autres creances immobilisees (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010030',
      label: 'Vers.a eff./Titres immobilises non liberes (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010031',
      label: 'Autres Actifs Non Courants (Brut)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60010032',
          sign: 1,
        },
        {
          code: 'F60010033',
          sign: 1,
        },
        {
          code: 'F60010034',
          sign: 1,
        },
        {
          code: 'F60010035',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60010032',
      label: 'Frais preliminaires (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010033',
      label: 'Charges a repartir (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010034',
      label: "Frais d'emission et primes de Remb. Empts (Brut)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010035',
      label: 'ecarts de conversion (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010036',
      label: 'Actifs courants (Brut)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60010037',
          sign: 1,
        },
        {
          code: 'F60010044',
          sign: 1,
        },
        {
          code: 'F60010050',
          sign: 1,
        },
        {
          code: 'F60010059',
          sign: 1,
        },
        {
          code: 'F60010064',
          sign: 1,
        },
        {
          code: 'F60010064',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60010037',
      label: 'Stocks (Brut)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60010038',
          sign: 1,
        },
        {
          code: 'F60010039',
          sign: 1,
        },
        {
          code: 'F60010040',
          sign: 1,
        },
        {
          code: 'F60010041',
          sign: 1,
        },
        {
          code: 'F60010042',
          sign: 1,
        },
        {
          code: 'F60010043',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60010038',
      label: 'Stocks Matieres Premieres et Fournit. Liees (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010039',
      label: 'Stocks Autres Approvisionnements (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010040',
      label: 'Stocks En-cours de production de biens (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010041',
      label: 'Stocks En-cours de production services (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010042',
      label: 'Stocks de produits (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010043',
      label: 'Stocks de marchandises (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010044',
      label: 'Clients et Comptes Rattaches (Brut)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60010045',
          sign: 1,
        },
        {
          code: 'F60010046',
          sign: 1,
        },
        {
          code: 'F60010047',
          sign: 1,
        },
        {
          code: 'F60010048',
          sign: 1,
        },
        {
          code: 'F60010049',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60010045',
      label: 'Clients  et  comptes rattaches (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010046',
      label: 'Clients - effets a recevoir (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010047',
      label: 'Clients douteux ou litigieux (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010048',
      label: 'Creances/travaux non encore facturables (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010049',
      label: 'Clt-pdts non encore factures (pdt a recev.) (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010050',
      label: 'Autres Actifs Courants (Brut)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60010051',
          sign: 1,
        },
        {
          code: 'F60010052',
          sign: 1,
        },
        {
          code: 'F60010053',
          sign: 1,
        },
        {
          code: 'F60010054',
          sign: 1,
        },
        {
          code: 'F60010055',
          sign: 1,
        },
        {
          code: 'F60010056',
          sign: 1,
        },
        {
          code: 'F60010057',
          sign: 1,
        },
        {
          code: 'F60010058',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60010051',
      label: 'Fournisseurs debiteurs (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010052',
      label: 'Personnel et comptes rattaches (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010053',
      label: 'etat et collectivites publiques (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010054',
      label: 'Societes du groupe  et  associes (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010055',
      label: 'Debiteurs divers et Crediteurs divers (Brut)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60010056',
      label: "Comptes transitoires ou d'attente (Brut)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010057',
      label: 'Comptes de regularisation (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010058',
      label: 'Prov. / deprec. comptes debiteurs divers (Brut)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60010059',
      label: 'Placements et Autres Actifs Financiers (Brut)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60010060',
          sign: 1,
        },
        {
          code: 'F60010061',
          sign: 1,
        },
        {
          code: 'F60010062',
          sign: 1,
        },
        {
          code: 'F60010063',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60010060',
      label: 'Prets et autres creances Fin. courants (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010061',
      label: 'Placements courants (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010062',
      label: "Regies d'avances et accreditifs (Brut)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010063',
      label: 'Prov. / deprec. des comptes financiers (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010064',
      label: 'Liquidites et equivalents de liquidites (Brut)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60010065',
          sign: 1,
        },
        {
          code: 'F60010066',
          sign: 1,
        },
        {
          code: 'F60010067',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60010065',
      label: 'Banques, etabl. Financiers et assimiles (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010066',
      label: 'Caisse (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010067',
      label: 'Autres Postes des Actifs du Bilan (Brut)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60010068',
      label: 'Total des actifs (Brut)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60010001',
          sign: 1,
        },
        {
          code: 'F60010036',
          sign: 1,
        },
        {
          code: 'F60010067',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011001',
      label: 'Actifs non courants (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60011002',
          sign: 1,
        },
        {
          code: 'F60011031',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011002',
      label: 'Actifs immobilises (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60011003',
          sign: 1,
        },
        {
          code: 'F60011012',
          sign: 1,
        },
        {
          code: 'F60011021',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011003',
      label: 'Immobilisations Incorporelles (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60011004',
          sign: 1,
        },
        {
          code: 'F60011005',
          sign: 1,
        },
        {
          code: 'F60011006',
          sign: 1,
        },
        {
          code: 'F60011007',
          sign: 1,
        },
        {
          code: 'F60011008',
          sign: 1,
        },
        {
          code: 'F60011009',
          sign: 1,
        },
        {
          code: 'F60011010',
          sign: 1,
        },
        {
          code: 'F60011011',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011004',
      label:
        'Investissement recherche et developpement (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011005',
      label: 'Concess. marque,brevet,licence,marque (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011006',
      label: 'Logiciels (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011007',
      label: 'Fonds commercial (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011008',
      label: 'Droit au bail (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011009',
      label: 'Autres Immobilisations Incorporelles (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011010',
      label: 'Immobilisations Incorporelles en cours (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011011',
      label: 'Av. et Ac. Verses/Cmde.Immob.Incorp. (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011012',
      label: 'Immobilisations corporelles (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60011013',
          sign: 1,
        },
        {
          code: 'F60011014',
          sign: 1,
        },
        {
          code: 'F60011015',
          sign: 1,
        },
        {
          code: 'F60011016',
          sign: 1,
        },
        {
          code: 'F60011017',
          sign: 1,
        },
        {
          code: 'F60011018',
          sign: 1,
        },
        {
          code: 'F60011019',
          sign: 1,
        },
        {
          code: 'F60011020',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011013',
      label: 'Terrains (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011014',
      label: 'Constructions (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011015',
      label:
        'Inst. Tech., materiel et outillages Industriels (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011016',
      label: 'Materiel de transport  (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011017',
      label: 'Autres Immobilisations Corporelles  (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011018',
      label: 'Immob. Corporelles en cours (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011019',
      label: 'Av. et Ac. Verses/Commande Immob.Corp. (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011020',
      label: 'Immob. a statut juridique particulier (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011021',
      label: 'Immobilisations Financieres (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60011022',
          sign: 1,
        },
        {
          code: 'F60011023',
          sign: 1,
        },
        {
          code: 'F60011024',
          sign: 1,
        },
        {
          code: 'F60011025',
          sign: 1,
        },
        {
          code: 'F60011026',
          sign: 1,
        },
        {
          code: 'F60011027',
          sign: 1,
        },
        {
          code: 'F60011028',
          sign: 1,
        },
        {
          code: 'F60011029',
          sign: 1,
        },
        {
          code: 'F60011030',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011022',
      label: 'Actions (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011023',
      label:
        'Autres creances rattach. a des participat. (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011024',
      label:
        'Creances rattach. a des stes en participat. (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011025',
      label:
        'Vers.a eff./titre de participation non liberes (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011026',
      label:
        'Titres immobilises (droit de propriete) (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011027',
      label: 'Titres immobilises (droit de creance) (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011028',
      label: 'Depots et cautionnements verses (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011029',
      label: 'Autres creances immobilisees (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011030',
      label:
        'Vers.a eff./Titres immobilises non liberes (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011031',
      label: 'Autres Actifs Non Courants (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60011032',
          sign: 1,
        },
        {
          code: 'F60011033',
          sign: 1,
        },
        {
          code: 'F60011034',
          sign: 1,
        },
        {
          code: 'F60011035',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011032',
      label: 'Frais preliminaires (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011033',
      label: 'Charges a repartir (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011034',
      label:
        "Frais d'emission et primes de Remb. Empts (Amortissement/Provision)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011035',
      label: 'ecarts de conversion (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011036',
      label: 'Actifs courants (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60011037',
          sign: 1,
        },
        {
          code: 'F60011044',
          sign: 1,
        },
        {
          code: 'F60011050',
          sign: 1,
        },
        {
          code: 'F60011059',
          sign: 1,
        },
        {
          code: 'F60011064',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011037',
      label: 'Stocks (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60011038',
          sign: 1,
        },
        {
          code: 'F60011039',
          sign: 1,
        },
        {
          code: 'F60011040',
          sign: 1,
        },
        {
          code: 'F60011041',
          sign: 1,
        },
        {
          code: 'F60011042',
          sign: 1,
        },
        {
          code: 'F60011043',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011038',
      label:
        'Stocks Matieres Premieres et Fournit. Liees (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011039',
      label: 'Stocks Autres Approvisionnements (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011040',
      label: 'Stocks En-cours de production de biens (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011041',
      label: 'Stocks En-cours de production services (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011042',
      label: 'Stocks de produits (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011043',
      label: 'Stocks de marchandises (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011044',
      label: 'Clients et Comptes Rattaches (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60011045',
          sign: 1,
        },
        {
          code: 'F60011046',
          sign: 1,
        },
        {
          code: 'F60011047',
          sign: 1,
        },
        {
          code: 'F60011048',
          sign: 1,
        },
        {
          code: 'F60011049',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011045',
      label: 'Clients  et  comptes rattaches (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011046',
      label: 'Clients - effets a recevoir (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011047',
      label: 'Clients douteux ou litigieux (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011048',
      label:
        'Creances/travaux non encore facturables (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011049',
      label:
        'Clt-pdts non encore factures (pdt a recev.) (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011050',
      label: 'Autres Actifs Courants (Amortissement/Provision)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60011051',
          sign: 1,
        },
        {
          code: 'F60011052',
          sign: 1,
        },
        {
          code: 'F60011053',
          sign: 1,
        },
        {
          code: 'F60011054',
          sign: 1,
        },
        {
          code: 'F60011055',
          sign: 1,
        },
        {
          code: 'F60011056',
          sign: 1,
        },
        {
          code: 'F60011057',
          sign: 1,
        },
        {
          code: 'F60011058',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011051',
      label: 'Fournisseurs debiteurs (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011052',
      label: 'Personnel et comptes rattaches (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011053',
      label: 'etat et collectivites publiques (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011054',
      label: 'Societes du groupe  et  associes (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011055',
      label: 'Debiteurs divers et Crediteurs divers (Amortissement/Provision)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60011056',
      label: "Comptes transitoires ou d'attente (Amortissement/Provision)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011057',
      label: 'Comptes de regularisation (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011058',
      label:
        'Prov. / deprec. comptes debiteurs divers (Amortissement/Provision)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60011059',
      label: 'Placements et Autres Actifs Financiers (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60011060',
          sign: 1,
        },
        {
          code: 'F60011061',
          sign: 1,
        },
        {
          code: 'F60011062',
          sign: 1,
        },
        {
          code: 'F60011063',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011060',
      label: 'Prets et autres creances Fin. courants (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011061',
      label: 'Placements courants (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011062',
      label: "Regies d'avances et accreditifs (Amortissement/Provision)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011063',
      label: 'Prov. / deprec. des comptes financiers (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011064',
      label:
        'Liquidites et equivalents de liquidites (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60011065',
          sign: 1,
        },
        {
          code: 'F60011066',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60011065',
      label:
        'Banques, etabl. Financiers et assimiles (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011066',
      label: 'Caisse (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011067',
      label: 'Autres Postes des Actifs du Bilan (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60011068',
      label: 'Total des actifs (Amortissement/Provision)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60011001',
          sign: 1,
        },
        {
          code: 'F60011036',
          sign: 1,
        },
        {
          code: 'F60011067',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012001',
      label: 'Actifs non courants (Net)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60012002',
          sign: 1,
        },
        {
          code: 'F60012031',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012002',
      label: 'Actifs immobilises (Net)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60012003',
          sign: 1,
        },
        {
          code: 'F60012012',
          sign: 1,
        },
        {
          code: 'F60012021',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012003',
      label: 'Immobilisations Incorporelles (Net)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60012004',
          sign: 1,
        },
        {
          code: 'F60012005',
          sign: 1,
        },
        {
          code: 'F60012006',
          sign: 1,
        },
        {
          code: 'F60012007',
          sign: 1,
        },
        {
          code: 'F60012008',
          sign: 1,
        },
        {
          code: 'F60012009',
          sign: 1,
        },
        {
          code: 'F60012010',
          sign: 1,
        },
        {
          code: 'F60012011',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012004',
      label: 'Investissement recherche et developpement (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012005',
      label: 'Concess. marque,brevet,licence,marque (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012006',
      label: 'Logiciels (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012007',
      label: 'Fonds commercial (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012008',
      label: 'Droit au bail (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012009',
      label: 'Autres Immobilisations Incorporelles (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012010',
      label: 'Immobilisations Incorporelles en cours (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012011',
      label: 'Av. et Ac. Verses/Cmde.Immob.Incorp. (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012012',
      label: 'Immobilisations corporelles (Net)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60012013',
          sign: 1,
        },
        {
          code: 'F60012014',
          sign: 1,
        },
        {
          code: 'F60012015',
          sign: 1,
        },
        {
          code: 'F60012016',
          sign: 1,
        },
        {
          code: 'F60012017',
          sign: 1,
        },
        {
          code: 'F60012018',
          sign: 1,
        },
        {
          code: 'F60012019',
          sign: 1,
        },
        {
          code: 'F60012020',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012013',
      label: 'Terrains (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012014',
      label: 'Constructions (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012015',
      label: 'Inst. Tech., materiel et outillages Industriels (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012016',
      label: 'Materiel de transport  (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012017',
      label: 'Autres Immobilisations Corporelles  (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012018',
      label: 'Immob. Corporelles en cours (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012019',
      label: 'Av. et Ac. Verses/Commande Immob.Corp. (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012020',
      label: 'Immob. a statut juridique particulier (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012021',
      label: 'Immobilisations Financieres (Net)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60012022',
          sign: 1,
        },
        {
          code: 'F60012023',
          sign: 1,
        },
        {
          code: 'F60012024',
          sign: 1,
        },
        {
          code: 'F60012025',
          sign: 1,
        },
        {
          code: 'F60012026',
          sign: 1,
        },
        {
          code: 'F60012027',
          sign: 1,
        },
        {
          code: 'F60012028',
          sign: 1,
        },
        {
          code: 'F60012029',
          sign: 1,
        },
        {
          code: 'F60012030',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012022',
      label: 'Actions (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012023',
      label: 'Autres creances rattach. a des participat. (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012024',
      label: 'Creances rattach. a des stes en participat. (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012025',
      label: 'Vers.a eff./titre de participation non liberes (Net)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60012026',
      label: 'Titres immobilises (droit de propriete) (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012027',
      label: 'Titres immobilises (droit de creance) (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012028',
      label: 'Depots et cautionnements verses (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012029',
      label: 'Autres creances immobilisees (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012030',
      label: 'Vers.a eff./Titres immobilises non liberes (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012031',
      label: 'Autres Actifs Non Courants (Net)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60012032',
          sign: 1,
        },
        {
          code: 'F60012033',
          sign: 1,
        },
        {
          code: 'F60012034',
          sign: 1,
        },
        {
          code: 'F60012035',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012032',
      label: 'Frais preliminaires (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012033',
      label: 'Charges a repartir (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012034',
      label: "Frais d'emission et primes de Remb. Empts (Net)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012035',
      label: 'ecarts de conversion (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012036',
      label: 'Actifs courants (Net)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60012037',
          sign: 1,
        },
        {
          code: 'F60012044',
          sign: 1,
        },
        {
          code: 'F60012050',
          sign: 1,
        },
        {
          code: 'F60012059',
          sign: 1,
        },
        {
          code: 'F60012064',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012037',
      label: 'Stocks (Net)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60012038',
          sign: 1,
        },
        {
          code: 'F60012039',
          sign: 1,
        },
        {
          code: 'F60012040',
          sign: 1,
        },
        {
          code: 'F60012041',
          sign: 1,
        },
        {
          code: 'F60012042',
          sign: 1,
        },
        {
          code: 'F60012043',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012038',
      label: 'Stocks Matieres Premieres et Fournit. Liees (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012039',
      label: 'Stocks Autres Approvisionnements (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012040',
      label: 'Stocks En-cours de production de biens (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012041',
      label: 'Stocks En-cours de production services (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012042',
      label: 'Stocks de produits (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012043',
      label: 'Stocks de marchandises (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012044',
      label: 'Clients et Comptes Rattaches (Net)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60012045',
          sign: 1,
        },
        {
          code: 'F60012046',
          sign: 1,
        },
        {
          code: 'F60012047',
          sign: 1,
        },
        {
          code: 'F60012048',
          sign: 1,
        },
        {
          code: 'F60012049',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012045',
      label: 'Clients  et  comptes rattaches (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012046',
      label: 'Clients - effets a recevoir (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012047',
      label: 'Clients douteux ou litigieux (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012048',
      label: 'Creances/travaux non encore facturables (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012049',
      label: 'Clt-pdts non encore factures (pdt a recev.) (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012050',
      label: 'Autres Actifs Courants (Net)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60012051',
          sign: 1,
        },
        {
          code: 'F60012052',
          sign: 1,
        },
        {
          code: 'F60012053',
          sign: 1,
        },
        {
          code: 'F60012054',
          sign: 1,
        },
        {
          code: 'F60012055',
          sign: 1,
        },
        {
          code: 'F60012056',
          sign: 1,
        },
        {
          code: 'F60012057',
          sign: 1,
        },
        {
          code: 'F60012058',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012051',
      label: 'Fournisseurs debiteurs (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012052',
      label: 'Personnel et comptes rattaches (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012053',
      label: 'etat et collectivites publiques (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012054',
      label: 'Societes du groupe  et  associes (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012055',
      label: 'Debiteurs divers et Crediteurs divers (Net)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60012056',
      label: "Comptes transitoires ou d'attente (Net)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012057',
      label: 'Comptes de regularisation (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012058',
      label: 'Prov. / deprec. comptes debiteurs divers (Net)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60012059',
      label: 'Placements et Autres Actifs Financiers (Net)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60012060',
          sign: 1,
        },
        {
          code: 'F60012061',
          sign: 1,
        },
        {
          code: 'F60012062',
          sign: 1,
        },
        {
          code: 'F60012063',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012060',
      label: 'Prets et autres creances Fin. courants (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012061',
      label: 'Placements courants (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012062',
      label: "Regies d'avances et accreditifs (Net)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012063',
      label: 'Prov. / deprec. des comptes financiers (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012064',
      label: 'Liquidites et equivalents de liquidites (Net)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60012065',
          sign: 1,
        },
        {
          code: 'F60012066',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60012065',
      label: 'Banques, etabl. Financiers et assimiles (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012066',
      label: 'Caisse (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012067',
      label: 'Autres Postes des Actifs du Bilan (Net)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60012068',
      label: 'Total des actifs (Net)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60012001',
          sign: 1,
        },
        {
          code: 'F60012036',
          sign: 1,
        },
        {
          code: 'F60012067',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013001',
      label: 'Actifs non courants (Net N-1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60013002',
          sign: 1,
        },
        {
          code: 'F60013031',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013002',
      label: 'Actifs immobilises (Net N-1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60013003',
          sign: 1,
        },
        {
          code: 'F60013012',
          sign: 1,
        },
        {
          code: 'F60013021',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013003',
      label: 'Immobilisations Incorporelles (Net N-1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60013004',
          sign: 1,
        },
        {
          code: 'F60013005',
          sign: 1,
        },
        {
          code: 'F60013006',
          sign: 1,
        },
        {
          code: 'F60013007',
          sign: 1,
        },
        {
          code: 'F60013008',
          sign: 1,
        },
        {
          code: 'F60013009',
          sign: 1,
        },
        {
          code: 'F60013010',
          sign: 1,
        },
        {
          code: 'F60013011',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013004',
      label: 'Investissement recherche et developpement (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013005',
      label: 'Concess. marque,brevet,licence,marque (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013006',
      label: 'Logiciels (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013007',
      label: 'Fonds commercial (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013008',
      label: 'Droit au bail (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013009',
      label: 'Autres Immobilisations Incorporelles (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013010',
      label: 'Immobilisations Incorporelles en cours (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013011',
      label: 'Av. et Ac. Verses/Cmde.Immob.Incorp. (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013012',
      label: 'Immobilisations corporelles (Net N-1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60013013',
          sign: 1,
        },
        {
          code: 'F60013014',
          sign: 1,
        },
        {
          code: 'F60013015',
          sign: 1,
        },
        {
          code: 'F60013016',
          sign: 1,
        },
        {
          code: 'F60013017',
          sign: 1,
        },
        {
          code: 'F60013018',
          sign: 1,
        },
        {
          code: 'F60013019',
          sign: 1,
        },
        {
          code: 'F60013020',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013013',
      label: 'Terrains (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013014',
      label: 'Constructions (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013015',
      label: 'Inst. Tech., materiel et outillages Industriels (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013016',
      label: 'Materiel de transport  (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013017',
      label: 'Autres Immobilisations Corporelles  (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013018',
      label: 'Immob. Corporelles en cours (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013019',
      label: 'Av. et Ac. Verses/Commande Immob.Corp. (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013020',
      label: 'Immob. a statut juridique particulier (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013021',
      label: 'Immobilisations Financieres (Net N-1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60013022',
          sign: 1,
        },
        {
          code: 'F60013023',
          sign: 1,
        },
        {
          code: 'F60013024',
          sign: 1,
        },
        {
          code: 'F60013025',
          sign: 1,
        },
        {
          code: 'F60013026',
          sign: 1,
        },
        {
          code: 'F60013027',
          sign: 1,
        },
        {
          code: 'F60013028',
          sign: 1,
        },
        {
          code: 'F60013029',
          sign: 1,
        },
        {
          code: 'F60013030',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013022',
      label: 'Actions (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013023',
      label: 'Autres creances rattach. a des participat. (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013024',
      label: 'Creances rattach. a des stes en participat. (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013025',
      label: 'Vers.a eff./titre de participation non liberes (Net N-1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60013026',
      label: 'Titres immobilises (droit de propriete) (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013027',
      label: 'Titres immobilises (droit de creance) (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013028',
      label: 'Depots et cautionnements verses (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013029',
      label: 'Autres creances immobilisees (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013030',
      label: 'Vers.a eff./Titres immobilises non liberes (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013031',
      label: 'Autres Actifs Non Courants (Net N-1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60013032',
          sign: 1,
        },
        {
          code: 'F60013033',
          sign: 1,
        },
        {
          code: 'F60013034',
          sign: 1,
        },
        {
          code: 'F60013035',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013032',
      label: 'Frais preliminaires (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013033',
      label: 'Charges a repartir (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013034',
      label: "Frais d'emission et primes de Remb. Empts (Net N-1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013035',
      label: 'ecarts de conversion (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013036',
      label: 'Actifs courants (Net N-1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60013037',
          sign: 1,
        },
        {
          code: 'F60013044',
          sign: 1,
        },
        {
          code: 'F60013050',
          sign: 1,
        },
        {
          code: 'F60013059',
          sign: 1,
        },
        {
          code: 'F60013064',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013037',
      label: 'Stocks (Net N-1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60013038',
          sign: 1,
        },
        {
          code: 'F60013039',
          sign: 1,
        },
        {
          code: 'F60013040',
          sign: 1,
        },
        {
          code: 'F60013041',
          sign: 1,
        },
        {
          code: 'F60013042',
          sign: 1,
        },
        {
          code: 'F60013043',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013038',
      label: 'Stocks Matieres Premieres et Fournit. Liees (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013039',
      label: 'Stocks Autres Approvisionnements (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013040',
      label: 'Stocks En-cours de production de biens (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013041',
      label: 'Stocks En-cours de production services (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013042',
      label: 'Stocks de produits (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013043',
      label: 'Stocks de marchandises (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013044',
      label: 'Clients et Comptes Rattaches (Net N-1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60013045',
          sign: 1,
        },
        {
          code: 'F60013046',
          sign: 1,
        },
        {
          code: 'F60013047',
          sign: 1,
        },
        {
          code: 'F60013048',
          sign: 1,
        },
        {
          code: 'F60013049',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013045',
      label: 'Clients  et  comptes rattaches (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013046',
      label: 'Clients - effets a recevoir (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013047',
      label: 'Clients douteux ou litigieux (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013048',
      label: 'Creances/travaux non encore facturables (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013049',
      label: 'Clt-pdts non encore factures (pdt a recev.) (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013050',
      label: 'Autres Actifs Courants (Net N-1)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60013051',
          sign: 1,
        },
        {
          code: 'F60013052',
          sign: 1,
        },
        {
          code: 'F60013053',
          sign: 1,
        },
        {
          code: 'F60013054',
          sign: 1,
        },
        {
          code: 'F60013055',
          sign: 1,
        },
        {
          code: 'F60013056',
          sign: 1,
        },
        {
          code: 'F60013057',
          sign: 1,
        },
        {
          code: 'F60013058',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013051',
      label: 'Fournisseurs debiteurs (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013052',
      label: 'Personnel et comptes rattaches (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013053',
      label: 'etat et collectivites publiques (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013054',
      label: 'Societes du groupe  et  associes (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013055',
      label: 'Debiteurs divers et Crediteurs divers (Net N-1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60013056',
      label: "Comptes transitoires ou d'attente (Net N-1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013057',
      label: 'Comptes de regularisation (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013058',
      label: 'Prov. / deprec. comptes debiteurs divers (Net N-1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60013059',
      label: 'Placements et Autres Actifs Financiers (Net N-1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60013060',
          sign: 1,
        },
        {
          code: 'F60013061',
          sign: 1,
        },
        {
          code: 'F60013062',
          sign: 1,
        },
        {
          code: 'F60013063',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013060',
      label: 'Prets et autres creances Fin. courants (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013061',
      label: 'Placements courants (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013062',
      label: "Regies d'avances et accreditifs (Net N-1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013063',
      label: 'Prov. / deprec. des comptes financiers (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013064',
      label: 'Liquidites et equivalents de liquidites (Net N-1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60013065',
          sign: 1,
        },
        {
          code: 'F60013066',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60013065',
      label: 'Banques, etabl. Financiers et assimiles (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013066',
      label: 'Caisse (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013067',
      label: 'Autres Postes des Actifs du Bilan (Net N-1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60013068',
      label: 'Total des actifs (Net N-1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60013001',
          sign: 1,
        },
        {
          code: 'F60013036',
          sign: 1,
        },
        {
          code: 'F60013067',
          sign: 1,
        },
      ],
    },
  ],
  F6002: [
    {
      code: 'F60020001',
      label: 'Capitaux propres (Net Exercice)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60020006',
          sign: 1,
        },
        {
          code: 'F60020007',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020002',
      label: 'Capital social (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60020003',
      label: 'Réserves (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020004',
      label: 'Autres capitaux propres (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60020005',
      label: 'Résultats reportés (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60020006',
      label:
        "Capitaux propres avant résultat de l'exercice (Net Exercice) F60020002 + F60020003 + F60020004 + F60020005",
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60020007',
      label: "résultat de l'exercice (Net Exercice)",
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60020008',
      label: 'Total Passifs (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020009',
          sign: 1,
        },
        {
          code: 'F60020031',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020009',
      label: 'Passifs non courants (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020010',
          sign: 1,
        },
        {
          code: 'F60020019',
          sign: 1,
        },
        {
          code: 'F60020022',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020010',
      label: 'Emprunts (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020011',
          sign: 1,
        },
        {
          code: 'F60020012',
          sign: 1,
        },
        {
          code: 'F60020013',
          sign: 1,
        },
        {
          code: 'F60020014',
          sign: 1,
        },
        {
          code: 'F60020015',
          sign: 1,
        },
        {
          code: 'F60020016',
          sign: 1,
        },
        {
          code: 'F60020017',
          sign: 1,
        },
        {
          code: 'F60020018',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020011',
      label: 'Emprunts obligataires (assortis de s�ret�s) (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020012',
      label: "Empts auprès d'étab.Fin. (assortis de s�ret�s) (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020013',
      label: "Empts auprès d'étab.Fin. (assorti de s�ret�s) (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020014',
      label:
        'Empts et dettes assorties de condit. particulières (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020015',
      label: 'Emprunts non assortis de s�ret�s (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020016',
      label: 'Dettes rattachées � des participations (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020017',
      label: 'Dépôts  et  cautionnements reçus (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020018',
      label: 'Autres emprunts et dettes (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020019',
      label: 'Autres Passifs Financiers (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020020',
          sign: 1,
        },
        {
          code: 'F60020021',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020020',
      label: 'Ecarts de conversion (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020021',
      label: 'Autres passifs financiers (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020022',
      label: 'Provisions (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020023',
          sign: 1,
        },
        {
          code: 'F60020024',
          sign: 1,
        },
        {
          code: 'F60020025',
          sign: 1,
        },
        {
          code: 'F60020026',
          sign: 1,
        },
        {
          code: 'F60020027',
          sign: 1,
        },
        {
          code: 'F60020028',
          sign: 1,
        },
        {
          code: 'F60020029',
          sign: 1,
        },
        {
          code: 'F60020030',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020023',
      label: 'Provisions pour risques (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020024',
      label: 'Prov.pour charges à répartir/plusieurs exercices (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020025',
      label: 'Prov.pour retraites et obligations similaires (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020026',
      label: "Provisions d'origine règlementaire (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020027',
      label: 'Provisions pour impôts (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020028',
      label: 'Prov.pour renouvellement des immobilisations (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020029',
      label: 'Provisions pour amortissement (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020030',
      label: 'Autres provisions pour charges (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020031',
      label: 'Passifs courants (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020032',
          sign: 1,
        },
        {
          code: 'F60020038',
          sign: 1,
        },
        {
          code: 'F60020047',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020032',
      label: 'Fournisseurs et Comptes Rattachés (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020033',
          sign: 1,
        },
        {
          code: 'F60020034',
          sign: 1,
        },
        {
          code: 'F60020035',
          sign: 1,
        },
        {
          code: 'F60020036',
          sign: 1,
        },
        {
          code: 'F60020037',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020033',
      label: "Fournisseurs d'exploitation (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020034',
      label: "Fournisseurs d'exploitation - effets à payer (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020035',
      label: "Fournisseurs d'immobilisations (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020036',
      label: "Fournisseurs d'immobilisations - effets à payer (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020037',
      label: 'Fournisseurs - factures non parvenues (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60020038',
      label: 'Autres passifs courants (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020039',
          sign: 1,
        },
        {
          code: 'F60020040',
          sign: 1,
        },
        {
          code: 'F60020041',
          sign: 1,
        },
        {
          code: 'F60020042',
          sign: 1,
        },
        {
          code: 'F60020043',
          sign: 1,
        },
        {
          code: 'F60020044',
          sign: 1,
        },
        {
          code: 'F60020045',
          sign: 1,
        },
        {
          code: 'F60020046',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020039',
      label: 'Clients créditeurs (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020040',
      label: 'Sociétés du groupe  et  associés (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020041',
      label: 'Etat et collectivités publiques (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020042',
      label: 'Sociétés du groupe  et  associés (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020043',
      label: 'Débiteurs divers et créditeurs divers (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020044',
      label: "Comptes transitoires ou d'attente (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020045',
      label: 'Comptes de régularisation (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020046',
      label: 'Provisions courantes pour risques et charges (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020047',
      label: 'Concours Bancaires et Autres Passifs Financiers (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020048',
          sign: 1,
        },
        {
          code: 'F60020049',
          sign: 1,
        },
        {
          code: 'F60020050',
          sign: 1,
        },
        {
          code: 'F60020051',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020048',
      label: 'Emprunts et autres dettes financières courants (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020049',
      label: 'Emprunts échus et impayés (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020050',
      label: 'Intérêts courus (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020051',
      label: 'Banques, établissements financiers et assimilés (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020052',
      label:
        'Autres Postes des Capitaux Propres et Passifs du Bilan (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020053',
      label: 'Total des capitaux propres et passifs (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020001',
          sign: 1,
        },
        {
          code: 'F60020008',
          sign: 1,
        },
        {
          code: 'F60020052',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020054',
      label: 'Capitaux propres (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60020059',
          sign: 1,
        },
        {
          code: 'F60020060',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020055',
      label: 'Capital social (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60020056',
      label: 'Réserves (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020057',
      label: 'Autres capitaux propres (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60020058',
      label: 'Résultats reportés (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60020059',
      label:
        "Capitaux propres avant résultat de l'exercice (Net Exercice - 1) = lf:F60020059 = lf:F60020055 + lf:F60020056 + lf:F60020057 + lf:F60020058",
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60020060',
      label: "résultat de l'exercice (Net Exercice - 1)",
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60020061',
      label: 'Total Passifs (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020062',
          sign: 1,
        },
        {
          code: 'F60020084',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020062',
      label: 'Passifs non courants (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020063',
          sign: 1,
        },
        {
          code: 'F60020072',
          sign: 1,
        },
        {
          code: 'F60020075',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020063',
      label: 'Emprunts (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020064',
          sign: 1,
        },
        {
          code: 'F60020065',
          sign: 1,
        },
        {
          code: 'F60020066',
          sign: 1,
        },
        {
          code: 'F60020067',
          sign: 1,
        },
        {
          code: 'F60020068',
          sign: 1,
        },
        {
          code: 'F60020069',
          sign: 1,
        },
        {
          code: 'F60020070',
          sign: 1,
        },
        {
          code: 'F60020071',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020064',
      label: 'Emprunts obligataires (assortis de s�ret�s) (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020065',
      label:
        "Empts auprès d'étab.Fin. (assortis de s�ret�s) (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020066',
      label: "Empts auprès d'étab.Fin. (assorti de s�ret�s) (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020067',
      label:
        'Empts et dettes assorties de condit. particulières (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020068',
      label: 'Emprunts non assortis de s�ret�s (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020069',
      label: 'Dettes rattachées à des participations (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020070',
      label: 'Dépôts  et  cautionnements reçus (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020071',
      label: 'Autres emprunts et dettes (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020072',
      label: 'Autres Passifs Financiers (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020073',
          sign: 1,
        },
        {
          code: 'F60020074',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020073',
      label: 'Ecarts de conversion (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020074',
      label: 'Autres passifs financiers (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020075',
      label: 'Provisions (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020076',
          sign: 1,
        },
        {
          code: 'F60020077',
          sign: 1,
        },
        {
          code: 'F60020078',
          sign: 1,
        },
        {
          code: 'F60020079',
          sign: 1,
        },
        {
          code: 'F60020080',
          sign: 1,
        },
        {
          code: 'F60020081',
          sign: 1,
        },
        {
          code: 'F60020082',
          sign: 1,
        },
        {
          code: 'F60020083',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020076',
      label: 'Provisions pour risques (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020077',
      label:
        'Prov.pour charges à répartir/plusieurs exercices (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020078',
      label: 'Prov.pour retraites et obligations similaires (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020079',
      label: "Provisions d'origine règlementaire (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020080',
      label: 'Provisions pour impôts (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020081',
      label: 'Prov.pour renouvellement des immobilisations (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020082',
      label: 'Provisions pour amortissement (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020083',
      label: 'Autres provisions pour charges (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020084',
      label: 'Passifs courants (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020085',
          sign: 1,
        },
        {
          code: 'F60020091',
          sign: 1,
        },
        {
          code: 'F60020100',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020085',
      label: 'Fournisseurs et Comptes Rattachés (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020086',
          sign: 1,
        },
        {
          code: 'F60020087',
          sign: 1,
        },
        {
          code: 'F60020088',
          sign: 1,
        },
        {
          code: 'F60020089',
          sign: 1,
        },
        {
          code: 'F60020090',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020086',
      label: "Fournisseurs d'exploitation (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020087',
      label: "Fournisseurs d'exploitation - effets à payer (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020088',
      label: "Fournisseurs d'immobilisations (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020089',
      label:
        "Fournisseurs d'immobilisations - effets à payer (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020090',
      label: 'Fournisseurs - factures non parvenues (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60020091',
      label: 'Autres passifs courants (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020092',
          sign: 1,
        },
        {
          code: 'F60020093',
          sign: 1,
        },
        {
          code: 'F60020094',
          sign: 1,
        },
        {
          code: 'F60020095',
          sign: 1,
        },
        {
          code: 'F60020096',
          sign: 1,
        },
        {
          code: 'F60020097',
          sign: 1,
        },
        {
          code: 'F60020098',
          sign: 1,
        },
        {
          code: 'F60020099',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020092',
      label: 'Clients créditeurs (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020093',
      label: 'Sociétés du groupe  et  associés (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020094',
      label: 'Etat et collectivités publiques (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020095',
      label: 'Sociétés du groupe  et  associés (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020096',
      label: 'Débiteurs divers et créditeurs divers (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020097',
      label: "Comptes transitoires ou d'attente (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020098',
      label: 'Comptes de régularisation (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020099',
      label: 'Provisions courantes pour risques et charges (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020100',
      label:
        'Concours Bancaires et Autres Passifs Financiers (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020101',
          sign: 1,
        },
        {
          code: 'F60020102',
          sign: 1,
        },
        {
          code: 'F60020103',
          sign: 1,
        },
        {
          code: 'F60020104',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60020101',
      label:
        'Emprunts et autres dettes financières courants (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020102',
      label: 'Emprunts échus et impayés (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020103',
      label: 'Intérêts courus (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020104',
      label:
        'Banques, établissements financiers et assimilés (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020105',
      label:
        'Autres Postes des Capitaux Propres et Passifs du Bilan (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60020106',
      label: 'Total des capitaux propres et passifs (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60020054',
          sign: 1,
        },
        {
          code: 'F60020061',
          sign: 1,
        },
        {
          code: 'F60020105',
          sign: 1,
        },
      ],
    },
  ],
  F6003: [
    {
      code: 'F60030001',
      label: "Produits d'exploitation (Net Exercice)",
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030002',
          sign: 1,
        },
        {
          code: 'F60030014',
          sign: 1,
        },
        {
          code: 'F60030015',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030002',
      label: 'Revenus (Net Exercice)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030003',
          sign: 1,
        },
        {
          code: 'F60030006',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030003',
      label: 'Ventes nettes des marchandises (Net Exercice)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030004',
          sign: 1,
        },
        {
          code: 'F60030005',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030004',
      label: 'Ventes de Marchandises (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030005',
      label:
        'Rabais, Remises et Ristournes (3R) accordés/ventes de Marchandises (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030006',
      label: 'Ventes nettes de la production (Net Exercice)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030007',
          sign: 1,
        },
        {
          code: 'F60030008',
          sign: 1,
        },
        {
          code: 'F60030009',
          sign: 1,
        },
        {
          code: 'F60030010',
          sign: 1,
        },
        {
          code: 'F60030011',
          sign: 1,
        },
        {
          code: 'F60030012',
          sign: 1,
        },
        {
          code: 'F60030013',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030007',
      label: 'Ventes de Produits Finis (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030008',
      label: 'Ventes de Produits Intermédiaires (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030009',
      label: 'Ventes de Produits Résiduels (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030010',
      label: 'Ventes des Travaux (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030011',
      label: 'Ventes des Etudes et Prestations de Services (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030012',
      label: 'Produits des Activités Annexes (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030013',
      label:
        'Rabais, Remises et Ristournes (3R) accordés/ventes de la Production (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030014',
      label: 'Production immobilisée (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030015',
      label: "Autres produits d'exploitation (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030016',
          sign: 1,
        },
        {
          code: 'F60030017',
          sign: 1,
        },
        {
          code: 'F60030018',
          sign: 1,
        },
        {
          code: 'F60030019',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030016',
      label: 'Produits divers ordin.(sans gains/cession immo.) (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030017',
      label: "Subventions d'exploitation et d'équilibre (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030018',
      label: 'Reprises sur amortissements et provisions (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030019',
      label: 'Transferts de charges (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030020',
      label: "Charges d'exploitation (Net Exercice)",
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030021',
          sign: 1,
        },
        {
          code: 'F60030025',
          sign: 1,
        },
        {
          code: 'F60030029',
          sign: 1,
        },
        {
          code: 'F60030036',
          sign: 1,
        },
        {
          code: 'F60030046',
          sign: 1,
        },
        {
          code: 'F60030053',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030021',
      label: 'Variation stocks produits finis et encours (Net Exercice)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030022',
          sign: 1,
        },
        {
          code: 'F60030023',
          sign: 1,
        },
        {
          code: 'F60030024',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030022',
      label: 'Variations des en-cours de production biens (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030023',
      label: 'Variation des en-cours de production services (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030024',
      label: 'Variation des stocks de produits (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030025',
      label: 'Achats de marchandises consommées (Net Exercice). 60030026 -',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030027',
          sign: -1,
        },
        {
          code: 'F60030028',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030026',
      label: 'Achats de marchandises (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030027',
      label:
        'Rabais, Remises et Ristournes (3R) obtenus sur achats marchandises (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030028',
      label: 'Variation des stocks de marchandises (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030029',
      label: "Achats d'approvisionnements consommés (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030030',
          sign: 1,
        },
        {
          code: 'F60030031',
          sign: 1,
        },
        {
          code: 'F60030032',
          sign: -1,
        },
        {
          code: 'F60030033',
          sign: -1,
        },
        {
          code: 'F60030034',
          sign: 1,
        },
        {
          code: 'F60030035',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030030',
      label: 'Achats stockés-Mat.Premières et Fournit. liées (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030031',
      label: 'Achats stockés - Autres approvisionnements (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030032',
      label:
        'Rabais, Remises et Ristournes (3R) obtenus/achats Mat.Premières et Fournit. liées (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030033',
      label:
        'Rabais, Remises et Ristournes (3R) obtenus/achats autres approvisionnements (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030034',
      label: 'Var.de stocks Mat.Premières et Fournitures (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030035',
      label: 'Var.de stocks des autres approvisionnements (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030036',
      label: 'Charges de personnel (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030037',
          sign: 1,
        },
        {
          code: 'F60030038',
          sign: 1,
        },
        {
          code: 'F60030039',
          sign: 1,
        },
        {
          code: 'F60030040',
          sign: 1,
        },
        {
          code: 'F60030041',
          sign: 1,
        },
        {
          code: 'F60030042',
          sign: 1,
        },
        {
          code: 'F60030043',
          sign: 1,
        },
        {
          code: 'F60030044',
          sign: 1,
        },
        {
          code: 'F60030045',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030037',
      label: 'Salaires et compléments de salaires (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030038',
      label: "Appointements et compléments d'appoint. (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030039',
      label: 'Indemnités représentatives de frais (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030040',
      label: 'Commissions au personnel (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030041',
      label: 'Rémun.des administrateurs, gérants et associés (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030042',
      label: 'Ch.connexes sal., appoint., comm. et Rémun. (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030043',
      label: 'Charges sociales légales (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030044',
      label:
        "Ch.PL/Modif.Compt.à imputer au Réslt de l'exerc.ou Activ.abandonnée (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030045',
      label: 'Autres charges de PL et autres charges sociales (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030046',
      label: 'Dotations aux amortissements et aux provisions (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030047',
          sign: 1,
        },
        {
          code: 'F60030048',
          sign: 1,
        },
        {
          code: 'F60030049',
          sign: 1,
        },
        {
          code: 'F60030050',
          sign: 1,
        },
        {
          code: 'F60030051',
          sign: 1,
        },
        {
          code: 'F60030052',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030047',
      label: 'Dot.amort. et prov.-Ch.ord.(autres que Fin.) (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030048',
      label: 'Dot. aux résorptions des charges reportées (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030049',
      label: "Dot. Prov. Risques et Charges d'exploitation (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030050',
      label: 'Dot.Prov.d�pr�c.immob. Incorp. et Corporelles (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030051',
      label:
        'Dot.Prov.d�pr�c.actifs courants (autres que Val.Mobil.de Placem. et équiv. de liquidités) (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030052',
      label:
        "Dot.aux amort. et prov./Modif.Compt. à imputer au Réslt de l'exerc. ou Activ. abandonnée (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030053',
      label: "Autres charges d'exploitation (Net Exercice)",
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030054',
          sign: 1,
        },
        {
          code: 'F60030055',
          sign: 1,
        },
        {
          code: 'F60030056',
          sign: 1,
        },
        {
          code: 'F60030057',
          sign: 1,
        },
        {
          code: 'F60030058',
          sign: 1,
        },
        {
          code: 'F60030059',
          sign: 1,
        },
        {
          code: 'F60030060',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030054',
      label:
        'Achats d��tudes et prestations services (y compris achat de sous-traitance production) (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030055',
      label: 'Achats de matériel, équipements et travaux (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030056',
      label: 'Achats non stockés non rattachés (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030057',
      label: 'Services extérieurs (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030058',
      label: 'Autres services extérieurs (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030059',
      label: 'Charges diverses ordinaires (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030060',
      label: 'Impôts, taxes et versements assimilés (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030061',
      label: "Resultat d'exploitation (Net Exercice)",
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030001',
          sign: 1,
        },
        {
          code: 'F60030020',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030062',
      label: 'Charges financières nettes (Net Exercice)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030063',
          sign: 1,
        },
        {
          code: 'F60030064',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030063',
      label: 'Charges financières (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030064',
      label: 'Dot.amort. et provisions - charges financières (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030065',
      label: 'Produits des placements (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030066',
          sign: 1,
        },
        {
          code: 'F60030067',
          sign: 1,
        },
        {
          code: 'F60030068',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030066',
      label: 'Produits financiers (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030067',
      label: 'Reprise/prov.(à inscrire dans les pdts financ.) (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030068',
      label: 'Transferts de charges financières (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030069',
      label: 'Autres gains ordinaires (Net Exercice)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030070',
          sign: 1,
        },
        {
          code: 'F60030071',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030070',
      label: "Produits nets sur cessions d'immobilisations (Net Exercice)",
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030071',
      label: 'Autres gains/�l�m.non récurrents ou except. (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030072',
      label: 'Autres pertes ordinanires (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030073',
          sign: 1,
        },
        {
          code: 'F60030074',
          sign: 1,
        },
        {
          code: 'F60030075',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030073',
      label: 'Charges Nettes/cession immobilisations (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030074',
      label: 'Autres pertes/�l�m.non récurrents ou except. (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030075',
      label: 'Réduction de valeur (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030076',
      label: 'Résultat des Activités Ordinaires avant Impôt (Net Exercice)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030061',
          sign: 1,
        },
        {
          code: 'F60030062',
          sign: -1,
        },
        {
          code: 'F60030065',
          sign: 1,
        },
        {
          code: 'F60030069',
          sign: 1,
        },
        {
          code: 'F60030072',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030077',
      label: 'Impôt sur les bénéfices (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030078',
          sign: 1,
        },
        {
          code: 'F60030079',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030078',
      label: 'Impôts/bénéfices calculés/Résultat/activ./ ord. (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030079',
      label: 'Autres Impôts/Bénéfice (régimes particuliers) (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030080',
      label: 'Résultat des Activités Ordinaires apr�s Impôt (Net Exercice)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030076',
          sign: 1,
        },
        {
          code: 'F60030077',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030081',
      label: 'Elements extraordinanires (Gains/pertes) (Net Exercice)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030082',
          sign: 1,
        },
        {
          code: 'F60030083',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030082',
      label: 'Gains extraordinaires (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030083',
      label: 'Pertes extraordinaires (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030084',
      label: "Résultat net de l'exercice (Net Exercice)",
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030080',
          sign: 1,
        },
        {
          code: 'F60030081',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030085',
      label: "Effets des modif. Comptables (net d'Impôt) (Net Exercice)",
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030086',
          sign: 1,
        },
        {
          code: 'F60030087',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030086',
      label: 'Effet positif/Modif.C.affectant Réslts Reportés (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030087',
      label: 'Effet négatif/Modif.C.affectant Réslts Reportés (Net Exercice)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030088',
      label: 'Autres Postes des Comptes de Résultat (Net Exercice)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030089',
      label: 'Resultat apres modifications comptables (Net Exercice)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030084',
          sign: 1,
        },
        {
          code: 'F60030085',
          sign: 1,
        },
        {
          code: 'F60030088',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030090',
      label: "Produits d'exploitation (Net Exercice - 1)",
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030091',
          sign: 1,
        },
        {
          code: 'F60030103',
          sign: 1,
        },
        {
          code: 'F60030104',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030091',
      label: 'Revenus (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030092',
          sign: 1,
        },
        {
          code: 'F60030095',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030092',
      label: 'Ventes nettes des marchandises (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030093',
          sign: 1,
        },
        {
          code: 'F60030094',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030093',
      label: 'Ventes de Marchandises (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030094',
      label:
        'Rabais, Remises et Ristournes (3R) accordés/ventes de Marchandises (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030095',
      label: 'Ventes nettes de la production (Net Exercice - 1)." -',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030096',
          sign: 1,
        },
        {
          code: 'F60030097',
          sign: 1,
        },
        {
          code: 'F60030098',
          sign: 1,
        },
        {
          code: 'F60030099',
          sign: 1,
        },
        {
          code: 'F60030100',
          sign: 1,
        },
        {
          code: 'F60030101',
          sign: 1,
        },
        {
          code: 'F60030102',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030096',
      label: 'Ventes de Produits Finis (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030097',
      label: 'Ventes de Produits Intermédiaires (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030098',
      label: 'Ventes de Produits Résiduels (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030099',
      label: 'Ventes des Travaux (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030100',
      label: 'Ventes des Etudes et Prestations de Services (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030101',
      label: 'Produits des Activités Annexes (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030102',
      label:
        'Rabais, Remises et Ristournes (3R) accordés/ventes de la Production (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030103',
      label: 'Production immobilisée (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030104',
      label: "Autres produits d'exploitation (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030105',
          sign: 1,
        },
        {
          code: 'F60030106',
          sign: 1,
        },
        {
          code: 'F60030107',
          sign: 1,
        },
        {
          code: 'F60030108',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030105',
      label:
        'Produits divers ordin.(sans gains/cession immo.) (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030106',
      label: "Subventions d'exploitation et d'équilibre (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030107',
      label: 'Reprises sur amortissements et provisions (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030108',
      label: 'Transferts de charges (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030109',
      label: "Charges d'exploitation (Net Exercice - 1)",
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030110',
          sign: 1,
        },
        {
          code: 'F60030114',
          sign: 1,
        },
        {
          code: 'F60030118',
          sign: 1,
        },
        {
          code: 'F60030125',
          sign: 1,
        },
        {
          code: 'F60030135',
          sign: 1,
        },
        {
          code: 'F60030142',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030110',
      label: 'Variation stocks produits finis et encours (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030111',
          sign: 1,
        },
        {
          code: 'F60030112',
          sign: 1,
        },
        {
          code: 'F60030113',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030111',
      label: 'Variations des en-cours de production biens (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030112',
      label: 'Variation des en-cours de production services (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030113',
      label: 'Variation des stocks de produits (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030114',
      label: 'Achats de marchandises consommées (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030115',
          sign: 1,
        },
        {
          code: 'F60030116',
          sign: -1,
        },
        {
          code: 'F60030117',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030115',
      label: 'Achats de marchandises (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030116',
      label:
        'Rabais, Remises et Ristournes (3R) obtenus sur achats marchandises (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030117',
      label: 'Variation des stocks de marchandises (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030118',
      label: "Achats d'approvisionnements consommés (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030119',
          sign: 1,
        },
        {
          code: 'F60030120',
          sign: 1,
        },
        {
          code: 'F60030121',
          sign: -1,
        },
        {
          code: 'F60030122',
          sign: -1,
        },
        {
          code: 'F60030123',
          sign: 1,
        },
        {
          code: 'F60030124',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030119',
      label:
        'Achats stockés-Mat.Premières et Fournit. liées (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030120',
      label: 'Achats stockés - Autres approvisionnements (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030121',
      label:
        'Rabais, Remises et Ristournes (3R) obtenus/achats Mat.Premières et Fournit. liées (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030122',
      label:
        'Rabais, Remises et Ristournes (3R) obtenus/achats autres approvisionnements (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030123',
      label: 'Var.de stocks Mat.Premières et Fournitures (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030124',
      label: 'Var.de stocks des autres approvisionnements (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030125',
      label: 'Charges de personnel (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030126',
          sign: 1,
        },
        {
          code: 'F60030127',
          sign: 1,
        },
        {
          code: 'F60030128',
          sign: 1,
        },
        {
          code: 'F60030129',
          sign: 1,
        },
        {
          code: 'F60030130',
          sign: 1,
        },
        {
          code: 'F60030131',
          sign: 1,
        },
        {
          code: 'F60030132',
          sign: 1,
        },
        {
          code: 'F60030133',
          sign: 1,
        },
        {
          code: 'F60030134',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030126',
      label: 'Salaires et compléments de salaires (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030127',
      label: "Appointements et compléments d'appoint. (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030128',
      label: 'Indemnités représentatives de frais (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030129',
      label: 'Commissions au personnel (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030130',
      label:
        'Rémun.des administrateurs, gérants et associés (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030131',
      label: 'Ch.connexes sal., appoint., comm. et Rémun. (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030132',
      label: 'Charges sociales légales (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030133',
      label:
        "Ch.PL/Modif.Compt.� imputer au Réslt de l'exerc.ou Activ.abandonnée (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030134',
      label:
        'Autres charges de PL et autres charges sociales (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030135',
      label:
        'Dotations aux amortissements et aux provisions (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030136',
          sign: 1,
        },
        {
          code: 'F60030137',
          sign: 1,
        },
        {
          code: 'F60030138',
          sign: 1,
        },
        {
          code: 'F60030139',
          sign: 1,
        },
        {
          code: 'F60030140',
          sign: 1,
        },
        {
          code: 'F60030141',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030136',
      label: 'Dot.amort. et prov.-Ch.ord.(autres que Fin.) (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030137',
      label: 'Dot. aux résorptions des charges reportées (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030138',
      label: "Dot. Prov. Risques et Charges d'exploitation (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030139',
      label: 'Dot.Prov.d�pr�c.immob. Incorp. et Corporelles (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030140',
      label:
        'Dot.Prov.d�pr�c.actifs courants (autres que Val.Mobil.de Placem. et équiv. de liquidités) (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030141',
      label:
        "Dot.aux amort. et prov./Modif.Compt. à imputer au Réslt de l'exerc. ou Activ. abandonnée (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030142',
      label: "Autres charges d'exploitation (Net Exercice - 1)",
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030143',
          sign: 1,
        },
        {
          code: 'F60030144',
          sign: 1,
        },
        {
          code: 'F60030145',
          sign: 1,
        },
        {
          code: 'F60030146',
          sign: 1,
        },
        {
          code: 'F60030147',
          sign: 1,
        },
        {
          code: 'F60030148',
          sign: 1,
        },
        {
          code: 'F60030149',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030143',
      label:
        'Achats d��tudes et prestations services (y compris achat de sous-traitance production) (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030144',
      label: 'Achats de matériel, équipements et travaux (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030145',
      label: 'Achats non stockés non rattachés (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030146',
      label: 'Services extérieurs (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030147',
      label: 'Autres services extérieurs (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030148',
      label: 'Charges diverses ordinaires (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030149',
      label: 'Impôts, taxes et versements assimilés (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030150',
      label: "Resultat d'exploitation (Net Exercice - 1)",
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030090',
          sign: 1,
        },
        {
          code: 'F60030109',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030151',
      label: 'Charges financières nettes (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030152',
          sign: 1,
        },
        {
          code: 'F60030153',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030152',
      label: 'Charges financières (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030153',
      label:
        'Dot.amort. et provisions - charges financières (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030154',
      label: 'Produits des placements (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030155',
          sign: 1,
        },
        {
          code: 'F60030156',
          sign: 1,
        },
        {
          code: 'F60030157',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030155',
      label: 'Produits financiers (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030156',
      label:
        'Reprise/prov.(à inscrire dans les pdts financ.) (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030157',
      label: 'Transferts de charges financières (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030158',
      label: 'Autres gains ordinaires (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030159',
          sign: 1,
        },
        {
          code: 'F60030160',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030159',
      label: "Produits nets sur cessions d'immobilisations (Net Exercice - 1)",
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030160',
      label: 'Autres gains/�l�m.non récurrents ou except. (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030161',
      label: 'Autres pertes ordinanires (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030162',
          sign: 1,
        },
        {
          code: 'F60030163',
          sign: 1,
        },
        {
          code: 'F60030164',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030162',
      label: 'Charges Nettes/cession immobilisations (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030163',
      label: 'Autres pertes/�l�m.non récurrents ou except. (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030164',
      label: 'Réduction de valeur (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030165',
      label: 'Résultat des Activités Ordinaires avant Impôt (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030150',
          sign: 1,
        },
        {
          code: 'F60030151',
          sign: -1,
        },
        {
          code: 'F60030154',
          sign: 1,
        },
        {
          code: 'F60030158',
          sign: 1,
        },
        {
          code: 'F60030161',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030166',
      label: 'Impôt sur les bénéfices (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: [
        {
          code: 'F60030167',
          sign: 1,
        },
        {
          code: 'F60030168',
          sign: 1,
        },
      ],
    },
    {
      code: 'F60030167',
      label:
        'Impôts/bénéfices calculés/Résultat/activ./ ord. (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030168',
      label: 'Autres Impôts/Bénéfice (régimes particuliers) (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030169',
      label: 'Résultat des Activités Ordinaires aprés Impôt (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030165',
          sign: 1,
        },
        {
          code: 'F60030166',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030170',
      label: 'Elements extraordinanires (Gains/pertes) (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030171',
          sign: 1,
        },
        {
          code: 'F60030172',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030171',
      label: 'Gains extraordinaires (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030172',
      label: 'Pertes extraordinaires (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030173',
      label: "Résultat net de l'exercice (Net Exercice - 1)",
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030169',
          sign: 1,
        },
        {
          code: 'F60030170',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030174',
      label: "Effets des modif. Comptables (net d'Impôt) (Net Exercice - 1)",
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030175',
          sign: 1,
        },
        {
          code: 'F60030176',
          sign: -1,
        },
      ],
    },
    {
      code: 'F60030175',
      label:
        'Effet positif/Modif.C.affectant Réslts Reportés (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030176',
      label:
        'Effet négatif/Modif.C.affectant Réslts Reportés (Net Exercice - 1)',
      type: 'T_NombrePositif15',
      formula: null,
    },
    {
      code: 'F60030177',
      label: 'Autres Postes des Comptes de Résultat (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: null,
    },
    {
      code: 'F60030178',
      label: 'Resultat apres modifications comptables (Net Exercice - 1)',
      type: 'T_Nombre15',
      formula: [
        {
          code: 'F60030173',
          sign: 1,
        },
        {
          code: 'F60030174',
          sign: 1,
        },
        {
          code: 'F60030177',
          sign: 1,
        },
      ],
    },
  ],
};
