# Blink AI Dashboard - Production Ready

A secure, scalable AdminJS-powered dashboard for managing and analyzing search query data with PostgreSQL.

## ✨ Features

### Core Features
- 📊 **Interactive Dashboard**: Real-time analytics with charts, graphs, and visualizations
- 🔐 **Secure Authentication**: Password-protected admin panel with session management
- 🔍 **CRUD Operations**: Full management of search query records
- 📈 **Analytics & Insights**: Timeline charts, search type distribution, and statistics
- 🎨 **Modern UI**: Beautiful, responsive interface with Chart.js visualizations

### Production Features
- 🛡️ **Enterprise Security**: Helmet.js, CORS, rate limiting, input validation
- 📝 **Comprehensive Logging**: Winston-based logging with rotation
- 💪 **High Availability**: Connection pooling, retry logic, graceful shutdown
- 🐳 **Docker Ready**: Full containerization with Docker Compose
- 📦 **CI/CD Pipeline**: GitHub Actions workflow included
- 💚 **Health Checks**: Kubernetes-ready liveness and readiness probes
- ⚡ **Performance**: Compression, optimized database queries, caching support
- 🔄 **Session Management**: PostgreSQL-backed sessions with auto-cleanup

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 12
- npm >= 9.0.0

## Database Table Structure

The application expects a `query_results` table with the following structure (you can adjust the model if your table differs):

```sql
CREATE TABLE query_results (
  id SERIAL PRIMARY KEY,
  query TEXT,
  result JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  executed_at TIMESTAMP,
  execution_time FLOAT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 📦 Installation

### Option 1: Development Setup

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd Testdashboard

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env
# Edit .env with your configuration

# 4. Start development server
npm run dev
```

### Option 2: Docker Setup (Recommended for Production)

```bash
# 1. Create .env file with your configuration
cp .env.example .env

# 2. Start all services
docker-compose up -d

# 3. View logs
docker-compose logs -f app
```

### Option 3: Production Deployment

See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) for comprehensive production setup instructions.

## ⚙️ Configuration

### Required Environment Variables

Create a `.env` file with the following:

```env
# Server Configuration
NODE_ENV=production
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_username
DB_PASSWORD=your_secure_password

# Security (CRITICAL - Change these!)
SESSION_SECRET=generate-a-secure-random-string-min-32-chars
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=YourStrongPassword123!

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

**Generate secure SESSION_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 🎯 Usage

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run prod
```

### Access Points

- **Dashboard**: http://localhost:3000/dashboard
- **Admin Panel**: http://localhost:3000/admin
- **API Stats**: http://localhost:3000/api/stats
- **Health Check**: http://localhost:3000/health

## 📁 Project Structure

```
├── middleware/
│   ├── auth.js                 # Authentication middleware
│   ├── error-handler.js        # Error handling middleware
│   └── security.js             # Security middleware (CORS, Helmet, Rate limiting)
├── models/
│   └── QueryResult.js          # Sequelize model for search queries
├── routes/
│   └── health.js               # Health check endpoints
├── scripts/
│   ├── setup-production.sh     # Production setup automation
│   ├── backup-db.sh            # Database backup script
│   └── health-check.sh         # Health monitoring script
├── utils/
│   ├── logger.js               # Winston logger configuration
│   └── env-validator.js        # Environment validation with Joi
├── .github/
│   └── workflows/
│       └── ci-cd.yml           # CI/CD pipeline
├── database.js                 # Database connection with retry logic
├── server.js                   # Main application server
├── Dockerfile                  # Multi-stage Docker build
├── docker-compose.yml          # Docker Compose configuration
├── nginx.conf                  # Nginx reverse proxy config
├── ecosystem.config.cjs        # PM2 configuration
├── dashboard-app.service       # Systemd service file
├── .env.example                # Example environment variables
├── PRODUCTION_DEPLOYMENT.md    # Detailed deployment guide
└── package.json                # Dependencies and scripts
```

## Features Explained

### Dashboard
- **Total Queries**: Shows the total number of records in the database
- **Successful Queries**: Count of queries with 'success' status
- **Failed Queries**: Count of queries with 'failed' status
- **Pending Queries**: Count of queries with 'pending' status
- **Average Execution Time**: Average time taken for query execution
- **Success Rate**: Percentage of successful queries

### Query Results Management
- View all query results in a paginated table
- Filter by status, date, and other fields
- Edit existing records
- Create new query result entries
- Delete records
- View detailed information for each query

## Customization

### Modify the Model
If your `query_results` table has different columns, edit `models/QueryResult.js` to match your schema.

### Customize the Dashboard
Edit `components/Dashboard.jsx` to add more charts, statistics, or custom visualizations.

### Change Branding
In `server.js`, update the `branding` section:

```javascript
branding: {
  companyName: 'Your Company Name',
  logo: 'path/to/logo.png',
  // ...
}
```

## Troubleshooting

### Cannot connect to database
- Verify PostgreSQL is running
- Check your `.env` credentials are correct
- Ensure the database exists
- Verify network connectivity to the database server

### Table not found
- Make sure the `query_results` table exists in your database
- Run the SQL CREATE TABLE command if needed
- Check table name matches exactly (case-sensitive)

### Port already in use
- Change the `PORT` in `.env` file
- Or kill the process using port 3000

## 🔒 Security Features

- ✅ **Authentication**: Argon2-hashed passwords for admin access
- ✅ **Session Management**: Secure PostgreSQL-backed sessions
- ✅ **Security Headers**: Helmet.js with strict CSP policies
- ✅ **CORS Protection**: Configurable allowed origins
- ✅ **Rate Limiting**: API and authentication endpoint protection
- ✅ **Input Validation**: Joi-based environment validation
- ✅ **SQL Injection Protection**: Parameterized queries via Sequelize
- ✅ **XSS Protection**: Express validator and sanitization
- ✅ **Error Handling**: Safe error messages (no stack traces in production)

## 📊 Monitoring & Health Checks

### Health Check Endpoints

```bash
# Overall health status
curl http://localhost:3000/health

# Kubernetes readiness probe
curl http://localhost:3000/ready

# Kubernetes liveness probe
curl http://localhost:3000/live
```

### Logs

Application logs are stored in `./logs/`:
- `combined.log` - All application logs
- `error.log` - Error logs only
- `exceptions.log` - Uncaught exceptions
- `rejections.log` - Unhandled promise rejections

### Monitoring with PM2

```bash
pm2 monit              # Real-time monitoring
pm2 logs dashboard-app # View logs
pm2 status             # Check status
```

## 🚀 Deployment Options

### Docker Deployment
```bash
docker-compose up -d
```

### PM2 Deployment
```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
```

### Systemd Service
```bash
sudo cp dashboard-app.service /etc/systemd/system/
sudo systemctl enable dashboard-app
sudo systemctl start dashboard-app
```

### Cloud Platforms
- **Heroku**: Push to deploy
- **AWS EC2**: Use provided scripts
- **DigitalOcean**: App Platform integration
- **Google Cloud Run**: Container-based deployment

See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) for detailed instructions.

## 🛠️ Development

### Scripts

```bash
npm start           # Start production server
npm run dev         # Start development server with nodemon
npm run prod        # Start with production environment
```

### Adding Features

1. Create new routes in `routes/`
2. Add middleware in `middleware/`
3. Update models in `models/`
4. Configure in `server.js`

## 🔧 Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
psql -h localhost -U your_user -d your_db
```

**Port Already in Use**
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

**Admin Login Not Working**
- Verify ADMIN_EMAIL and ADMIN_PASSWORD in .env
- Check logs: `tail -f logs/combined.log`
- Ensure SESSION_SECRET is set

For more troubleshooting, see [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md#troubleshooting).

## 📦 Dependencies

### Core
- **express** - Web framework
- **adminjs** - Admin panel framework
- **sequelize** - PostgreSQL ORM
- **pg** - PostgreSQL client

### Security
- **helmet** - Security headers
- **cors** - CORS configuration
- **express-rate-limit** - Rate limiting
- **argon2** - Password hashing
- **express-validator** - Input validation

### Utilities
- **winston** - Logging
- **joi** - Environment validation
- **compression** - Response compression
- **morgan** - HTTP request logging

## 📄 License

ISC

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

- **Documentation**: See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)
- **Health Check**: `/health` endpoint
- **Logs**: `./logs/` directory
- **AdminJS Docs**: https://docs.adminjs.co/

## ⚠️ Important Notes

1. **Change Default Credentials**: Always change ADMIN_EMAIL and ADMIN_PASSWORD before deploying
2. **Generate Secure Secrets**: Use cryptographically secure random strings for SESSION_SECRET
3. **Enable HTTPS**: Use SSL/TLS certificates in production
4. **Regular Backups**: Setup automated database backups (script provided)
5. **Monitor Logs**: Regularly check application and error logs
6. **Update Dependencies**: Keep packages updated for security patches

## 🎯 Production Checklist

Before deploying to production:

- [ ] Changed all default passwords
- [ ] Generated secure SESSION_SECRET
- [ ] Configured ALLOWED_ORIGINS
- [ ] Setup SSL/TLS certificates
- [ ] Configured firewall rules
- [ ] Setup database backups
- [ ] Configured monitoring/alerting
- [ ] Tested health check endpoints
- [ ] Reviewed security settings
- [ ] Updated environment variables

---

Built with ❤️ using AdminJS, Express, and PostgreSQL


