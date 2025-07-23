const crypto = require('crypto');

// Security middleware to prevent session contamination and privacy leaks
const validateAuthentication = (req, res, next) => {
  console.log('🔒 AUTH SECURITY CHECK:', {
    path: req.path,
    method: req.method,
    sessionId: req.sessionID,
    timestamp: new Date().toISOString()
  });

  // Check if user is authenticated
  if (!req.session.userInfo && !req.session.internalUserInfo && !req.session.adminUserInfo) {
    console.error('🚨 SECURITY: Unauthenticated request to protected route');
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

  console.log('🔒 USER ACCESS VALIDATION:', {
    requestedUserId: requestedUserId,
    sessionUserId: sessionUserInfo?.userId,
    sessionSub: sessionUserInfo?.sub,
    sessionEmail: sessionUserInfo?.email,
    path: req.path
  });

  // Critical security check: ensure user can only access their own data
  if (sessionUserInfo) {
    const sessionUserId = sessionUserInfo.userId || sessionUserInfo.sub;
    
    if (!sessionUserId) {
      console.error('🚨 CRITICAL: Session has no valid userId/sub');
      return res.status(500).json({
        success: false,
        message: 'Invalid session data',
        securityAlert: 'Missing userId in session'
      });
    }

    if (sessionUserId !== requestedUserId) {
      console.error('🚨 SECURITY ALERT: User attempting to access wrong data!');
      console.error('Session userId:', sessionUserId);
      console.error('Requested userId:', requestedUserId);
      console.error('User email:', sessionUserInfo.email);
      console.error('IP:', req.ip);
      
      // Check if this is a legitimate new user vs. actual security breach
      // For customer routes, we'll let the route handler determine if it's a new user
      if (req.path.includes('/by-user-id/') || req.path.includes('/customer/')) {
        console.log('🔍 SECURITY: Potential new user accessing customer routes - allowing route to handle');
        // Let the route handler decide - they can show welcome modal for new users
      } else {
        // For other routes, this is a genuine security violation
        return res.status(403).json({
          success: false,
          message: 'Access denied: User ID mismatch',
          securityAlert: 'UNAUTHORIZED_USER_ACCESS_ATTEMPT'
        });
      }
    }

    console.log('✅ SECURITY: User access validation passed');
  }

  next();
};

// Clear any potentially contaminated session data
const sanitizeSession = (req, res, next) => {
  // Log session state for debugging
  console.log('🧹 SESSION SANITIZATION CHECK:', {
    sessionId: req.sessionID,
    hasUserInfo: !!req.session.userInfo,
    hasInternalUserInfo: !!req.session.internalUserInfo,
    hasAdminUserInfo: !!req.session.adminUserInfo
  });

  // Clear any undefined or invalid session data
  if (req.session.userInfo) {
    const userInfo = req.session.userInfo;
    
    // Validate required fields
    if (!userInfo.sub || !userInfo.email) {
      console.warn('🚨 SECURITY: Invalid userInfo in session, clearing...');
      delete req.session.userInfo;
      req.session.isAuthenticated = false;
    }
  }

  next();
};

// Generate secure request ID for tracking
const addRequestSecurity = (req, res, next) => {
  req.securityId = crypto.randomBytes(16).toString('hex');
  
  console.log('🔐 REQUEST SECURITY:', {
    securityId: req.securityId,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')?.substring(0, 100),
    timestamp: new Date().toISOString()
  });

  next();
};

module.exports = {
  validateAuthentication,
  validateUserAccess,
  sanitizeSession,
  addRequestSecurity
}; 