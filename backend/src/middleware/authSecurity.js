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
      console.error('Path:', req.path);
      console.error('Timestamp:', new Date().toISOString());
      
      // CRITICAL SECURITY: Block ALL unauthorized access attempts
      // No exceptions - user can only access their own data
      return res.status(403).json({
        success: false,
        message: 'Access denied: Unauthorized access attempt',
        securityAlert: 'UNAUTHORIZED_USER_ACCESS_BLOCKED',
        details: {
          sessionUserId: sessionUserId,
          requestedUserId: requestedUserId,
          timestamp: new Date().toISOString()
        }
      });
    }

    console.log('✅ SECURITY: User access validation passed');
  }

  next();
};

// Validate that the user is authenticated for welcome form submission
const validateWelcomeFormAccess = (req, res, next) => {
  const sessionUserInfo = req.session.userInfo;

  console.log('🔒 WELCOME FORM ACCESS VALIDATION:', {
    sessionUserId: sessionUserInfo?.userId,
    sessionSub: sessionUserInfo?.sub,
    sessionEmail: sessionUserInfo?.email,
    path: req.path
  });

  // Check if user is authenticated
  if (!sessionUserInfo) {
    console.error('🚨 SECURITY: No user session for welcome form submission');
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      securityAlert: 'NO_USER_SESSION'
    });
  }

  const sessionUserId = sessionUserInfo.userId || sessionUserInfo.sub;
  
  if (!sessionUserId) {
    console.error('🚨 CRITICAL: Session has no valid userId/sub for welcome form');
    return res.status(500).json({
      success: false,
      message: 'Invalid session data',
      securityAlert: 'Missing userId in session'
    });
  }

  console.log('✅ SECURITY: Welcome form access validation passed');
  next();
};

// Validate that the user is authenticated for shop upload operations
const validateShopUploadAccess = (req, res, next) => {
  const sessionUserInfo = req.session.userInfo;

  console.log('🔒 SHOP UPLOAD ACCESS VALIDATION:', {
    sessionUserId: sessionUserInfo?.userId,
    sessionSub: sessionUserInfo?.sub,
    sessionEmail: sessionUserInfo?.email,
    path: req.path,
    shopId: req.params.shopId
  });

  // Check if user is authenticated
  if (!sessionUserInfo) {
    console.error('🚨 SECURITY: No user session for shop upload');
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      securityAlert: 'NO_USER_SESSION'
    });
  }

  const sessionUserId = sessionUserInfo.userId || sessionUserInfo.sub;
  
  if (!sessionUserId) {
    console.error('🚨 CRITICAL: Session has no valid userId/sub for shop upload');
    return res.status(500).json({
      success: false,
      message: 'Invalid session data',
      securityAlert: 'Missing userId in session'
    });
  }

  // For shop uploads, we need to verify that the shop belongs to the authenticated user
  // This will be done in the route handler by looking up the shop in the database
  console.log('✅ SECURITY: Shop upload access validation passed');
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
  validateWelcomeFormAccess,
  validateShopUploadAccess,
  sanitizeSession,
  addRequestSecurity
}; 