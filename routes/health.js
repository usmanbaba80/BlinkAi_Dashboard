import { Router } from 'express';
import { healthCheck } from '../database.js';
import { version } from 'process';
import logger from '../utils/logger.js';

const router = Router();

// Basic health check
router.get('/health', async (req, res) => {
  try {
    const dbHealth = await healthCheck();
    const uptime = process.uptime();
    
    const health = {
      status: dbHealth.status === 'healthy' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: version,
      database: dbHealth,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      }
    };

    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Readiness probe (for Kubernetes/container orchestration)
router.get('/ready', async (req, res) => {
  try {
    const dbHealth = await healthCheck();
    
    if (dbHealth.status === 'healthy') {
      res.status(200).json({ ready: true });
    } else {
      res.status(503).json({ ready: false, reason: dbHealth.message });
    }
  } catch (error) {
    res.status(503).json({ ready: false, reason: error.message });
  }
});

// Liveness probe (for Kubernetes/container orchestration)
router.get('/live', (req, res) => {
  res.status(200).json({ alive: true });
});

export default router;
