export type PgConstraintCode = '23505' | '23503';

function getPgErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) {
    return undefined;
  }
  const candidate = err as { code?: string; driverError?: { code?: string } };
  return candidate.driverError?.code ?? candidate.code;
}

export function isPgError(err: unknown, code: PgConstraintCode): boolean {
  return getPgErrorCode(err) === code;
}

export function handlePgConstraintError(
  err: unknown,
  handlers: { onUnique?: () => never; onForeignKey?: () => never },
): never {
  if (isPgError(err, '23505') && handlers.onUnique) {
    handlers.onUnique();
  }
  if (isPgError(err, '23503') && handlers.onForeignKey) {
    handlers.onForeignKey();
  }
  throw err;
}
