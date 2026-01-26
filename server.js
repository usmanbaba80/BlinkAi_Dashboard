import express from 'express';
import AdminJS from 'adminjs';
import { buildAuthenticatedRouter } from '@adminjs/express';
import { Resource, Database } from '@adminjs/sequelize';
import dotenv from 'dotenv';
import compression from 'compression';
import morgan from 'morgan';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync } from 'fs';
import { Op } from 'sequelize';
import { sequelize, testConnection, closeConnection } from './database.js';
import SearchQuery from './models/QueryResult.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from './utils/logger.js';
import { validateEnv } from './utils/env-validator.js';
import { configureCors, configureHelmet, apiLimiter } from './middleware/security.js';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/error-handler.js';
import { initializeAdminUser, authenticate, requireAuth, requireAuthWeb } from './middleware/auth.js';
import healthRouter from './routes/health.js';

// Load and validate environment variables
dotenv.config();

let env;
try {
  env = validateEnv();
} catch (error) {
  logger.error('Failed to validate environment variables');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const httpsEnabled = env.HTTPS_ENABLED;
const forceHttpsRedirect = env.FORCE_HTTPS_REDIRECT;
const sslKeyPath = env.SSL_KEY_PATH;
const sslCertPath = env.SSL_CERT_PATH;
const sslCaPath = env.SSL_CA_PATH;

// Register Sequelize adapter for AdminJS
AdminJS.registerAdapter({
  Resource: Resource,
  Database: Database,
});

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const start = async () => {
  const app = express();
  const enforceHttps = Boolean(forceHttpsRedirect && httpsEnabled);
  let sslOptions;

  if (httpsEnabled) {
    try {
      sslOptions = {
        key: readFileSync(sslKeyPath),
        cert: readFileSync(sslCertPath)
      };

      if (sslCaPath) {
        sslOptions.ca = readFileSync(sslCaPath);
      }
    } catch (error) {
      logger.error('Failed to load SSL certificate files:', error);
      process.exit(1);
    }
  }

  // Trust proxy for rate limiting and secure cookies behind reverse proxy
  app.set('trust proxy', 1);

  if (enforceHttps) {
    app.use((req, res, next) => {
      const proto = req.headers['x-forwarded-proto'] || (req.connection?.encrypted ? 'https' : req.protocol);
      if (proto === 'https') {
        return next();
      }

      if (!req.headers.host) {
        return res.status(400).send('Host header is required');
      }

      return res.redirect(`https://${req.headers.host}${req.originalUrl}`);
    });
  }

  // Security middleware
  app.use(configureHelmet({ isSecureOrigin: httpsEnabled }));
  app.use(configureCors());

  // Request logging
  if (isProduction) {
    app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
  } else {
    app.use(morgan('dev'));
  }

  // Compression middleware
  app.use(compression());

  // Cookie parser middleware (needed to read cookies)
  app.use(cookieParser());

  // Initialize admin user
  await initializeAdminUser();

  // Test database connection
  await testConnection();

  // Sync models with database
  await sequelize.sync({ alter: false });
  logger.info('✓ Models synchronized with database.');

  // Configure session store with PostgreSQL (needed before protected routes)
  const PgSession = connectPgSimple(session);
  const pool = sequelize.connectionManager.pool;
  const sessionStore = new PgSession({
    conObject: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    },
    tableName: 'session',
    createTableIfMissing: true,
  });

  const sessionConfig = {
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'adminjs.sid',
    cookie: {
      httpOnly: true,
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
      sameSite: isProduction ? 'strict' : 'lax'
    }
  };

  // Apply session middleware to entire app BEFORE protected routes
  app.use(session(sessionConfig));

  // Health check routes (before rate limiting)
  app.use('/', healthRouter);

  // Apply rate limiting to API routes
  app.use('/api', apiLimiter);

  // Favicon placeholder to avoid 404 noise
  app.get('/favicon.ico', (req, res) => res.status(204).end());

  // API endpoint for dashboard statistics (requires authentication)
  app.get('/api/stats', requireAuth, asyncHandler(async (req, res) => {
      // Get total count (optimized query)
      const total = await SearchQuery.count();
      
      // Count by search type using database aggregation
      const searchTypeResults = await SearchQuery.findAll({
        attributes: [
          'search_type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['search_type'],
        raw: true
      });

      // Convert to object format
      const searchTypeBreakdown = {};
      searchTypeResults.forEach(row => {
        const type = row.search_type || 'Unknown';
        searchTypeBreakdown[type] = parseInt(row.count);
      });

      // Count by platform name (ignore null)
      const platformResults = await SearchQuery.findAll({
        attributes: [
          'platform_name',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: { platform_name: { [Op.ne]: null } },
        group: ['platform_name'],
        raw: true
      });

      const platformBreakdown = {};
      platformResults.forEach(row => {
        const platform = row.platform_name || 'Unknown';
        platformBreakdown[platform] = parseInt(row.count);
      });

      // Group queries by date for timeline chart
      const timelineResults = await SearchQuery.findAll({
        attributes: [
          [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: [sequelize.fn('DATE', sequelize.col('created_at'))],
        order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']],
        raw: true
      });

      // Convert to timeline format (last 30 days or all data if less)
      const timelineData = {};
      timelineResults.forEach(row => {
        timelineData[row.date] = parseInt(row.count);
      });

      // Get date range
      const dateRange = await SearchQuery.findAll({
        attributes: [
          [sequelize.fn('MIN', sequelize.col('created_at')), 'earliest'],
          [sequelize.fn('MAX', sequelize.col('created_at')), 'latest']
        ],
        raw: true
      });

      const { earliest, latest } = dateRange[0] || {};

      // Get recent queries (only fetch the latest 10)
      const recentRecords = await SearchQuery.findAll({
        order: [['created_at', 'DESC']],
        limit: 10
      });

      const recentQueries = recentRecords.map(r => ({
        id: r.id,
        keyword: r.keyword,
        search_type: r.search_type,
        platform_name: r.platform_name,
        created_at: r.created_at
      }));

      res.json({
        success: true,
        data: {
          total,
          searchTypeBreakdown,
          timelineData,
          platformBreakdown,
          recentQueries,
          dateRange: {
            earliest,
            latest
          }
        },
        timestamp: new Date().toISOString()
      });
  }));

  // Serve the dashboard HTML (requires authentication)
  app.get('/dashboard', requireAuthWeb, (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blink_Ai Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .header {
            background: white;
            padding: 30px;
            border-radius: 15px;
            margin-bottom: 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin-bottom: 10px; font-size: 32px; }
        .subtitle { color: #666; font-size: 16px; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            text-align: center;
            transition: transform 0.3s ease;
        }
        .stat-card:hover { transform: translateY(-5px); }
        .stat-value {
            font-size: 48px;
            font-weight: bold;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 10px;
        }
        .stat-label { color: #666; font-size: 14px; font-weight: 500; }
        .charts-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 30px;
            margin-bottom: 30px;
        }
        .chart-card {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .chart-title {
            font-size: 20px;
            font-weight: 600;
            color: #333;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
        }
        .chart-title::before {
            content: '📊';
            margin-right: 10px;
            font-size: 24px;
        }
        .table-card {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background: #f8f9fa;
            padding: 15px;
            text-align: left;
            font-weight: 600;
            color: #333;
            border-bottom: 2px solid #e0e0e0;
        }
        td {
            padding: 15px;
            border-bottom: 1px solid #f0f0f0;
            color: #666;
        }
        tr:hover { background: #f8f9fa; }
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-size: 12px;
            font-weight: 600;
        }
        .loading {
            text-align: center;
            padding: 100px 20px;
            color: white;
            font-size: 24px;
        }
        .admin-link {
            display: inline-block;
            background: white;
            color: #667eea;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            margin-top: 20px;
            transition: all 0.3s ease;
        }
        .admin-link:hover {
            background: #667eea;
            color: white;
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Blink_Ai Dashboard</h1>
            <p class="subtitle">Real-time analytics and insights from your search queries</p>
            <a href="/admin" class="admin-link">Go to Admin Panel →</a>
        </div>
        
        <div id="loading" class="loading">Loading dashboard data...</div>
        <div id="content" style="display: none;">
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value" id="totalQueries">0</div>
                    <div class="stat-label">Total Queries</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="searchTypes">0</div>
                    <div class="stat-label">Search Types</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="dateRange">-</div>
                    <div class="stat-label">Date Range</div>
                </div>
            </div>

            <div class="charts-grid">
                <div class="chart-card">
                    <div class="chart-title">Queries by Search Type</div>
                    <canvas id="searchTypeChart"></canvas>
                </div>
            </div>

            <div class="chart-card" style="margin-bottom: 30px;">
                <div class="chart-title">📈 Queries Over Time</div>
                <canvas id="timelineChart"></canvas>
            </div>

            <div class="chart-card" style="margin-bottom: 30px;">
                <div class="chart-title">Platforms</div>
                <canvas id="platformChart" style="max-height: 400px;"></canvas>
            </div>

            <div class="chart-card" style="margin-bottom: 30px;">
                <div class="chart-title">Search Type Distribution</div>
                <canvas id="pieChart" style="max-height: 400px;"></canvas>
            </div>

            <div class="table-card">
                <div class="chart-title">📝 Recent Queries</div>
                <table id="recentTable">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Keyword</th>
                            <th>Platform</th>
                            <th>Search Type</th>
                            <th>Created At</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        async function loadDashboard() {
            try {
                const response = await fetch('/api/stats');
                const result = await response.json();
                
                if (!result.success) {
                    throw new Error('Failed to load data');
                }
                
                const data = result.data;

                // Update stats
                document.getElementById('totalQueries').textContent = data.total.toLocaleString();
                document.getElementById('searchTypes').textContent = Object.keys(data.searchTypeBreakdown).length;
                
                // Update date range
                if (data.dateRange && data.dateRange.earliest && data.dateRange.latest) {
                    const earliest = new Date(data.dateRange.earliest).toLocaleDateString();
                    const latest = new Date(data.dateRange.latest).toLocaleDateString();
                    const daysDiff = Math.ceil((new Date(data.dateRange.latest) - new Date(data.dateRange.earliest)) / (1000 * 60 * 60 * 24));
                    document.getElementById('dateRange').textContent = daysDiff + ' days';
                    document.getElementById('dateRange').title = \`From \${earliest} to \${latest}\`;
                    document.getElementById('dateRange').style.cursor = 'help';
                }

                // Search Type Bar Chart
                const searchTypeLabels = Object.keys(data.searchTypeBreakdown);
                const searchTypeValues = Object.values(data.searchTypeBreakdown);
                new Chart(document.getElementById('searchTypeChart'), {
                    type: 'bar',
                    data: {
                        labels: searchTypeLabels,
                        datasets: [{
                            label: 'Number of Queries',
                            data: searchTypeValues,
                            backgroundColor: 'rgba(102, 126, 234, 0.8)',
                            borderColor: 'rgba(102, 126, 234, 1)',
                            borderWidth: 2,
                            borderRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: { beginAtZero: true }
                        }
                    }
                });

                // Timeline Chart (Queries Over Time)
                const timelineLabels = Object.keys(data.timelineData);
                const timelineValues = Object.values(data.timelineData);
                new Chart(document.getElementById('timelineChart'), {
                    type: 'line',
                    data: {
                        labels: timelineLabels,
                        datasets: [{
                            label: 'Queries per Day',
                            data: timelineValues,
                            backgroundColor: 'rgba(102, 126, 234, 0.2)',
                            borderColor: 'rgba(102, 126, 234, 1)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            pointBackgroundColor: 'rgba(102, 126, 234, 1)',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { 
                                display: true,
                                position: 'top'
                            },
                            tooltip: {
                                mode: 'index',
                                intersect: false,
                                callbacks: {
                                    title: function(tooltipItems) {
                                        return 'Date: ' + tooltipItems[0].label;
                                    },
                                    label: function(context) {
                                        return 'Queries: ' + context.parsed.y.toLocaleString();
                                    }
                                }
                            }
                        },
                        scales: {
                            y: { 
                                beginAtZero: true,
                                ticks: {
                                    callback: function(value) {
                                        return value.toLocaleString();
                                    }
                                }
                            },
                            x: {
                                ticks: {
                                    maxRotation: 45,
                                    minRotation: 45
                                }
                            }
                        },
                        interaction: {
                            mode: 'nearest',
                            axis: 'x',
                            intersect: false
                        }
                    }
                });

                // Pie Chart
                const colors = [
                    'rgba(102, 126, 234, 0.8)',
                    'rgba(118, 75, 162, 0.8)',
                    'rgba(162, 155, 254, 0.8)',
                    'rgba(217, 128, 250, 0.8)',
                    'rgba(255, 159, 243, 0.8)',
                    'rgba(255, 195, 113, 0.8)',
                    'rgba(255, 231, 76, 0.8)',
                    'rgba(130, 255, 173, 0.8)'
                ];
                // Platform Chart (ignore nulls)
                const platformLabels = Object.keys(data.platformBreakdown || {});
                const platformValues = Object.values(data.platformBreakdown || {});
                if (platformLabels.length) {
                    new Chart(document.getElementById('platformChart'), {
                        type: 'bar',
                        data: {
                            labels: platformLabels,
                            datasets: [{
                                label: 'Queries by Platform',
                                data: platformValues,
                                backgroundColor: colors.slice(0, platformLabels.length),
                                borderColor: 'rgba(102, 126, 234, 1)',
                                borderWidth: 2,
                                borderRadius: 8
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: { legend: { display: false } },
                            scales: { y: { beginAtZero: true } }
                        }
                    });
                }
                new Chart(document.getElementById('pieChart'), {
                    type: 'doughnut',
                    data: {
                        labels: searchTypeLabels,
                        datasets: [{
                            data: searchTypeValues,
                            backgroundColor: colors.slice(0, searchTypeLabels.length),
                            borderWidth: 3,
                            borderColor: '#fff'
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                position: 'right'
                            }
                        }
                    }
                });

                // Populate table
                const tbody = document.querySelector('#recentTable tbody');
                data.recentQueries.forEach(item => {
                    const row = tbody.insertRow();
                    row.innerHTML = \`
                        <td>\${item.id}</td>
                        <td>\${item.keyword || 'N/A'}</td>
                        <td>\${item.platform_name || 'N/A'}</td>
                        <td><span class="badge">\${item.search_type || 'N/A'}</span></td>
                        <td>\${new Date(item.created_at).toLocaleString()}</td>
                    \`;
                });

                // Show content
                document.getElementById('loading').style.display = 'none';
                document.getElementById('content').style.display = 'block';
            } catch (error) {
                console.error('Error loading dashboard:', error);
                document.getElementById('loading').textContent = 'Error loading dashboard data';
            }
        }

        loadDashboard();
        // Refresh every 30 seconds
        setInterval(loadDashboard, 30000);
    </script>
</body>
</html>
    `);
  });

  // Configure AdminJS
  const adminOptions = {
    dashboard: {
      handler: async () => {
        return {
          message: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 30px; max-width: 1200px; margin: 0 auto; background: #f8f9fc;">
              
              <!-- Welcome Header -->
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 20px; margin-bottom: 30px; box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
                  <div>
                    <h1 style="font-size: 36px; margin: 0 0 12px 0; font-weight: 700;">Welcome to Blink AI Dashboard</h1>
                    <p style="font-size: 18px; margin: 0; opacity: 0.95;">Manage and analyze your search data with powerful tools</p>
                  </div>
                  <div style="font-size: 72px;">🤖</div>
                </div>
              </div>

              <!-- Stats Cards Row -->
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
                <div style="background: white; padding: 25px; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-left: 4px solid #667eea;">
                  <div style="font-size: 14px; color: #666; margin-bottom: 8px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Total Queries</div>
                  <div style="font-size: 32px; font-weight: 700; color: #667eea;">16,583</div>
                </div>
                <div style="background: white; padding: 25px; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-left: 4px solid #764ba2;">
                  <div style="font-size: 14px; color: #666; margin-bottom: 8px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Search Types</div>
                  <div style="font-size: 32px; font-weight: 700; color: #764ba2;">Multiple</div>
                </div>
                <div style="background: white; padding: 25px; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-left: 4px solid #42C6F6;">
                  <div style="font-size: 14px; color: #666; margin-bottom: 8px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Timeline</div>
                  <div style="font-size: 32px; font-weight: 700; color: #42C6F6;">📈</div>
                </div>
              </div>

              <!-- Main Action Button -->
              <a href="/dashboard" style="display: block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 32px; border-radius: 16px; text-decoration: none; margin-bottom: 30px; box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3); transition: all 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 12px 32px rgba(102, 126, 234, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 24px rgba(102, 126, 234, 0.3)';">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
                  <div style="display: flex; align-items: center; gap: 20px;">
                    <div style="font-size: 56px;">📊</div>
                    <div>
                      <div style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">Interactive Analytics Dashboard</div>
                      <div style="font-size: 16px; opacity: 0.9;">View comprehensive charts, graphs, and real-time data visualizations</div>
                    </div>
                  </div>
                  <div style="font-size: 32px; background: rgba(255,255,255,0.2); width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">→</div>
                </div>
              </a>

              <!-- Quick Actions Grid -->
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px;">
                
                <a href="/admin/resources/SearchQuery" style="background: white; padding: 28px; border-radius: 16px; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.08); transition: all 0.3s ease; border: 2px solid transparent;" onmouseover="this.style.borderColor='#667eea'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.12)';" onmouseout="this.style.borderColor='transparent'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)';">
                  <div style="display: flex; align-items: flex-start; gap: 16px;">
                    <div style="font-size: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); width: 60px; height: 60px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">📁</div>
                    <div style="flex: 1;">
                      <div style="font-size: 18px; font-weight: 700; color: #333; margin-bottom: 8px;">Search Analytics</div>
                      <div style="font-size: 14px; color: #666; line-height: 1.5;">Manage, view, edit, and filter all search query records</div>
                    </div>
                  </div>
                </a>

                <a href="/api/stats" target="_blank" style="background: white; padding: 28px; border-radius: 16px; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.08); transition: all 0.3s ease; border: 2px solid transparent;" onmouseover="this.style.borderColor='#42C6F6'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.12)';" onmouseout="this.style.borderColor='transparent'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)';">
                  <div style="display: flex; align-items: flex-start; gap: 16px;">
                    <div style="font-size: 40px; background: linear-gradient(135deg, #42C6F6 0%, #4268F6 100%); width: 60px; height: 60px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">🔌</div>
                    <div style="flex: 1;">
                      <div style="font-size: 18px; font-weight: 700; color: #333; margin-bottom: 8px;">API Endpoint</div>
                      <div style="font-size: 14px; color: #666; line-height: 1.5;">Access raw statistics data in JSON format for integration</div>
                    </div>
                  </div>
                </a>

              </div>

              <!-- Features List -->
              <div style="background: white; padding: 32px; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <h2 style="font-size: 22px; font-weight: 700; color: #333; margin: 0 0 24px 0; display: flex; align-items: center; gap: 12px;">
                  <span>✨</span> Platform Features
                </h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                  
                  <div style="display: flex; align-items: start; gap: 12px;">
                    <div style="font-size: 24px; background: #f0f3ff; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">📈</div>
                    <div>
                      <div style="font-size: 15px; font-weight: 600; color: #333; margin-bottom: 4px;">Interactive Visualizations</div>
                      <div style="font-size: 13px; color: #666;">Dynamic charts including timeline analysis</div>
                    </div>
                  </div>

                  <div style="display: flex; align-items: start; gap: 12px;">
                    <div style="font-size: 24px; background: #f0f3ff; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">🔄</div>
                    <div>
                      <div style="font-size: 15px; font-weight: 600; color: #333; margin-bottom: 4px;">Real-Time Updates</div>
                      <div style="font-size: 13px; color: #666;">Auto-refresh every 30 seconds</div>
                    </div>
                  </div>

                  <div style="display: flex; align-items: start; gap: 12px;">
                    <div style="font-size: 24px; background: #f0f3ff; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">🔍</div>
                    <div>
                      <div style="font-size: 15px; font-weight: 600; color: #333; margin-bottom: 4px;">Advanced Filtering</div>
                      <div style="font-size: 13px; color: #666;">Search and filter by any field</div>
                    </div>
                  </div>

                  <div style="display: flex; align-items: start; gap: 12px;">
                    <div style="font-size: 24px; background: #f0f3ff; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">💾</div>
                    <div>
                      <div style="font-size: 15px; font-weight: 600; color: #333; margin-bottom: 4px;">Data Management</div>
                      <div style="font-size: 13px; color: #666;">Full CRUD operations on all records</div>
                    </div>
                  </div>

                  <div style="display: flex; align-items: start; gap: 12px;">
                    <div style="font-size: 24px; background: #f0f3ff; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">🔍</div>
                    <div>
                      <div style="font-size: 15px; font-weight: 600; color: #333; margin-bottom: 4px;">Query Tracking</div>
                      <div style="font-size: 13px; color: #666;">Track and analyze search queries</div>
                    </div>
                  </div>

                  <div style="display: flex; align-items: start; gap: 12px;">
                    <div style="font-size: 24px; background: #f0f3ff; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">📊</div>
                    <div>
                      <div style="font-size: 15px; font-weight: 600; color: #333; margin-bottom: 4px;">Search Type Analysis</div>
                      <div style="font-size: 13px; color: #666;">Categorize and analyze query types</div>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          `,
        };
      },
    },
    assets: {
      scripts: ['/admin-assets/dashboard-button.js'],
    },
    pages: {
      dashboardCharts: {
        label: '📊 View Analytics Dashboard',
        icon: 'ChartLine',
        handler: async (request, response, context) => {
          return {
            text: `
              <div style="padding: 40px; text-align: center;">
                <h1 style="font-size: 32px; margin-bottom: 20px;">📊 Interactive Analytics Dashboard</h1>
                <p style="font-size: 18px; color: #666; margin-bottom: 40px;">Click the button below to view your comprehensive analytics dashboard with interactive charts</p>
                <a href="/dashboard" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px 48px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 18px; box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);">
                  🚀 Open Dashboard with Charts
                </a>
                <p style="margin-top: 40px; color: #999; font-size: 14px;">The dashboard will open in a new tab</p>
              </div>
            `,
          };
        },
      },
    },
    resources: [
      {
        resource: SearchQuery,
        options: {
          navigation: {
            name: 'Search Queries',
            icon: 'Database',
          },
          properties: {
            id: {
              isVisible: { list: true, filter: true, show: true, edit: false },
              position: 1
            },
            keyword: {
              type: 'textarea',
              isVisible: { list: true, filter: true, show: true, edit: true },
              position: 2
            },
            platform_name: {
              isVisible: { list: true, filter: true, show: true, edit: true },
              position: 3
            },
            search_type: {
              isVisible: { list: true, filter: true, show: true, edit: true },
              position: 4
            },
            created_at: {
              isVisible: { list: true, filter: true, show: true, edit: false },
              position: 5
            }
          },
          listProperties: ['id', 'keyword', 'platform_name', 'search_type', 'created_at'],
          filterProperties: ['id', 'keyword', 'platform_name', 'search_type', 'created_at'],
          showProperties: ['id', 'keyword', 'platform_name', 'search_type', 'created_at'],
          editProperties: ['keyword', 'platform_name', 'search_type'],
          sort: {
            sortBy: 'created_at',
            direction: 'desc',
          },
        },
      },
    ],
    rootPath: '/admin',
    branding: {
      companyName: 'INVICTTUS',
      logo: false,
      softwareBrothers: false,
      withMadeWithLove: false,
    },
    locale: {
      translations: {
        en: {
          messages: {
            welcomeOnBoard_title: 'Welcome to Blink_Ai Dashboard!',
            welcomeOnBoard_subtitle: 'Manage your search query data and view analytics for Blink_Ai.',
          },
        },
      },
    },
  };

  const admin = new AdminJS(adminOptions);

  // Serve custom admin assets (e.g., dashboard button script)
  app.use('/admin-assets', express.static(join(__dirname, 'public')));

  // Build authenticated router WITHOUT session config (uses app-level session)
  const adminRouter = buildAuthenticatedRouter(
    admin,
    {
      authenticate,
      cookiePassword: process.env.SESSION_SECRET,
      cookieName: 'adminjs'
    },
    null, // router - let AdminJS create it
    sessionConfig  // Ensure AdminJS uses the same session config (no double sessions)
  );

  app.use(admin.options.rootPath, adminRouter);

  // Body parsing middleware (MUST be after AdminJS router)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Add a custom route in admin for redirecting to dashboard
  app.get('/admin/dashboard-view', (req, res) => {
    res.redirect('/dashboard');
  });

  // Root route redirect to admin login
  app.get('/', (req, res) => {
    res.redirect('/admin');
  });

  // 404 handler (must be after all routes)
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  // Start server
  const protocol = httpsEnabled ? 'https' : 'http';
  const serverFactory = httpsEnabled
    ? () => createHttpsServer(sslOptions, app)
    : () => createHttpServer(app);

  const server = serverFactory().listen(PORT, () => {
    logger.info(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🚀 Server is running successfully!                          ║
║                                                                ║
║   Environment: ${process.env.NODE_ENV || 'development'}                                      ║
║   Port: ${PORT}                                                    ║
║                                                                ║
║   📊 Dashboard:    ${protocol}://localhost:${PORT}/dashboard              ║
║   🔐 Admin Panel:  ${protocol}://localhost:${PORT}${admin.options.rootPath}                    ║
║   💚 Health Check: ${protocol}://localhost:${PORT}/health                 ║
║   📡 API Stats:    ${protocol}://localhost:${PORT}/api/stats              ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
    `);

    if (!httpsEnabled) {
      logger.warn('HTTPS is disabled. COOP/OAC headers are off and browsers will treat the origin as untrusted. Set HTTPS_ENABLED=true with SSL_KEY_PATH and SSL_CERT_PATH to enable HTTPS.');
    }
  });

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal) => {
    logger.info(`\n${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        // Close database connection
        await closeConnection();
        logger.info('All connections closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forcing shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
  });

  return server;
};

start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
