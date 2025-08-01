# HTTPS Setup Guide

This guide walks you through enabling HTTPS on your platform without breaking any functionality.

## 🔒 Why Enable HTTPS?

**Security Benefits:**
- ✅ **Encrypted data transmission** - All data encrypted in transit
- ✅ **Authentication protection** - Login credentials protected
- ✅ **CSRF protection** - Enhanced protection against attacks
- ✅ **SEO benefits** - Search engines prefer HTTPS sites
- ✅ **Browser security** - Modern browsers require HTTPS for many features
- ✅ **Professional appearance** - No "Not Secure" warnings

## 📋 Implementation Overview

Your HTTPS implementation includes:
- **Automatic HTTP to HTTPS redirects** (production only)
- **Comprehensive security headers** (HSTS, CSP, etc.)
- **Secure session cookies** (auto-configured)
- **SSL certificate management** (development & production)
- **Zero functionality loss** - everything continues working

## 🚀 Quick Start

### Development Environment

**1. Generate SSL Certificates for Development:**
```bash
cd backend
npm run generate-ssl
```

**2. Start HTTPS Development Server:**
```bash
npm run dev:https
```

**3. Access Your Secure Application:**
```
https://localhost:3001
```

**Browser Warning:** Your browser will show a security warning for self-signed certificates. Click "Advanced" → "Proceed to localhost (unsafe)" - this is normal for development.

### Production Environment

**1. Obtain SSL Certificates:**
You have several options:

**Option A: Let's Encrypt (Free)**
```bash
# Install Certbot
sudo apt-get install certbot  # Ubuntu/Debian
brew install certbot         # macOS

# Generate certificates
sudo certbot certonly --standalone -d yourdomain.com
```

**Option B: Purchase SSL Certificate**
- Buy from a Certificate Authority (CA)
- Place certificates in `/etc/ssl/` or custom location

**Option C: Cloud Provider SSL**
- AWS Application Load Balancer
- CloudFlare SSL
- Other cloud SSL services

**2. Configure Certificate Paths:**
Add to your production `.env`:
```env
# Production SSL certificate paths
SSL_PRIVATE_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
SSL_CERTIFICATE_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem

# Enable production mode
NODE_ENV=production
```

**3. Start Production Server:**
```bash
npm run start:prod
```

## 🔧 Configuration Options

### Environment Variables

```env
# SSL Configuration
NODE_ENV=production                    # Enables production security features
SSL_PRIVATE_KEY_PATH=/path/to/key.pem  # SSL private key path
SSL_CERTIFICATE_PATH=/path/to/cert.pem # SSL certificate path
SSL_CA_PATH=/path/to/ca.pem           # CA certificate (optional)

# Port Configuration
PORT=443                              # HTTPS port (default: 3001)
HTTP_PORT=80                          # HTTP redirect port (production only)

# Security Options
FORCE_HTTPS=true                      # Force HTTPS redirects (default: auto)
```

### Automatic Features

**Development Mode (`NODE_ENV=development`):**
- ✅ HTTP and HTTPS both work
- ✅ No forced redirects
- ✅ Self-signed certificates supported
- ✅ Relaxed security headers

**Production Mode (`NODE_ENV=production`):**
- ✅ HTTP automatically redirects to HTTPS
- ✅ Strict security headers enabled
- ✅ Secure cookies enforced
- ✅ HSTS (HTTP Strict Transport Security) enabled

## 🛡️ Security Features Implemented

### 1. HTTPS Redirect Middleware
```javascript
// Automatically redirects HTTP to HTTPS in production
// Skips redirects for health checks and API status endpoints
```

### 2. Comprehensive Security Headers
```javascript
// Applied to all responses:
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: [comprehensive policy]
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### 3. Secure Session Configuration
```javascript
// Auto-configured based on environment:
cookie: {
  secure: true,           // HTTPS only (production)
  httpOnly: true,         // Prevent XSS
  sameSite: 'strict'      // CSRF protection
}
```

## 📱 Frontend Compatibility

**Zero Changes Required:**
- ✅ All existing frontend code continues working
- ✅ API calls automatically use HTTPS
- ✅ Authentication flows unchanged
- ✅ File uploads/downloads work normally
- ✅ WebSocket connections upgraded automatically

**Browser Benefits:**
- ✅ No "Not Secure" warnings
- ✅ Green padlock icon
- ✅ Modern browser features enabled
- ✅ Service workers supported (if needed)

## 🔍 Testing Your HTTPS Setup

### 1. Development Testing
```bash
# Start HTTPS development server
npm run dev:https

# Test secure connection
curl -k https://localhost:3001/api/health

# Check security headers
curl -I -k https://localhost:3001
```

### 2. Production Testing
```bash
# Test SSL certificate
openssl s_client -connect yourdomain.com:443

# Test HTTP redirect
curl -I http://yourdomain.com

# Security scan
https://www.ssllabs.com/ssltest/
```

### 3. Functionality Testing
- ✅ Login/logout flows
- ✅ File uploads (S3 integration)
- ✅ Document downloads (sensitive docs)
- ✅ Internal portal access
- ✅ Admin panel functionality
- ✅ Shopify integration

## 🚨 Troubleshooting

### Common Issues

**Error: SSL Certificate Not Found**
```
⚠️ [SSL] Production SSL certificates not found, falling back to HTTP
```
**Solution:** Verify certificate paths in environment variables

**Error: Permission Denied**
```
❌ [SSL] Error loading production certificates: EACCES
```
**Solution:** Ensure proper file permissions:
```bash
sudo chmod 600 /path/to/private.key
sudo chmod 644 /path/to/certificate.crt
```

**Browser: Certificate Invalid**
```
NET::ERR_CERT_AUTHORITY_INVALID
```
**Development:** Normal for self-signed certificates - click "Proceed"
**Production:** Check certificate validity and domain match

**Mixed Content Warnings**
```
Mixed Content: The page was loaded over HTTPS, but requested an insecure resource
```
**Solution:** Ensure all resources use HTTPS URLs

### Performance Considerations

**HTTPS Overhead:**
- **Minimal impact** (~1-3% CPU increase)
- **HTTP/2 benefits** often offset overhead
- **CDN caching** reduces server load

**Certificate Renewal:**
```bash
# Let's Encrypt auto-renewal
sudo crontab -e
0 12 * * * /usr/bin/certbot renew --quiet
```

## 🎯 Deployment Checklist

### Pre-Deployment
- [ ] SSL certificates obtained and installed
- [ ] Environment variables configured
- [ ] HTTPS testing completed locally
- [ ] All functionality verified

### Post-Deployment
- [ ] HTTPS site accessible
- [ ] HTTP redirects working
- [ ] Security headers present
- [ ] SSL certificate valid
- [ ] No mixed content warnings
- [ ] Performance acceptable

### Monitoring
- [ ] Certificate expiration monitoring
- [ ] Security header checks
- [ ] Performance monitoring
- [ ] Error log monitoring

## 📈 Next Steps

**Optional Enhancements:**
1. **HTTP/2 Support** - Already enabled with Node.js HTTPS
2. **Certificate Pinning** - For advanced security
3. **Security Monitoring** - Automated vulnerability scanning
4. **Performance Optimization** - HTTP/2 push, compression

**Security Auditing:**
1. **SSL Labs Test** - https://www.ssllabs.com/ssltest/
2. **Security Headers Check** - https://securityheaders.com/
3. **Mozilla Observatory** - https://observatory.mozilla.org/

Your platform is now enterprise-ready with full HTTPS encryption! 🔐 