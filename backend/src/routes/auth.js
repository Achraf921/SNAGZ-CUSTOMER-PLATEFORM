const express = require('express');
const { logger } = require('../utils/secureLogger');
const router = express.Router();
const cognitoService = require('../services/cognitoService');

// Change password endpoint
router.post('/change-password', async (req, res) => {
  logger.debug(`🔐 [AUTH ROUTES] Change password request received`);
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
        error: 'Missing required fields'
      });
    }

    // Get user info from session - check all user types
    let userInfo = null;
    let userType = null;
    let username = null;

    if (req.session?.internalUserInfo) {
      userInfo = req.session.internalUserInfo;
      userType = 'internal';
      username = userInfo.username || userInfo.email;
    } else if (req.session?.adminUserInfo) {
      userInfo = req.session.adminUserInfo;
      userType = 'admin';
      username = userInfo.username || userInfo.email;
    } else if (req.session?.userInfo) {
      userInfo = req.session.userInfo;
      userType = 'client';
      username = userInfo.username || userInfo.email;
    }

    if (!userInfo || !userType || !username) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        error: 'Authentication required'
      });
    }

    logger.debug(`🔐 Password change request for user: ${username} (${userType})`);
    // Email logging removed for security

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long',
        error: 'Password too short'
      });
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'New password must contain at least one uppercase letter, one lowercase letter, and one number',
        error: 'Password complexity requirements not met'
      });
    }

    // Check if new password is different from current
    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password',
        error: 'Same password'
      });
    }

    try {
      // Use Cognito service to change password
      const result = await cognitoService.changePassword(userType, username, currentPassword, newPassword);
      
      if (result.success) {
        logger.debug(`✅ Password changed successfully for user: ${username}`);
        
        res.json({
          success: true,
          message: 'Password changed successfully'
        });
      } else {
        logger.debug(`❌ Password change failed for user: ${username}`, result.error);
        
        // Handle specific Cognito errors
        if (result.error && result.error.includes('NotAuthorizedException')) {
          return res.status(400).json({
            success: false,
            message: 'Current password is incorrect',
            error: 'Invalid current password'
          });
        }
        
        res.status(400).json({
          success: false,
          message: result.message || 'Password change failed',
          error: result.error
        });
      }
    } catch (cognitoError) {
      logger.error('❌ Cognito error during password change:', cognitoError);
      
      // Handle specific Cognito errors
      if (cognitoError.name === 'NotAuthorizedException') {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect',
          error: 'Invalid current password'
        });
      }
      
      if (cognitoError.name === 'InvalidPasswordException') {
        return res.status(400).json({
          success: false,
          message: 'New password does not meet security requirements',
          error: 'Invalid password format'
        });
      }
      
      throw cognitoError; // Re-throw to be caught by outer catch
    }
    
  } catch (error) {
    logger.error('❌ Error in password change:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while changing password',
      error: error.message
    });
  }
});

module.exports = router; 