import { NotFoundException, ConflictException } from '@nestjs/common';
import { DeleteResult, Repository, UpdateResult } from 'typeorm';
import { handlePgConstraintError } from '@/common/utils/pg-constraint-error.util';

export function assertFound<T>(entity: T | null, label: string, id: string): T {
  if (!entity) {
    throw new NotFoundException(`${label} with ID "${id}" not found`);
  }
  return entity;
}

export function ensureAffected(result: UpdateResult | DeleteResult, label: string, id: string): void {
  if (result.affected === 0) {
    throw new NotFoundException(`${label} with ID "${id}" not found`);
  }
}

export async function safeDelete<T>(
  repo: Pick<Repository<T>, 'delete'>,
  id: string,
  label: string,
  foreignKeyMessage: string,
): Promise<void> {
  try {
    const result = await repo.delete(id);
    ensureAffected(result, label, id);
  } catch (err) {
    handlePgConstraintError(err, {
      onForeignKey: () => {
        throw new ConflictException(foreignKeyMessage);
      },
    });
  }
}
