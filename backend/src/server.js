const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();
// const { Issuer, generators } = require('openid-client'); // No longer needed for login
const session = require('express-session');
const AWS = require('aws-sdk'); // Added AWS SDK
const crypto = require('crypto'); // Added crypto module for SECRET_HASH
const { connectToDatabase } = require('./config/db'); // MongoDB connection

// Routes
// const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customer');

const app = express();
// const ADMIN_CALLBACK_PATH = '/auth/cognito/callback-admin';

// Configure AWS SDK
AWS.config.update({ region: process.env.COGNITO_REGION });
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

// Helper function to calculate SecretHash
const calculateSecretHash = (username, clientId, clientSecret) => {
  const message = Buffer.from(username + clientId, 'utf-8');
  const key = Buffer.from(clientSecret, 'utf-8');
  return crypto.createHmac('sha256', key).update(message).digest('base64');
};

// **NEW: Global request logger**
app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.originalUrl}`);
  next();
});

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // Request logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(session({
    secret: process.env.SESSION_SECRET || 'your strong secret here for production', // Use env var
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // true in production
      httpOnly: true,
      sameSite: 'lax' // Consider 'strict' if applicable
    }
}));

// Setup view engine (EJS)
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));

// Middleware to require client authentication
const requireClientAuth = (req, res, next) => {
    if (!req.session.userInfo) {
    console.log('[AUTH] Client access denied. Redirecting to / for path:', req.originalUrl);
    // Redirect to the frontend login page, not a backend route directly if it's just serving HTML
    return res.redirect('/'); // Or specific client login page like /client-login-page
  }
  console.log('[AUTH] Client access granted for path:', req.originalUrl);
  next();
};

// Middleware to require internal personnel authentication
const requireInternalAuth = (req, res, next) => {
  if (!req.session.internalUserInfo) {
    console.log('[AUTH] Internal access denied. Redirecting to / for path:', req.originalUrl);
    // Redirect to the main page, which will show login options
    return res.redirect('/'); 
  }
  console.log('[AUTH] Internal access granted for path:', req.originalUrl);
  next();
};

// Middleware to require admin authentication
const requireAdminAuth = (req, res, next) => {
  if (!req.session.adminUserInfo) {
    console.log('[AUTH] Admin access denied. Redirecting to / for path:', req.originalUrl);
    // Redirect to the main page, which will show login options
    return res.redirect('/');
  }
  console.log('[AUTH] Admin access granted for path:', req.originalUrl);
    next();
};

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../../frontend/build')));

// API Routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Customer routes
app.use('/api/customer', customerRoutes);
app.use('/api/internal', customerRoutes);

// Add debug logging for route registration
console.log('Registered routes:');
console.log('- POST /api/customer/shop/:shopId/documentation');
console.log('- GET /api/customer/shop/:shopId/documentation');
console.log('- GET /api/internal/clients/:clientId');

// Add CORS headers for preflight requests
app.options('/api/customer/shop/:shopId/documentation', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).send();
});

// Add debug logging for environment variables
console.log('Environment check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('COGNITO_REGION:', process.env.COGNITO_REGION ? 'Set' : 'Not set');

// Connect to MongoDB when the server starts
connectToDatabase()
  .then(() => {
    console.log('MongoDB connection established');
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
  });

// Auth routes
// app.use('/api/auth', authRoutes);

// Import routes
// app.use('/api/shops', require('./routes/shops'));
// app.use('/api/users', require('./routes/users'));
// We'll uncomment these as we create the route files

// Error handling middleware for API routes
app.use('/api', (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    status: 'error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Client Portal Login Route - MODIFIED for custom form POST
app.post('/login-client', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const clientId = process.env.COGNITO_CLIENT_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_CLIENT_APP_SECRET;

    if (!clientId || !clientSecret) {
        console.error('[/login-client] Client ID or Client Secret not configured in .env for client portal.');
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

        const authResult = await cognitoIdentityServiceProvider.initiateAuth(params).promise();
        
        if (authResult.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
            console.log('[/login-client] NEW_PASSWORD_REQUIRED challenge for user:', email);
            return res.json({
                success: false, // Not fully authenticated yet
                challengeName: 'NEW_PASSWORD_REQUIRED',
                session: authResult.Session,
                username: email, // Pass username back to client
                challengeParameters: authResult.ChallengeParameters
            });
        } else if (authResult.AuthenticationResult && authResult.AuthenticationResult.AccessToken) {
            const accessToken = authResult.AuthenticationResult.AccessToken;
            const userDetailsParams = { AccessToken: accessToken };
            const userDetails = await cognitoIdentityServiceProvider.getUser(userDetailsParams).promise();

            const userInfo = {};
            userDetails.UserAttributes.forEach(attr => {
                userInfo[attr.Name] = attr.Value;
            });
            userInfo.username = userDetails.Username;
            
            // Extract and log all potential identifiers from userInfo
            console.log('==== USER IDENTITY DEBUG INFO ====');
            console.log('Raw userInfo:', JSON.stringify(userInfo, null, 2));
            console.log('userInfo.sub:', userInfo.sub);
            console.log('userInfo.username:', userInfo.username);
            console.log('userDetails.Username:', userDetails.Username);
            
            // Use the sub attribute as the userId
            // This is a unique identifier from Cognito that won't change
            const userId = userInfo.sub;
            userInfo.userId = userId;
            
            // Log the userId (sub) being used
            console.log('FINAL userId (from sub):', userId);
            console.log('==== END USER IDENTITY DEBUG INFO ====');

            req.session.userInfo = userInfo;
            req.session.isAuthenticated = true;

            console.log('==== DEBUG INFO ====');
            console.log('[/login-client] Client login successful for:', email);
            console.log('[/login-client] Generated userId:', userId);
            console.log('[/login-client] Full userInfo:', JSON.stringify(userInfo, null, 2));
            console.log('==== END DEBUG INFO ====');
            return res.json({ success: true, redirectUrl: '/client/dashboard', userInfo });
        } else {
            console.error('[/login-client] Cognito initiateAuth unexpected result for:', email, authResult);
            return res.status(401).json({ success: false, message: 'Authentication failed. Please check credentials or server logs.' });
        }
    } catch (error) {
        console.error('[/login-client] Error during client authentication for:', email, error);
        let message = 'Authentication failed. Please check credentials.';
        if (error.code === 'NotAuthorizedException') {
            message = 'Incorrect username or password.';
        } else if (error.code === 'UserNotFoundException') {
            message = 'User does not exist.';
        } else if (error.code === 'UserNotConfirmedException') {
            message = 'User account is not confirmed. Please check your email to confirm your account.';
        } else if (error.code === 'InvalidParameterException' && error.message.includes('USER_PASSWORD_AUTH flow not enabled')) {
            message = 'Authentication flow not enabled for this client. Please contact support.';
        }
        // Do not specifically mention NEW_PASSWORD_REQUIRED here as an error, it's handled above.
        return res.status(401).json({ success: false, message });
    }
});

// Client Portal Logout Route
app.get('/logout', (req, res) => {
    const cognitoDomain = process.env.COGNITO_CLIENT_DOMAIN; // e.g., your-domain.auth.region.amazoncognito.com
    const clientId = process.env.COGNITO_CLIENT_APP_CLIENT_ID; 
    
    if (!cognitoDomain || !clientId) {
        console.error('[/logout] Cognito domain or client ID not configured in .env for client portal.');
        // Fallback or simple session clear if Cognito details are missing
        req.session.destroy(err => {
            if (err) console.error('[/logout] Session destruction error (fallback):', err);
            res.redirect('/');
        });
        return;
    }
    
    let postLogoutRedirectUri;
    const host = req.get('host');
    const protocol = req.protocol;
    if (host && host.startsWith('localhost')) {
        postLogoutRedirectUri = `${protocol}://${host}/`; // Redirect to homepage after logout
    } else {
        postLogoutRedirectUri = process.env.PROD_APP_URL || `https://${host}/`; // Use env var for production base URL
    }
    req.session.destroy(err => {
        if (err) console.error('[/logout] Session destruction error:', err);
        const encodedLogoutUri = encodeURIComponent(postLogoutRedirectUri);
        const cognitoLogoutUrl = `https://${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodedLogoutUri}`;
        res.redirect(cognitoLogoutUrl);
    });
});

// NEW: Internal Personnel Login Route - MODIFIED for custom form POST
app.post('/login-internal', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const clientId = process.env.COGNITO_INTERNAL_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_INTERNAL_APP_SECRET;

    if (!clientId || !clientSecret) {
        console.error('[/login-internal] Client ID or Client Secret not configured in .env for internal portal.');
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

        const authResult = await cognitoIdentityServiceProvider.initiateAuth(params).promise();
        
        if (authResult.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
            console.log('[/login-internal] NEW_PASSWORD_REQUIRED challenge for user:', email);
            return res.json({
                success: false,
                challengeName: 'NEW_PASSWORD_REQUIRED',
                session: authResult.Session,
                username: email,
                challengeParameters: authResult.ChallengeParameters
            });
        } else if (authResult.AuthenticationResult && authResult.AuthenticationResult.AccessToken) {
            const accessToken = authResult.AuthenticationResult.AccessToken;
            const userDetailsParams = { AccessToken: accessToken };
            const userDetails = await cognitoIdentityServiceProvider.getUser(userDetailsParams).promise();
            
            const internalUserInfo = {};
            userDetails.UserAttributes.forEach(attr => {
                internalUserInfo[attr.Name] = attr.Value;
            });
            internalUserInfo.username = userDetails.Username;

            req.session.internalUserInfo = internalUserInfo;
            req.session.isInternalAuthenticated = true;

            console.log('[/login-internal] Internal login successful for:', email);
            return res.json({ success: true, redirectUrl: '/internal/dashboard', internalUserInfo });
        } else {
            console.error('[/login-internal] Cognito initiateAuth unexpected result for:', email, authResult);
            return res.status(401).json({ success: false, message: 'Authentication failed. Please check credentials or server logs.' });
        }
    } catch (error) {
        console.error('[/login-internal] Error during internal authentication for:', email, error);
        let message = 'Authentication failed. Please check credentials.';
        if (error.code === 'NotAuthorizedException') {
            message = 'Incorrect username or password.';
        } else if (error.code === 'UserNotFoundException') {
            message = 'User does not exist.';
        } else if (error.code === 'UserNotConfirmedException') {
            message = 'User account is not confirmed.';
        } else if (error.code === 'InvalidParameterException' && error.message.includes('USER_PASSWORD_AUTH flow not enabled')) {
            message = 'Authentication flow not enabled for this client. Please contact support.';
        }
        return res.status(401).json({ success: false, message });
    }
});

// NEW: Internal Personnel Logout Route
app.get('/logout-internal', (req, res) => {
    const cognitoDomain = process.env.COGNITO_INTERNAL_DOMAIN; // e.g., your-internal-domain.auth.region.amazoncognito.com
    const clientId = process.env.COGNITO_INTERNAL_APP_CLIENT_ID;

    if (!cognitoDomain || !clientId) {
        console.error('[/logout-internal] Cognito domain or client ID not configured in .env for internal portal.');
        req.session.destroy(err => {
            if (err) console.error('[/logout-internal] Session destruction error (fallback):', err);
            res.redirect('/internal-login'); // Or internal homepage
        });
        return;
    }

    let postLogoutRedirectUri;
    const host = req.get('host');
    const protocol = req.protocol;
    if (host && host.startsWith('localhost')) {
        postLogoutRedirectUri = `${protocol}://${host}/internal-login`; // Redirect to internal login page
    } else {
        postLogoutRedirectUri = process.env.PROD_APP_URL ? `${process.env.PROD_APP_URL}/internal-login` : `https://${host}/internal-login`;
    }
    req.session.destroy(err => {
        if (err) console.error('[/logout-internal] Session destruction error:', err);
        const encodedLogoutUri = encodeURIComponent(postLogoutRedirectUri);
        const cognitoLogoutUrl = `https://${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodedLogoutUri}`;
        res.redirect(cognitoLogoutUrl);
    });
});

// NEW: Admin Portal Login Route - MODIFIED for custom form POST
app.post('/login-admin-portal', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const clientId = process.env.COGNITO_ADMIN_APP_CLIENT_ID;
    const clientSecret = process.env.COGNITO_ADMIN_APP_SECRET;

    if (!clientId || !clientSecret) {
        console.error('[/login-admin-portal] Client ID or Client Secret not configured in .env for admin portal.');
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

        const authResult = await cognitoIdentityServiceProvider.initiateAuth(params).promise();
        
        if (authResult.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
            console.log('[/login-admin-portal] NEW_PASSWORD_REQUIRED challenge for user:', email);
            return res.json({
                success: false,
                challengeName: 'NEW_PASSWORD_REQUIRED',
                session: authResult.Session,
                username: email,
                challengeParameters: authResult.ChallengeParameters
            });
        } else if (authResult.AuthenticationResult && authResult.AuthenticationResult.AccessToken) {
            const accessToken = authResult.AuthenticationResult.AccessToken;
            const userDetailsParams = { AccessToken: accessToken };
            const userDetails = await cognitoIdentityServiceProvider.getUser(userDetailsParams).promise();

            const adminUserInfo = {};
            userDetails.UserAttributes.forEach(attr => {
                adminUserInfo[attr.Name] = attr.Value;
            });
            adminUserInfo.username = userDetails.Username;

            req.session.adminUserInfo = adminUserInfo;
            req.session.isAdminAuthenticated = true;

            console.log('[/login-admin-portal] Admin login successful for:', email);
            return res.json({ success: true, redirectUrl: '/admin/dashboard', adminUserInfo });
          } else {
            console.error('[/login-admin-portal] Cognito initiateAuth unexpected result for:', email, authResult);
            return res.status(401).json({ success: false, message: 'Authentication failed. Please check credentials or server logs.' });
        }
    } catch (error) {
        console.error('[/login-admin-portal] Error during admin authentication for:', email, error);
        let message = 'Authentication failed. Please check credentials.';
        if (error.code === 'NotAuthorizedException') {
            message = 'Incorrect username or password.';
        } else if (error.code === 'UserNotFoundException') {
            message = 'User does not exist.';
        } else if (error.code === 'UserNotConfirmedException') {
            message = 'User account is not confirmed.';
        } else if (error.code === 'InvalidParameterException' && error.message.includes('USER_PASSWORD_AUTH flow not enabled')) {
            message = 'Authentication flow not enabled for this client. Please contact support.';
        }
        return res.status(401).json({ success: false, message });
    }
});

// NEW: Admin Portal Logout Route
app.get('/logout-admin', (req, res) => {
    const cognitoDomain = process.env.COGNITO_ADMIN_DOMAIN; // e.g., your-admin-domain.auth.region.amazoncognito.com
    const clientId = process.env.COGNITO_ADMIN_APP_CLIENT_ID;

    if (!cognitoDomain || !clientId) {
        console.error('[/logout-admin] Cognito domain or client ID not configured in .env for admin portal.');
        req.session.destroy(err => {
            if (err) console.error('[/logout-admin] Session destruction error (fallback):', err);
            res.redirect('/admin-login'); // Or admin homepage
        });
        return;
    }

    let postLogoutRedirectUri;
    const host = req.get('host');
    const protocol = req.protocol;
    if (host && host.startsWith('localhost')) {
        postLogoutRedirectUri = `${protocol}://${host}/admin-login`; // Redirect to admin login page
    } else {
        postLogoutRedirectUri = process.env.PROD_APP_URL ? `${process.env.PROD_APP_URL}/admin-login` : `https://${host}/admin-login`;
    }
    req.session.destroy(err => {
        if (err) console.error('[/logout-admin] Session destruction error:', err);
        const encodedLogoutUri = encodeURIComponent(postLogoutRedirectUri);
        const cognitoLogoutUrl = `https://${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodedLogoutUri}`;
        res.redirect(cognitoLogoutUrl);
    });
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
        console.error('[/complete-new-password-client] Client ID or Client Secret not configured in .env for client portal.');
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

        const authResult = await cognitoIdentityServiceProvider.respondToAuthChallenge(params).promise();

        if (authResult.AuthenticationResult && authResult.AuthenticationResult.AccessToken) {
            const accessToken = authResult.AuthenticationResult.AccessToken;
            const userDetailsParams = { AccessToken: accessToken };
            const userDetails = await cognitoIdentityServiceProvider.getUser(userDetailsParams).promise();

            const userInfo = {};
            userDetails.UserAttributes.forEach(attr => {
                userInfo[attr.Name] = attr.Value;
            });
            userInfo.username = userDetails.Username;

            req.session.userInfo = userInfo;
            req.session.isAuthenticated = true;

            console.log('[/complete-new-password-client] New password set and client login successful for:', username);
            return res.json({ success: true, redirectUrl: '/client/dashboard', userInfo });
        } else {
            console.error('[/complete-new-password-client] Cognito respondToAuthChallenge unexpected result for:', username, authResult);
            // This case might indicate an issue if Cognito doesn't return tokens after a successful challenge response
            // or if another challenge is presented (which shouldn't happen here).
            return res.status(401).json({ success: false, message: 'Failed to set new password. Please try logging in again.' });
        }
    } catch (error) {
        console.error('[/complete-new-password-client] Error completing new password for:', username, error);
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
        console.error('[/complete-new-password-internal] Client ID or Client Secret not configured for internal portal.');
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

        const authResult = await cognitoIdentityServiceProvider.respondToAuthChallenge(params).promise();

        if (authResult.AuthenticationResult && authResult.AuthenticationResult.AccessToken) {
            const accessToken = authResult.AuthenticationResult.AccessToken;
            const userDetailsParams = { AccessToken: accessToken };
            const userDetails = await cognitoIdentityServiceProvider.getUser(userDetailsParams).promise();

            const internalUserInfo = {};
            userDetails.UserAttributes.forEach(attr => {
                internalUserInfo[attr.Name] = attr.Value;
            });
            internalUserInfo.username = userDetails.Username;

            req.session.internalUserInfo = internalUserInfo;
            req.session.isInternalAuthenticated = true;

            console.log('[/complete-new-password-internal] New password set and internal login successful for:', username);
            return res.json({ success: true, redirectUrl: '/internal/dashboard', internalUserInfo });
        } else {
            console.error('[/complete-new-password-internal] Cognito respondToAuthChallenge unexpected result for:', username, authResult);
            return res.status(401).json({ success: false, message: 'Failed to set new password. Please try logging in again.' });
        }
    } catch (error) {
        console.error('[/complete-new-password-internal] Error completing new password for:', username, error);
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
        console.error('[/complete-new-password-admin] Client ID or Client Secret not configured for admin portal.');
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

        const authResult = await cognitoIdentityServiceProvider.respondToAuthChallenge(params).promise();

        if (authResult.AuthenticationResult && authResult.AuthenticationResult.AccessToken) {
            const accessToken = authResult.AuthenticationResult.AccessToken;
            const userDetailsParams = { AccessToken: accessToken };
            const userDetails = await cognitoIdentityServiceProvider.getUser(userDetailsParams).promise();

            const adminUserInfo = {};
            userDetails.UserAttributes.forEach(attr => {
                adminUserInfo[attr.Name] = attr.Value;
            });
            adminUserInfo.username = userDetails.Username;

            req.session.adminUserInfo = adminUserInfo;
            req.session.isAdminAuthenticated = true;

            console.log('[/complete-new-password-admin] New password set and admin login successful for:', username);
            return res.json({ success: true, redirectUrl: '/admin/dashboard', adminUserInfo });
        } else {
            console.error('[/complete-new-password-admin] Cognito respondToAuthChallenge unexpected result for:', username, authResult);
            return res.status(401).json({ success: false, message: 'Failed to set new password. Please try logging in again.' });
        }
    } catch (error) {
        console.error('[/complete-new-password-admin] Error completing new password for:', username, error);
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
      console.log(`[CATCH-ALL] Passing through request for: ${req.originalUrl}`);
      return next(); // Let it fall through to a 404 handler or other specific handlers
    }

    // If the path does not match any exclusion, it's a client-side navigable path.
    // Now apply auth checks based on the path prefix.
    if (req.path.startsWith('/client/')) {
        return requireClientAuth(req, res, () => {
            console.log(`[Catch-all * : /client/] Client auth passed. Serving index.html for ${req.path}`);
            res.sendFile(path.join(__dirname, '../../frontend/build/index.html'), (err) => {
                if (err) {
                    console.error(`[Catch-all * : /client/] Error sending index.html for ${req.path}:`, err);
                    if (!res.headersSent) res.status(500).send('Error serving application.');
                }
            });
        });
    } else if (req.path.startsWith('/internal/')) {
        return requireInternalAuth(req, res, () => {
            console.log(`[Catch-all * : /internal/] Internal auth passed. Serving index.html for ${req.path}`);
            res.sendFile(path.join(__dirname, '../../frontend/build/index.html'), (err) => {
                if (err) {
                    console.error(`[Catch-all * : /internal/] Error sending index.html for ${req.path}:`, err);
                    if (!res.headersSent) res.status(500).send('Error serving application.');
                }
            });
        });
    } else if (req.path.startsWith('/admin/')) {
        return requireAdminAuth(req, res, () => {
            console.log(`[Catch-all * : /admin/] Admin auth passed. Serving index.html for ${req.path}`);
            res.sendFile(path.join(__dirname, '../../frontend/build/index.html'), (err) => {
                if (err) {
                    console.error(`[Catch-all * : /admin/] Error sending index.html for ${req.path}:`, err);
                    if (!res.headersSent) res.status(500).send('Error serving application.');
                }
            });
        });
    } else {
        // For public paths not starting with /client, /internal, or /admin (e.g., '/', or any other page)
        console.log(`[Catch-all * : Public Path] Serving index.html for ${req.path}`);
        res.sendFile(path.join(__dirname, '../../frontend/build/index.html'), (err) => {
            if (err) {
                console.error(`[Catch-all * : Public Path] Error sending index.html for ${req.path}:`, err);
                if (!res.headersSent) res.status(500).send('Error serving application.');
            }
        });
    }
});

// Add a final 404 handler for anything that falls through all routing.
// This should be the VERY LAST piece of middleware/route handler.
app.use((req, res, next) => {
    console.log(`[404 Handler] Path not found: ${req.originalUrl}`);
    res.status(404).send("Sorry, the page you are looking for does not exist.");
});

async function startServer() {
  try {
    console.log('Starting server initialization...');
    const preferredPort = parseInt(process.env.PORT, 10) || 3001;
    console.log('Attempting to start server on port:', preferredPort);

    // Test MongoDB connection first
    try {
      console.log('Testing MongoDB connection...');
      await connectToDatabase();
      console.log('MongoDB connection successful');
    } catch (dbError) {
      console.error('MongoDB connection failed:', dbError);
      throw dbError;
    }

    app.listen(preferredPort, () => {
      console.log(`Server running on port ${preferredPort}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      // Log required Cognito environment variables for easier debugging
      console.log('Required Cognito Env Vars (ensure these are set in your .env file):');
      console.log(`  COGNITO_REGION: ${process.env.COGNITO_REGION || 'NOT SET'}`);
      console.log(`  COGNITO_CLIENT_USER_POOL_ID: ${process.env.COGNITO_CLIENT_USER_POOL_ID || 'NOT SET'}`);
      console.log(`  COGNITO_CLIENT_APP_CLIENT_ID: ${process.env.COGNITO_CLIENT_APP_CLIENT_ID || 'NOT SET'}`);
      console.log(`  COGNITO_CLIENT_APP_SECRET: ${process.env.COGNITO_CLIENT_APP_SECRET ? 'SET' : 'NOT SET'}`);
      console.log(`  COGNITO_CLIENT_DOMAIN: ${process.env.COGNITO_CLIENT_DOMAIN || 'NOT SET (for logout)'}`);
      console.log(`  COGNITO_INTERNAL_USER_POOL_ID: ${process.env.COGNITO_INTERNAL_USER_POOL_ID || 'NOT SET'}`);
      console.log(`  COGNITO_INTERNAL_APP_CLIENT_ID: ${process.env.COGNITO_INTERNAL_APP_CLIENT_ID || 'NOT SET'}`);
      console.log(`  COGNITO_INTERNAL_APP_SECRET: ${process.env.COGNITO_INTERNAL_APP_SECRET ? 'SET' : 'NOT SET'}`);
      console.log(`  COGNITO_INTERNAL_DOMAIN: ${process.env.COGNITO_INTERNAL_DOMAIN || 'NOT SET (for logout)'}`);
      console.log(`  COGNITO_ADMIN_USER_POOL_ID: ${process.env.COGNITO_ADMIN_USER_POOL_ID || 'NOT SET'}`);
      console.log(`  COGNITO_ADMIN_APP_CLIENT_ID: ${process.env.COGNITO_ADMIN_APP_CLIENT_ID || 'NOT SET'}`);
      console.log(`  COGNITO_ADMIN_APP_SECRET: ${process.env.COGNITO_ADMIN_APP_SECRET ? 'SET' : 'NOT SET'}`);
      console.log(`  COGNITO_ADMIN_DOMAIN: ${process.env.COGNITO_ADMIN_DOMAIN || 'NOT SET (for logout)'}`);
      console.log(`  SESSION_SECRET: ${process.env.SESSION_SECRET ? 'SET' : 'NOT SET (using default)'}`);
      console.log(`  PROD_APP_URL: ${process.env.PROD_APP_URL || 'NOT SET (for prod logout redirects)'}`);

    });
  } catch (error) {
    console.error("Failed to start the server. Detailed error:", error);
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