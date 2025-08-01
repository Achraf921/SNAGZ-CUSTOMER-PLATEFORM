const express = require('express');
const { logger } = require('../utils/secureLogger');
const router = express.Router();

// Import authentication middleware for admin-only routes
const requireAdminAPIAuth = (req, res, next) => {
  // Allow internal users to access admin functions
  if (req.session.internalUserInfo) {
    return next();
  }
  
  // Otherwise require admin authentication
  if (!req.session.adminUserInfo) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required - Admin access only',
      securityAlert: 'UNAUTHORIZED_API_ACCESS'
    });
  }
  next();
};
const crypto = require('crypto');
const cognitoService = require('../services/cognitoService');
const captchaService = require('../services/captchaService');

// In-memory storage for reset tokens (in production, use Redis or MongoDB)
const resetTokens = new Map();

// Clean up expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of resetTokens.entries()) {
    if (data.expiresAt < now) {
      resetTokens.delete(token);
      logger.debug('🧹 Cleaned up expired reset token');
    }
  }
}, 5 * 60 * 1000);

// Request password reset
router.post('/request', async (req, res) => {
  try {
    const { email, userType, captchaToken } = req.body;
    
    // Validate input
    if (!email || !userType) {
      return res.status(400).json({
        success: false,
        message: 'Email et type d\'utilisateur requis',
        error: 'Missing required fields'
      });
    }

    // Verify CAPTCHA
    const captchaValidation = await captchaService.validateCaptchaForAPI(captchaToken, req.ip);
    if (!captchaValidation.isValid) {
      return res.status(captchaValidation.statusCode).json(captchaValidation.response);
    }

    if (!['client', 'internal', 'admin'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Type d\'utilisateur invalide',
        error: 'Invalid user type'
      });
    }

    logger.debug(`🔐 Password reset requested for: ${email} (${userType})`);

    // Check if user exists in Cognito
    let userResult = null;
    try {
      userResult = await cognitoService.getUser(userType, email);
      
      if (!userResult.success) {
        // Don't reveal whether user exists or not for security
        logger.debug(`❌ User not found: ${email} (${userType})`);
        return res.json({
          success: true,
          message: 'Si votre email est associé à un compte, vous recevrez un lien de réinitialisation.'
        });
      }
      
      logger.debug(`✅ User found: ${email} (${userType})`);
      
    } catch (error) {
      logger.error('Error checking user existence:', error);
      // Don't reveal the error for security
      return res.json({
        success: true,
        message: 'Si votre email est associé à un compte, vous recevrez un lien de réinitialisation.'
      });
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour expiration
    
    // Store token with user info
    resetTokens.set(resetToken, {
      email,
      userType,
      expiresAt,
      used: false,
      createdAt: Date.now()
    });

    logger.debug(`🎫 Generated reset token for ${email}: ${resetToken.substring(0, 8)}...`);

    // Send reset email
    try {
      const emailService = require('../services/emailService');
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
      
      // Use the user's name if available, otherwise fallback to email
      const userName = (userResult && userResult.user && userResult.user.name) ? userResult.user.name : email;
      const result = await emailService.sendPasswordResetEmail(email, userName, resetUrl);
      
      if (result.success) {
        logger.debug('✅ Password reset email sent successfully');
        
        res.json({
          success: true,
          message: 'Si votre email est associé à un compte, vous recevrez un lien de réinitialisation.'
        });
      } else {
        logger.error('❌ Failed to send password reset email:', result.error);
        
        // Clean up the token since email failed
        resetTokens.delete(resetToken);
        
        res.status(500).json({
          success: false,
          message: 'Erreur lors de l\'envoi de l\'email de réinitialisation'
        });
      }
    } catch (emailError) {
      logger.error('❌ Email service error:', emailError);
      
      // Clean up the token since email failed
      resetTokens.delete(resetToken);
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi de l\'email de réinitialisation'
      });
    }
    
  } catch (error) {
    logger.error('❌ Error in password reset request:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la demande de réinitialisation',
      error: error.message
    });
  }
});

// Verify reset token
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token de réinitialisation requis',
        error: 'Missing token'
      });
    }

    logger.debug(`🔍 Verifying reset token: ${token.substring(0, 8)}...`);

    const tokenData = resetTokens.get(token);
    
    if (!tokenData) {
      logger.debug('❌ Invalid or expired reset token');
      return res.status(400).json({
        success: false,
        message: 'Token de réinitialisation invalide ou expiré',
        error: 'Invalid token'
      });
    }

    if (tokenData.expiresAt < Date.now()) {
      logger.debug('❌ Reset token expired');
      resetTokens.delete(token);
      return res.status(400).json({
        success: false,
        message: 'Token de réinitialisation expiré',
        error: 'Token expired'
      });
    }

    if (tokenData.used) {
      logger.debug('❌ Reset token already used');
      resetTokens.delete(token);
      return res.status(400).json({
        success: false,
        message: 'Token de réinitialisation déjà utilisé',
        error: 'Token already used'
      });
    }

    logger.debug('✅ Reset token is valid');
    
    res.json({
      success: true,
      message: 'Token valide',
      email: tokenData.email,
      userType: tokenData.userType
    });
    
  } catch (error) {
    logger.error('❌ Error verifying reset token:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification du token',
      error: error.message
    });
  }
});

// Reset password with token
router.post('/confirm', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    // Validate input
    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token et nouveau mot de passe requis',
        error: 'Missing required fields'
      });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins 8 caractères',
        error: 'Password too short'
      });
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
        error: 'Password complexity requirements not met'
      });
    }

    logger.debug(`🔐 Confirming password reset for token: ${token.substring(0, 8)}...`);

    const tokenData = resetTokens.get(token);
    
    if (!tokenData) {
      logger.debug('❌ Invalid or expired reset token');
      return res.status(400).json({
        success: false,
        message: 'Token de réinitialisation invalide ou expiré',
        error: 'Invalid token'
      });
    }

    if (tokenData.expiresAt < Date.now()) {
      logger.debug('❌ Reset token expired');
      resetTokens.delete(token);
      return res.status(400).json({
        success: false,
        message: 'Token de réinitialisation expiré',
        error: 'Token expired'
      });
    }

    if (tokenData.used) {
      logger.debug('❌ Reset token already used');
      resetTokens.delete(token);
      return res.status(400).json({
        success: false,
        message: 'Token de réinitialisation déjà utilisé',
        error: 'Token already used'
      });
    }

    // Mark token as used
    tokenData.used = true;
    resetTokens.set(token, tokenData);

    // Reset password using Cognito Admin API
    try {
      const config = cognitoService.getPoolConfig(tokenData.userType);
      
      const { AdminSetUserPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
      
      await cognitoService.cognitoClient.send(new AdminSetUserPasswordCommand({
        UserPoolId: config.userPoolId,
        Username: tokenData.email,
        Password: newPassword,
        Permanent: true
      }));

      // Remove the token after successful password reset
      resetTokens.delete(token);

      logger.debug(`✅ Password reset successfully for: ${tokenData.email}`);
      
      res.json({
        success: true,
        message: 'Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.',
        userType: tokenData.userType
      });
      
    } catch (cognitoError) {
      logger.error('❌ Cognito error during password reset:', cognitoError);
      
      // Mark token as unused again if Cognito operation failed
      tokenData.used = false;
      resetTokens.set(token, tokenData);
      
      if (cognitoError.name === 'UserNotFoundException') {
        return res.status(400).json({
          success: false,
          message: 'Utilisateur non trouvé',
          error: 'User not found'
        });
      }
      
      if (cognitoError.name === 'InvalidPasswordException') {
        return res.status(400).json({
          success: false,
          message: 'Le nouveau mot de passe ne respecte pas les exigences de sécurité',
          error: 'Invalid password format'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la réinitialisation du mot de passe',
        error: cognitoError.message
      });
    }
    
  } catch (error) {
    logger.error('❌ Error in password reset confirmation:', error);
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la réinitialisation',
      error: error.message
    });
  }
});

// Get reset token statistics (for debugging) - ADMIN ONLY
router.get('/stats', requireAdminAPIAuth, async (req, res) => {
  const now = Date.now();
  const activeTokens = Array.from(resetTokens.entries()).filter(([, data]) => !data.used && data.expiresAt > now);
  const expiredTokens = Array.from(resetTokens.entries()).filter(([, data]) => data.expiresAt <= now);
  const usedTokens = Array.from(resetTokens.entries()).filter(([, data]) => data.used);
  
  res.json({
    success: true,
    statistics: {
      totalTokens: resetTokens.size,
      activeTokens: activeTokens.length,
      expiredTokens: expiredTokens.length,
      usedTokens: usedTokens.length
    }
  });
});

module.exports = router; 