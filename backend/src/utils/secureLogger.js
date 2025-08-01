/**
 * Secure Logger Utility
 * Masks sensitive data and implements proper log levels for production security
 * 
 * CRITICAL: This prevents sensitive data from being logged to server console/files
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class SecureLogger {
  constructor() {
    // In production, only log ERROR level by default
    // In development, log everything for debugging
    this.logLevel = process.env.NODE_ENV === 'production' 
      ? LOG_LEVELS.ERROR 
      : LOG_LEVELS.DEBUG;
    
    // Override with environment variable if set
    if (process.env.LOG_LEVEL) {
      this.logLevel = LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || this.logLevel;
    }
    
    // In production, disable most logging entirely for security
    this.productionLoggingEnabled = process.env.ENABLE_PRODUCTION_LOGS === 'true';
  }

  /**
   * Mask sensitive data in strings and objects
   */
  maskSensitiveData(data) {
    if (typeof data === 'string') {
      return this.maskString(data);
    }
    
    if (typeof data === 'object' && data !== null) {
      return this.maskObject(data);
    }
    
    return data;
  }

  /**
   * Mask sensitive data in strings
   */
  maskString(str) {
    if (typeof str !== 'string') return str;
    
    // Mask email addresses
    str = str.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[EMAIL_MASKED]');
    
    // Mask what looks like user IDs (long alphanumeric strings)
    str = str.replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, (match) => {
      return this.maskUserId(match);
    });
    
    // Mask session IDs
    str = str.replace(/sessionId[:\s]*['"]*([a-zA-Z0-9\-_.]{8,})['"]*/, 'sessionId: [SESSION_MASKED]');
    
    // Mask JWT tokens
    str = str.replace(/eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g, '[JWT_MASKED]');
    
    // Mask passwords
    str = str.replace(/(password[:\s]*['"]*)[^'";\s]+(['"]*)/gi, '$1[PASSWORD_MASKED]$2');
    
    return str;
  }

  /**
   * Mask sensitive data in objects
   */
  maskObject(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.maskSensitiveData(item));
    }
    
    const masked = {};
    const sensitiveKeys = [
      'email', 'password', 'token', 'secret', 'key', 'sessionId', 'userId', 
      'sub', 'userAgent', 'authorization', 'cookie', 'referer', 'ip'
    ];
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveKeys.some(sensitiveKey => lowerKey.includes(sensitiveKey))) {
        if (lowerKey.includes('email')) {
          masked[key] = '[EMAIL_MASKED]';
        } else if (lowerKey.includes('userid') || lowerKey === 'sub') {
          masked[key] = this.maskUserId(value);
        } else if (lowerKey.includes('ip')) {
          masked[key] = this.maskIP(value);
        } else if (lowerKey.includes('useragent')) {
          masked[key] = this.maskUserAgent(value);
        } else {
          masked[key] = '[SENSITIVE_MASKED]';
        }
      } else {
        masked[key] = this.maskSensitiveData(value);
      }
    }
    
    return masked;
  }

  /**
   * Mask user ID (show first and last 4 characters)
   */
  maskUserId(userId) {
    if (!userId || typeof userId !== 'string') return '[USERID_MASKED]';
    if (userId.length <= 8) return '[USERID_MASKED]';
    return `${userId.substring(0, 4)}***${userId.slice(-4)}`;
  }

  /**
   * Mask IP address (show first two octets only)
   */
  maskIP(ip) {
    if (!ip || typeof ip !== 'string') return '[IP_MASKED]';
    if (ip === '::1' || ip === 'localhost') return '[LOCALHOST]';
    
    // IPv4
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length >= 2) {
        return `${parts[0]}.${parts[1]}.*.* `;
      }
    }
    
    // IPv6 or other
    return '[IP_MASKED]';
  }

  /**
   * Mask User Agent (show only browser name)
   */
  maskUserAgent(userAgent) {
    if (!userAgent || typeof userAgent !== 'string') return '[UA_MASKED]';
    
    // Extract just the browser name for debugging purposes
    if (userAgent.includes('Chrome')) return '[Chrome]';
    if (userAgent.includes('Firefox')) return '[Firefox]';
    if (userAgent.includes('Safari')) return '[Safari]';
    if (userAgent.includes('Edge')) return '[Edge]';
    
    return '[BROWSER_MASKED]';
  }

  /**
   * Check if logging should occur based on level and production settings
   */
  shouldLog(level) {
    // In production, respect the production logging setting
    if (process.env.NODE_ENV === 'production' && !this.productionLoggingEnabled) {
      // Only allow ERROR level in production when logging is disabled
      return level <= LOG_LEVELS.ERROR;
    }
    
    return level <= this.logLevel;
  }

  /**
   * Format log message with timestamp and level
   */
  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const levelName = Object.keys(LOG_LEVELS)[level];
    
    // Mask all arguments
    const maskedArgs = args.map(arg => this.maskSensitiveData(arg));
    const maskedMessage = this.maskSensitiveData(message);
    
    return {
      timestamp,
      level: levelName,
      message: maskedMessage,
      data: maskedArgs.length > 0 ? maskedArgs : undefined
    };
  }

  /**
   * Log at ERROR level (always logged, even in production)
   */
  error(message, ...args) {
    if (this.shouldLog(LOG_LEVELS.ERROR)) {
      const formatted = this.formatMessage(LOG_LEVELS.ERROR, message, ...args);
      console.error(`[${formatted.timestamp}] ERROR: ${formatted.message}`, 
        ...(formatted.data || []));
    }
  }

  /**
   * Log at WARN level (production: only if enabled)
   */
  warn(message, ...args) {
    if (this.shouldLog(LOG_LEVELS.WARN)) {
      const formatted = this.formatMessage(LOG_LEVELS.WARN, message, ...args);
      console.warn(`[${formatted.timestamp}] WARN: ${formatted.message}`, 
        ...(formatted.data || []));
    }
  }

  /**
   * Log at INFO level (development only by default)
   */
  info(message, ...args) {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      const formatted = this.formatMessage(LOG_LEVELS.INFO, message, ...args);
      console.log(`[${formatted.timestamp}] INFO: ${formatted.message}`, 
        ...(formatted.data || []));
    }
  }

  /**
   * Log at DEBUG level (development only)
   */
  debug(message, ...args) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      const formatted = this.formatMessage(LOG_LEVELS.DEBUG, message, ...args);
      console.log(`[${formatted.timestamp}] DEBUG: ${formatted.message}`, 
        ...(formatted.data || []));
    }
  }

  /**
   * Security audit log (always logged with extra security)
   */
  security(message, context = {}) {
    // Always log security events, but with extra masking
    const maskedContext = this.maskSensitiveData(context);
    const timestamp = new Date().toISOString();
    
    console.error(`[${timestamp}] SECURITY: ${this.maskSensitiveData(message)}`, maskedContext);
  }

  /**
   * Authentication log (production: errors only)
   */
  auth(level, message, context = {}) {
    if (process.env.NODE_ENV === 'production' && level !== 'error') {
      return; // Only log auth errors in production
    }
    
    const maskedContext = this.maskSensitiveData(context);
    const maskedMessage = this.maskSensitiveData(message);
    
    if (level === 'error') {
      this.error(`AUTH: ${maskedMessage}`, maskedContext);
    } else {
      this.debug(`AUTH: ${maskedMessage}`, maskedContext);
    }
  }
}

// Create singleton instance
const logger = new SecureLogger();

// Export both the class and instance
module.exports = {
  SecureLogger,
  logger,
  LOG_LEVELS
}; 