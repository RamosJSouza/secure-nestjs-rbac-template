import { isPgError } from './pg-constraint-error.util';

describe('pg-constraint-error util', () => {
  it('detects code on the error object', () => {
    expect(isPgError({ code: '23505' }, '23505')).toBe(true);
  });

  it('detects code on driverError (TypeORM QueryFailedError shape)', () => {
    expect(isPgError({ driverError: { code: '23503' } }, '23503')).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isPgError(new Error('fail'), '23505')).toBe(false);
  });
});
