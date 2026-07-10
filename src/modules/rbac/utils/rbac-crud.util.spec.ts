import { NotFoundException, ConflictException } from '@nestjs/common';
import { assertFound, ensureAffected, safeDelete } from './rbac-crud.util';

describe('rbac-crud util', () => {
  describe('assertFound', () => {
    it('returns the entity when present', () => {
      const entity = { id: '1' };
      expect(assertFound(entity, 'Role', '1')).toBe(entity);
    });

    it('throws NotFoundException with a labelled message when missing', () => {
      expect(() => assertFound(null, 'Role', 'r1')).toThrow(NotFoundException);
      expect(() => assertFound(null, 'Role', 'r1')).toThrow('Role with ID "r1" not found');
    });
  });

  describe('ensureAffected', () => {
    it('is a no-op when rows were affected', () => {
      expect(() => ensureAffected({ affected: 1, raw: {}, generatedMaps: [] } as any, 'Feature', '1')).not.toThrow();
    });

    it('throws NotFoundException when no row was affected', () => {
      expect(() => ensureAffected({ affected: 0, raw: {}, generatedMaps: [] } as any, 'Feature', '1')).toThrow(NotFoundException);
    });
  });

  describe('safeDelete', () => {
    it('completes when the delete affects a row', async () => {
      const repo = { delete: jest.fn().mockResolvedValue({ affected: 1 }) };
      await expect(safeDelete(repo as any, '1', 'Feature', 'fk')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when the delete affects no row', async () => {
      const repo = { delete: jest.fn().mockResolvedValue({ affected: 0 }) };
      await expect(safeDelete(repo as any, 'missing', 'Feature', 'fk')).rejects.toThrow(NotFoundException);
    });

    it('maps a foreign-key violation to ConflictException', async () => {
      const error = new Error('FK');
      (error as any).code = '23503';
      const repo = { delete: jest.fn().mockRejectedValue(error) };
      await expect(safeDelete(repo as any, '1', 'Feature', 'has dependencies')).rejects.toThrow(ConflictException);
    });
  });
});
