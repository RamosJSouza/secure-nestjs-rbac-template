import { assertSingleTenant } from './single-tenant.guard';

describe('assertSingleTenant', () => {
  const original = process.env.MULTI_TENANT;
  afterEach(() => {
    if (original === undefined) delete process.env.MULTI_TENANT;
    else process.env.MULTI_TENANT = original;
  });

  it('does not throw when MULTI_TENANT is unset', () => {
    delete process.env.MULTI_TENANT;
    expect(() => assertSingleTenant()).not.toThrow();
  });

  it('does not throw when MULTI_TENANT=false', () => {
    process.env.MULTI_TENANT = 'false';
    expect(() => assertSingleTenant()).not.toThrow();
  });

  it('throws when MULTI_TENANT=true', () => {
    process.env.MULTI_TENANT = 'true';
    expect(() => assertSingleTenant()).toThrow(/MULTI_TENANT=true is not supported/);
  });
});
