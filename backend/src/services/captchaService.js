const axios = require('axios');

class CaptchaService {
  constructor() {
    this.secretKey = process.env.RECAPTCHA_SECRET_KEY;
    this.verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
  }

  // Verify reCAPTCHA token with Google
  async verifyToken(token, userIP = null) {
    try {
      if (!this.secretKey) {
        console.warn('⚠️ reCAPTCHA secret key not configured. Set RECAPTCHA_SECRET_KEY in environment variables.');
        
        // In development, if no secret key is set, we'll allow requests to pass through
        if (process.env.NODE_ENV === 'development') {
          console.log('🔧 Development mode: Bypassing reCAPTCHA verification');
          return {
            success: true,
            score: 1.0,
            action: 'development',
            challenge_ts: new Date().toISOString(),
            hostname: 'localhost',
            bypass: true
          };
        }
        
        return {
          success: false,
          error: 'reCAPTCHA not configured',
          message: 'Configuration serveur manquante pour la vérification CAPTCHA'
        };
      }

      if (!token) {
        return {
          success: false,
          error: 'missing-input-response',
          message: 'Token CAPTCHA manquant'
        };
      }

      // Handle development bypass token
      if (token === 'development-bypass-token') {
        console.log('🔧 Development mode: Accepting bypass token');
        return {
          success: true,
          score: 1.0,
          action: 'development-bypass',
          challenge_ts: new Date().toISOString(),
          hostname: 'localhost',
          bypass: true
        };
      }

      console.log(`🔍 Verifying reCAPTCHA token: ${token.substring(0, 20)}...`);

      // Prepare request data
      const requestData = {
        secret: this.secretKey,
        response: token
      };

      // Add remote IP if provided
      if (userIP) {
        requestData.remoteip = userIP;
      }

      // Make request to Google reCAPTCHA API
      const response = await axios.post(this.verifyUrl, null, {
        params: requestData,
        timeout: 10000, // 10 second timeout
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const result = response.data;

      console.log(`📊 reCAPTCHA verification result:`, {
        success: result.success,
        score: result.score,
        action: result.action,
        challenge_ts: result.challenge_ts,
        hostname: result.hostname,
        error_codes: result['error-codes']
      });

      if (result.success) {
        console.log('✅ reCAPTCHA verification successful');
        return {
          success: true,
          score: result.score,
          action: result.action,
          challenge_ts: result.challenge_ts,
          hostname: result.hostname
        };
      } else {
        console.log('❌ reCAPTCHA verification failed:', result['error-codes']);
        
        // Map Google error codes to user-friendly messages
        const errorMessages = {
          'missing-input-secret': 'Configuration serveur manquante',
          'invalid-input-secret': 'Configuration serveur invalide',
          'missing-input-response': 'Vérification CAPTCHA manquante',
          'invalid-input-response': 'Vérification CAPTCHA invalide',
          'bad-request': 'Requête de vérification malformée',
          'timeout-or-duplicate': 'Token CAPTCHA expiré ou déjà utilisé'
        };

        const errorCodes = result['error-codes'] || [];
        const userMessage = errorCodes.length > 0 
          ? errorMessages[errorCodes[0]] || 'Erreur de vérification CAPTCHA'
          : 'Erreur de vérification CAPTCHA';

        return {
          success: false,
          error: errorCodes.join(', '),
          message: userMessage,
          details: result
        };
      }

    } catch (error) {
      console.error('❌ Error during reCAPTCHA verification:', error);
      
      if (error.code === 'ECONNABORTED') {
        return {
          success: false,
          error: 'timeout',
          message: 'Délai de vérification CAPTCHA dépassé. Veuillez réessayer.'
        };
      }
      
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('reCAPTCHA API error response:', error.response.data);
        return {
          success: false,
          error: 'api-error',
          message: 'Erreur du service de vérification CAPTCHA'
        };
      } else if (error.request) {
        // The request was made but no response was received
        console.error('reCAPTCHA API request error:', error.request);
        return {
          success: false,
          error: 'network-error',
          message: 'Impossible de contacter le service de vérification CAPTCHA'
        };
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error('reCAPTCHA setup error:', error.message);
        return {
          success: false,
          error: 'setup-error',
          message: 'Erreur de configuration CAPTCHA'
        };
      }
    }
  }

  // Validate reCAPTCHA token and return appropriate error response for API
  async validateCaptchaForAPI(token, userIP = null) {
    const result = await this.verifyToken(token, userIP);
    
    if (!result.success) {
      return {
        isValid: false,
        statusCode: 400,
        response: {
          success: false,
          message: result.message || 'Vérification CAPTCHA échouée',
          error: 'captcha-verification-failed',
          details: result.error
        }
      };
    }

    // For reCAPTCHA v2, we don't have scores, so we just check success
    // For reCAPTCHA v3, you might want to check the score here
    return {
      isValid: true,
      result: result
    };
  }

  // Check if reCAPTCHA is properly configured
  isConfigured() {
    return !!this.secretKey;
  }

  // Get configuration status for debugging
  getConfigStatus() {
    return {
      configured: this.isConfigured(),
      environment: process.env.NODE_ENV || 'development',
      secretKeySet: !!this.secretKey,
      verifyUrl: this.verifyUrl
    };
  }
}

// Create and export a singleton instance
const captchaService = new CaptchaService();
module.exports = captchaService; 