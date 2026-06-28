import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtAuthGuard } from 'src/auth/strategy/jwt-auth.guard';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { FeatureController } from 'src/modules/rbac/controllers/feature.controller';
import { FeatureService } from 'src/modules/rbac/services/feature.service';

describe('FeatureController (e2e)', () => {
    let app: INestApplication;
    const mockFeatureService = {
        findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
        create: jest.fn().mockResolvedValue({ id: '1', key: 'test', name: 'Test' }),
    };

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [FeatureController],
            providers: [
                { provide: FeatureService, useValue: mockFeatureService },
                {
                    provide: JwtAuthGuard,
                    useValue: { canActivate: () => true },
                },
                {
                    provide: PermissionGuard,
                    useValue: { canActivate: () => true },
                }
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    it('/features (GET)', () => {
        return request(app.getHttpServer())
            .get('/features')
            .expect(200)
            .expect({ data: [], total: 0 });
    });

    it('/features (POST)', () => {
        return request(app.getHttpServer())
            .post('/features')
            .send({ key: 'test', name: 'Test' })
            .expect(201)
            .expect({ id: '1', key: 'test', name: 'Test' });
    });

    afterAll(async () => {
        await app.close();
    });
});
