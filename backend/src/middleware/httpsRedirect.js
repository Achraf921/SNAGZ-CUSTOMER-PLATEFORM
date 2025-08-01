/**
 * HTTPS Redirect Middleware
 * Automatically redirects HTTP requests to HTTPS in production
 */

const httpsRedirect = (req, res, next) => {
  // Skip redirect in development or if already using HTTPS
  if (process.env.NODE_ENV !== 'production' || req.secure || req.get('x-forwarded-proto') === 'https') {
    return next();
  }

  // Skip redirect for health checks and API status endpoints
  const skipPaths = ['/health', '/api/health', '/status'];
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // HTTP to HTTPS redirect (no logging needed for security)
  
  // Construct HTTPS URL
  const httpsUrl = `https://${req.get('host')}${req.originalUrl}`;
  
  // Use 301 (permanent redirect) for better SEO
  res.redirect(301, httpsUrl);
};

module.exports = httpsRedirect; 