import Joi from 'joi';
import logger from './logger.js';

// Define environment variable schema
const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  HTTPS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  FORCE_HTTPS_REDIRECT: Joi.boolean().truthy('true').falsy('false').default(true),
  SSL_KEY_PATH: Joi.when('HTTPS_ENABLED', {
    is: true,
    then: Joi.string().required(),
    otherwise: Joi.string().optional()
  }),
  SSL_CERT_PATH: Joi.when('HTTPS_ENABLED', {
    is: true,
    then: Joi.string().required(),
    otherwise: Joi.string().optional()
  }),
  SSL_CA_PATH: Joi.string().optional(),
  
  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  
  // Security
  SESSION_SECRET: Joi.string().min(32).required(),
  ADMIN_EMAIL: Joi.string().email().required(),
  ADMIN_PASSWORD: Joi.string().min(8).required(),
  
  // CORS
  ALLOWED_ORIGINS: Joi.string().default('http://localhost:3000'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .default('info')
}).unknown(true);

export function validateEnv() {
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false,
    stripUnknown: false
  });

  if (error) {
    logger.error('❌ Environment validation failed:');
    error.details.forEach(detail => {
      logger.error(`  - ${detail.message}`);
    });
    throw new Error('Environment validation failed');
  }

  logger.info('✅ Environment variables validated successfully');
  return value;
}

export default validateEnv;
