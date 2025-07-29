const { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  ListUsersCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  InitiateAuthCommand
} = require('@aws-sdk/client-cognito-identity-provider');

const crypto = require('crypto');

class CognitoService {
  constructor() {
    this.cognitoClient = new CognitoIdentityProviderClient({ 
      region: process.env.COGNITO_REGION 
    });
  }

  // Helper function to calculate SecretHash
  calculateSecretHash(username, clientId, clientSecret) {
    const message = Buffer.from(username + clientId, 'utf-8');
    const key = Buffer.from(clientSecret, 'utf-8');
    return crypto.createHmac('sha256', key).update(message).digest('base64');
  }

  // Get user pool and client config based on user type
  getPoolConfig(userType) {
    switch (userType) {
      case 'client':
        return {
          userPoolId: process.env.COGNITO_CLIENT_USER_POOL_ID,
          clientId: process.env.COGNITO_CLIENT_APP_CLIENT_ID,
          clientSecret: process.env.COGNITO_CLIENT_APP_SECRET,
        };
      case 'internal':
        return {
          userPoolId: process.env.COGNITO_INTERNAL_USER_POOL_ID,
          clientId: process.env.COGNITO_INTERNAL_APP_CLIENT_ID,
          clientSecret: process.env.COGNITO_INTERNAL_APP_SECRET,
        };
      case 'admin':
        return {
          userPoolId: process.env.COGNITO_ADMIN_USER_POOL_ID,
          clientId: process.env.COGNITO_ADMIN_APP_CLIENT_ID,
          clientSecret: process.env.COGNITO_ADMIN_APP_SECRET,
        };
      default:
        throw new Error(`Invalid user type: ${userType}`);
    }
  }

  // Test if we can access the user pool
  async testUserPoolAccess(userType) {
    try {
      const config = this.getPoolConfig(userType);
      console.log(`Testing access to ${userType} user pool:`, config.userPoolId);
      
      const listParams = {
        UserPoolId: config.userPoolId,
        Limit: 1
      };
      
      const listCommand = new ListUsersCommand(listParams);
      await this.cognitoClient.send(listCommand);
      console.log('✅ User pool access test successful');
      return true;
    } catch (error) {
      console.error('❌ User pool access test failed:', error);
      return false;
    }
  }

  // Create a new user in Cognito
  async createUser(userType, userData) {
    try {
      const config = this.getPoolConfig(userType);
      
      if (!config.userPoolId || !config.clientId || !config.clientSecret) {
        throw new Error(`Missing Cognito configuration for user type: ${userType}`);
      }

      // Test access before attempting creation
      const hasAccess = await this.testUserPoolAccess(userType);
      if (!hasAccess) {
        throw new Error('Cannot access User Pool - check credentials and permissions');
      }

      const { name, email, password, sendWelcomeEmail = false } = userData;

      const userAttributes = [
        {
          Name: 'email',
          Value: email
        },
        {
          Name: 'name',
          Value: name
        },
        {
          Name: 'email_verified',
          Value: 'true'
        }
      ];

      const createUserParams = {
        UserPoolId: config.userPoolId,
        Username: email,
        UserAttributes: userAttributes,
        TemporaryPassword: password,
        ForceAliasCreation: false
      };

      // Handle welcome email logic
      if (!sendWelcomeEmail) {
        createUserParams.MessageAction = 'SUPPRESS';
      } else {
        // We'll send our custom branded email for all account types
        createUserParams.MessageAction = 'SUPPRESS'; // Always suppress Cognito's default email
      }

      console.log(`Creating ${userType} user in Cognito:`, { email, name });
      console.log('Create user params:', JSON.stringify(createUserParams, null, 2));

      const createCommand = new AdminCreateUserCommand(createUserParams);
      const createResult = await this.cognitoClient.send(createCommand);
      
      console.log('User created successfully:', createResult.User?.Username);
      
      // Add small delay to handle eventual consistency
      await new Promise(resolve => setTimeout(resolve, 1000));

      // If we provided a custom password and don't want to send welcome email,
      // set it as permanent password
      if (password && !sendWelcomeEmail) {
        console.log('Setting permanent password for user:', email);
        const setPasswordParams = {
          UserPoolId: config.userPoolId,
          Username: email,
          Password: password,
          Permanent: true
        };

        try {
          const setPasswordCommand = new AdminSetUserPasswordCommand(setPasswordParams);
          await this.cognitoClient.send(setPasswordCommand);
          console.log('Password set successfully for user:', email);
        } catch (passwordError) {
          console.error('Error setting password:', passwordError);
          throw passwordError;
        }
      }

      // Get the created user details
      console.log('Getting user details for:', email);
      const getUserParams = {
        UserPoolId: config.userPoolId,
        Username: email
      };

      try {
        const getUserCommand = new AdminGetUserCommand(getUserParams);
        const userDetails = await this.cognitoClient.send(getUserCommand);
        console.log('User details retrieved successfully');
        
        // Send custom account creation email for all users when requested
        if (sendWelcomeEmail) {
          try {
            await this.sendCustomAccountCreationEmail(email, name, password, userType);
            console.log(`Custom account creation email sent successfully for ${userType} user`);
          } catch (emailError) {
            console.error('Failed to send custom account creation email:', emailError);
            // Don't fail user creation if email fails
          }
        }
        
        return {
          success: true,
          user: this.formatUserData(userDetails),
          message: 'User created successfully'
        };
      } catch (getUserError) {
        console.error('Error getting user details:', getUserError);
        // User was created but we can't get details - still return success with basic info
        return {
          success: true,
          user: {
            username: email,
            email: email,
            name: name,
            status: 'FORCE_CHANGE_PASSWORD',
            enabled: true,
            createdAt: new Date()
          },
          message: 'User created successfully but details unavailable'
        };
      }



    } catch (error) {
      console.error(`Error creating ${userType} user:`, error);
      return {
        success: false,
        error: error.message,
        message: this.getErrorMessage(error)
      };
    }
  }

  // Delete a user from Cognito
  async deleteUser(userType, username) {
    try {
      const config = this.getPoolConfig(userType);

      const deleteParams = {
        UserPoolId: config.userPoolId,
        Username: username
      };

      console.log(`Deleting ${userType} user from Cognito:`, username);

      const deleteCommand = new AdminDeleteUserCommand(deleteParams);
      await this.cognitoClient.send(deleteCommand);

      return {
        success: true,
        message: 'User deleted successfully'
      };

    } catch (error) {
      console.error(`Error deleting ${userType} user:`, error);
      return {
        success: false,
        error: error.message,
        message: this.getErrorMessage(error)
      };
    }
  }

  // List users from a specific user pool
  async listUsers(userType, limit = 60) {
    try {
      const config = this.getPoolConfig(userType);

      const listParams = {
        UserPoolId: config.userPoolId,
        Limit: limit
      };

      console.log(`Listing ${userType} users from Cognito`);

      const listCommand = new ListUsersCommand(listParams);
      const result = await this.cognitoClient.send(listCommand);

      const users = result.Users.map(user => this.formatUserData(user));

      return {
        success: true,
        users,
        totalUsers: users.length
      };

    } catch (error) {
      console.error(`Error listing ${userType} users:`, error);
      return {
        success: false,
        error: error.message,
        message: this.getErrorMessage(error)
      };
    }
  }

  // Enable/Disable a user
  async toggleUserStatus(userType, username, enable) {
    try {
      const config = this.getPoolConfig(userType);

      const params = {
        UserPoolId: config.userPoolId,
        Username: username
      };

      const command = enable 
        ? new AdminEnableUserCommand(params)
        : new AdminDisableUserCommand(params);

      await this.cognitoClient.send(command);

      return {
        success: true,
        message: `User ${enable ? 'enabled' : 'disabled'} successfully`
      };

    } catch (error) {
      console.error(`Error ${enable ? 'enabling' : 'disabling'} user:`, error);
      return {
        success: false,
        error: error.message,
        message: this.getErrorMessage(error)
      };
    }
  }

  // Update user attributes
  async updateUser(userType, username, updates) {
    try {
      const config = this.getPoolConfig(userType);

      const userAttributes = [];
      
      if (updates.name) {
        userAttributes.push({
          Name: 'name',
          Value: updates.name
        });
      }
      
      if (updates.email) {
        userAttributes.push({
          Name: 'email',
          Value: updates.email
        });
      }

      if (userAttributes.length === 0) {
        return {
          success: false,
          message: 'No valid attributes to update'
        };
      }

      const updateParams = {
        UserPoolId: config.userPoolId,
        Username: username,
        UserAttributes: userAttributes
      };

      const updateCommand = new AdminUpdateUserAttributesCommand(updateParams);
      await this.cognitoClient.send(updateCommand);

      return {
        success: true,
        message: 'User updated successfully'
      };

    } catch (error) {
      console.error(`Error updating ${userType} user:`, error);
      return {
        success: false,
        error: error.message,
        message: this.getErrorMessage(error)
      };
    }
  }

  // Get user details
  async getUser(userType, username) {
    try {
      const config = this.getPoolConfig(userType);

      const getUserParams = {
        UserPoolId: config.userPoolId,
        Username: username
      };

      const getUserCommand = new AdminGetUserCommand(getUserParams);
      const userDetails = await this.cognitoClient.send(getUserCommand);

      return {
        success: true,
        user: this.formatUserData(userDetails)
      };

    } catch (error) {
      console.error(`Error getting ${userType} user:`, error);
      return {
        success: false,
        error: error.message,
        message: this.getErrorMessage(error)
      };
    }
  }

  // Format user data for consistent response
  formatUserData(cognitoUser) {
    const userData = {
      username: cognitoUser.Username,
      status: cognitoUser.UserStatus,
      enabled: cognitoUser.Enabled,
      createdAt: cognitoUser.UserCreateDate,
      lastModified: cognitoUser.UserLastModifiedDate
    };

    // Extract attributes
    if (cognitoUser.Attributes) {
      cognitoUser.Attributes.forEach(attr => {
        switch (attr.Name) {
          case 'email':
            userData.email = attr.Value;
            break;
          case 'name':
            userData.name = attr.Value;
            break;
          case 'sub':
            userData.sub = attr.Value;
            break;
          case 'email_verified':
            userData.emailVerified = attr.Value === 'true';
            break;
        }
      });
    }

    // Extract attributes from UserAttributes if available (different format)
    if (cognitoUser.UserAttributes) {
      cognitoUser.UserAttributes.forEach(attr => {
        switch (attr.Name) {
          case 'email':
            userData.email = attr.Value;
            break;
          case 'name':
            userData.name = attr.Value;
            break;
          case 'sub':
            userData.sub = attr.Value;
            break;
          case 'email_verified':
            userData.emailVerified = attr.Value === 'true';
            break;
        }
      });
    }

    return userData;
  }

    // Send custom account creation email for all account types
  async sendCustomAccountCreationEmail(email, name, temporaryPassword, accountType) {
    console.log(`📧 Sending custom account creation email to: ${email} (${accountType})`);

    // Import and use the email service
    const emailService = require('./emailService');
    
    try {
      const result = await emailService.sendAccountCreationEmail(email, name, temporaryPassword, accountType);
      
      if (result.success) {
        console.log('✅ Account creation email sent successfully:', {
          recipient: result.recipient,
          messageId: result.messageId,
          accountType: result.accountType
        });
        return result;
      } else {
        console.error('❌ Failed to send account creation email:', result.error);
        return result;
      }
    } catch (error) {
      console.error('❌ Error in sendCustomAccountCreationEmail:', error);
      return {
        success: false,
        error: error.message,
        recipient: email,
        accountType: accountType
      };
    }
  }

  // Change user password
  async changePassword(userType, username, currentPassword, newPassword) {
    try {
      console.log(`🔐 Changing password for ${userType} user: ${username}`);
      
      const config = this.getPoolConfig(userType);
      
      // First, authenticate the user with current password to verify it's correct
      const authResult = await this.cognitoClient.send(new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: config.clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: currentPassword,
          SECRET_HASH: this.calculateSecretHash(username, config.clientId, config.clientSecret)
        }
      }));

      // If authentication succeeds, the current password is correct
      if (!authResult.AuthenticationResult) {
        return {
          success: false,
          message: 'Current password verification failed',
          error: 'Authentication failed'
        };
      }

      // Now change the password using admin privileges
      await this.cognitoClient.send(new AdminSetUserPasswordCommand({
        UserPoolId: config.userPoolId,
        Username: username,
        Password: newPassword,
        Permanent: true
      }));

      console.log(`✅ Password changed successfully for user: ${username}`);
      
      return {
        success: true,
        message: 'Password changed successfully'
      };
      
    } catch (error) {
      console.error(`❌ Error changing password for ${username}:`, error);
      
      let errorMessage = 'Failed to change password';
      
      if (error.name === 'NotAuthorizedException') {
        errorMessage = 'Current password is incorrect';
      } else if (error.name === 'InvalidPasswordException') {
        errorMessage = 'New password does not meet security requirements';
      } else if (error.name === 'UserNotFoundException') {
        errorMessage = 'User not found';
      } else if (error.name === 'TooManyRequestsException') {
        errorMessage = 'Too many requests. Please try again later';
      } else if (error.name === 'LimitExceededException') {
        errorMessage = 'Rate limit exceeded. Please try again later';
      }
      
      return {
        success: false,
        message: errorMessage,
        error: error.name || 'Unknown error',
        details: error.message
      };
    }
  }

  // Get human-readable error messages
  getErrorMessage(error) {
    switch (error.name || error.code) {
      case 'UsernameExistsException':
        return 'Un utilisateur avec cette adresse email existe déjà';
      case 'UserNotFoundException':
        return 'Utilisateur non trouvé';
      case 'InvalidParameterException':
        return 'Paramètres invalides: ' + error.message;
      case 'InvalidPasswordException':
        return 'Mot de passe invalide: ' + error.message;
      case 'LimitExceededException':
        return 'Limite atteinte. Veuillez réessayer plus tard';
      case 'TooManyRequestsException':
        return 'Trop de requêtes. Veuillez réessayer plus tard';
      default:
        return 'Une erreur est survenue: ' + error.message;
    }
  }
}

module.exports = new CognitoService(); 