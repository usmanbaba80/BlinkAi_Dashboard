import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import logger from './utils/logger.js';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Create Sequelize instance with PostgreSQL connection
export const sequelize = new Sequelize({
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  dialect: 'postgres',
  logging: isProduction ? false : (sql) => logger.debug(sql),
  pool: {
    max: isProduction ? 20 : 5,
    min: isProduction ? 5 : 0,
    acquire: 60000,
    idle: 10000,
    evict: 1000,
  },
  dialectOptions: isProduction ? {
    ssl: {
      require: true,
      rejectUnauthorized: false // Set to true if you have proper SSL certificates
    },
    keepAlive: true,
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 30000
  } : {
    keepAlive: true
  },
  retry: {
    max: 3,
    match: [
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/,
      /TimeoutError/,
    ],
  },
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true,
  },
});

// Test database connection with retry logic
export const testConnection = async (retries = 5, delay = 5000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sequelize.authenticate();
      logger.info('✓ Database connection established successfully.');
      
      // Get database info
      const dbInfo = await sequelize.query('SELECT version();', { plain: true });
      logger.info(`Database: PostgreSQL ${dbInfo.version}`);
      
      return true;
    } catch (error) {
      logger.error(`Database connection attempt ${attempt}/${retries} failed:`, error.message);
      
      if (attempt < retries) {
        logger.info(`Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.error('✗ Unable to connect to the database after all retries');
        throw error;
      }
    }
  }
};

// Graceful shutdown handler
export const closeConnection = async () => {
  try {
    await sequelize.close();
    logger.info('Database connection closed successfully');
  } catch (error) {
    logger.error('Error closing database connection:', error);
    throw error;
  }
};

// Health check for database
export const healthCheck = async () => {
  try {
    await sequelize.authenticate();
    return { status: 'healthy', message: 'Database connection is active' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};
