import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UsersService } from './users.service';
import { User } from 'src/modules/rbac/entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const cacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
        { provide: CACHE_MANAGER, useValue: cacheManager },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a user', async () => {
      const createUserDto = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
      };

      const createdUser = {
        ...createUserDto,
      };

      const savedUser = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        ...createUserDto,
        isActive: true,
        roleId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockRepository.create.mockReturnValue(createdUser);
      mockRepository.save.mockResolvedValue(savedUser);

      const result = await service.create(createUserDto);

      expect(mockRepository.create).toHaveBeenCalledWith(expect.objectContaining(createUserDto));
      expect(mockRepository.save).toHaveBeenCalledWith(createdUser);
      expect(result).toEqual(savedUser);
    });
  });

  describe('findOne', () => {
    it('should return a user by email', async () => {
      const email = 'test@example.com';
      const user = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        name: 'Test User',
        email,
        password: 'hashedpassword',
        roleId: null,
        isActive: true,
      };

      mockRepository.findOne.mockResolvedValue(user);

      const result = await service.findOne(email);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { email } });
      expect(result).toEqual(user);
    });
  });

  describe('findById', () => {
    it('should return a user by id', async () => {
      const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const user = { id, name: 'Test User', email: 'test@example.com' };

      mockRepository.findOne.mockResolvedValue(user);

      const result = await service.findById(id);

      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id } });
      expect(result).toEqual(user);
    });

    it('findById does not select the password column', async () => {
      const id = 'u1';
      mockRepository.findOne.mockResolvedValue({ id, email: 't@x.com' });
      await service.findById(id);
      const callArg = mockRepository.findOne.mock.calls[0][0];
      expect(callArg.select?.password).not.toBe(true);
    });
  });

  describe('findOneWithPassword', () => {
    it('findOne does not select the password column', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 'u1', email: 't@x.com' });
      await service.findOne('t@x.com');
      const callArg = mockRepository.findOne.mock.calls[0][0];
      expect(callArg.select?.password).not.toBe(true);
    });

    it('findOneWithPassword selects the password column', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 'u1', email: 't@x.com', password: 'h' });
      const user = await service.findOneWithPassword('t@x.com');
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: 't@x.com' },
        select: expect.objectContaining({ password: true }),
      });
      expect(user?.password).toBe('h');
    });

    it('findByIdWithPassword selects the password column', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 'u1', email: 't@x.com', password: 'h' });
      const user = await service.findByIdWithPassword('u1');
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: expect.objectContaining({ password: true }),
      });
      expect(user?.password).toBe('h');
    });
  });

  describe('cache invalidation', () => {
    it('updatePassword invalidates the user cache', async () => {
      mockRepository.update.mockResolvedValue(undefined);
      cacheManager.del.mockResolvedValue(undefined);
      await service.updatePassword('u1', 'hash');
      expect(mockRepository.update).toHaveBeenCalledWith({ id: 'u1' }, { password: 'hash' });
      expect(cacheManager.del).toHaveBeenCalledWith('user:u1');
    });

    it('resetFailedLogin invalidates the user cache', async () => {
      mockRepository.update.mockResolvedValue(undefined);
      cacheManager.del.mockResolvedValue(undefined);
      await service.resetFailedLogin('u1');
      expect(cacheManager.del).toHaveBeenCalledWith('user:u1');
    });
  });

});
