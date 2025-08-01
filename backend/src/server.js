// Load environment variables from .env file at the root of the backend directory
require('dotenv').config();

// Load secure logger first
const { logger } = require('./utils/secureLogger');

// SECURITY: Environment variables loaded (not logged for security)
logger.debug('--- Environment Configuration Loaded ---');


logger.debug('Starting server.js...');
logger.debug('Current working directory:', process.cwd());
logger.debug('NODE_ENV:', process.env.NODE_ENV);

logger.debug('Loading express...');
const express = require('express');
logger.debug('Express loaded');

logger.debug('Loading cors...');
const cors = require('cors');
logger.debug('CORS loaded');

logger.debug('Loading helmet...');
const helmet = require('helmet');
logger.debug('Helmet loaded');

logger.debug('Loading morgan...');
const morgan = require('morgan');
logger.debug('Morgan loaded');

logger.debug('Loading path...');
const path = require('path');
logger.debug('Path loaded');

logger.debug('Loading HTTPS middleware...');
const httpsRedirect = require('./middleware/httpsRedirect');
const securityHeaders = require('./middleware/securityHeaders');
const { getSSLOptions } = require('./config/ssl');
logger.debug('HTTPS middleware loaded');

logger.debug('Loading session...');
const session = require('express-session');
logger.debug('Session loaded');

logger.debug('Loading rate limit...');
const rateLimit = require('express-rate-limit');
logger.debug('Rate limit loaded');

logger.debug('Loading AWS SDK v3 Cognito Client...');
const { CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand, GetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
logger.debug('Cognito Client loaded');

logger.debug('Loading crypto...');
const crypto = require('crypto');
logger.debug('Crypto loaded');

logger.debug('Loading database config...');
const { connectToDatabase } = require('./config/db');
logger.debug('Database config loaded');

const captchaService = require('./services/captchaService');
logger.debug('CAPTCHA service loaded');

// Import and log each route loading step
logger.debug('Loading customer routes...');
logger.debug('Customer routes loaded');
logger.debug('Loading shopify routes...');
logger.debug('Shopify routes loaded');
logger.debug('Loading internal routes...');
// Module loading (debug info removed)
logger.debug('Internal routes loaded');
logger.debug('Loading accounts routes...');
logger.debug('Accounts routes loaded');
logger.debug('Statistics routes loaded');
logger.debug('Auth routes loaded');
logger.debug('Password reset routes loaded');

// const { Issuer, generators } = require('openid-client'); // No longer needed for login
// const crypto = require('crypto'); // Added crypto module for SECRET_HASH
// const { connectToDatabase } = require('./config/db'); // MongoDB connection

// Routes
// const authRoutes = require('./routes/auth');

const app = express();
// const ADMIN_CALLBACK_PATH = '/auth/cognito/callback-admin';

// Configure AWS SDK v3 Cognito Client
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });

// Helper function to calculate SecretHash
const calculateSecretHash = (username, clientId, clientSecret) => {
  const message = Buffer.from(username + clientId, 'utf-8');
  const key = Buffer.from(clientSecret, 'utf-8');
  return crypto.createHmac('sha256', key).update(message).digest('base64');
};

// **NEW: Global request logger**
app.use((req, res, next) => {
  logger.debug(`Incoming Request: ${req.method} ${req.originalUrl}`);
  next();
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": [
        "'self'", 
        "'unsafe-inline'", 
        "'unsafe-eval'",
        "https://www.google.com",
        "https://www.gstatic.com"
      ],
      "frame-src": [
        "'self'", 
        "https://www.google.com"
      ],
      "style-src": [
        "'self'", 
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      "font-src": [
        "'self'",
        "https://fonts.gstatic.com"
      ],
      "connect-src": [
        "'self'",
        "https://www.google.com"
      ],
      "img-src": [
        "'self'", 
        "data:", 
        "https:",
        "https://snagz.s3.eu-north-1.amazonaws.com"
      ]
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "same-origin" },
  hidePoweredBy: true
})); // Basic security headers

// Apply HTTPS redirect first (before other middleware)
app.use(httpsRedirect);

// Apply comprehensive security headers
app.use(securityHeaders);

// Configure CORS - Simple configuration that was working before
app.use(cors());
app.use(morgan('dev')); // Request logging

// Session middleware MUST come before upload routes for authentication
app.use(session({
    secret: process.env.SESSION_SECRET || 'your strong secret here for production', // Use env var
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS !== 'false', // Auto-enable secure cookies in production
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // CSRF protection
      maxAge: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    },
    name: 'sna-gz-session' // Custom session name for better identification
}));

// MOUNT UPLOAD ROUTES BEFORE BODY PARSERS TO AVOID STREAM CONFLICTS
logger.debug('🔧 [MIDDLEWARE] Mounting upload routes before body parsers...');
const customerUploadRoutes = require('./routes/customerUpload');
app.use('/api/customer', customerUploadRoutes);

// Mount internal upload routes before body parsers as well
const internalUploadRoutes = require('./routes/internalUpload');
app.use('/api/internal', internalUploadRoutes);
logger.debug('🔧 [MIDDLEWARE] Upload routes mounted successfully');

// Conditional body parsing - skip for upload routes that handle raw streams
app.use((req, res, next) => {
  if (req.skipBodyParsing) {
    logger.debug(`⏭️ [BODY PARSER] Skipping body parsing for: ${req.url}`);
    return next();
  }
  next();
});

// Apply body parsers conditionally (skip for upload routes)
app.use((req, res, next) => {
  // Skip body parsing for upload routes - check specific upload patterns
  const uploadPatterns = [
    '/upload',
    '/upload-image',
    '/upload-images',
    '/upload-logo',
    '/upload-banner',
    '/upload-favicon'
  ];
  
  const shouldSkip = uploadPatterns.some(pattern => req.path.includes(pattern));
  
  if (shouldSkip) {
    logger.debug(`⏭️ [BODY PARSER] Skipping JSON parsing for upload route: ${req.path}`);
    return next();
  }
  
  express.json({ limit: '50mb' })(req, res, next);
});

app.use((req, res, next) => {
  // Skip body parsing for upload routes - check specific upload patterns
  const uploadPatterns = [
    '/upload',
    '/upload-image',
    '/upload-images',
    '/upload-logo',
    '/upload-banner',
    '/upload-favicon'
  ];
  
  const shouldSkip = uploadPatterns.some(pattern => req.path.includes(pattern));
  
  if (shouldSkip) {
    logger.debug(`⏭️ [BODY PARSER] Skipping URL-encoded parsing for upload route: ${req.path}`);
    return next();
  }
  
  express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
});

// Rate limiting for API routes to prevent abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 500 : 5000, // Increased production limit for safety
  message: {
    success: false,
    message: 'Too many API requests, please try again later.',
    securityAlert: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.debug(`[RATE LIMIT] API rate limit exceeded for ${req.ip} on ${req.originalUrl}`);
    logger.debug(`[RATE LIMIT] Current environment: ${process.env.NODE_ENV || 'undefined'}`);
    logger.debug(`[RATE LIMIT] Request count limit: ${process.env.NODE_ENV === 'production' ? 500 : 5000}`);
    res.status(429).json({
      success: false,
      message: 'Too many API requests, please try again later.',
      securityAlert: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

// Stricter rate limiting for sensitive operations
const strictApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 150 : 1000, // Increased production limit for safety
  message: {
    success: false,
    message: 'Too many requests to sensitive endpoint, please try again later.',
    securityAlert: 'SENSITIVE_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.debug(`[RATE LIMIT] Sensitive endpoint rate limit exceeded for ${req.ip} on ${req.originalUrl}`);
    logger.debug(`[RATE LIMIT] Current environment: ${process.env.NODE_ENV || 'undefined'}`);
    logger.debug(`[RATE LIMIT] Sensitive request count limit: ${process.env.NODE_ENV === 'production' ? 150 : 1000}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests to sensitive endpoint, please try again later.',
      securityAlert: 'SENSITIVE_RATE_LIMIT_EXCEEDED'
    });
  }
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Rate limit status endpoint for debugging
app.get('/api/rate-limit-status', (req, res) => {
  const clientIP = req.ip;
  const rateLimitInfo = {
    clientIP,
    environment: process.env.NODE_ENV || 'development',
    generalLimit: process.env.NODE_ENV === 'production' ? 500 : 5000,
    sensitiveLimit: process.env.NODE_ENV === 'production' ? 150 : 1000,
    windowMs: '15 minutes',
    rateLimitDisabled: process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMIT === 'true'
  };
  
  res.json({
    success: true,
    rateLimitInfo,
    message: 'Rate limit configuration info'
  });
});

// Development: Add option to disable rate limiting for debugging
if (process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMIT === 'true') {
  logger.info("DEV: Rate limiting disabled for development");
} else {
  logger.debug(`[RATE LIMIT] API rate limiting enabled - General: ${process.env.NODE_ENV === 'production' ? 500 : 5000} req/15min, Sensitive: ${process.env.NODE_ENV === 'production' ? 150 : 1000} req/15min`);
}

// Apply stricter rate limiting to sensitive endpoints
app.use('/api/internal/all-shops', strictApiLimiter);
app.use('/api/internal/all-products', strictApiLimiter);
app.use('/api/customer/all-shops', strictApiLimiter);
app.use('/api/customer/all-products', strictApiLimiter);
app.use('/api/accounts', strictApiLimiter);
app.use('/api/statistics', strictApiLimiter);

// Extra protection for credential and config endpoints
app.use('/api/internal/config/', strictApiLimiter);
app.use('/api/internal/shops/:shopId/api-credentials', strictApiLimiter);
app.use('/api/password-reset/stats', strictApiLimiter);

// Security headers for API responses
app.use('/api/', (req, res, next) => {
  // Prevent caching of sensitive API responses
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Additional security headers for API
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  
  next();
});

// File upload middleware removed - multer handles uploads in individual routes

// Setup view engine (EJS)
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));

// Middleware to require client authentication
const requireClientAuth = (req, res, next) => {
    if (!req.session.userInfo) {
    logger.debug('[AUTH] Client access denied. Redirecting to / for path:', req.originalUrl);
    // Redirect to the frontend login page, not a backend route directly if it's just serving HTML
    return res.redirect('/'); // Or specific client login page like /client-login-page
  }
  logger.debug('[AUTH] Client access granted for path:', req.originalUrl);
  next();
};

// Middleware to require internal personnel authentication
const requireInternalAuth = (req, res, next) => {
  if (!req.session.internalUserInfo) {
    logger.debug('[AUTH] Internal access denied. Redirecting to / for path:', req.originalUrl);
    // Redirect to the main page, which will show login options
    return res.redirect('/'); 
  }
  logger.debug('[AUTH] Internal access granted for path:', req.originalUrl);
  next();
};

// Middleware to require admin authentication
const requireAdminAuth = (req, res, next) => {
  if (!req.session.adminUserInfo) {
    logger.debug('[AUTH] Admin access denied. Redirecting to / for path:', req.originalUrl);
    // Redirect to the main page, which will show login options
    return res.redirect('/');
  }
  logger.debug('[AUTH] Admin access granted for path:', req.originalUrl);
    next();
};

// API Authentication Middleware - Returns JSON instead of redirects
const requireInternalAPIAuth = (req, res, next) => {
  if (!req.session.internalUserInfo) {
    logger.debug(`[API AUTH] Internal API access denied for: ${req.originalUrl}`);
    return res.status(401).json({
      success: false,
      message: 'Authentication required - Internal personnel access only',
      securityAlert: 'UNAUTHORIZED_API_ACCESS'
    });
  }
  logger.debug(`[API AUTH] Internal API access granted for: ${req.originalUrl}`);
  next();
};

const requireClientAPIAuth = (req, res, next) => {
  // DEBUG: Log session information for API calls
  logger.debug("Client API auth check");

  // Allow internal users to access customer data for management
  if (req.session.internalUserInfo) {
    logger.debug(`[API AUTH] Internal user accessing customer API: ${req.originalUrl}`);
    return next();
  }
  
  // Otherwise require client authentication
  if (!req.session.userInfo) {
    logger.debug(`[API AUTH] Client API access denied for: ${req.originalUrl}`);
    return res.status(401).json({
      success: false,
      message: 'Authentication required - Client access only',
      securityAlert: 'UNAUTHORIZED_API_ACCESS'
    });
  }
  logger.debug(`[API AUTH] Client API access granted for: ${req.originalUrl}`);
  next();
};

const requireAdminAPIAuth = (req, res, next) => {
  // Allow internal users to access admin functions for account management
  if (req.session.internalUserInfo) {
    logger.debug(`[API AUTH] Internal user accessing admin API: ${req.originalUrl}`);
    return next();
  }
  
  // Otherwise require admin authentication
  if (!req.session.adminUserInfo) {
    logger.debug(`[API AUTH] Admin API access denied for: ${req.originalUrl}`);
    return res.status(401).json({
      success: false,
      message: 'Authentication required - Admin access only',
      securityAlert: 'UNAUTHORIZED_API_ACCESS'
    });
  }
  logger.debug(`[API AUTH] Admin API access granted for: ${req.originalUrl}`);
  next();
};

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../../frontend/build')));

// Security middleware to prevent direct URL access to sensitive routes
// MUST be placed BEFORE route registration to intercept API requests
app.use((req, res, next) => {
  logger.debug(`🔍 [SECURITY] Middleware executed for: ${req.method} ${req.path}`);
  
  const sensitiveRoutes = [
    '/api/internal/',
    '/api/customer/',
    '/api/accounts/',
    '/api/statistics/',
    '/api/shopify/'
  ];
  
  // Check if request is to a sensitive API route
  const isSensitiveRoute = sensitiveRoutes.some(route => req.path.startsWith(route));
  
  if (isSensitiveRoute) {
    logger.debug(`🔍 [SECURITY] API request to: ${req.path} from IP: ${req.ip}`);
    
    // Check for legitimate AJAX request indicators
    const hasCredentials = req.headers.cookie; // Session cookie present
    const hasJsonContentType = req.headers['content-type']?.includes('application/json');
    const hasFetchHeaders = req.headers['sec-fetch-mode'] === 'cors' || 
                           req.headers['sec-fetch-dest'] === 'empty';
    const hasRefererFromApp = req.headers.referer?.includes('localhost:3000');
    const acceptsJson = req.headers.accept?.includes('application/json');
    
    // Direct browser access indicators
    const acceptsHtml = req.headers.accept?.includes('text/html');
    const isNavigateRequest = req.headers['sec-fetch-mode'] === 'navigate';
    const hasNoCacheBuster = !req.query._ && !req.headers['cache-control']?.includes('no-cache');
    
    // DEBUG: Log request details for troubleshooting
    logger.debug("Security validation");
    
    // Block if it looks like direct browser navigation
    const isDirectBrowserAccess = req.method === 'GET' && 
      acceptsHtml && 
      isNavigateRequest && 
      !hasRefererFromApp &&
      !acceptsJson;
    
    if (isDirectBrowserAccess) {
      logger.debug(`🚨 [SECURITY] Blocking direct browser access to API: ${req.path}`);
      logger.security("Security validation failed");
      return res.status(403).json({
        success: false,
        message: 'Direct API access not allowed. Please use the application interface.',
        securityAlert: 'DIRECT_API_ACCESS_BLOCKED'
      });
    }
    
    // Log legitimate but unauthenticated access attempts  
    const hasValidSession = req.session.internalUserInfo || req.session.userInfo || req.session.adminUserInfo;
    if (!hasValidSession) {
      logger.debug(`🚨 [SECURITY] Unauthenticated API access attempt to: ${req.path}`);
    }
  }
  
  next();
});

// API Routes with Authentication
logger.debug('🔍 [DEBUG] Registering API routes...');
app.use('/api/customer', requireClientAPIAuth, require('./routes/customer'));
logger.debug('🔍 [DEBUG] Customer routes registered');
app.use('/api/shopify', requireInternalAPIAuth, require('./routes/shopify'));
logger.debug('🔍 [DEBUG] Shopify routes registered');
app.use('/api/internal', requireInternalAPIAuth, require('./routes/internal'));
logger.debug('🔍 [DEBUG] Internal routes registered');
app.use('/api/accounts', requireAdminAPIAuth, require('./routes/accounts'));
logger.debug('🔍 [DEBUG] Accounts routes registered');
app.use('/api/statistics', requireInternalAPIAuth, require('./routes/statistics'));
logger.debug('🔍 [DEBUG] Statistics routes registered');

// Mixed authentication routes (some endpoints need auth, others don't)
const authRoutes = require('./routes/auth');
const passwordResetRoutes = require('./routes/passwordReset');

// Auth routes - change-password needs session auth, others are public
app.use('/api/auth', (req, res, next) => {
  logger.debug(`🔍 [AUTH ROUTES] Request to: ${req.method} ${req.path}`);
  // This endpoint requires authentication (any user type)
  if (req.path === '/change-password' && !req.session.userInfo && !req.session.internalUserInfo && !req.session.adminUserInfo) {
    logger.debug(`🔍 [AUTH ROUTES] Unauthorized access attempt to change-password`);
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      securityAlert: 'UNAUTHENTICATED_PASSWORD_CHANGE_ATTEMPT'
    });
  }
  next();
}, authRoutes);

// Password reset routes - public endpoints with reCAPTCHA protection  
app.use('/api/password-reset', passwordResetRoutes);

// Add special protection for password reset stats (internal only)
app.get('/api/password-reset/stats', requireInternalAPIAuth, (req, res, next) => {
  next();
});

// Health check endpoint (public)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Add debug logging for route registration
logger.debug('Registered routes:');
logger.debug('- POST /api/customer/shop/:shopId/documentation');
logger.debug('- GET /api/customer/shop/:shopId/documentation');
logger.debug('- GET /api/internal/clients/:clientId');

// Add CORS headers for preflight requests
app.options('/api/customer/shop/:shopId/documentation', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).send();
});

// SECURITY: Environment variables loaded (not logged for security)
logger.debug('Environment Variables: Loaded');

// Connect to MongoDB when the server starts
connectToDatabase()
  .then(() => {
    logger.debug('MongoDB connection established');
  })
  .catch(err => {
    logger.error('Failed to connect to MongoDB:', err);
  });

// Auth routes
// app.use('/api/auth', authRoutes);

// Import routes
// app.use('/api/shops', require('./routes/shops'));
// app.use('/api/users', require('./routes/users'));
// We'll uncomment these as we create the route files

// Error handling middleware for API routes
app.use('/api', (err, req, res, next) => {
  logger.error('🔍 [ERROR HANDLER] API Error caught:', err);
  logger.error('🔍 [ERROR HANDLER] Request path:', req.path);
  logger.error('🔍 [ERROR HANDLER] Error stack:', err.stack);
  res.status(500).json({ 
    status: 'error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Catch-all error handler for any unhandled errors
app.use((err, req, res, next) => {
  logger.error('🔍 [CATCH-ALL ERROR] Unhandled error:', err);
  logger.error('🔍 [CATCH-ALL ERROR] Request path:', req.path);
  logger.error('🔍 [CATCH-ALL ERROR] Error stack:', err.stack);
  
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  }
  
  // For non-API routes, send a generic error page
  res.status(500).send('Something went wrong');
});

// Background token revocation function for enhanced security
async function revokeCognitoTokens(accessToken, clientId, clientSecret) {
    if (!accessToken || !clientId || !clientSecret) {
        return;
    }
    
    try {
        const { RevokeTokenCommand } = require('@aws-sdk/client-cognito-identity-provider');
        
        const revokeParams = {
            Token: accessToken,
            ClientId: clientId,
            ClientSecret: clientSecret
        };
        
        const command = new RevokeTokenCommand(revokeParams);
        await cognitoClient.send(command);
        logger.debug('Background token revocation successful');
    } catch (error) {
        logger.debug('Background token revocation failed (non-critical):', error.message);
    }
}

// Client Portal Login Route - MODIFIED for custom form POST
app.post('/login-client', async (req, res) => {
    const { email, password, captchaToken } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    // Verify CAPTCHA
    const captchaValidation = await captchaService.validateCaptchaForAPI(captchaToken, req.ip);
    if (!captchaValidation.isValid) {
        return res.status(captchaValidation.statusCode).json(captchaValidation.response);
    }

    const clientId = process.env.COGNITO_CLIENT_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_CLIENT_APP_SECRET;

    if (!clientId || !clientSecret) {
        logger.error('[/login-client] Client ID or Client Secret not configured in .env for client portal.');
        return res.status(500).json({ success: false, message: 'Server configuration error.' });
    }

    const authParameters = {
        USERNAME: email,
        PASSWORD: password,
    };

    try {
        authParameters.SECRET_HASH = calculateSecretHash(email, clientId, clientSecret);

        const params = {
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: clientId,
            AuthParameters: authParameters,
        };

        const command = new InitiateAuthCommand(params);
        const authResult = await cognitoClient.send(command);
        
        if (authResult.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
            logger.debug('[/login-client] NEW_PASSWORD_REQUIRED challenge for user:', email);
            return res.json({
                success: false, // Not fully authenticated yet
                challengeName: 'NEW_PASSWORD_REQUIRED',
                session: authResult.Session,
                username: email, // Pass username back to client
                challengeParameters: authResult.ChallengeParameters
            });
        } else if (authResult.AuthenticationResult) {
            // User authenticated, now get user details
            const accessToken = authResult.AuthenticationResult.AccessToken;
            const userDetailsParams = { AccessToken: accessToken };
            const userDetails = await cognitoClient.send(new GetUserCommand(userDetailsParams));

            const userInfo = {};
            userDetails.UserAttributes.forEach(attr => {
                userInfo[attr.Name] = attr.Value;
            });
            userInfo.username = userDetails.Username;
            
            // Extract and log all potential identifiers from userInfo
            // Debug info removed for security
            logger.debug('Raw userInfo:', JSON.stringify(userInfo, null, 2));
            logger.debug('userInfo.sub:', userInfo.sub);
            logger.debug('userInfo.username:', userInfo.username);
            logger.debug('userDetails.Username:', userDetails.Username);
            
            // Use the sub attribute as the userId
            // This is a unique identifier from Cognito that won't change
            const userId = userInfo.sub;
            userInfo.userId = userId;
            
            // Store access token for logout revocation
            userInfo.accessToken = accessToken;
            
            // Log the userId (sub) being used
            logger.debug('FINAL userId (from sub):', userId);
            // Debug info removed for security

            req.session.userInfo = userInfo;
            req.session.isAuthenticated = true;

            // Explicitly save the session to ensure it persists
            req.session.save((err) => {
                if (err) {
                    logger.error('[/login-client] Session save error:', err);
                    return res.status(500).json({ success: false, message: 'Session save failed.' });
                }

                logger.debug('[/login-client] Client login successful for:', email);
                return res.json({ success: true, redirectUrl: '/client/dashboard', userInfo });
            });
        } else {
            logger.error('[/login-client] Cognito initiateAuth unexpected result for:', email, authResult);
            return res.status(401).json({ success: false, message: 'Authentication failed. Please check credentials or server logs.' });
        }
    } catch (error) {
        logger.error('[/login-client] Error during client authentication for:', email, error);
        logger.error("Authentication error occurred");
        
        let message = 'Échec de l\'authentification. Veuillez vérifier vos identifiants.';
        if (error.code === 'NotAuthorizedException' || error.__type === 'NotAuthorizedException') {
            message = 'Nom d\'utilisateur ou mot de passe incorrect.';
            logger.info("/login-client: Setting NotAuthorizedException message");
        } else if (error.code === 'UserNotFoundException' || error.__type === 'UserNotFoundException') {
            message = 'Utilisateur inexistant.';
            logger.info("/login-client: Setting UserNotFoundException message");
        } else if (error.code === 'UserNotConfirmedException' || error.__type === 'UserNotConfirmedException') {
            message = 'Compte utilisateur non confirmé. Veuillez vérifier votre email pour confirmer votre compte.';
            logger.info("/login-client: Setting UserNotConfirmedException message");
        } else if (error.code === 'InvalidParameterException' && error.message.includes('USER_PASSWORD_AUTH flow not enabled')) {
            message = 'Flux d\'authentification non activé pour ce client. Veuillez contacter le support.';
            logger.info("/login-client: Setting InvalidParameterException message");
        }
        
        logger.debug('[/login-client] Final error message:', message);
        // Do not specifically mention NEW_PASSWORD_REQUIRED here as an error, it's handled above.
        return res.status(401).json({ success: false, message });
    }
});

// Client Portal Logout Route
app.get('/logout', (req, res) => {
    const cognitoDomain = process.env.COGNITO_CLIENT_DOMAIN; // e.g., your-domain.auth.region.amazoncognito.com
    const clientId = process.env.COGNITO_CLIENT_APP_CLIENT_ID; 
    const clientSecret = process.env.COGNITO_CLIENT_APP_SECRET;
    
    // Get access token from session if available
    const accessToken = req.session.userInfo?.accessToken;
    
    // Clear all session data immediately
    req.session.userInfo = null;
    req.session.isAuthenticated = false;
    req.session.isFirstLogin = false;
    
    // Destroy session and redirect directly to login page
    req.session.destroy(err => {
        if (err) {
            logger.error('[/logout] Session destruction error:', err);
        } else {
            logger.info("/logout: Session destroyed successfully");
        }
        
        // Redirect directly to login page for better UX
        res.redirect('/client/login');
    });
    
    // Background token revocation for enhanced security
    if (accessToken && clientId && clientSecret) {
        setTimeout(() => {
            revokeCognitoTokens(accessToken, clientId, clientSecret);
        }, 100);
    }
});

// NEW: Internal Personnel Login Route - MODIFIED for custom form POST
app.post('/login-internal', async (req, res) => {
    const { email, password, captchaToken } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    // Verify CAPTCHA
    const captchaValidation = await captchaService.validateCaptchaForAPI(captchaToken, req.ip);
    if (!captchaValidation.isValid) {
        return res.status(captchaValidation.statusCode).json(captchaValidation.response);
    }

    const clientId = process.env.COGNITO_INTERNAL_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_INTERNAL_APP_SECRET;

    if (!clientId || !clientSecret) {
        logger.error('[/login-internal] Client ID or Client Secret not configured in .env for internal portal.');
        return res.status(500).json({ success: false, message: 'Server configuration error.' });
    }

    const authParameters = {
        USERNAME: email,
        PASSWORD: password,
    };
    
    try {
        authParameters.SECRET_HASH = calculateSecretHash(email, clientId, clientSecret);

        const params = {
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: clientId,
            AuthParameters: authParameters,
        };

        const command = new InitiateAuthCommand(params);
        const authResult = await cognitoClient.send(command);
        
        if (authResult.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
            logger.debug('[/login-internal] NEW_PASSWORD_REQUIRED challenge for user:', email);
            return res.json({
                success: false,
                challengeName: 'NEW_PASSWORD_REQUIRED',
                session: authResult.Session,
                username: email,
                challengeParameters: authResult.ChallengeParameters
            });
        } else if (authResult.AuthenticationResult) {
            // User authenticated, now get user details
            const accessToken = authResult.AuthenticationResult.AccessToken;
            const userDetailsParams = { AccessToken: accessToken };
            const userDetails = await cognitoClient.send(new GetUserCommand(userDetailsParams));

            const internalUserInfo = {};
            userDetails.UserAttributes.forEach(attr => {
                internalUserInfo[attr.Name] = attr.Value;
            });
            internalUserInfo.username = userDetails.Username;
            
            // Store access token for logout revocation
            internalUserInfo.accessToken = accessToken;

            req.session.internalUserInfo = internalUserInfo;
            req.session.isInternalAuthenticated = true;

            // Explicitly save the session to ensure it persists
            req.session.save((err) => {
                if (err) {
                    logger.error('[/login-internal] Session save error:', err);
                    return res.status(500).json({ success: false, message: 'Session save failed.' });
                }
                
                logger.debug('[/login-internal] Internal login successful for:', email);
                return res.json({ success: true, redirectUrl: '/internal/dashboard', userInfo: internalUserInfo });
            });
        } else {
            logger.error('[/login-internal] Cognito initiateAuth unexpected result for:', email, authResult);
            return res.status(401).json({ success: false, message: 'Authentication failed. Please check credentials or server logs.' });
        }
    } catch (error) {
        logger.error('[/login-internal] Error during internal authentication for:', email, error);
        logger.error("Authentication error occurred");
        
        let message = 'Échec de l\'authentification. Veuillez vérifier vos identifiants.';
        if (error.code === 'NotAuthorizedException' || error.__type === 'NotAuthorizedException') {
            message = 'Nom d\'utilisateur ou mot de passe incorrect.';
            logger.info("/login-internal: Setting NotAuthorizedException message");
        } else if (error.code === 'UserNotFoundException' || error.__type === 'UserNotFoundException') {
            message = 'Utilisateur inexistant.';
            logger.info("/login-internal: Setting UserNotFoundException message");
        } else if (error.code === 'UserNotConfirmedException' || error.__type === 'UserNotConfirmedException') {
            message = 'Compte utilisateur non confirmé.';
            logger.info("/login-internal: Setting UserNotConfirmedException message");
        } else if (error.code === 'InvalidParameterException' && error.message.includes('USER_PASSWORD_AUTH flow not enabled')) {
            message = 'Flux d\'authentification non activé pour ce client. Veuillez contacter le support.';
            logger.info("/login-internal: Setting InvalidParameterException message");
        }
        
        logger.debug('[/login-internal] Final error message:', message);
        return res.status(401).json({ success: false, message });
    }
});

// NEW: Internal Personnel Logout Route
app.get('/logout-internal', (req, res) => {
    const cognitoDomain = process.env.COGNITO_INTERNAL_DOMAIN; // e.g., your-internal-domain.auth.region.amazoncognito.com
    const clientId = process.env.COGNITO_INTERNAL_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_INTERNAL_APP_SECRET;
    
    // Get access token from session if available
    const accessToken = req.session.internalUserInfo?.accessToken;

    // Clear all session data immediately
    req.session.internalUserInfo = null;
    req.session.isInternalAuthenticated = false;

    // Destroy session and redirect directly to login page
    req.session.destroy(err => {
        if (err) {
            logger.error('[/logout-internal] Session destruction error:', err);
        } else {
            logger.info("/logout-internal: Session destroyed successfully");
        }
        
        // Redirect directly to internal login page for better UX
        res.redirect('/internal-login');
    });
    
    // Background token revocation for enhanced security
    if (accessToken && clientId && clientSecret) {
        setTimeout(() => {
            revokeCognitoTokens(accessToken, clientId, clientSecret);
        }, 100);
    }
});

// NEW: Admin Portal Login Route - MODIFIED for custom form POST
app.post('/login-admin-portal', async (req, res) => {
    const { email, password, captchaToken } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    // Verify CAPTCHA
    const captchaValidation = await captchaService.validateCaptchaForAPI(captchaToken, req.ip);
    if (!captchaValidation.isValid) {
        return res.status(captchaValidation.statusCode).json(captchaValidation.response);
    }

    const clientId = process.env.COGNITO_ADMIN_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_ADMIN_APP_SECRET;

    if (!clientId || !clientSecret) {
        logger.error('[/login-admin-portal] Client ID or Client Secret not configured in .env for admin portal.');
        return res.status(500).json({ success: false, message: 'Server configuration error.' });
    }

    const authParameters = {
        USERNAME: email,
        PASSWORD: password,
    };

    try {
        authParameters.SECRET_HASH = calculateSecretHash(email, clientId, clientSecret);
        
        const params = {
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: clientId,
            AuthParameters: authParameters,
        };

        const command = new InitiateAuthCommand(params);
        const authResult = await cognitoClient.send(command);
        
        if (authResult.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
            logger.debug('[/login-admin-portal] NEW_PASSWORD_REQUIRED challenge for user:', email);
            return res.json({
                success: false,
                challengeName: 'NEW_PASSWORD_REQUIRED',
                session: authResult.Session,
                username: email,
                challengeParameters: authResult.ChallengeParameters
            });
        } else if (authResult.AuthenticationResult) {
            // User authenticated, now get user details
            const accessToken = authResult.AuthenticationResult.AccessToken;
            const userDetailsParams = { AccessToken: accessToken };
            const userDetails = await cognitoClient.send(new GetUserCommand(userDetailsParams));

            const adminUserInfo = {};
            userDetails.UserAttributes.forEach(attr => {
                adminUserInfo[attr.Name] = attr.Value;
            });
            adminUserInfo.username = userDetails.Username;
            
            // Store access token for logout revocation
            adminUserInfo.accessToken = accessToken;

            req.session.adminUserInfo = adminUserInfo;
            req.session.isAdminAuthenticated = true;

            logger.debug('[/login-admin-portal] Admin login successful for:', email);
            return res.json({ success: true, redirectUrl: '/admin/client-accounts', userInfo: adminUserInfo });
          } else {
            logger.error('[/login-admin-portal] Cognito initiateAuth unexpected result for:', email, authResult);
            return res.status(401).json({ success: false, message: 'Authentication failed. Please check credentials or server logs.' });
        }
    } catch (error) {
        logger.error('[/login-admin-portal] Error during admin authentication for:', email, error);
        logger.error("Authentication error occurred");
        
        let message = 'Échec de l\'authentification. Veuillez vérifier vos identifiants.';
        if (error.code === 'NotAuthorizedException' || error.__type === 'NotAuthorizedException') {
            message = 'Nom d\'utilisateur ou mot de passe incorrect.';
            logger.info("/login-admin-portal: Setting NotAuthorizedException message");
        } else if (error.code === 'UserNotFoundException' || error.__type === 'UserNotFoundException') {
            message = 'Utilisateur inexistant.';
            logger.info("/login-admin-portal: Setting UserNotFoundException message");
        } else if (error.code === 'UserNotConfirmedException' || error.__type === 'UserNotConfirmedException') {
            message = 'Compte utilisateur non confirmé.';
            logger.info("/login-admin-portal: Setting UserNotConfirmedException message");
        } else if (error.code === 'InvalidParameterException' && error.message.includes('USER_PASSWORD_AUTH flow not enabled')) {
            message = 'Flux d\'authentification non activé pour ce client. Veuillez contacter le support.';
            logger.info("/login-admin-portal: Setting InvalidParameterException message");
        }
        
        logger.debug('[/login-admin-portal] Final error message:', message);
        return res.status(401).json({ success: false, message });
    }
});

// NEW: Admin Portal Logout Route
app.get('/logout-admin', (req, res) => {
    const cognitoDomain = process.env.COGNITO_ADMIN_DOMAIN; // e.g., your-admin-domain.auth.region.amazoncognito.com
    const clientId = process.env.COGNITO_ADMIN_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_ADMIN_APP_SECRET;
    
    // Get access token from session if available
    const accessToken = req.session.adminUserInfo?.accessToken;

    // Clear all session data immediately
    req.session.adminUserInfo = null;
    req.session.isAdminAuthenticated = false;

    // Destroy session and redirect directly to login page
    req.session.destroy(err => {
        if (err) {
            logger.error('[/logout-admin] Session destruction error:', err);
        } else {
            logger.info("/logout-admin: Session destroyed successfully");
        }
        
        // Redirect directly to admin login page for better UX
        res.redirect('/admin-login');
    });
    
    // Background token revocation for enhanced security
    if (accessToken && clientId && clientSecret) {
        setTimeout(() => {
            revokeCognitoTokens(accessToken, clientId, clientSecret);
        }, 100);
    }
});

// API Logout endpoints for better frontend integration
app.post('/api/logout', (req, res) => {
    const clientId = process.env.COGNITO_CLIENT_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_CLIENT_APP_SECRET;
    const accessToken = req.session.userInfo?.accessToken;
    
    // Clear all session data immediately
    req.session.userInfo = null;
    req.session.isAuthenticated = false;
    req.session.isFirstLogin = false;
    
    req.session.destroy(err => {
        if (err) {
            logger.error('[/api/logout] Session destruction error:', err);
            return res.status(500).json({ success: false, message: 'Logout failed' });
        }
        logger.info("/api/logout: Session destroyed successfully");
        res.json({ success: true, message: 'Logged out successfully' });
    });
    
    // Background token revocation for enhanced security
    if (accessToken && clientId && clientSecret) {
        setTimeout(() => {
            revokeCognitoTokens(accessToken, clientId, clientSecret);
        }, 100);
    }
});

app.post('/api/logout-internal', (req, res) => {
    const clientId = process.env.COGNITO_INTERNAL_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_INTERNAL_APP_SECRET;
    const accessToken = req.session.internalUserInfo?.accessToken;
    
    // Clear all session data immediately
    req.session.internalUserInfo = null;
    req.session.isInternalAuthenticated = false;
    
    req.session.destroy(err => {
        if (err) {
            logger.error('[/api/logout-internal] Session destruction error:', err);
            return res.status(500).json({ success: false, message: 'Logout failed' });
        }
        logger.info("/api/logout-internal: Session destroyed successfully");
        res.json({ success: true, message: 'Logged out successfully' });
    });
    
    // Background token revocation for enhanced security
    if (accessToken && clientId && clientSecret) {
        setTimeout(() => {
            revokeCognitoTokens(accessToken, clientId, clientSecret);
        }, 100);
    }
});

app.post('/api/logout-admin', (req, res) => {
    const clientId = process.env.COGNITO_ADMIN_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_ADMIN_APP_SECRET;
    const accessToken = req.session.adminUserInfo?.accessToken;
    
    // Clear all session data immediately
    req.session.adminUserInfo = null;
    req.session.isAdminAuthenticated = false;
    
    req.session.destroy(err => {
        if (err) {
            logger.error('[/api/logout-admin] Session destruction error:', err);
            return res.status(500).json({ success: false, message: 'Logout failed' });
        }
        logger.info("/api/logout-admin: Session destroyed successfully");
        res.json({ success: true, message: 'Logged out successfully' });
    });
    
    // Background token revocation for enhanced security
    if (accessToken && clientId && clientSecret) {
        setTimeout(() => {
            revokeCognitoTokens(accessToken, clientId, clientSecret);
        }, 100);
    }
});

// NEW: Routes to handle NEW_PASSWORD_REQUIRED challenge completion
app.post('/complete-new-password-client', async (req, res) => {
    const { username, newPassword, session } = req.body;

    if (!username || !newPassword || !session) {
        return res.status(400).json({ success: false, message: 'Username, new password, and session are required.' });
    }

    const clientId = process.env.COGNITO_CLIENT_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_CLIENT_APP_SECRET;

    if (!clientId || !clientSecret) {
        logger.error('[/complete-new-password-client] Client ID or Client Secret not configured in .env for client portal.');
        return res.status(500).json({ success: false, message: 'Server configuration error.' });
    }

    try {
        const challengeResponses = {
            USERNAME: username,
            NEW_PASSWORD: newPassword,
            SECRET_HASH: calculateSecretHash(username, clientId, clientSecret)
        };

        const params = {
            ChallengeName: 'NEW_PASSWORD_REQUIRED',
            ClientId: clientId,
            ChallengeResponses: challengeResponses,
            Session: session
        };

        const command = new RespondToAuthChallengeCommand(params);
        const authResult = await cognitoClient.send(command);

        if (authResult.AuthenticationResult && authResult.AuthenticationResult.AccessToken) {
            const accessToken = authResult.AuthenticationResult.AccessToken;
            const userDetailsParams = { AccessToken: accessToken };
            const userDetails = await cognitoClient.send(new GetUserCommand(userDetailsParams));

            const userInfo = {};
            userDetails.UserAttributes.forEach(attr => {
                userInfo[attr.Name] = attr.Value;
            });
            userInfo.username = userDetails.Username;
            
            // Extract and add the userId (sub) for consistency
            const userId = userInfo.sub;
            userInfo.userId = userId;

            req.session.userInfo = userInfo;
            req.session.isAuthenticated = true;
            req.session.isFirstLogin = true; // Mark as first login to trigger welcome form

            logger.debug('[/complete-new-password-client] New password set and client login successful for:', username);
            logger.info("/complete-new-password-client: Marked as first login - will show welcome form");
            return res.json({ 
                success: true, 
                redirectUrl: '/client/compte', // Redirect to account page to show welcome form
                userInfo,
                isFirstLogin: true
            });
        } else {
            logger.error('[/complete-new-password-client] Cognito respondToAuthChallenge unexpected result for:', username, authResult);
            // This case might indicate an issue if Cognito doesn't return tokens after a successful challenge response
            // or if another challenge is presented (which shouldn't happen here).
            return res.status(401).json({ success: false, message: 'Failed to set new password. Please try logging in again.' });
        }
    } catch (error) {
        logger.error('[/complete-new-password-client] Error completing new password for:', username, error);
        let message = 'Failed to set new password.';
        if (error.code === 'InvalidPasswordException') {
            message = `Password does not meet requirements: ${error.message}`;
        } else if (error.code === 'NotAuthorizedException') {
            message = 'Session expired or invalid. Please try logging in again.';
        } else if (error.code === 'UserNotFoundException') {
            message = 'User not found. Please try logging in again.';
        } else if (error.code === 'CodeMismatchException') {
             message = 'Invalid verification code. Please try again.'; // Should not happen for NEW_PASSWORD_REQUIRED without MFA
        } else if (error.code === 'ExpiredCodeException'){
            message = 'Verification code expired. Please try again.'; // Should not happen for NEW_PASSWORD_REQUIRED without MFA
        }
        return res.status(401).json({ success: false, message });
    }
});

app.post('/complete-new-password-internal', async (req, res) => {
    const { username, newPassword, session } = req.body;

    if (!username || !newPassword || !session) {
        return res.status(400).json({ success: false, message: 'Username, new password, and session are required.' });
    }

    const clientId = process.env.COGNITO_INTERNAL_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_INTERNAL_APP_SECRET;

    if (!clientId || !clientSecret) {
        logger.error('[/complete-new-password-internal] Client ID or Client Secret not configured for internal portal.');
        return res.status(500).json({ success: false, message: 'Server configuration error.' });
    }

    try {
        const challengeResponses = {
            USERNAME: username,
            NEW_PASSWORD: newPassword,
            SECRET_HASH: calculateSecretHash(username, clientId, clientSecret)
        };

        const params = {
            ChallengeName: 'NEW_PASSWORD_REQUIRED',
            ClientId: clientId,
            ChallengeResponses: challengeResponses,
            Session: session
        };

        const command = new RespondToAuthChallengeCommand(params);
        const authResult = await cognitoClient.send(command);

        if (authResult.AuthenticationResult && authResult.AuthenticationResult.AccessToken) {
            const accessToken = authResult.AuthenticationResult.AccessToken;
            const userDetailsParams = { AccessToken: accessToken };
            const userDetails = await cognitoClient.send(new GetUserCommand(userDetailsParams));

            const internalUserInfo = {};
            userDetails.UserAttributes.forEach(attr => {
                internalUserInfo[attr.Name] = attr.Value;
            });
            internalUserInfo.username = userDetails.Username;

            req.session.internalUserInfo = internalUserInfo;
            req.session.isInternalAuthenticated = true;

            logger.debug('[/complete-new-password-internal] New password set and internal login successful for:', username);
            return res.json({ success: true, redirectUrl: '/internal/dashboard', userInfo: internalUserInfo });
        } else {
            logger.error('[/complete-new-password-internal] Cognito respondToAuthChallenge unexpected result for:', username, authResult);
            return res.status(401).json({ success: false, message: 'Failed to set new password. Please try logging in again.' });
        }
    } catch (error) {
        logger.error('[/complete-new-password-internal] Error completing new password for:', username, error);
        let message = 'Failed to set new password.';
        if (error.code === 'InvalidPasswordException') {
            message = `Password does not meet requirements: ${error.message}`;
        } else if (error.code === 'NotAuthorizedException') {
            message = 'Session expired or invalid. Please try logging in again.';
        }
        return res.status(401).json({ success: false, message });
    }
});

app.post('/complete-new-password-admin', async (req, res) => {
    const { username, newPassword, session } = req.body;

    if (!username || !newPassword || !session) {
        return res.status(400).json({ success: false, message: 'Username, new password, and session are required.' });
    }

    const clientId = process.env.COGNITO_ADMIN_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_ADMIN_APP_SECRET;

    if (!clientId || !clientSecret) {
        logger.error('[/complete-new-password-admin] Client ID or Client Secret not configured for admin portal.');
        return res.status(500).json({ success: false, message: 'Server configuration error.' });
    }

    try {
        const challengeResponses = {
            USERNAME: username,
            NEW_PASSWORD: newPassword,
            SECRET_HASH: calculateSecretHash(username, clientId, clientSecret)
        };

        const params = {
            ChallengeName: 'NEW_PASSWORD_REQUIRED',
            ClientId: clientId,
            ChallengeResponses: challengeResponses,
            Session: session
        };

        const command = new RespondToAuthChallengeCommand(params);
        const authResult = await cognitoClient.send(command);

        if (authResult.AuthenticationResult && authResult.AuthenticationResult.AccessToken) {
            const accessToken = authResult.AuthenticationResult.AccessToken;
            const userDetailsParams = { AccessToken: accessToken };
            const userDetails = await cognitoClient.send(new GetUserCommand(userDetailsParams));

            const adminUserInfo = {};
            userDetails.UserAttributes.forEach(attr => {
                adminUserInfo[attr.Name] = attr.Value;
            });
            adminUserInfo.username = userDetails.Username;
            
            // Store access token for logout revocation
            adminUserInfo.accessToken = accessToken;

            req.session.adminUserInfo = adminUserInfo;
            req.session.isAdminAuthenticated = true;

            logger.debug('[/complete-new-password-admin] New password set and admin login successful for:', username);
            return res.json({ success: true, redirectUrl: '/admin/client-accounts', userInfo: adminUserInfo });
        } else {
            logger.error('[/complete-new-password-admin] Cognito respondToAuthChallenge unexpected result for:', username, authResult);
            return res.status(401).json({ success: false, message: 'Failed to set new password. Please try logging in again.' });
        }
    } catch (error) {
        logger.error('[/complete-new-password-admin] Error completing new password for:', username, error);
        let message = 'Failed to set new password.';
        if (error.code === 'InvalidPasswordException') {
            message = `Password does not meet requirements: ${error.message}`;
        } else if (error.code === 'NotAuthorizedException') {
            message = 'Session expired or invalid. Please try logging in again.';
        }
        return res.status(401).json({ success: false, message });
    }
});

// Catch-all for client-side routing, API fallbacks, and auth enforcement
app.get('*', (req, res, next) => {
    // Exclude API routes, static files, and specific auth related paths from this catch-all
    if (
      req.originalUrl.startsWith('/api/') ||
      req.originalUrl.includes('.') || // A simple check for static files (e.g., main.css, bundle.js)
      req.originalUrl.startsWith('/login-client') || // Handled by POST now
      req.originalUrl.startsWith('/logout') ||
      req.originalUrl.startsWith('/login-internal') || // Handled by POST now
      req.originalUrl.startsWith('/logout-internal') ||
      req.originalUrl.startsWith('/login-admin-portal') || // Handled by POST now
      req.originalUrl.startsWith('/logout-admin') // ||
      // OIDC callback paths are no longer used for login
      // req.originalUrl.startsWith(CLIENT_CALLBACK_PATH) ||
      // req.originalUrl.startsWith(INTERNAL_CALLBACK_PATH) ||
      // req.originalUrl.startsWith(ADMIN_CALLBACK_PATH)
    ) {
      logger.debug(`[CATCH-ALL] Passing through request for: ${req.originalUrl}`);
      return next(); // Let it fall through to a 404 handler or other specific handlers
    }

    // If the path does not match any exclusion, it's a client-side navigable path.
    // Now apply auth checks based on the path prefix.
    if (req.path.startsWith('/client/')) {
        return requireClientAuth(req, res, () => {
            logger.debug(`[Catch-all * : /client/] Client auth passed. Serving index.html for ${req.path}`);
            res.sendFile(path.join(__dirname, '../../frontend/build/index.html'), (err) => {
                if (err) {
                    logger.error(`[Catch-all * : /client/] Error sending index.html for ${req.path}:`, err);
                    if (!res.headersSent) res.status(500).send('Error serving application.');
                }
            });
        });
    } else if (req.path.startsWith('/internal/')) {
        return requireInternalAuth(req, res, () => {
            logger.debug(`[Catch-all * : /internal/] Internal auth passed. Serving index.html for ${req.path}`);
            res.sendFile(path.join(__dirname, '../../frontend/build/index.html'), (err) => {
                if (err) {
                    logger.error(`[Catch-all * : /internal/] Error sending index.html for ${req.path}:`, err);
                    if (!res.headersSent) res.status(500).send('Error serving application.');
                }
            });
        });
    } else if (req.path.startsWith('/admin/')) {
        return requireAdminAuth(req, res, () => {
            logger.debug(`[Catch-all * : /admin/] Admin auth passed. Serving index.html for ${req.path}`);
            res.sendFile(path.join(__dirname, '../../frontend/build/index.html'), (err) => {
                if (err) {
                    logger.error(`[Catch-all * : /admin/] Error sending index.html for ${req.path}:`, err);
                    if (!res.headersSent) res.status(500).send('Error serving application.');
                }
            });
        });
    } else {
        // For public paths not starting with /client, /internal, or /admin (e.g., '/', or any other page)
        logger.debug(`[Catch-all * : Public Path] Serving index.html for ${req.path}`);
        res.sendFile(path.join(__dirname, '../../frontend/build/index.html'), (err) => {
            if (err) {
                logger.error(`[Catch-all * : Public Path] Error sending index.html for ${req.path}:`, err);
                if (!res.headersSent) res.status(500).send('Error serving application.');
            }
        });
    }
});

// Add a final 404 handler for anything that falls through all routing.
// This should be the VERY LAST piece of middleware/route handler.
app.use((req, res, next) => {
    logger.debug(`[404 Handler] Path not found: ${req.originalUrl}`);
    res.status(404).send("Sorry, the page you are looking for does not exist.");
});

async function startServer() {
  try {
    // Initialize sensitive documents function
    const initializeSensitiveDocsOnStartup = async () => {
      try {
        // Only initialize if environment variables are set for S3
        if (process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_S3_BUCKET_NAME) {
          const { initializeSensitiveDocuments } = require('./services/sensitiveDocumentsS3');
          logger.debug('📄 [STARTUP] Checking sensitive documents in S3...');
          await initializeSensitiveDocuments();
        } else {
          logger.debug('⚠️ [STARTUP] S3 not configured for sensitive documents, skipping initialization');
        }
      } catch (error) {
        logger.error('❌ [STARTUP] Error initializing sensitive documents:', error.message);
        // Don't fail startup if sensitive docs initialization fails
      }
    };

    logger.debug('Starting server initialization...');
    const preferredPort = parseInt(process.env.PORT, 10) || 3001;
    logger.debug('Attempting to start server on port:', preferredPort);

    // Test MongoDB connection first
    try {
      logger.debug('Testing MongoDB connection...');
      await connectToDatabase();
      logger.debug('MongoDB connection successful');
    } catch (dbError) {
      logger.error('MongoDB connection failed:', dbError);
      throw dbError;
    }

    // Configure HTTPS if SSL certificates are available
    const sslOptions = getSSLOptions();
    
    if (sslOptions) {
      // Start HTTPS server
      const https = require('https');
      const httpsServer = https.createServer(sslOptions, app);
      
      httpsServer.listen(preferredPort, async () => {
        logger.debug(`🔒 HTTPS Server running on port ${preferredPort}`);
        logger.debug(`🌐 Secure URL: https://localhost:${preferredPort}`);
        logger.debug(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.debug('Cognito Configuration: Loaded');
        logger.debug('🔐 SSL/TLS encryption: ENABLED');
        
        // Initialize sensitive documents after server starts
        await initializeSensitiveDocsOnStartup();
        
        logger.debug('✅ HTTPS Server ready to accept secure connections\n');
      });
      
      // Also start HTTP server for redirects (optional)
      if (process.env.NODE_ENV === 'production') {
        const httpPort = process.env.HTTP_PORT || 80;
        const httpApp = express();
        httpApp.use(httpsRedirect);
        httpApp.listen(httpPort, () => {
          logger.debug(`🔄 HTTP redirect server running on port ${httpPort} (redirects to HTTPS)`);
        });
      }
      
    } else {
      // Start regular HTTP server
      app.listen(preferredPort, async () => {
        logger.debug(`🌐 HTTP Server running on port ${preferredPort}`);
        logger.debug(`🔓 URL: http://localhost:${preferredPort}`);
        logger.debug(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.debug('Cognito Configuration: Loaded');
        
        if (process.env.NODE_ENV === 'production') {
          logger.debug('⚠️  WARNING: Running HTTP in production mode');
          logger.debug('💡 Consider enabling HTTPS for production deployment');
        }
      
        // Initialize sensitive documents after server starts
        await initializeSensitiveDocsOnStartup();
        
        logger.debug('✅ HTTP Server ready to accept connections\n');
      });
    }
  } catch (error) {
    logger.error("Failed to start the server. Detailed error:", error);
    process.exit(1);
  }
}
// ... existing code ...
startServer(); 

// Utility function to find an available port (can be removed if not needed)
/*
async function findAvailablePort(startPort, endPort) {
    const net = require('net');
    for (let port = startPort; port <= endPort; port++) {
        try {
            await new Promise((resolve, reject) => {
                const server = net.createServer();
                server.unref();
                server.on('error', reject);
                server.listen({ port, host: '0.0.0.0' }, () => {
                    server.close(resolve);
                });
            });
            return port;
        } catch (err) {
            if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') {
                throw err;
            }
            // If EADDRINUSE or EACCES, try next port
        }
    }
    throw new Error(`No available port found between ${startPort} and ${endPort}`);
}
*/

// Commented out EJS setup, moved outside of any function body
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));

// app.get('/', checkAuth, (req, res) => {
//     res.render('home', {
//         isAuthenticated: req.isAuthenticated,
//         userInfo: req.session.userInfo
//     });
// });

// Export middleware for use in other modules
module.exports = {
  requireInternalAPIAuth,
  app
}; 