import { parseStatementLines } from '../../src/ledger/statements';
import { isCardRepayment } from '../../src/ledger/importPolicy';

import { chase, amex } from '../helpers/cardStatements';

describe('Local card statement extraction', () => {
  test('Chase continuation, duplicate headings, rollover, FX, fees and rewards exclusion reconcile', () => {
    const result = parseStatementLines(chase());
    expect(result.candidates).toHaveLength(5);
    expect(result.candidates.map(row => row.input.date)).toContain('2024-12-28');
    expect(result.candidates.filter(row => row.input.kind === 'income')).toHaveLength(1);
    expect(result.candidates.find(row => row.input.amount === '20.00')?.input.notes).toContain('28.00 CAD');
    expect(result.warnings.join(' ')).toContain('Skipped 1');
    expect(result.candidates.every(row => row.input.currency === 'USD')).toBe(true);
  });
  test('Amex payment/credit sections, foreign columns, continuation and interest reconcile', () => {
    const result = parseStatementLines(amex());
    expect(result.candidates).toHaveLength(4);
    expect(result.candidates.map(row => row.input.amount)).toEqual(['4.00', '3.00', '20.00', '1.00']);
    expect(result.candidates[0]?.warnings.join(' ')).toContain('refund');
    expect(result.candidates[2]?.input.merchant).toBe('Multiline merchant');
    expect(result.candidates[2]?.input.notes).toContain('140.00 CNY');
    expect(result.warnings.join(' ')).toContain('Skipped 1');
  });
  test('Amex cardmember names are removed from merchants but merchants are otherwise unchanged', () => {
    const rows = amex().map(row => ({ ...row, text: row.text
      .replace('06/02/25 Example refund', '06/02/25 EXAMPLE MEMBER Example refund')
      .replace('Closing Date 06/12/25', 'Closing Date 06/12/25 Account Ending 1-23456') }));
    rows.splice(4, 0, { text: 'Example Member 1-23456', page: 3 }, { text: 'Card Ending 1-23456', page: 3 });
    const result = parseStatementLines(rows);
    expect(result.candidates.map(row => row.input.merchant)).toEqual(['Example refund', 'Example cafe', 'Multiline merchant', 'Interest Charge on Purchases']);
    expect(JSON.stringify(result)).not.toMatch(/example member/i);
  });
  test.each([
    (rows: ReturnType<typeof chase>) => rows.filter(row => !row.text.includes('Example cafe')),
    (rows: ReturnType<typeof chase>) => rows.map(row => ({ ...row, text: row.text.replace('Example cafe 10.00', 'Example cafe unreadable') })),
    (rows: ReturnType<typeof chase>) => rows.map(row => ({ ...row, text: row.text.replace('Purchases +$30.00', 'Purchases +$31.00') })),
    (rows: ReturnType<typeof chase>) => rows.filter(row => !row.text.includes('Fees Charged')),
  ])('rejects incomplete extraction instead of silently accepting a partial statement', change => {
    expect(() => parseStatementLines(change(chase()))).toThrow('reconcile');
  });
  test('requires explicit USD billing evidence and recognized layout', () => {
    expect(() => parseStatementLines(chase().filter(row => !row.text.includes('U.S. dollars')))).toThrow('USD');

    expect(() => parseStatementLines([{ text: 'Unknown Bank', page: 1 }])).toThrow('not recognized');
    expect(() => parseStatementLines(chase().filter(row => !row.text.includes('Opening/Closing')))).toThrow();
  });
  test('rejects invalid and out-of-cycle dates', () => {
    expect(() => parseStatementLines(chase().map(row => ({ ...row, text: row.text.replace('12/28 Example', '12/32 Example') })))).toThrow('invalid date');
    expect(() => parseStatementLines(chase().map(row => ({ ...row, text: row.text.replace('12/28 Example', '06/28 Example') })))).toThrow('period');
  });
  test('recognizes repayment labels without treating a payment-service merchant as a repayment', () => {
    expect(isCardRepayment('AUTOPAY PAYMENT - THANK YOU')).toBe(true);
    expect(isCardRepayment('PAYMENT THANK YOU-MOBILE')).toBe(true);
    expect(isCardRepayment('Example Payment Solutions')).toBe(false);
    expect(isCardRepayment('Online Store')).toBe(false);
  });
});
