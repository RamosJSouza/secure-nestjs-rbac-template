import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RbacService } from '@/modules/rbac/services/rbac.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: RbacService,
          useValue: { checkPermissions: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should call authService.login and return result', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const authResponse = {
        email: 'test@example.com',
        access_token: 'mock-jwt-token',
      };

      mockAuthService.login.mockResolvedValue(authResponse);

      const mockReq: any = {
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        get: jest.fn().mockReturnValue('test-agent'),
      };
      const result = await controller.login(loginDto, mockReq);

      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto, '127.0.0.1', 'test-agent');
      expect(result).toEqual(authResponse);
    });
  });

  describe('register', () => {
    it('should call authService.register and return result', async () => {
      const registerDto = {
        email: 'newuser@example.com',
        name: 'New User',
        password: 'password123',
      };

      const authResponse = {
        message: 'User created with success',
      };

      mockAuthService.register.mockResolvedValue(authResponse);

      const result = await controller.register(registerDto);

      expect(mockAuthService.register).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual(authResponse);
    });
  });

  describe('logout', () => {
    it('calls authService.logout with userId, jti and refresh_token', async () => {
      mockAuthService.logout = jest.fn().mockResolvedValue(undefined);
      const req: any = { user: { id: 'u1', jti: 'jti-1' } };
      const res = await controller.logout(req, { refresh_token: 'rt' });
      expect(mockAuthService.logout).toHaveBeenCalledWith('u1', 'jti-1', 'rt');
      expect(res).toEqual({ message: 'Logged out' });
    });

    it('logoutAll calls authService.logoutAll with userId and jti', async () => {
      mockAuthService.logoutAll = jest.fn().mockResolvedValue(undefined);
      const req: any = { user: { id: 'u1', jti: 'jti-1' } };
      const res = await controller.logoutAll(req);
      expect(mockAuthService.logoutAll).toHaveBeenCalledWith('u1', 'jti-1');
      expect(res).toEqual({ message: 'All sessions revoked' });
    });
  });
});
