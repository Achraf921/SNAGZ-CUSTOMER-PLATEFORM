const crypto = require('crypto');
const { logger } = require('../utils/secureLogger');

// Security middleware to prevent session contamination and privacy leaks
const validateAuthentication = (req, res, next) => {
  logger.debug('Auth security check for protected route', {
    path: req.path,
    method: req.method
  });

  // Check if user is authenticated
  if (!req.session.userInfo && !req.session.internalUserInfo && !req.session.adminUserInfo) {
    logger.security('Unauthenticated request to protected route', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      securityAlert: 'Unauthenticated access attempt'
    });
  }

  next();
};

// Validate that the authenticated user matches the requested userId  
const validateUserAccess = (req, res, next) => {
  const requestedUserId = req.params.userId;
  const sessionUserInfo = req.session.userInfo;

  logger.debug('User access validation check', {
    path: req.path,
    hasSession: !!sessionUserInfo
  });

  // Critical security check: ensure user can only access their own data
  if (sessionUserInfo) {
    const sessionUserId = sessionUserInfo.userId || sessionUserInfo.sub;
    
    if (!sessionUserId) {
      logger.error('CRITICAL: Session has no valid userId/sub');
      return res.status(500).json({
        success: false,
        message: 'Invalid session data',
        securityAlert: 'Missing userId in session'
      });
    }

    if (sessionUserId !== requestedUserId) {
      logger.security('UNAUTHORIZED ACCESS ATTEMPT BLOCKED', {
        path: req.path,
        ip: req.ip,
        sessionUserId: logger.maskUserId(sessionUserId),
        requestedUserId: logger.maskUserId(requestedUserId)
      });
      
      // CRITICAL SECURITY: Block ALL unauthorized access attempts
      return res.status(403).json({
        success: false,
        message: 'Access denied: Unauthorized access attempt',
        securityAlert: 'UNAUTHORIZED_USER_ACCESS_BLOCKED'
      });
    }

    logger.debug('User access validation passed');
  }

  next();
};

// Clear any potentially contaminated session data
const sanitizeSession = (req, res, next) => {
  logger.debug('Session sanitization check', {
    hasUserInfo: !!req.session.userInfo,
    hasInternalUserInfo: !!req.session.internalUserInfo,
    hasAdminUserInfo: !!req.session.adminUserInfo
  });

  // Clear any undefined or invalid session data
  if (req.session.userInfo) {
    const userInfo = req.session.userInfo;
    
    // Validate required fields
    if (!userInfo.sub || !userInfo.email) {
      logger.warn('Invalid userInfo in session, clearing session');
      delete req.session.userInfo;
      req.session.isAuthenticated = false;
    }
  }

  next();
};

// Generate secure request ID for tracking
const addRequestSecurity = (req, res, next) => {
  req.securityId = crypto.randomBytes(16).toString('hex');
  
  logger.debug('Request security ID assigned', {
    path: req.path,
    method: req.method
  });

  next();
};

module.exports = {
  validateAuthentication,
  validateUserAccess,
  sanitizeSession,
  addRequestSecurity
}; 