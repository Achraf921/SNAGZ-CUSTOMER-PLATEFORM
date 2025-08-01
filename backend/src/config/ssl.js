const fs = require('fs');
const { logger } = require('../utils/secureLogger');
const path = require('path');

/**
 * SSL Configuration for HTTPS
 * Handles both development (self-signed) and production (real certificates) scenarios
 */

const getSSLOptions = () => {
  const environment = process.env.NODE_ENV || 'development';
  
  logger.debug(`🔒 [SSL] Configuring SSL for environment: ${environment}`);
  
  if (environment === 'production') {
    // Production SSL certificates
    const sslConfig = getProductionSSLConfig();
    if (sslConfig) {
      logger.debug('🔒 [SSL] Production SSL certificates loaded');
      return sslConfig;
    }
    logger.warn('⚠️ [SSL] Production SSL certificates not found, falling back to HTTP');
    return null;
  }
  
  // Development SSL certificates (self-signed)
  const devSSLConfig = getDevelopmentSSLConfig();
  if (devSSLConfig) {
    logger.debug('🔒 [SSL] Development SSL certificates loaded');
    return devSSLConfig;
  }
  
  logger.debug('ℹ️ [SSL] No SSL certificates configured, using HTTP');
  return null;
};

const getProductionSSLConfig = () => {
  try {
    // Common production certificate paths
    const possiblePaths = [
      {
        key: process.env.SSL_PRIVATE_KEY_PATH || '/etc/ssl/private/server.key',
        cert: process.env.SSL_CERTIFICATE_PATH || '/etc/ssl/certs/server.crt',
        ca: process.env.SSL_CA_PATH || '/etc/ssl/certs/ca-bundle.crt'
      },
      {
        key: '/etc/letsencrypt/live/yourdomain.com/privkey.pem',
        cert: '/etc/letsencrypt/live/yourdomain.com/fullchain.pem'
      },
      {
        key: './ssl/server.key',
        cert: './ssl/server.crt'
      }
    ];
    
    for (const config of possiblePaths) {
      if (fs.existsSync(config.key) && fs.existsSync(config.cert)) {
        const sslOptions = {
          key: fs.readFileSync(config.key),
          cert: fs.readFileSync(config.cert)
        };
        
        // Add CA certificate if available
        if (config.ca && fs.existsSync(config.ca)) {
          sslOptions.ca = fs.readFileSync(config.ca);
        }
        
        logger.debug(`🔒 [SSL] Found production certificates: ${config.key}, ${config.cert}`);
        return sslOptions;
      }
    }
    
    return null;
  } catch (error) {
    logger.error('❌ [SSL] Error loading production certificates:', error.message);
    return null;
  }
};

const getDevelopmentSSLConfig = () => {
  try {
    const sslDir = path.join(__dirname, '../../ssl');
    const keyPath = path.join(sslDir, 'localhost.key');
    const certPath = path.join(sslDir, 'localhost.crt');
    
    // Check if development certificates exist
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
    }
    
    logger.debug('ℹ️ [SSL] Development SSL certificates not found');
    logger.debug('💡 [SSL] To enable HTTPS in development, run: npm run generate-ssl');
    return null;
  } catch (error) {
    logger.error('❌ [SSL] Error loading development certificates:', error.message);
    return null;
  }
};

const isSSLConfigured = () => {
  return getSSLOptions() !== null;
};

module.exports = {
  getSSLOptions,
  isSSLConfigured
}; 