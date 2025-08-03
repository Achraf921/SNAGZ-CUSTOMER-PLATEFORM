/**
 * Security Headers Middleware
 * Adds comprehensive security headers for HTTPS deployment
 */

const securityHeaders = (req, res, next) => {
  // Strict Transport Security (HSTS) - Force HTTPS for 1 year
  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com", // reCAPTCHA
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob: https://snagz.s3.eu-north-1.amazonaws.com", // Allow S3 images and data URLs
    "connect-src 'self' https://api.shopify.com https://admin.shopify.com http://localhost:3000 https://localhost:3000", // Shopify API & Local Dev
    "frame-src 'self' https://www.google.com", // reCAPTCHA
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', csp);
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Security headers applied (no logging needed in production)
  
  next();
};

module.exports = securityHeaders; 