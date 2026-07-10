import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(3000),

  API_PREFIX: Joi.string().default('api'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),

  PRIVATE_KEY: Joi.string()
    .required()
    .messages({
      'string.empty': 'PRIVATE_KEY must not be empty',
      'any.required': 'PRIVATE_KEY is required',
    }),

  PUBLIC_KEY: Joi.string()
    .required()
    .messages({
      'string.empty': 'PUBLIC_KEY must not be empty',
      'any.required': 'PUBLIC_KEY is required',
    }),

  DB_SSL: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().valid('true').required().messages({
        'any.only': 'DB_SSL must be "true" when NODE_ENV=production',
      }),
      otherwise: Joi.string().valid('true', 'false').optional(),
    }),

  DB_SSL_CA: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .required()
      .messages({
        'any.required':
          'DB_SSL_CA is required when NODE_ENV=production and DB_SSL=true',
      }),
    otherwise: Joi.string().optional(),
  }),

  ALLOWED_ORIGINS: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string()
        .pattern(/^https?:\/\/.+(,https?:\/\/.+)*$/)
        .required()
        .messages({
          'any.required': 'ALLOWED_ORIGINS is required when NODE_ENV=production',
          'string.pattern.base': 'ALLOWED_ORIGINS must be comma-separated URLs (e.g. https://admin.example.com)',
        }),
      otherwise: Joi.string().optional().allow(''),
    }),

  PURGE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),

  SESSION_PURGE_CRON: Joi.string().default('0 3 * * *'),

  SESSION_GRACE_DAYS: Joi.number().integer().min(0).default(1),

  AUDIT_RETENTION_DAYS: Joi.number().integer().min(1).default(90),

  AUDIT_PURGE_CRON: Joi.string().default('0 4 * * *'),

  PURGE_BATCH_SIZE: Joi.number().integer().min(1).default(1000),

  REDIS_PASSWORD: Joi.string().optional().allow(''),

  MULTI_TENANT: Joi.string()
    .valid('false')
    .default('false')
    .messages({
      'any.only': 'MULTI_TENANT=true is not supported: this template is single-tenant and does not implement PostgreSQL Row-Level Security (RLS). Set MULTI_TENANT=false or unset it.',
    }),
}).options({
  allowUnknown: true,
  stripUnknown: true,
  abortEarly: false,
});
