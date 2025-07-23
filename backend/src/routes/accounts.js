const express = require('express');
const router = express.Router();
const cognitoService = require('../services/cognitoService');
const { getCustomersCollection } = require('../config/db');
const { ObjectId } = require('mongodb');

// Get all accounts for a specific user type
router.get('/:userType', async (req, res) => {
  try {
    const { userType } = req.params;
    
    if (!['client', 'internal', 'admin'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type. Must be client, internal, or admin'
      });
    }

    console.log(`Fetching ${userType} accounts from Cognito`);

    const result = await cognitoService.listUsers(userType);
    
    if (!result.success) {
      return res.status(500).json(result);
    }

    // For client accounts, check if they have corresponding customer documents
    if (userType === 'client') {
      try {
        const customersCollection = await getCustomersCollection();
        
        // Get all customer documents
        const customers = await customersCollection.find({}).toArray();
        
        // Create a map of userId (sub) to customer data
        const customerMap = new Map();
        customers.forEach(customer => {
          if (customer.userId) {
            customerMap.set(customer.userId, {
              customerId: customer._id,
              raisonSociale: customer.raisonSociale,
              status: customer.status,
              shopsCount: customer.shops ? customer.shops.length : 0
            });
          }
        });

        // Enhance user data with customer mapping information
        result.users = result.users.map(user => ({
          ...user,
          customerMapping: user.sub ? customerMap.get(user.sub) : null,
          hasMappedCustomer: user.sub ? customerMap.has(user.sub) : false
        }));
        
      } catch (dbError) {
        console.error('Error checking customer mappings:', dbError);
        // Continue without customer mapping data if DB error
        result.users = result.users.map(user => ({
          ...user,
          customerMapping: null,
          hasMappedCustomer: false,
          customerMappingError: 'Could not check customer mapping'
        }));
      }
    }

    res.json(result);
    
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching accounts',
      error: error.message
    });
  }
});

// Create a new account
router.post('/:userType', async (req, res) => {
  try {
    const { userType } = req.params;
    const { name, email, password, sendWelcomeEmail } = req.body;
    
    if (!['client', 'internal', 'admin'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type. Must be client, internal, or admin'
      });
    }

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    console.log(`Creating ${userType} account:`, { name, email, sendWelcomeEmail });

    const result = await cognitoService.createUser(userType, {
      name,
      email,
      password,
      sendWelcomeEmail
    });

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
    
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating the account',
      error: error.message
    });
  }
});

// Delete an account
router.delete('/:userType/:username', async (req, res) => {
  try {
    const { userType, username } = req.params;
    
    if (!['client', 'internal', 'admin'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type. Must be client, internal, or admin'
      });
    }

    console.log(`Deleting ${userType} account:`, username);

    // Step 1: Get user details before deletion (to get sub for customer mapping)
    let userSub = null;
    let mappedCustomer = null;
    
    if (userType === 'client') {
      console.log('🔍 Getting user details before deletion to check for customer mapping...');
      const userDetails = await cognitoService.getUser(userType, username);
      
      if (userDetails.success && userDetails.user.sub) {
        userSub = userDetails.user.sub;
        console.log('📋 Found user sub:', userSub);
        
        // Step 2: Check if there's a mapped customer document
        try {
          const customersCollection = await getCustomersCollection();
          mappedCustomer = await customersCollection.findOne({ userId: userSub });
          
          if (mappedCustomer) {
            console.log('🎯 Found mapped customer document:', {
              customerId: mappedCustomer._id,
              raisonSociale: mappedCustomer.raisonSociale,
              shopsCount: mappedCustomer.shops ? mappedCustomer.shops.length : 0
            });
          } else {
            console.log('ℹ️ No customer document found for this user');
          }
        } catch (dbError) {
          console.error('⚠️ Error checking for customer mapping:', dbError);
          // Continue with Cognito deletion even if DB check fails
        }
      }
    }

    // Step 3: Delete from Cognito
    const result = await cognitoService.deleteUser(userType, username);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Step 4: Delete mapped customer document if it exists (only if Cognito deletion succeeded)
    if (userType === 'client' && mappedCustomer) {
      try {
        console.log('🗑️ Deleting mapped customer document...');
        const customersCollection = await getCustomersCollection();
        const deleteResult = await customersCollection.deleteOne({ _id: mappedCustomer._id });
        
        if (deleteResult.deletedCount === 1) {
          console.log('✅ Successfully deleted customer document');
          result.deletedCustomerDocument = true;
          result.deletedCustomer = {
            customerId: mappedCustomer._id,
            raisonSociale: mappedCustomer.raisonSociale
          };
        } else {
          console.log('⚠️ Customer document not found during deletion (may have been deleted already)');
        }
      } catch (dbError) {
        console.error('❌ Error deleting customer document:', dbError);
        // Don't fail the entire operation - Cognito user is already deleted
        result.customerDeletionError = 'Failed to delete customer document: ' + dbError.message;
      }
    }

    // Update success message
    if (result.deletedCustomerDocument) {
      result.message = `${userType} account and associated customer profile deleted successfully`;
    }

    res.json(result);
    
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the account',
      error: error.message
    });
  }
});

// Update account status (enable/disable)
router.patch('/:userType/:username/status', async (req, res) => {
  try {
    const { userType, username } = req.params;
    const { enabled } = req.body;
    
    if (!['client', 'internal', 'admin'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type. Must be client, internal, or admin'
      });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'enabled field must be a boolean'
      });
    }

    console.log(`${enabled ? 'Enabling' : 'Disabling'} ${userType} account:`, username);

    const result = await cognitoService.toggleUserStatus(userType, username, enabled);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
    
  } catch (error) {
    console.error('Error updating account status:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the account status',
      error: error.message
    });
  }
});

// Update account details
router.put('/:userType/:username', async (req, res) => {
  try {
    const { userType, username } = req.params;
    const { name, email } = req.body;
    
    if (!['client', 'internal', 'admin'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type. Must be client, internal, or admin'
      });
    }

    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    console.log(`Updating ${userType} account:`, username, updates);

    const result = await cognitoService.updateUser(userType, username, updates);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
    
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the account',
      error: error.message
    });
  }
});

// Get specific account details
router.get('/:userType/:username', async (req, res) => {
  try {
    const { userType, username } = req.params;
    
    if (!['client', 'internal', 'admin'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type. Must be client, internal, or admin'
      });
    }

    console.log(`Fetching ${userType} account details:`, username);

    const result = await cognitoService.getUser(userType, username);
    
    if (!result.success) {
      return res.status(404).json(result);
    }

    // For client accounts, check if they have corresponding customer document
    if (userType === 'client' && result.user.sub) {
      try {
        const customersCollection = await getCustomersCollection();
        const customer = await customersCollection.findOne({ userId: result.user.sub });
        
        if (customer) {
          result.user.customerMapping = {
            customerId: customer._id,
            raisonSociale: customer.raisonSociale,
            status: customer.status,
            shopsCount: customer.shops ? customer.shops.length : 0
          };
          result.user.hasMappedCustomer = true;
        } else {
          result.user.customerMapping = null;
          result.user.hasMappedCustomer = false;
        }
        
      } catch (dbError) {
        console.error('Error checking customer mapping:', dbError);
        result.user.customerMapping = null;
        result.user.hasMappedCustomer = false;
        result.user.customerMappingError = 'Could not check customer mapping';
      }
    }

    res.json(result);
    
  } catch (error) {
    console.error('Error fetching account details:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching account details',
      error: error.message
    });
  }
});

// Get credentials for a newly created account (returns username and temporary password info)
router.get('/:userType/:username/credentials', async (req, res) => {
  try {
    const { userType, username } = req.params;
    
    if (!['client', 'internal', 'admin'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type. Must be client, internal, or admin'
      });
    }

    console.log(`Fetching credentials for ${userType} account:`, username);

    const result = await cognitoService.getUser(userType, username);
    
    if (!result.success) {
      return res.status(404).json(result);
    }

    // Return basic credential information
    const credentials = {
      username: result.user.username,
      email: result.user.email,
      status: result.user.status,
      enabled: result.user.enabled,
      needsPasswordReset: result.user.status === 'FORCE_CHANGE_PASSWORD',
      loginUrl: userType === 'client' ? '/client' : 
                userType === 'internal' ? '/internal' : '/admin'
    };

    res.json({
      success: true,
      credentials
    });
    
  } catch (error) {
    console.error('Error fetching account credentials:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching account credentials',
      error: error.message
    });
  }
});

module.exports = router; 