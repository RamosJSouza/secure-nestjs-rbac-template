import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RbacService } from './modules/rbac/services/rbac.service';
import { Reflector } from '@nestjs/core';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  const mockAppService = {
    getHello: jest.fn(),
  };

  const mockRbacService = {
    checkPermissions: jest.fn(),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
        {
          provide: RbacService,
          useValue: mockRbacService,
        },
        Reflector,
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      const expectedResult = { message: 'Hello World!' };
      mockAppService.getHello.mockReturnValue(expectedResult);

      const result = appController.getHello();

      expect(appService.getHello).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getPremiumEcho', () => {
    it('should echo the request body for authorized users', () => {
      const body = { message: 'premium test' };

      const result = appController.getPremiumEcho(body);

      expect(result).toEqual(body);
    });
  });
});
