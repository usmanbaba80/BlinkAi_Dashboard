import { Router } from 'express';
import argon2 from 'argon2';
import logger from '../utils/logger.js';

// Admin user model (simplified - in production, store in database)
const adminUsers = [];

// Initialize admin user from environment variables
export const initializeAdminUser = async () => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    logger.error('Admin credentials not set in environment variables');
    throw new Error('Admin credentials not configured');
  }

  // Hash the password
  const hashedPassword = await argon2.hash(adminPassword);

  adminUsers.push({
    email: adminEmail,
    password: hashedPassword,
    role: 'admin'
  });

  logger.info('Admin user initialized');
};

// Authenticate admin user
export const authenticate = async (email, password) => {
  const user = adminUsers.find(u => u.email === email);
  
  if (!user) {
    return null;
  }

  try {
    const isValid = await argon2.verify(user.password, password);
    if (isValid) {
      return {
        email: user.email,
        role: user.role
      };
    }
  } catch (error) {
    logger.error('Error during authentication:', error);
  }

  return null;
};

// Build authentication configuration for AdminJS
export const buildAuthConfig = () => {
  return {
    authenticate,
    cookiePassword: process.env.SESSION_SECRET,
    cookieName: 'adminjs',
  };
};

// Helper to check if user is authenticated via session
const checkAuth = (req) => {
  if (!req.session) {
    logger.info('Auth check - no session found');
    return false;
  }

  const isAuthenticated = !!(
    req.session.adminUser ||
    req.session.adminjs ||
    (req.session.passport && req.session.passport.user)
  );

  logger.info(
    `Auth check - session keys: ${JSON.stringify(Object.keys(req.session))}, authenticated: ${isAuthenticated}`
  );

  return isAuthenticated;
};

// Middleware to check if user is authenticated (for API routes)
export const requireAuth = (req, res, next) => {
  if (checkAuth(req)) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
};

// Middleware to check if user is authenticated (for HTML pages)
export const requireAuthWeb = (req, res, next) => {
  if (checkAuth(req)) {
    return next();
  }
  // Redirect to admin login page
  res.redirect('/admin/login');
};
