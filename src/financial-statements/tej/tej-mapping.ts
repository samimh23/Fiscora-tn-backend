// Maps DGI liasse fiscale (TEJ) leaf fields to NC01 ledger account code
// prefixes. Built from the official XSD field labels (see tej-fields.json)
// cross-referenced against the NC01 chart in ../../accounting/tunisian-chart.ts.
//
// Coverage is intentionally not 100% surgical for every rare sub-category:
// any account balance that isn't claimed by a specific leaf below falls
// into that statement's designated "Autres postes" catch-all field
// (F60010067 / F60020052 / F60030088, plus their N-1 equivalents), computed
// as a residual so the statement always balances exactly. This is a
// best-effort mapping requiring accountant review before filing - see
// the coverage report returned alongside the generated XML.

// F6001 (Bilan Actif): suffix -> NC01 prefixes for the gross (Brut) value
// and for the matching amortissement/provision (contra-asset) account.
export const F6001_LEAF_MAPPING: Record<
  string,
  { brut: string[]; amort: string[] }
> = {
  '0004': { brut: ['211'], amort: ['2811'] },
  '0005': { brut: ['212'], amort: ['2812'] },
  '0006': { brut: ['213'], amort: ['2813'] },
  '0007': { brut: ['214'], amort: [] },
  '0008': { brut: ['216'], amort: [] },
  '0009': { brut: ['218', '278'], amort: ['2818'] },
  '0010': { brut: ['231'], amort: [] },
  '0011': { brut: ['237'], amort: [] },
  '0013': { brut: ['221'], amort: [] },
  '0014': { brut: ['222'], amort: ['2822'] },
  '0015': { brut: ['223'], amort: ['2823'] },
  '0016': { brut: ['224'], amort: ['2824'] },
  '0017': { brut: ['228'], amort: ['2828'] },
  '0018': { brut: ['232'], amort: [] },
  '0019': { brut: ['238'], amort: [] },
  '0020': { brut: ['24'], amort: ['294'] },
  '0022': { brut: ['251', '256'], amort: ['295'] },
  '0023': { brut: ['257'], amort: [] },
  '0024': { brut: ['258'], amort: [] },
  '0025': { brut: [], amort: [] },
  '0026': { brut: ['261'], amort: ['296'] },
  '0027': { brut: [], amort: [] },
  '0028': { brut: ['265'], amort: [] },
  '0029': { brut: ['266', '267'], amort: [] },
  '0030': { brut: [], amort: [] },
  '0032': { brut: ['271'], amort: [] },
  '0033': { brut: ['272'], amort: [] },
  '0034': { brut: ['273'], amort: [] },
  '0035': { brut: ['275'], amort: [] },
  '0038': { brut: ['31'], amort: ['391'] },
  '0039': { brut: ['32'], amort: ['392'] },
  '0040': { brut: ['33'], amort: ['393'] },
  '0041': { brut: ['34'], amort: ['394'] },
  '0042': { brut: ['35'], amort: ['395'] },
  '0043': { brut: ['37'], amort: ['397'] },
  '0045': { brut: ['411'], amort: [] },
  '0046': { brut: ['413'], amort: [] },
  '0047': { brut: ['416'], amort: ['491'] },
  '0048': { brut: ['417'], amort: [] },
  '0049': { brut: ['418'], amort: [] },
  '0051': { brut: ['409'], amort: [] },
  // 0052-0057 are tiers accounts that can be net debtor or net creditor
  // (personnel/état/groupe/débiteurs-créditeurs divers/transitoire/
  // régularisation): handled by NETTED_ASSET_CATEGORIES below, computed
  // per dossier as MAX(net balance, 0) so the same account never counts
  // on both the F6001 and F6002 side.
  '0058': { brut: [], amort: ['49'] },
  '0060': { brut: ['51'], amort: [] },
  '0061': { brut: ['52'], amort: [] },
  '0062': { brut: ['55'], amort: [] },
  '0063': { brut: [], amort: ['59'] },
  '0065': { brut: ['53'], amort: [] },
  '0066': { brut: ['54'], amort: [] },
};

// Netted tiers categories shared between F6001 (actif, debtor side) and
// F6002 (passif, creditor side): NC01 prefix set -> {asset suffix, liability
// field code}. Computed once per prefix set as a single net balance.
export const NETTED_TIERS_CATEGORIES: Array<{
  label: string;
  prefixes: string[];
  f6001Suffix: string;
  f6002Code: string;
}> = [
  { label: 'Personnel', prefixes: ['42'], f6001Suffix: '0052', f6002Code: '' },
  {
    label: 'État et collectivités publiques',
    prefixes: ['43'],
    f6001Suffix: '0053',
    f6002Code: 'F60020041',
  },
  {
    label: 'Sociétés du groupe et associés',
    prefixes: ['441', '442'],
    f6001Suffix: '0054',
    f6002Code: 'F60020040',
  },
  {
    label: 'Débiteurs/créditeurs divers',
    prefixes: ['45'],
    f6001Suffix: '0055',
    f6002Code: 'F60020043',
  },
  {
    label: "Comptes transitoires ou d'attente",
    prefixes: ['46'],
    f6001Suffix: '0056',
    f6002Code: 'F60020044',
  },
  {
    label: 'Comptes de régularisation',
    prefixes: ['471', '478'],
    f6001Suffix: '0057',
    f6002Code: 'F60020045',
  },
];

// F6002 (Bilan Passif): current-year field code -> NC01 prefixes (credit
// balance). N-1 codes are derived with a fixed +53 offset (verified against
// the XSD: e.g. F60020002 <-> F60020055).
export const F6002_N1_OFFSET = 53;
export const F6002_LEAF_MAPPING: Record<string, string[]> = {
  F60020002: ['101'],
  F60020003: ['11'],
  F60020004: ['14'],
  F60020005: ['12'],
  F60020007: ['13'],
  F60020011: ['161'],
  F60020012: ['162'],
  F60020013: [],
  F60020014: ['167'],
  F60020015: [],
  F60020016: ['166'],
  F60020017: ['165'],
  F60020018: ['164', '168'],
  F60020020: ['185'],
  F60020021: ['188'],
  F60020023: ['151'],
  F60020024: ['152'],
  F60020025: ['153'],
  F60020026: ['143'],
  F60020027: ['155'],
  F60020028: ['156'],
  F60020029: [],
  F60020030: ['158'],
  F60020033: ['401'],
  F60020034: ['403'],
  F60020035: ['404'],
  F60020036: ['405'],
  F60020037: ['408'],
  F60020039: ['419'],
  // F60020040/41/43/44/45 are populated from NETTED_TIERS_CATEGORIES above.
  F60020042: ['446', '447', '448'],
  F60020046: ['48'],
  F60020048: ['50'],
  F60020049: [],
  F60020050: ['508', '518'],
  F60020051: [],
};

// F6003 (État de résultats): current-year field code -> NC01 prefixes and
// a sign: +1 for revenue-type accounts (credit-positive), -1 for
// expense-type accounts (debit-positive, subtracted from the result as
// a positive charge amount). N-1 codes use a fixed +89 offset (verified:
// F60030004 <-> F60030093).
export const F6003_N1_OFFSET = 89;
export const F6003_LEAF_MAPPING: Record<
  string,
  { prefixes: string[]; sign: 1 | -1 }
> = {
  F60030004: { prefixes: ['707'], sign: 1 },
  F60030005: { prefixes: ['7097'], sign: -1 },
  F60030007: { prefixes: ['701'], sign: 1 },
  F60030008: { prefixes: ['702'], sign: 1 },
  F60030009: { prefixes: ['703'], sign: 1 },
  F60030010: { prefixes: ['704'], sign: 1 },
  F60030011: { prefixes: ['705'], sign: 1 },
  F60030012: { prefixes: ['706'], sign: 1 },
  F60030013: { prefixes: ['7091', '7094', '7095'], sign: -1 },
  F60030014: { prefixes: ['72'], sign: 1 },
  F60030016: {
    prefixes: ['731', '732', '733', '734', '735', '738'],
    sign: 1,
  },
  F60030017: { prefixes: ['74'], sign: 1 },
  F60030018: { prefixes: ['781'], sign: 1 },
  F60030019: { prefixes: ['79'], sign: 1 },
  F60030022: { prefixes: ['7133'], sign: 1 },
  F60030023: { prefixes: ['7134'], sign: 1 },
  F60030024: { prefixes: ['7135'], sign: 1 },
  F60030026: { prefixes: ['607'], sign: -1 },
  F60030027: { prefixes: ['609'], sign: 1 },
  F60030028: { prefixes: ['6037'], sign: -1 },
  F60030030: { prefixes: ['601'], sign: -1 },
  F60030031: { prefixes: ['602'], sign: -1 },
  F60030032: { prefixes: [], sign: 1 },
  F60030033: { prefixes: [], sign: 1 },
  F60030034: { prefixes: ['6031'], sign: -1 },
  F60030035: { prefixes: ['6032'], sign: -1 },
  F60030037: { prefixes: ['640'], sign: -1 },
  F60030038: { prefixes: ['642'], sign: -1 },
  F60030039: { prefixes: ['643'], sign: -1 },
  F60030040: { prefixes: ['644'], sign: -1 },
  F60030041: { prefixes: ['645'], sign: -1 },
  F60030042: { prefixes: ['646'], sign: -1 },
  F60030043: { prefixes: ['647'], sign: -1 },
  F60030044: { prefixes: [], sign: -1 },
  F60030045: { prefixes: ['649'], sign: -1 },
  F60030047: { prefixes: ['681'], sign: -1 },
  F60030048: { prefixes: [], sign: -1 },
  F60030049: { prefixes: ['6815'], sign: -1 },
  F60030050: { prefixes: ['6811'], sign: -1 },
  F60030051: { prefixes: ['6816'], sign: -1 },
  F60030052: { prefixes: [], sign: -1 },
  F60030054: { prefixes: ['604', '611'], sign: -1 },
  F60030055: { prefixes: ['605'], sign: -1 },
  F60030056: { prefixes: ['606'], sign: -1 },
  F60030057: { prefixes: ['613', '614', '615', '616', '617', '618'], sign: -1 },
  F60030058: { prefixes: ['62'], sign: -1 },
  F60030059: { prefixes: ['63'], sign: -1 },
  F60030060: { prefixes: ['66'], sign: -1 },
  F60030063: { prefixes: ['651', '653', '654', '655', '657'], sign: -1 },
  F60030064: { prefixes: ['686'], sign: -1 },
  F60030066: {
    prefixes: ['751', '752', '753', '754', '755', '756', '757'],
    sign: 1,
  },
  F60030067: { prefixes: ['786'], sign: 1 },
  F60030068: { prefixes: [], sign: 1 },
  F60030070: { prefixes: ['736'], sign: 1 },
  F60030071: { prefixes: [], sign: 1 },
  F60030073: { prefixes: ['636'], sign: -1 },
  F60030074: { prefixes: [], sign: -1 },
  F60030075: { prefixes: ['637'], sign: -1 },
  F60030078: { prefixes: ['69'], sign: -1 },
  F60030079: { prefixes: [], sign: -1 },
  F60030082: { prefixes: ['77'], sign: 1 },
  F60030083: { prefixes: ['67'], sign: -1 },
  F60030086: { prefixes: [], sign: 1 },
  F60030087: { prefixes: [], sign: -1 },
};
