import { isBankLedgerAccountCode } from './bank-ledger-account';

describe('isBankLedgerAccountCode', () => {
  it.each(['532', '5321', '53201', ' 5321 '])(
    'accepts bank account code %s',
    (code) => {
      expect(isBankLedgerAccountCode(code)).toBe(true);
    },
  );

  it.each(['53', '531', '534', '1011', '411', '627'])(
    'rejects non-bank account code %s',
    (code) => {
      expect(isBankLedgerAccountCode(code)).toBe(false);
    },
  );
});
