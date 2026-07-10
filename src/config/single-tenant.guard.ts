/**
 * Early fail-loud check for single-tenancy. Reads process.env directly so it can
 * run at the very top of bootstrap(), before NestFactory.create and before any
 * DB/Redis connection is attempted. The authoritative check is the Joi
 * validation schema (MULTI_TENANT), which runs against the full config when
 * ConfigModule initializes; this guard is a defence-in-depth early-exit for
 * shell-provided env.
 */
export function assertSingleTenant(): void {
  const raw = process.env.MULTI_TENANT;
  if (raw === 'true') {
    throw new Error(
      'MULTI_TENANT=true is not supported: this template is single-tenant and does not implement PostgreSQL Row-Level Security (RLS). Set MULTI_TENANT=false (or unset).',
    );
  }
}
