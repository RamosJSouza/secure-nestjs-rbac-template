import { SelectQueryBuilder } from 'typeorm';
import { BasePaginationQueryDto } from '@/common/dto/base-pagination-query.dto';

export function applyPagination<T>(
  qb: SelectQueryBuilder<T>,
  query: BasePaginationQueryDto,
  orderBy: { column: string; direction?: 'ASC' | 'DESC' },
): void {
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;

  qb.orderBy(orderBy.column, orderBy.direction ?? 'ASC');
  qb.skip((page - 1) * limit);
  qb.take(limit);
}

export function applyActiveFilter<T>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  isActive?: boolean,
): void {
  if (isActive !== undefined) {
    qb.andWhere(`${alias}.isActive = :isActive`, { isActive });
  }
}
