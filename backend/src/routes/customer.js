const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { getCustomersCollection } = require('../config/db');
const { ObjectId } = require('mongodb');
const { generateDocumentation } = require('../services/sharepointService');
const path = require('path');
const fs = require('fs');
const { connectToDatabase } = require('../config/db');
const { getSignedUrl } = require('../services/s3Service');
const multer = require('multer');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require('../services/s3Service');
const { logger } = require('../utils/secureLogger');

// Ensure temp directory exists
const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Local multer configuration for customer uploads (more reliable than S3 multer)
const customerImageUpload = multer({
  dest: tempDir,
  fileFilter: (req, file, cb) => {
    logger.debug('Customer multer processing file', { originalname: file.originalname, mimetype: file.mimetype });
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      logger.debug('Customer multer file accepted', { originalname: file.originalname });
      cb(null, true);
    } else {
      logger.warn('Customer multer file rejected - not an image', { originalname: file.originalname });
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});
const { validateAuthentication, validateUserAccess, validateWelcomeFormAccess, validateShopUploadAccess, addRequestSecurity } = require('../middleware/authSecurity');

// Error handling middleware for multer file upload errors
const handleMulterError = (err, req, res, next) => {
  logger.error('Customer multer error', { code: err.code, message: err.message });
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'File size too large. Maximum allowed size is 10MB.',
      error: 'FILE_SIZE_LIMIT_EXCEEDED'
    });
  }
  
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      message: 'Too many files. Only one file allowed.',
      error: 'FILE_COUNT_LIMIT_EXCEEDED'
    });
  }
  
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      message: 'Unexpected file field.',
      error: 'UNEXPECTED_FILE_FIELD'
    });
  }
  
  // Handle custom file filter errors
  if (err.message === 'Only image files are allowed!') {
    return res.status(400).json({
      success: false,
      message: 'Invalid file type. Only image files are allowed.',
      error: 'INVALID_FILE_TYPE'
    });
  }
  
  // Handle "Unexpected end of form" error
  if (err.message === 'Unexpected end of form') {
    return res.status(400).json({
      success: false,
      message: 'Invalid form data. Please ensure you are uploading a valid image file.',
      error: 'INVALID_FORM_DATA'
    });
  }
  
  // Generic multer error
  return res.status(400).json({
    success: false,
    message: 'File upload error: ' + err.message,
    error: 'FILE_UPLOAD_ERROR'
  });
};

// Rate limiting for image operations to prevent abuse
const imageOperationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each user to 50 image operations per 15 minutes
  message: {
    success: false,
    message: 'Too many image operations. Please try again later.',
    securityAlert: 'IMAGE_OPERATION_RATE_LIMIT_EXCEEDED'
  },
  keyGenerator: (req) => {
    // Use userId for rate limiting to prevent abuse per user
    return req.params.userId || req.ip;
  },
  handler: (req, res) => {
    logger.security('Image operation rate limit exceeded', { userId: logger.maskUserId(req.params.userId), ip: logger.maskIP(req.ip) });
    res.status(429).json({
      success: false,
      message: 'Too many image operations. Please try again later.',
      securityAlert: 'IMAGE_OPERATION_RATE_LIMIT_EXCEEDED'
    });
  }
});

// Input validation middleware for image operations
const validateImageOperation = (req, res, next) => {
  const { userId, shopId, productId, imageIndex } = req.params;
  
  // Validate required parameters
  if (!userId || !shopId || !productId) {
    logger.security('Missing required parameters in image operation');
    return res.status(400).json({
      success: false,
      message: 'Missing required parameters',
      securityAlert: 'MISSING_REQUIRED_PARAMETERS'
    });
  }
  
  // Validate userId format (should be a valid sub/ID)
  if (typeof userId !== 'string' || userId.length < 10) {
    logger.security('Invalid userId format', { userId: logger.maskUserId(userId) });
    return res.status(400).json({
      success: false,
      message: 'Invalid user ID format',
      securityAlert: 'INVALID_USER_ID_FORMAT'
    });
  }
  
  // Validate shopId format
  if (typeof shopId !== 'string' || shopId.length < 10) {
    logger.security('Invalid shopId format', { shopId });
    return res.status(400).json({
      success: false,
      message: 'Invalid shop ID format',
      securityAlert: 'INVALID_SHOP_ID_FORMAT'
    });
  }
  
  // Validate productId format
  if (typeof productId !== 'string' || productId.length < 10) {
    logger.security('Invalid productId format', { productId });
    return res.status(400).json({
      success: false,
      message: 'Invalid product ID format',
      securityAlert: 'INVALID_PRODUCT_ID_FORMAT'
    });
  }
  
  // Validate imageIndex if present (for delete operations)
  if (imageIndex !== undefined) {
    const index = parseInt(imageIndex);
    if (isNaN(index) || index < 0) {
      logger.security('Invalid imageIndex', { imageIndex });
      return res.status(400).json({
        success: false,
        message: 'Invalid image index',
        securityAlert: 'INVALID_IMAGE_INDEX'
      });
    }
  }
  
  next();
};

// SECURITY: Removed dangerous /all-shops route that exposed all customers' shops
// SECURITY: Removed dangerous /all route that exposed all customers' data  
// SECURITY: Removed dangerous /all-products route that exposed all customers' products

// Route to get customer's own shops only - SECURE
router.get('/my-shops', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    // Get userId from session for security
    const userId = req.session.userInfo?.sub || req.session.userInfo?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        securityAlert: 'NO_USER_SESSION'
      });
    }

    const customersCollection = await getCustomersCollection();
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found'
      });
    }

    const customerShops = customer.shops || [];
    
    // Generate signed URLs for shop assets
    const shopsWithSignedUrls = await Promise.all(
      customerShops.map(async (shop) => {
        const shopWithUrls = { ...shop };
        
        if (shop.logoUrl) {
          try {
            const key = new URL(shop.logoUrl).pathname.substring(1);
            shopWithUrls.logoUrl = await getSignedUrl(decodeURIComponent(key));
          } catch (e) {
            logger.error(`Error generating signed URL for logo: ${shop.logoUrl}`, e);
          }
        }
        
        return {
          ...shopWithUrls,
          clientName: customer.raisonSociale || customer.name || 'My Business',
          clientId: customer._id?.toString() || customer.id || '-',
          payment: customer.payment || customer.Payement
        };
      })
    );
    
    res.status(200).json({ 
      success: true, 
      shops: shopsWithSignedUrls,
      message: `Found ${shopsWithSignedUrls.length} shops for your account`
    });
  } catch (error) {
    logger.error("[SECURITY] Error in /my-shops:", error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving your shops',
      error: error.message
    });
  }
});

// Route to get customer's own data only - SECURE
router.get('/my-profile', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    // Get userId from session for security
    const userId = req.session.userInfo?.sub || req.session.userInfo?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        securityAlert: 'NO_USER_SESSION'
      });
    }

    const customersCollection = await getCustomersCollection();
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found'
      });
    }

    // Remove sensitive fields before sending
    const { _id, ...customerData } = customer;
    
    res.status(200).json({
      success: true,
      customer: {
        ...customerData,
        id: _id.toString()
      }
    });
  } catch (error) {
    logger.error("[SECURITY] Error in /my-profile:", error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving your profile',
      error: error.message
    });
  }
});

// Route to get customer's own products only - SECURE
router.get('/my-products', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    // Get userId from session for security
    const userId = req.session.userInfo?.sub || req.session.userInfo?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        securityAlert: 'NO_USER_SESSION'
      });
    }

    const customersCollection = await getCustomersCollection();
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found'
      });
    }

    const myProducts = [];
    
    if (Array.isArray(customer.shops)) {
      customer.shops.forEach(shop => {
        const shopName = shop.nomProjet || shop.name || 'My Shop';
        const shopId = shop.shopId || shop.id;
        
        if (Array.isArray(shop.products)) {
          shop.products.forEach(product => {
            myProducts.push({
              ...product,
              shopName,
              shopId,
              clientName: customer.raisonSociale || customer.name || 'My Business'
            });
          });
        }
      });
    }
    
    logger.debug('Customer accessed products', { userId: logger.maskUserId(userId), productCount: myProducts.length });
    
    res.status(200).json({
      success: true,
      products: myProducts,
      message: `Found ${myProducts.length} products in your shops`
    });
  } catch (error) {
    logger.error("[SECURITY] Error in /my-products:", error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving your products',
      error: error.message
    });
  }
});

// Route to handle welcome form submissions - REQUIRES AUTHENTICATION
router.post('/welcome-form', addRequestSecurity, validateWelcomeFormAccess, async (req, res) => {
  try {
    const formData = req.body;
    
    // SECURITY: Get authenticated user's ID from session
    const authenticatedUserId = req.session.userInfo?.sub || req.session.userInfo?.userId;
    
    if (!authenticatedUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        securityAlert: 'NO_USER_SESSION'
      });
    }
    
    // SECURITY: Validate that formData.userId matches the authenticated user
    if (formData.userId && formData.userId !== authenticatedUserId) {
      logger.security('User attempting to submit welcome form with different userId');
      logger.security('Authenticated userId', { userId: logger.maskUserId(authenticatedUserId) });
      logger.security('Form userId', { userId: logger.maskUserId(formData.userId) });
      logger.security('User email', { email: logger.maskString(req.session.userInfo?.email) });
      logger.security('IP', { ip: logger.maskIP(req.ip) });
      
      return res.status(403).json({
        success: false,
        message: 'Access denied: User ID mismatch',
        securityAlert: 'UNAUTHORIZED_WELCOME_FORM_SUBMISSION'
      });
    }
    
    // Add authenticated user's ID and timestamp to the submission
    const submission = {
      ...formData,
      userId: authenticatedUserId, // Override with authenticated user's ID
      submittedAt: new Date(),
      status: 'inactive',
      documented: 'undocumented',
      CompteClientNumber: '', // To be filled by internal user during validation
      Payement: '' // To be filled by internal user during validation (vendeur/mandataire)
    };
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Insert the form data into the customers collection
    const result = await customersCollection.insertOne(submission);
    
    // Return success response
    res.status(201).json({
      success: true,
      message: 'Welcome form submitted successfully',
      customerId: result.insertedId
    });
  } catch (error) {
    logger.error('Error saving welcome form:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while saving the welcome form',
      error: error.message
    });
  }
});

// INTERNAL-ONLY ROUTES - For management purposes by internal personnel
// These routes are protected and only accessible by internal users
// MUST be placed BEFORE parameterized routes to avoid conflicts

// SECURITY: Removed dangerous /all route - moved to internal API where it belongs

// SECURITY: Removed dangerous /all-shops route - moved to internal API where it belongs

// SECURITY: Removed dangerous /all-products route - moved to internal API where it belongs

// Route to get customer data by MongoDB ID - REQUIRES AUTHENTICATION
router.get('/:customerId', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    const { customerId } = req.params;
    
    // SECURITY: Get authenticated user's ID from session
    const authenticatedUserId = req.session.userInfo?.sub || req.session.userInfo?.userId;
    
    if (!authenticatedUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        securityAlert: 'NO_USER_SESSION'
      });
    }
    
    const customersCollection = await getCustomersCollection();
    let customer;
    try {
      customer = await customersCollection.findOne({ _id: new ObjectId(customerId) });
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID format',
        error: e.message
      });
    }
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // CRITICAL SECURITY: Verify the customer belongs to the authenticated user
    if (customer.userId !== authenticatedUserId) {
      logger.error('🚨 SECURITY ALERT: User attempting to access wrong customer data via MongoDB ID!');
      logger.security('Authenticated userId', { userId: logger.maskUserId(authenticatedUserId) });
      logger.error('Customer userId:', customer.userId);
      logger.error('Customer MongoDB ID:', customerId);
      logger.security('User email', { email: logger.maskString(req.session.userInfo?.email) });
      logger.security('IP', { ip: logger.maskIP(req.ip) });
      
      return res.status(403).json({
        success: false,
        message: 'Access denied: Unauthorized customer data access',
        securityAlert: 'UNAUTHORIZED_CUSTOMER_DATA_ACCESS'
      });
    }
    res.status(200).json({
      success: true,
      customer
    });
  } catch (error) {
    logger.error('Error fetching customer data:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching customer data',
      error: error.message
    });
  }
});

// Route to get customer data by userId - SECURED WITH VALIDATION
router.get('/by-user-id/:userId', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    logger.debug('Customer route debug info');
    logger.debug('Request params', { params: req.params });
    logger.debug('Request query', { query: req.query });
    logger.debug('Request headers available');
    logger.debug('Fetching customer with userId:', userId);
    logger.debug('Timestamp:', new Date().toISOString());
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Log all customers in the collection for debugging
    logger.debug('Checking all documents in the customers collection...');
    const allCustomers = await customersCollection.find({}).toArray();
    logger.debug('Total documents in customers collection:', allCustomers.length);
    
    // Log the first few customers (limit to avoid excessive logging)
    const customerSample = allCustomers.slice(0, Math.min(5, allCustomers.length));
    logger.debug('Sample of customers in database:');
    customerSample.forEach((doc, index) => {
      logger.debug(`Document ${index + 1}:`, {
        _id: doc._id,
        userId: doc.userId,
        raisonSociale: doc.raisonSociale || 'N/A'
      });
    });
    
    // Use the userId directly as provided - no transformations or alternatives
    logger.debug('==== CUSTOMER LOOKUP DEBUG INFO ====');
    logger.debug('Searching for customer with EXACT userId:', userId);
    logger.debug('This should be the sub from Cognito for the logged-in user');
    logger.debug('Timestamp:', new Date().toISOString());
    
    // CRITICAL SECURITY: Strict validation to prevent privacy leaks
    // Only allow exact userId matches - NO fallbacks or alternative lookups
    logger.debug('🔒 SECURITY CHECK: Performing strict userId validation');
    logger.debug('Looking for EXACT match with userId:', userId);
    
    if (!userId || userId === 'undefined' || userId === 'null') {
      logger.error('🚨 SECURITY ALERT: Invalid userId provided:', userId);
      return res.status(400).json({
        success: false,
        message: 'Invalid user identifier',
        securityAlert: 'Invalid userId'
      });
    }
    
    // Find customer by exact userId match only - NO FALLBACKS ALLOWED
    let customer = await customersCollection.findOne({ 
      userId: { $eq: userId } // Explicit equality check
    });
    
    // SECURITY VALIDATION: Verify the found customer actually belongs to this user
    if (customer) {
      // Double-check the userId matches exactly
      if (customer.userId !== userId) {
        logger.error('🚨 CRITICAL SECURITY ALERT: UserId mismatch detected!');
        logger.error('Expected userId:', userId);
        logger.error('Found customer userId:', customer.userId);
        logger.error('Customer:', customer.raisonSociale);
        
        // This should never happen - indicates a serious security breach
        return res.status(500).json({
          success: false,
          message: 'Security validation failed',
          securityAlert: 'UserId mismatch detected'
        });
      }
      
      logger.debug(`✅ SECURITY VALIDATED: Found customer with exact userId: ${userId}`);
      logger.debug('Customer details:', {
        _id: customer._id,
        userId: customer.userId,
        raisonSociale: customer.raisonSociale || 'N/A'
      });
    } else {
      logger.debug(`ℹ️ No customer found with userId: ${userId} (This is normal for new users)`);
    }
    logger.debug('==== END CUSTOMER LOOKUP DEBUG INFO ====');
    
    // If customer not found, handle gracefully for new users
    if (!customer) {
      logger.debug('ℹ️ No customer document found - likely a new user');
      logger.debug('==== END DEBUG INFO ====');
      
      // Check if this is a valid Cognito user by checking session
      const sessionUserInfo = req.session?.userInfo;
      if (sessionUserInfo && (sessionUserInfo.sub === userId || sessionUserInfo.userId === userId)) {
        logger.debug('✅ Valid new user - returning welcome form flag');
        return res.status(200).json({
          success: false,
          isNewUser: true,
          needsWelcomeForm: true,
          message: 'Welcome! Please complete your profile to get started.',
          userInfo: {
            email: sessionUserInfo.email,
            name: sessionUserInfo.name,
            sub: sessionUserInfo.sub
          }
        });
      } else {
        logger.debug('🚨 SECURITY: No valid session for userId');
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          securityAlert: 'No valid session'
        });
      }
    }
    
    logger.debug('Customer found with _id:', customer._id);
    logger.debug('==== END DEBUG INFO ====');
    
    // Return the customer data
    res.status(200).json({
      success: true,
      customer
    });
  } catch (error) {
    logger.error('Error fetching customer data by userId:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching customer data',
      error: error.message
    });
  }
});

// Route to update customer data by userId
router.put('/update/:userId', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;
    
    logger.debug('Updating customer with userId:', userId);
    logger.debug('Update data:', updateData);
    
    // Remove any fields that should not be updated
    delete updateData._id; // Cannot update MongoDB _id
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document
    const existingCustomer = await customersCollection.findOne({ userId });
    
    if (!existingCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user'
      });
    }
    
    // Update the document
    const result = await customersCollection.updateOne(
      { userId },
      { $set: updateData }
    );
    
    if (result.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'No changes were made to the customer profile'
      });
    }
    
    // Get the updated customer data
    const updatedCustomer = await customersCollection.findOne({ userId });
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Customer profile updated successfully',
      customer: updatedCustomer
    });
  } catch (error) {
    logger.error('Error updating customer data:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the customer profile',
      error: error.message
    });
  }
});

// Route to get all shops for a specific customer
router.get('/shops/:userId', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    
    logger.debug('==== FETCH SHOPS DEBUG INFO ====');
    logger.debug('Fetching shops for userId (sub):', userId);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      logger.debug(`FAILURE: No customer found with userId: ${userId}`);
      logger.debug('==== END FETCH SHOPS DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    logger.debug(`SUCCESS: Found customer with userId: ${userId}`);
    
    // Check if customer has shops
    const shops = customer.shops || [];
    logger.debug(`Found ${shops.length} shops for this customer`);
    
    // Generate pre-signed URLs for all shop images
    const shopsWithSignedUrls = await Promise.all(
      shops.map(async (shop) => {
        const shopWithUrls = { ...shop };
        
        // Generate signed URLs for all image types
        if (shop.logoUrl) {
          try {
            const key = decodeURIComponent(new URL(shop.logoUrl).pathname.substring(1));
            shopWithUrls.logoUrl = await getSignedUrl(key);
          } catch (e) {
            logger.error(`Error generating signed URL for logo: ${shop.logoUrl}`, e);
          }
        }
        
        if (shop.desktopBannerUrl) {
          try {
            const key = decodeURIComponent(new URL(shop.desktopBannerUrl).pathname.substring(1));
            shopWithUrls.desktopBannerUrl = await getSignedUrl(key);
          } catch (e) {
            logger.error(`Error generating signed URL for desktop banner: ${shop.desktopBannerUrl}`, e);
          }
        }
        
        if (shop.mobileBannerUrl) {
          try {
            const key = decodeURIComponent(new URL(shop.mobileBannerUrl).pathname.substring(1));
            shopWithUrls.mobileBannerUrl = await getSignedUrl(key);
          } catch (e) {
            logger.error(`Error generating signed URL for mobile banner: ${shop.mobileBannerUrl}`, e);
          }
        }
        
        if (shop.faviconUrl) {
          try {
            const key = decodeURIComponent(new URL(shop.faviconUrl).pathname.substring(1));
            shopWithUrls.faviconUrl = await getSignedUrl(key);
          } catch (e) {
            logger.error(`Error generating signed URL for favicon: ${shop.faviconUrl}`, e);
          }
        }
        
        return shopWithUrls;
      })
    );
    
    logger.debug('==== END FETCH SHOPS DEBUG INFO ====');
    
    // Return shops array with signed URLs
    res.status(200).json({
      success: true,
      shops: shopsWithSignedUrls
    });
  } catch (error) {
    logger.error('Error fetching shops:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching shops',
      error: error.message
    });
  }
});

// Route to add a new shop to a customer's document
router.post('/shops/:userId', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const shopData = req.body;
    
    logger.debug('==== CREATE SHOP DEBUG INFO ====');
    logger.debug('Creating shop for userId (sub):', userId);
    logger.debug('Shop data:', shopData);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      logger.debug(`FAILURE: No customer found with userId: ${userId}`);
      logger.debug('==== END CREATE SHOP DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    logger.debug(`SUCCESS: Found customer with userId: ${userId}`);
    
    // Add timestamp and unique ID to the shop data
    const newShop = {
      ...shopData,
      nomClient: customer.raisonSociale || customer.name || 'Client', // Automatically fill with customer's raisonSociale
      shopId: new ObjectId().toString(), // Generate a unique ID for the shop
      createdAt: new Date(),
      status: 'pending', // Initial status for new shops
      hasShopify: false, // Shopify store non générée par défaut
      documented: 'undocumented', // Initial documentation status
    };
    
    // Initialize shops array if it doesn't exist
    const updateOperation = customer.shops 
      ? { $push: { shops: newShop } }
      : { $set: { shops: [newShop] } };
    
    // Update the customer document with the new shop
    const result = await customersCollection.updateOne(
      { userId },
      updateOperation
    );
    
    if (result.modifiedCount === 0) {
      logger.debug('Failed to add shop to customer document');
      logger.debug('==== END CREATE SHOP DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to add shop to customer profile'
      });
    }
    
    logger.debug('Shop added successfully to customer document');
    logger.debug('Shop ID:', newShop.shopId);
    logger.debug('==== END CREATE SHOP DEBUG INFO ====');
    
    // Return success response
    res.status(201).json({
      success: true,
      message: 'Shop created successfully',
      shopId: newShop.shopId,
      shop: newShop
    });
  } catch (error) {
    logger.error('Error creating shop:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating the shop',
      error: error.message
    });
  }
});

// Route to update an existing shop in a customer's document
router.put('/shops/:userId/:shopId', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    const { userId, shopId } = req.params;
    const updatedShopData = req.body;
    
    logger.debug('==== UPDATE SHOP DEBUG INFO ====');
    logger.debug('Updating shop for userId (sub):', userId);
    logger.debug('Shop ID:', shopId);
    // Clean up the data for logging to avoid console spam
    const logData = { ...updatedShopData };
    const imageTypes = ['logo', 'desktopBanner', 'mobileBanner', 'favicon'];
    imageTypes.forEach((imageType) => {
      if (logData[`${imageType}Url`] && logData[`${imageType}Url`].startsWith('data:')) {
        logData[`${imageType}Url`] = '[BASE64_DATA_URL]';
      }
    });
    logger.debug('Updated shop data keys:', Object.keys(updatedShopData));
    logger.debug('Updated shop data (cleaned):', logData);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      logger.debug(`FAILURE: No customer found with userId: ${userId}`);
      logger.debug('==== END UPDATE SHOP DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    logger.debug(`SUCCESS: Found customer with userId: ${userId}`);
    
    // Check if customer has shops array
    if (!customer.shops || !Array.isArray(customer.shops)) {
      logger.debug('FAILURE: Customer has no shops array');
      logger.debug('==== END UPDATE SHOP DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'No shops found for this customer'
      });
    }
    
    // Find the shop index in the array
    const shopIndex = customer.shops.findIndex(shop => shop.shopId === shopId);
    
    if (shopIndex === -1) {
      logger.debug(`FAILURE: No shop found with ID: ${shopId}`);
      logger.debug('==== END UPDATE SHOP DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Preserve original shop data and only update the fields that were provided
    const originalShop = customer.shops[shopIndex];
    const updatedShop = { ...originalShop };
    
    // Only update fields with meaningful values to avoid overwriting with empty strings/nulls
    Object.entries(updatedShopData).forEach(([key, value]) => {
      if (key === '_id' || key === 'shopId') return;
      // Accept boolean and numeric values even if false/0, but skip undefined/null/empty strings
      const isEmptyString = typeof value === 'string' && value.trim() === '';
      if (value === undefined || value === null || isEmptyString) {
        return;
      }
      updatedShop[key] = value;
    });
    
    // Always update the updatedAt timestamp
    updatedShop.updatedAt = new Date();

    // Log the update if status is being changed
    if (updatedShopData.status && updatedShopData.status !== originalShop.status) {
      logger.debug('Updating shop status:', {
        shopId: originalShop.shopId,
        oldStatus: originalShop.status,
        newStatus: updatedShopData.status,
        timestamp: new Date().toISOString()
      });
    }

    // Update the shop in the array
    const updateOperation = {
      $set: { 
        [`shops.${shopIndex}`]: updatedShop,
        updatedAt: new Date()
      }
    };

    // Update the customer document
    const result = await customersCollection.updateOne(
      { userId },
      updateOperation
    );

    if (result.modifiedCount === 0) {
      logger.debug('FAILURE: Failed to update shop');
      logger.debug('==== END UPDATE SHOP DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to update shop'
      });
    }
    
    logger.debug('SUCCESS: Shop updated successfully');
    logger.debug('==== END UPDATE SHOP DEBUG INFO ====');
    
    // Return success response
    const shopResponse = {
      ...updatedShop,
      clientId: customer._id.toString(),
      clientName: customer.raisonSociale || customer.name || '-',
      createdAt: updatedShop.createdAt || customer.createdAt,
    };

    res.status(200).json({
      success: true,
      message: 'Shop updated successfully',
      shop: shopResponse,
      updatedClient: await customersCollection.findOne({ userId }),
    });
  } catch (error) {
    logger.error('Error updating shop:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the shop',
      error: error.message
    });
  }
});

// Route to upload an image for a shop
router.post('/shops/:userId/:shopId/upload-image', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    const { userId, shopId } = req.params;
    const { imageType } = req.body;
    
    logger.debug('==== UPLOAD IMAGE DEBUG INFO ====');
    logger.debug('Uploading image for userId:', userId);
    logger.debug('Shop ID:', shopId);
    logger.debug('Image type:', imageType);
    
    if (!req.files || !req.files.image) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const imageFile = req.files.image;
    
    // Validate file type
    // Accept any MIME type that starts with "image/" to be more flexible and avoid edge-cases
    // (e.g. image/x-icon, image/svg+xml, image/heic, etc.).
    if (!imageFile.mimetype || !imageFile.mimetype.startsWith('image/')) {
      console.warn('Rejected upload due to invalid MIME type:', imageFile.mimetype);
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only images are allowed.'
      });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB (increased for convenience)
    if (imageFile.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 10MB.'
      });
    }

    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user'
      });
    }
    
    // Check if customer has shops array
    if (!customer.shops || !Array.isArray(customer.shops)) {
      return res.status(404).json({
        success: false,
        message: 'No shops found for this customer'
      });
    }
    
    // Find the shop in the array
    const shopIndex = customer.shops.findIndex(shop => shop.shopId === shopId);
    
    if (shopIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = imageFile.name.split('.').pop();
    const fileName = `${timestamp}-${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
    
    // Determine S3 folder based on image type
    let s3Folder;
    switch (imageType) {
      case 'logo':
        s3Folder = 'logos';
        break;
      case 'desktopBanner':
        s3Folder = 'banners/desktop';
        break;
      case 'mobileBanner':
        s3Folder = 'banners/mobile';
        break;
      case 'favicon':
        s3Folder = 'favicons';
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid image type'
        });
    }

    const s3Key = `${s3Folder}/shop-${shopId}/${fileName}`;
    
    // Upload to S3
    const s3Service = require('../services/s3Service');
    const fs = require('fs');
    // express-fileupload populates either `data` (when useTempFiles=false) or `tempFilePath` (when useTempFiles=true).
    let fileBuffer;
    if (imageFile.data && imageFile.data.length) {
      fileBuffer = imageFile.data;
    } else if (imageFile.tempFilePath) {
      fileBuffer = fs.readFileSync(imageFile.tempFilePath);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unable to read uploaded file data'
      });
    }

    const uploadResult = await s3Service.uploadFile(fileBuffer, s3Key, imageFile.mimetype);

    // Clean up temp file if it exists
    if (imageFile.tempFilePath) {
      fs.unlink(imageFile.tempFilePath, () => {});
    }
    
    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to upload image to S3',
        error: uploadResult.error
      });
    }

    // Store the S3 key instead of a pre-signed URL (which expires)
    // We'll generate pre-signed URLs on-demand when displaying images
    
    // Update the shop with the S3 key
    const updateOperation = {
      $set: { 
        [`shops.${shopIndex}.${imageType}S3Key`]: s3Key,
        [`shops.${shopIndex}.updatedAt`]: new Date(),
        updatedAt: new Date()
      }
    };

    const result = await customersCollection.updateOne(
      { userId },
      updateOperation
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Failed to update shop with new image URL'
      });
    }
    
    logger.debug('SUCCESS: Image uploaded and shop updated');
    logger.debug('==== END UPLOAD IMAGE DEBUG INFO ====');
    
    logger.debug('Returning S3 key:', s3Key);
    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      imageUrl: s3Key // Return the S3 key instead of pre-signed URL
    });
    
  } catch (error) {
    logger.error('Error uploading image:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while uploading the image',
      error: error.message
    });
  }
});

// Route to get pre-signed URL for an image
router.get('/shops/:userId/:shopId/image/:imageType', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    const { userId, shopId, imageType } = req.params;
    
    logger.debug('==== GET IMAGE URL DEBUG INFO ====');
    logger.debug('Getting image URL for userId:', userId);
    logger.debug('Shop ID:', shopId);
    logger.debug('Image type:', imageType);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user'
      });
    }
    
    // Check if customer has shops array
    if (!customer.shops || !Array.isArray(customer.shops)) {
      return res.status(404).json({
        success: false,
        message: 'No shops found for this customer'
      });
    }
    
    // Find the shop in the array
    const shop = customer.shops.find(shop => shop.shopId === shopId);
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Get the S3 key for the image
    const s3Key = shop[`${imageType}S3Key`];
    
    logger.debug(`Looking for ${imageType}S3Key:`, s3Key);
    
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }
    
    // Generate a fresh pre-signed URL
    const s3Service = require('../services/s3Service');
    const presignedUrl = await s3Service.generatePresignedUrl(s3Key);
    
    logger.debug('Generated pre-signed URL for:', s3Key);
    logger.debug('==== END GET IMAGE URL DEBUG INFO ====');
    
    res.status(200).json({
      success: true,
      imageUrl: presignedUrl,
      // Also return a proxy URL that goes through our backend to avoid CORS issues
      proxyUrl: `/api/customer/shops/${userId}/${shopId}/image-proxy/${imageType}`
    });
    
  } catch (error) {
    logger.error('Error generating image URL:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while generating the image URL',
      error: error.message
    });
  }
});

// Route to proxy images to avoid CORS issues
router.get('/shops/:userId/:shopId/image-proxy/:imageType', addRequestSecurity, validateUserAccess, async (req, res) => {
  logger.debug('==== PROXY ROUTE CALLED ====');
  logger.debug('Request URL:', req.originalUrl);
  logger.debug('Request method:', req.method);
  try {
    const { userId, shopId, imageType } = req.params;
    
    logger.debug('==== IMAGE PROXY DEBUG INFO ====');
    logger.debug('Proxying image for userId:', userId);
    logger.debug('Shop ID:', shopId);
    logger.debug('Image type:', imageType);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user'
      });
    }
    
    // Check if customer has shops array
    if (!customer.shops || !Array.isArray(customer.shops)) {
      return res.status(404).json({
        success: false,
        message: 'No shops found for this customer'
      });
    }
    
    // Find the shop in the array
    const shop = customer.shops.find(shop => shop.shopId === shopId);
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Get the S3 key for the image
    let s3Key = shop[`${imageType}S3Key`];
    
    logger.debug(`Looking for ${imageType}S3Key, found initial value:`, s3Key);
    
    // Robustly extract the S3 key if the field contains a full URL
    if (s3Key && (s3Key.startsWith('http') || s3Key.includes('amazonaws.com'))) {
      try {
        const url = new URL(s3Key);
        s3Key = decodeURIComponent(url.pathname.substring(1)); // Remove leading slash and decode
        logger.debug(`Extracted S3 key from ${imageType}S3Key field:`, s3Key);
      } catch (urlError) {
        logger.error(`Error parsing S3 key which looks like a URL: ${s3Key}`, urlError);
        s3Key = null; // Invalidate if parsing fails
      }
    }

    // If no valid S3 key was found, try to extract it from the corresponding Url field as a fallback
    if (!s3Key) {
      const imageUrl = shop[`${imageType}Url`];
      logger.debug(`S3 key not found or invalid, falling back to ${imageType}Url:`, imageUrl);
      if (imageUrl && (imageUrl.startsWith('http') || imageUrl.includes('amazonaws.com'))) {
        try {
          const url = new URL(imageUrl);
          s3Key = decodeURIComponent(url.pathname.substring(1)); // Remove leading slash and decode
          logger.debug(`Extracted S3 key from fallback ${imageType}Url field:`, s3Key);
        } catch (urlError) {
          logger.error('Error parsing fallback image URL:', urlError);
        }
      }
    }
    
    if (!s3Key) {
      logger.error(`Could not determine a valid S3 key for ${imageType}`);
      return res.status(404).json({
        success: false,
        message: 'Image not found or key is invalid'
      });
    }
    
    // Get the image from S3 and serve it directly
    const s3Service = require('../services/s3Service');
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    
    try {
      logger.debug('S3 bucket name:', s3Service.bucketName);
      logger.debug('S3 key:', s3Key);
      
      const command = new GetObjectCommand({
        Bucket: s3Service.bucketName,
        Key: s3Key,
      });
      
      const s3Response = await s3Service.s3.send(command);
      
      // Set appropriate headers
      res.setHeader('Content-Type', s3Response.ContentType || 'image/jpeg');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // Convert the stream to buffer and send it
      const chunks = [];
      for await (const chunk of s3Response.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      
      res.send(buffer);
      
      logger.debug('==== END IMAGE PROXY DEBUG INFO ====');
      
    } catch (s3Error) {
      logger.error('Error fetching image from S3:', s3Error);
      res.status(500).json({
        success: false,
        message: 'Error fetching image from S3',
        error: s3Error.message
      });
    }
  } catch (error) {
    logger.error('Error in image proxy route:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing image proxy request'
    });
  }
});

// Route to proxy product images to avoid CORS issues
// SECURITY: This route is protected by authentication, user access validation, and rate limiting
router.get('/shops/:userId/:shopId/products/:productId/image-proxy', 
  imageOperationLimiter, // Rate limiting to prevent abuse
  addRequestSecurity, 
  validateUserAccess, 
  validateImageOperation, // Input validation
  async (req, res) => {
    logger.debug('🔒 [SECURITY] Product image proxy route accessed');
    logger.debug('🔒 [SECURITY] Request details:', {
      securityId: req.securityId,
      userId: req.params.userId,
      shopId: req.params.shopId,
      productId: req.params.productId,
      imageKey: req.query.imageKey,
      ip: req.ip,
      userAgent: req.get('User-Agent')?.substring(0, 100),
      timestamp: new Date().toISOString()
    });
  
  try {
    const { userId, shopId, productId } = req.params;
    const { imageKey } = req.query;
    
    // SECURITY: Additional input validation
    if (!imageKey || typeof imageKey !== 'string' || imageKey.length > 500) {
      logger.error('🔒 [SECURITY] Invalid imageKey provided:', imageKey);
      return res.status(400).json({
        success: false,
        message: 'Invalid image key provided',
        securityAlert: 'INVALID_IMAGE_KEY'
      });
    }
    
    // SECURITY: Validate imageKey format to prevent path traversal attacks
    if (imageKey.includes('..') || imageKey.includes('//') || !imageKey.startsWith('products/')) {
      logger.error('🔒 [SECURITY] Potential path traversal attack detected:', imageKey);
      return res.status(403).json({
        success: false,
        message: 'Invalid image key format',
        securityAlert: 'PATH_TRAVERSAL_ATTEMPT'
      });
    }
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user'
      });
    }
    
    // Check if customer has shops array
    if (!customer.shops || !Array.isArray(customer.shops)) {
      return res.status(404).json({
        success: false,
        message: 'No shops found for this customer'
      });
    }
    
    // Find the shop in the array
    const shop = customer.shops.find(shop => shop.shopId === shopId);
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Find the product in the shop
    const product = shop.products?.find(product => product.productId === productId);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // SECURITY: Verify that the image key belongs to this product
    if (!product.imageUrls || !product.imageUrls.some(url => {
      if (url.startsWith('https://')) {
        const urlObj = new URL(url);
        return urlObj.pathname.substring(1) === imageKey;
      }
      return url === imageKey;
    })) {
      logger.error('🔒 [SECURITY] Unauthorized image access attempt:', {
        userId,
        shopId,
        productId,
        imageKey,
        ip: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 100)
      });
      return res.status(403).json({
        success: false,
        message: 'Image not found in this product',
        securityAlert: 'UNAUTHORIZED_IMAGE_ACCESS'
      });
    }
    
    logger.debug('🔒 [SECURITY] Image access authorized for user:', userId);
    
    // Get the image from S3 and serve it directly
    const s3Service = require('../services/s3Service');
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    
    try {
      logger.debug('S3 bucket name:', s3Service.bucketName);
      logger.debug('S3 key:', imageKey);
      
      const command = new GetObjectCommand({
        Bucket: s3Service.bucketName,
        Key: imageKey,
      });
      
      const s3Response = await s3Service.s3.send(command);
      
      // SECURITY: Set appropriate headers with security considerations
      res.setHeader('Content-Type', s3Response.ContentType || 'image/jpeg');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevent MIME type sniffing
      res.setHeader('X-Frame-Options', 'DENY'); // Prevent clickjacking
      res.setHeader('X-XSS-Protection', '1; mode=block'); // Enable XSS protection
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); // Control referrer information
      res.setHeader('Access-Control-Allow-Origin', '*'); // CORS for image serving
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // Convert the stream to buffer and send it
      const chunks = [];
      for await (const chunk of s3Response.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      
      res.send(buffer);
      
      logger.debug('🔒 [SECURITY] Product image successfully served:', {
        securityId: req.securityId,
        userId,
        shopId,
        productId,
        imageKey,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
      
    } catch (s3Error) {
      logger.error('🔒 [SECURITY] S3 error in product image proxy:', {
        securityId: req.securityId,
        userId,
        shopId,
        productId,
        imageKey,
        error: s3Error.message,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
      res.status(500).json({
        success: false,
        message: 'Error fetching product image from S3',
        error: s3Error.message
      });
    }
    
  } catch (error) {
    logger.error('🔒 [SECURITY] General error in product image proxy:', {
      securityId: req.securityId,
      userId: req.params.userId,
      shopId: req.params.shopId,
      productId: req.params.productId,
      error: error.message,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      success: false,
      message: 'An error occurred while proxying the image',
      error: error.message
    });
  }
});

// Clean GET route to fetch a customer by clientId (for internal portal)
router.get('/clients/:clientId', async (req, res) => {
  logger.debug('==== GET /clients/:clientId ====');
  logger.debug('Client ID from params:', req.params.clientId);
  
  try {
    const { clientId } = req.params;
    
    if (!clientId || clientId === 'undefined') {
      logger.error('No client ID provided');
      return res.status(400).json({ 
        success: false, 
        message: 'ID client manquant' 
      });
    }
    
    const customersCollection = await getCustomersCollection();
    let customer;
    
    try {
      logger.debug('Trying to find customer with ID:', clientId);
      customer = await customersCollection.findOne({ _id: new ObjectId(clientId) });
      logger.debug('Found customer:', customer ? 'Yes' : 'No');
    } catch (err) {
      logger.error('Error finding customer:', err.message);
      // If ObjectId is invalid, immediately return 404
      return res.status(404).json({ 
        success: false, 
        message: 'Client introuvable (ID invalide)',
        details: err.message
      });
    }
    
    if (!customer) {
      logger.debug('No customer found with ID:', clientId);
      return res.status(404).json({ 
        success: false, 
        message: 'Client introuvable',
        clientId: clientId
      });
    }
    
    logger.debug('Successfully retrieved customer:', customer._id);
    res.status(200).json({ 
      success: true, 
      customer 
    });
    
  } catch (error) {
    logger.error('Unexpected error in GET /clients/:clientId:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du client',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Route to update a client (for internal portal)
router.put('/clients/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const updatedClientFields = req.body;

    if (!ObjectId.isValid(clientId)) {
      return res.status(400).json({ success: false, message: 'Invalid client ID format' });
    }

    // Remove potentially harmful or uneditable fields from the update
    delete updatedClientFields._id;
    delete updatedClientFields.userId;
    delete updatedClientFields.shops; // Prevent direct shops modification

    const customersCollection = await getCustomersCollection();
    
    // Update the client document
    const result = await customersCollection.updateOne(
      { _id: new ObjectId(clientId) },
      { $set: updatedClientFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Client updated successfully',
      data: result
    });
    
  } catch (error) {
    logger.error('Error updating client:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update client',
      error: error.message 
    });
  }
});

// Route to update a specific shop for a client (for internal portal)
router.put('/clients/:clientId/shops/:shopId', async (req, res) => {
  try {
    const { clientId, shopId } = req.params;
    const updatedShopFields = req.body;

    if (!ObjectId.isValid(clientId)) {
      return res.status(400).json({ success: false, message: 'Invalid client ID format' });
    }

    // Remove potentially harmful or uneditable fields from the update
    delete updatedShopFields._id;
    delete updatedShopFields.clientId;

    const customersCollection = await getCustomersCollection();

    // Find the customer
    const client = await customersCollection.findOne({ _id: new ObjectId(clientId) });
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    // Find the shop index in the array
    const shopIndex = client.shops.findIndex(shop => 
      String(shop.shopId) === String(shopId) || 
      String(shop._id) === String(shopId) || 
      String(shop.id) === String(shopId)
    );

    if (shopIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this client'
      });
    }

    // Preserve original shop data and only update the fields that were provided
    const originalShop = client.shops[shopIndex];
    const updatedShop = { ...originalShop };
    
    // Only update fields with meaningful values to avoid overwriting with empty strings/nulls
    Object.entries(updatedShopFields).forEach(([key, value]) => {
      if (key === '_id' || key === 'shopId') return;
      // Accept boolean and numeric values even if false/0, but skip undefined/null/empty strings
      const isEmptyString = typeof value === 'string' && value.trim() === '';
      if (value === undefined || value === null || isEmptyString) {
        return;
      }
      updatedShop[key] = value;
    });
    
    // Always update the updatedAt timestamp
    updatedShop.updatedAt = new Date();

    // Log the update if status is being changed
    if (updatedShopFields.status && updatedShopFields.status !== originalShop.status) {
      logger.debug('Updating shop status:', {
        shopId: originalShop.shopId,
        oldStatus: originalShop.status,
        newStatus: updatedShopFields.status,
        timestamp: new Date().toISOString()
      });
    }

    // Update the shop in the array
    const updateOperation = {
      $set: { 
        [`shops.${shopIndex}`]: updatedShop,
        updatedAt: new Date()
      }
    };

    // Update the customer document
    const result = await customersCollection.updateOne(
      { _id: new ObjectId(clientId) },
      updateOperation
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Client not found during update' });
    }

    if (result.modifiedCount === 0) {
      logger.debug('Shop update requested but data was identical to existing data.');
    }

    const shopResponse = {
      ...updatedShop,
      clientId: client._id.toString(),
      clientName: client.raisonSociale || client.name || '-',
      createdAt: updatedShop.createdAt || client.createdAt,
    };

    res.status(200).json({
      success: true,
      message: 'Shop updated successfully',
      shop: shopResponse,
      updatedClient: await customersCollection.findOne({ _id: new ObjectId(clientId) }),
    });

  } catch (error) {
    logger.error('Error updating shop:', error);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred while updating the shop', 
      error: error.message 
    });
  }
});

// Add this route after existing routes
router.get('/clients/:clientId/shops/:shopId', async (req, res) => {
  try {
    const { clientId, shopId } = req.params;
    const customersCollection = await getCustomersCollection();
    
    const customer = await customersCollection.findOne({
      _id: new ObjectId(clientId),
      'shops.shopId': shopId
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }
    
    // Find the specific shop
    const shop = customer.shops.find(s => s.shopId === shopId);
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    res.status(200).json({
      success: true,
      shop: {
        ...shop,
        clientId: customer._id.toString(),
        clientName: customer.raisonSociale || customer.name || '-',
        createdAt: shop.createdAt || customer.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la boutique',
      error: error.message
    });
  }
});

// Route to update shop documentation status - REQUIRES AUTHENTICATION
router.post('/shop/:shopId/documentation', validateAuthentication, async (req, res) => {
  logger.debug('Received request to update shop documentation status');
  logger.debug('Params:', req.params);
  logger.debug('Body:', req.body);
  
  try {
    const { shopId } = req.params;
    const { action, forceOverwrite } = req.body;
    if (!['document','mark_documented','undocument'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    if (!shopId || !action) {
      logger.debug('Missing required parameters');
      return res.status(400).json({
        success: false,
        message: 'Shop ID and action are required'
      });
    }

    const customersCollection = await getCustomersCollection();
    
    // Find the customer document that contains the shop
    logger.debug('Searching for customer with shopId:', shopId);
    const customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });

    // FIXED: Check if customer exists BEFORE using it
    if (!customer) {
      logger.debug('Shop not found');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    logger.debug('Found customer:', customer._id);

    // Find specific shop object
    const shop = customer.shops.find(s => s.shopId === shopId);
    if (!shop) {
      logger.debug('❌ [DOC-DELETE-ERROR] Shop not found in customer shops array');
      logger.debug('❌ [DOC-DELETE-ERROR] Available shop IDs in customer:', customer.shops.map(s => s.shopId));
      logger.debug('❌ [DOC-DELETE-ERROR] Requested shopId:', shopId);
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    logger.debug('✅ [DOC-DELETE-SUCCESS] Found shop in customer document');
    logger.debug('📊 [DOC-DELETE-INFO] Shop details:', {
      shopId: shop.shopId,
      nomProjet: shop.nomProjet,
      currentDocStatus: shop.documented,
      productsCount: shop.products?.length || 0
    });
    logger.debug('📊 [DOC-DELETE-INFO] Requested action:', action);

    // Handle SharePoint documentation generation
    if (action === 'document') {
      try {
        // SECURITY: Use spawn instead of exec to prevent command injection
        const { spawn } = require('child_process');
        const base64 = require('base64-js');
        
        // Create shop data with single product for appending
        const shopData = {
          nomProjet: shop.nomProjet || shop.name,
          shopifyDomain: shop.shopifyDomain,
          dateSortie: shop.dateSortie,
          dateCommercialisation: shop.dateCommercialisation,
          raisonSociale: customer.raisonSociale,
          products: [product] // Only this single product
        };
        
        // Encode shop data as base64
        const shopDataString = JSON.stringify(shopData);
        const encodedShopData = base64.fromByteArray(new TextEncoder().encode(shopDataString));
        
        // Paths for the template and output
        const docsDir = path.join(__dirname, '../services/generated_docs');
        if (!fs.existsSync(docsDir)) {
          fs.mkdirSync(docsDir, { recursive: true });
        }

        // Sanitize project name for filename matching
        const safeNomProjet = (shop.nomProjet || 'PROJET').replace(/[^a-zA-Z0-9]/g, '_');
        const filenamePrefix = `FICHES_PRODUITS_${safeNomProjet}`;

        // Look for an existing document for this shop
        const existingFiles = fs
          .readdirSync(docsDir)
          .filter((f) => f.startsWith(filenamePrefix) && f.endsWith('.xlsx'))
          .map((f) => ({
            name: f,
            mtime: fs.statSync(path.join(docsDir, f)).mtimeMs,
          }));

        let templatePath;
        let outputPath;

        if (existingFiles.length > 0) {
          // Use the most recent existing file to append
          existingFiles.sort((a, b) => b.mtime - a.mtime);
          templatePath = path.join(docsDir, existingFiles[0].name);
          outputPath = templatePath; // Overwrite (append) the same file
          logger.debug(`Appending product to existing XLSX: ${templatePath}`);
        } else {
          // No existing file, use the base template and create a new file
          templatePath = path.join(
            __dirname,
            '../services/FichesProduitTemplate/FICHES.PRODUITS_SHOPIFY_CLIENT_PROJET.xlsx'
          );
          outputPath = path.join(docsDir, `${filenamePrefix}_${Date.now()}.xlsx`);
          logger.debug(`Creating new XLSX for product documentation: ${outputPath}`);
        }
        
        logger.debug('Calling merch XLSX processor for single product...');
        
        // SECURITY: Use spawn with array arguments to prevent command injection
        const pythonScript = path.join(__dirname, '../services/merch_xlsx_processor.py');
        const args = [pythonScript, templatePath, encodedShopData, outputPath];
        
        const pythonProcess = spawn('python3', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false // SECURITY: Disable shell to prevent injection
        });
        
        let stdout = '';
        let stderr = '';
        
        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        // Wait for process to complete
        await new Promise((resolve, reject) => {
          pythonProcess.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Python process exited with code ${code}`));
            }
          });
          
          pythonProcess.on('error', (error) => {
            reject(error);
          });
        });
        
        // Log any stderr output as a warning, but do NOT treat it as a fatal error.
        // openpyxl (used by merch_xlsx_processor.py) prints benign warnings such as
        // "Data Validation extension is not supported" on stderr. These do not
        // indicate a failure and should be ignored.
        if (stderr) {
          console.warn('[merch_xlsx_processor warning]', stderr);
        }
        
        logger.debug('XLSX processor stdout:', stdout);
        logger.debug(`Product documentation generated successfully: ${outputPath}`);
        
        // Update the shop's documentation status only after successful generation
        const updateResult = await customersCollection.updateOne(
          { 'shops.shopId': shopId },
          { 
            $set: { 
              'shops.$.documented': 'documented',
              'shops.$.updatedAt': new Date()
            }
          }
        );

        if (updateResult.modifiedCount === 0) {
          logger.debug('No documents were modified');
          return res.status(500).json({
            success: false,
            message: 'Failed to update shop documentation status'
          });
        }
        
        // Fetch updated customer and shop to regenerate merchandising XLSX on SharePoint
        try {
          const updatedCustomer = await customersCollection.findOne({ _id: customer._id });
          const updatedShop = updatedCustomer.shops.find((s) => s.shopId === shopId);
          await generateDocumentation(updatedCustomer, updatedShop, true); // force overwrite merch file with new product row
        } catch (regenErr) {
          logger.error('Error regenerating merchandising XLSX after single product doc:', regenErr);
        }
        
        res.status(200).json({
          success: true,
          message: `Documentation SharePoint générée avec succès`,
          shopId,
          documented: 'documented'
        });
      } catch (err) {
        logger.error('Error generating documentation:', err);
        
        // Handle the special case where documentation already exists
        if (err.message === 'DOCUMENTATION_EXISTS') {
          return res.status(409).json({
            success: false,
            message: 'DOCUMENTATION_EXISTS',
            shopId,
            error: 'Documentation already exists for this shop'
          });
        }
        
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la génération de la documentation SharePoint',
          error: err.message
        });
      }
    } else {
      // For other actions (mark_documented, undocument), update status first
      const newStatus = action === 'mark_documented' ? 'documented' : 'undocumented';
      const productDocumentedStatus = action === 'mark_documented' ? true : false;
      
      logger.debug('🔄 [DOC-UPDATE] Starting documentation status update...');
      logger.debug('🔄 [DOC-UPDATE] Action requested:', action);
      logger.debug('🔄 [DOC-UPDATE] New shop status:', newStatus);
      logger.debug('🔄 [DOC-UPDATE] New product documented status:', productDocumentedStatus);
      
      // Find the shop and get products count for logging
      const shopData = customer.shops.find(s => s.shopId === shopId);
      const productsCount = shopData?.products?.length || 0;
      
      logger.debug('📊 [DOC-UPDATE] Shop data before update:', {
        currentStatus: shopData?.documented,
        productsCount: productsCount,
        shopId: shopId
      });
      
      // Update the shop and all its products documentation status
      const updateOperations = {
            'shops.$.documented': newStatus,
            'shops.$.updatedAt': new Date()
      };
      
      // Update all products' documented status
      if (productsCount > 0) {
        logger.debug(`🔄 [DOC-UPDATE] Preparing to update ${productsCount} products...`);
        for (let i = 0; i < productsCount; i++) {
          updateOperations[`shops.$.products.${i}.documented`] = productDocumentedStatus;
          }
        logger.debug('🔄 [DOC-UPDATE] Product update operations prepared');
        }
      
      logger.debug('🔄 [DOC-UPDATE] Final update operations:', updateOperations);
      logger.debug('🔄 [DOC-UPDATE] Executing database update...');
      
      const updateResult = await customersCollection.updateOne(
        { 'shops.shopId': shopId },
        { $set: updateOperations }
      );

      logger.debug('📊 [DOC-UPDATE] Database update result:', {
        acknowledged: updateResult.acknowledged,
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount,
        upsertedCount: updateResult.upsertedCount
      });

      if (updateResult.modifiedCount === 0) {
        logger.debug('❌ [DOC-UPDATE-ERROR] No documents were modified');
        logger.debug('❌ [DOC-UPDATE-ERROR] This could mean the shop was not found or data was already in the requested state');
        return res.status(500).json({
          success: false,
          message: 'Failed to update shop documentation status'
        });
      }

      logger.debug(`✅ [DOC-UPDATE-SUCCESS] Successfully updated shop documentation status and ${productsCount} products`);
      
      res.status(200).json({
        success: true,
        message: action === 'mark_documented' 
          ? `Boutique et ${productsCount} produits marqués comme documentés`
          : `Documentation supprimée avec succès pour la boutique et ${productsCount} produits`,
        shopId,
        documented: newStatus
      });
    }
  } catch (error) {
    logger.error('💥 [DOC-UPDATE-FATAL-ERROR] Critical error updating shop documentation status');
    logger.error('💥 [DOC-UPDATE-FATAL-ERROR] Error name:', error.name);
    logger.error('💥 [DOC-UPDATE-FATAL-ERROR] Error message:', error.message);
    logger.error('💥 [DOC-UPDATE-FATAL-ERROR] Error stack:', error.stack);
    logger.error('💥 [DOC-UPDATE-FATAL-ERROR] Request params:', req.params);
    logger.error('💥 [DOC-UPDATE-FATAL-ERROR] Request body:', req.body);
    logger.error('💥 [DOC-UPDATE-FATAL-ERROR] Timestamp:', new Date().toISOString());
    
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating shop documentation status',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add a GET route for the same path to handle OPTIONS requests
router.get('/shop/:shopId/documentation', (req, res) => {
  res.status(200).json({ message: 'GET method not supported for this endpoint' });
});

// Route to get products for a shop (for documentation dropdown)
router.get('/shop/:shopId/products', async (req, res) => {
  try {
    const { shopId } = req.params;
    
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document that contains the shop
    const customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Find specific shop object
    const shop = customer.shops.find(s => s.shopId === shopId);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    
    // Filter only valid products
    const validProducts = (shop.products || []).filter(product => 
      product.active === true || product.validated === true || product.validatedAt
    );
    
    res.status(200).json({
      success: true,
      products: validProducts,
      shopName: shop.nomProjet || shop.name
    });
  } catch (error) {
    logger.error('Error fetching shop products:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching shop products',
      error: error.message
    });
  }
});

// Route to handle individual product documentation actions
router.post('/shop/:shopId/product/:productId/documentation', async (req, res) => {
  try {
    const { shopId, productId } = req.params;
    const { action } = req.body; // 'document', 'mark_documented', 'undocument'
    
    if (!['document', 'mark_documented', 'undocument'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
    
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document that contains the shop
    const customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Find specific shop and product
    const shop = customer.shops.find(s => s.shopId === shopId);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    
    const productIndex = shop.products?.findIndex(p => p.productId === productId);
    if (productIndex === -1 || productIndex === undefined) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    const product = shop.products[productIndex];
    
    if (action === 'document') {
      try {
        // Call the merch XLSX processor to append product to existing document
        const { spawn } = require('child_process');
        const base64 = require('base64-js');
        
        // Create shop data with single product for appending
        const shopData = {
          nomProjet: shop.nomProjet || shop.name,
          shopifyDomain: shop.shopifyDomain,
          dateSortie: shop.dateSortie,
          dateCommercialisation: shop.dateCommercialisation,
          raisonSociale: customer.raisonSociale,
          products: [product] // Only this single product
        };
        
        // Encode shop data as base64
        const shopDataString = JSON.stringify(shopData);
        const encodedShopData = base64.fromByteArray(new TextEncoder().encode(shopDataString));
        
        // Paths for the template and output
        const docsDir = path.join(__dirname, '../services/generated_docs');
        if (!fs.existsSync(docsDir)) {
          fs.mkdirSync(docsDir, { recursive: true });
        }

        // Sanitize project name for filename matching
        const safeNomProjet = (shop.nomProjet || 'PROJET').replace(/[^a-zA-Z0-9]/g, '_');
        const filenamePrefix = `FICHES_PRODUITS_${safeNomProjet}`;

        // Look for an existing document for this shop
        const existingFiles = fs
          .readdirSync(docsDir)
          .filter((f) => f.startsWith(filenamePrefix) && f.endsWith('.xlsx'))
          .map((f) => ({
            name: f,
            mtime: fs.statSync(path.join(docsDir, f)).mtimeMs,
          }));

        let templatePath;
        let outputPath;

        if (existingFiles.length > 0) {
          // Use the most recent existing file to append
          existingFiles.sort((a, b) => b.mtime - a.mtime);
          templatePath = path.join(docsDir, existingFiles[0].name);
          outputPath = templatePath; // Overwrite (append) the same file
          logger.debug(`Appending product to existing XLSX: ${templatePath}`);
        } else {
          // No existing file, use the base template and create a new file
          templatePath = path.join(
            __dirname,
            '../services/FichesProduitTemplate/FICHES.PRODUITS_SHOPIFY_CLIENT_PROJET.xlsx'
          );
          outputPath = path.join(docsDir, `${filenamePrefix}_${Date.now()}.xlsx`);
          logger.debug(`Creating new XLSX for product documentation: ${outputPath}`);
        }
        
        logger.debug('Calling merch XLSX processor for single product...');
        
        // SECURITY: Use spawn with array arguments to prevent command injection
        const pythonScript = path.join(__dirname, '../services/merch_xlsx_processor.py');
        const args = [pythonScript, templatePath, encodedShopData, outputPath];
        
        const pythonProcess = spawn('python3', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false // SECURITY: Disable shell to prevent injection
        });
        
        let stdout = '';
        let stderr = '';
        
        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        // Wait for process to complete
        await new Promise((resolve, reject) => {
          pythonProcess.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Python process exited with code ${code}`));
            }
          });
          
          pythonProcess.on('error', (error) => {
            reject(error);
          });
        });
        
        // Log any stderr output as a warning, but do NOT treat it as a fatal error.
        // openpyxl (used by merch_xlsx_processor.py) prints benign warnings such as
        // "Data Validation extension is not supported" on stderr. These do not
        // indicate a failure and should be ignored.
        if (stderr) {
          console.warn('[merch_xlsx_processor warning]', stderr);
        }
        
        logger.debug('XLSX processor stdout:', stdout);
        logger.debug(`Product documentation generated successfully: ${outputPath}`);
        
        // Update product status to documented
        const updateResult = await customersCollection.updateOne(
          { 'shops.shopId': shopId },
          { 
            $set: { 
              [`shops.$.products.${productIndex}.documented`]: true,
              [`shops.$.products.${productIndex}.updatedAt`]: new Date()
            }
          }
        );
        
        if (updateResult.modifiedCount === 0) {
          return res.status(500).json({
            success: false,
            message: 'Failed to update product documentation status'
          });
        }
        
        // Fetch updated customer and shop to regenerate merchandising XLSX on SharePoint
        try {
          const updatedCustomer = await customersCollection.findOne({ _id: customer._id });
          const updatedShop = updatedCustomer.shops.find((s) => s.shopId === shopId);
          await generateDocumentation(updatedCustomer, updatedShop, true); // force overwrite merch file with new product row
        } catch (regenErr) {
          logger.error('Error regenerating merchandising XLSX after single product doc:', regenErr);
        }

        res.status(200).json({
          success: true,
          message: `Produit "${product.titre}" documenté avec succès dans SharePoint`,
          productId,
          documented: true
        });
        
      } catch (error) {
        logger.error('Error generating product documentation:', error);
        res.status(500).json({
          success: false,
          message: `Erreur lors de la génération de la documentation: ${error.message}`,
          productId,
          documented: false
        });
      }
      
    } else {
      // For mark_documented and undocument
      const newDocumentedStatus = action === 'mark_documented';
      
      const updateResult = await customersCollection.updateOne(
        { 'shops.shopId': shopId },
        { 
          $set: { 
            [`shops.$.products.${productIndex}.documented`]: newDocumentedStatus,
            [`shops.$.products.${productIndex}.updatedAt`]: new Date()
          }
        }
      );
      
      if (updateResult.modifiedCount === 0) {
        return res.status(500).json({
          success: false,
          message: 'Failed to update product documentation status'
        });
      }
      
      res.status(200).json({
        success: true,
        message: action === 'mark_documented' 
          ? `Produit "${product.titre}" marqué comme documenté`
          : `Documentation supprimée pour le produit "${product.titre}"`,
        productId,
        documented: newDocumentedStatus
      });
    }
    
  } catch (error) {
    logger.error('Error updating product documentation:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating product documentation',
      error: error.message
    });
  }
});

// Route to add a product to a shop
router.post('/shops/:userId/:shopId/products', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    const { userId, shopId } = req.params;
    const productData = req.body;
    
    logger.debug('==== CREATE PRODUCT DEBUG INFO ====');
    logger.debug('Creating product for userId:', userId);
    logger.debug('Shop ID:', shopId);
    logger.debug('Product data:', productData);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      logger.debug(`FAILURE: No customer found with userId: ${userId}`);
      logger.debug('==== END CREATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    // Find the specific shop
    const shop = customer.shops?.find(s => s.shopId === shopId);
    
    if (!shop) {
      logger.debug(`FAILURE: No shop found with shopId: ${shopId}`);
      logger.debug('==== END CREATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Check if shop is valid
    if (shop.status !== 'valid') {
      logger.debug(`FAILURE: Shop doesn't meet requirements - Status: ${shop.status}`);
      logger.debug('==== END CREATE PRODUCT DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Shop must be valid to create products'
      });
    }
    
    logger.debug(`SUCCESS: Found valid shop with shopId: ${shopId}`);
    
    // Create the new product with timestamp and unique ID
    const newProduct = {
      ...productData,
      productId: new ObjectId().toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
      // Initialize boolean flags as specified
      active: false,
      documented: false,
      hasShopify: false,
      hasEC: false
    };
    
    // Add the product to the shop's products array
    const result = await customersCollection.updateOne(
      { userId, 'shops.shopId': shopId },
      { 
        $push: { 'shops.$.products': newProduct },
        $set: { 'shops.$.updatedAt': new Date() }
      }
    );
    
    if (result.modifiedCount === 0) {
      logger.debug('Failed to add product to shop');
      logger.debug('==== END CREATE PRODUCT DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to add product to shop'
      });
    }
    
    logger.debug('Product added successfully to shop');
    logger.debug('Product ID:', newProduct.productId);
    logger.debug('==== END CREATE PRODUCT DEBUG INFO ====');
    
    // Return success response
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      productId: newProduct.productId,
      product: newProduct
    });
  } catch (error) {
    logger.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating the product',
      error: error.message
    });
  }
});

// Route to get all products for a specific shop
router.get('/shops/:userId/:shopId/products', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    const { userId, shopId } = req.params;
    
    logger.debug('==== FETCH PRODUCTS DEBUG INFO ====');
    logger.debug('Fetching products for userId:', userId);
    logger.debug('Shop ID:', shopId);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      logger.debug(`FAILURE: No customer found with userId: ${userId}`);
      logger.debug('==== END FETCH PRODUCTS DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    // Find the specific shop
    const shop = customer.shops?.find(s => s.shopId === shopId);
    
    if (!shop) {
      logger.debug(`FAILURE: No shop found with shopId: ${shopId}`);
      logger.debug('==== END FETCH PRODUCTS DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    logger.debug(`SUCCESS: Found shop with shopId: ${shopId}`);
    
    // Get products array (initialize if doesn't exist)
    const products = shop.products || [];
    logger.debug(`Found ${products.length} products for this shop`);
    
    // Generate pre-signed URLs for all product images
    logger.debug(`Generating signed URLs for ${products.length} products...`);
    const productsWithSignedUrls = await Promise.all(
      products.map(async (product) => {
        if (product.imageUrls && product.imageUrls.length > 0) {
          logger.debug(`Processing ${product.imageUrls.length} images for product ${product.productId || product.titre}`);
          try {
            const signedUrls = await Promise.all(
              product.imageUrls.map(async (url) => {
                try {
                  // Handle both full S3 URLs and S3 keys
                  let key;
                  if (url.startsWith('https://')) {
                    // Full S3 URL - extract the key
                    const key = decodeURIComponent(new URL(url).pathname.substring(1));
                    return await getSignedUrl(key);
                  } else {
                    // Already an S3 key
                    return await getSignedUrl(url);
                  }
                } catch (urlError) {
                  logger.error(`Failed to generate signed URL for image: ${url}`, urlError);
                  // Return the original URL if signing fails
                  return url;
                }
              })
            );
            return { ...product, imageUrls: signedUrls };
          } catch (e) {
            logger.error(`Failed to generate signed URLs for product ${product.productId}:`, e);
            // Return the product with original URLs if signing fails
            return product;
          }
        }
        return product;
      })
    );
    
    logger.debug('==== END FETCH PRODUCTS DEBUG INFO ====');
    
    // Return products array with signed URLs
    res.status(200).json({
      success: true,
      products: productsWithSignedUrls,
      shopName: shop.nomProjet || shop.name || 'Shop',
      shopStatus: shop.status
    });
  } catch (error) {
    logger.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching products',
      error: error.message
    });
  }
});

// Route to update a product in a shop
router.put('/shops/:userId/:shopId/products/:productId', addRequestSecurity, validateUserAccess, async (req, res) => {
  try {
    const { userId, shopId, productId } = req.params;
    const productData = req.body;
    
    logger.debug('==== UPDATE PRODUCT DEBUG INFO ====');
    logger.debug('Updating product for userId:', userId);
    logger.debug('Shop ID:', shopId);
    logger.debug('Product ID:', productId);
    logger.debug('Product data:', productData);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      logger.debug(`FAILURE: No customer found with userId: ${userId}`);
      logger.debug('==== END UPDATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    // Find the specific shop
    const shop = customer.shops?.find(s => s.shopId === shopId);
    
    if (!shop) {
      logger.debug(`FAILURE: No shop found with shopId: ${shopId}`);
      logger.debug('==== END UPDATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Find the specific product
    const productIndex = shop.products?.findIndex(p => p.productId === productId);
    
    if (productIndex === -1 || productIndex === undefined) {
      logger.debug(`FAILURE: No product found with productId: ${productId}`);
      logger.debug('==== END UPDATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    logger.debug(`SUCCESS: Found product with productId: ${productId}`);
    
    // Remove status fields that customers shouldn't be able to modify
    const { active, documented, hasShopify, hasEC, ...allowedProductData } = productData;
    
    // Get the existing product to preserve all fields
    const existingProduct = shop.products[productIndex];
    
    // Create updated product by merging existing data with new data
    const updatedProduct = {
      ...existingProduct,  // Preserve all existing fields
      ...allowedProductData,  // Override only the fields being updated
      productId: productId, // Keep the original product ID
      updatedAt: new Date(),
      // Preserve original creation timestamp
      createdAt: existingProduct.createdAt,
      // Preserve existing status fields (customers can't modify these)
      active: existingProduct.active,
      documented: existingProduct.documented,
      hasShopify: existingProduct.hasShopify,
      hasEC: existingProduct.hasEC
    };
    
    // Update the product in the shop's products array
    const result = await customersCollection.updateOne(
      { userId, 'shops.shopId': shopId },
      { 
        $set: { 
          [`shops.$.products.${productIndex}`]: updatedProduct,
          'shops.$.updatedAt': new Date()
        }
      }
    );
    
    if (result.modifiedCount === 0) {
      logger.debug('Failed to update product in shop');
      logger.debug('==== END UPDATE PRODUCT DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to update product in shop'
      });
    }
    
    logger.debug('Product updated successfully in shop');
    logger.debug('==== END UPDATE PRODUCT DEBUG INFO ====');
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      productId: productId,
      product: updatedProduct
    });
  } catch (error) {
    logger.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the product',
      error: error.message
    });
  }
});



router.post('/shops/:shopId/upload/logo', addRequestSecurity, validateShopUploadAccess, customerImageUpload.single('logo'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No logo file uploaded' });
    }

    const customersCollection = await getCustomersCollection();
    const shopId = req.params.shopId;
    const sessionUserId = req.session.userInfo?.sub || req.session.userInfo?.userId;
    
    // Verify that the shop belongs to the authenticated user
    const customer = await customersCollection.findOne({
      userId: sessionUserId,
      'shops.shopId': shopId
    });

    if (!customer) {
      logger.error('🚨 SECURITY: User attempting to upload to unauthorized shop');
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied: Shop not found or unauthorized' 
      });
    }

    // Read the uploaded file
    const fileBuffer = await fs.promises.readFile(req.file.path);
    
    // Generate unique key for S3 (matching S3 service structure)
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const fileName = `${timestamp}-${randomString}${fileExtension}`;
    const s3Key = `shops/shop-${shopId}/logo/${fileName}`;
    
    logger.debug(`[CUSTOMER LOGO UPLOAD] Uploading to S3 with key: ${s3Key}`);
    
    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: req.file.mimetype,
      ACL: 'private'
    });
    
    await s3.send(uploadCommand);
    
    // Generate signed URL for the uploaded image
    const signedUrl = await getSignedUrl(s3Key);
    
    logger.debug(`[CUSTOMER LOGO UPLOAD] Successfully uploaded to S3, signed URL generated`);
    logger.debug(`[CUSTOMER LOGO UPLOAD] S3 Key to store: ${s3Key}`);
    logger.debug(`[CUSTOMER LOGO UPLOAD] Signed URL: ${signedUrl.substring(0, 100)}...`);
    
    // Clean up temporary file
    try {
      await fs.promises.unlink(req.file.path);
    } catch (unlinkError) {
      console.warn(`[CUSTOMER LOGO UPLOAD] Failed to delete temp file:`, unlinkError);
    }
    
    // Update shop with logo URL and the clean S3 key
    const result = await customersCollection.updateOne(
      { userId: sessionUserId, 'shops.shopId': shopId },
      { 
        $set: { 
          'shops.$.logoUrl': signedUrl, // The full URL for frontend use
          'shops.$.logoS3Key': s3Key,      // The clean key for proxy use
          'shops.$.updatedAt': new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    res.json({ 
      success: true, 
      logoUrl: signedUrl,
      message: 'Logo uploaded successfully' 
    });
  } catch (error) {
    logger.error('Error uploading logo:', error);
    
    // Clean up temporary file on error
    if (req.file && req.file.path) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (unlinkError) {
        console.warn(`[CUSTOMER LOGO UPLOAD] Failed to delete temp file on error:`, unlinkError);
      }
    }
    
    res.status(500).json({ success: false, message: 'Error uploading logo' });
  }
});

router.post('/shops/:shopId/upload/banner', addRequestSecurity, validateShopUploadAccess, customerImageUpload.fields([
  { name: 'desktopBanner', maxCount: 1 },
  { name: 'mobileBanner', maxCount: 1 }
]), handleMulterError, async (req, res) => {
  try {
    if (!req.files || (!req.files.desktopBanner && !req.files.mobileBanner)) {
      return res.status(400).json({ success: false, message: 'No banner files uploaded' });
    }

    const customersCollection = await getCustomersCollection();
    const shopId = req.params.shopId;
    const sessionUserId = req.session.userInfo?.sub || req.session.userInfo?.userId;
    
    // Verify that the shop belongs to the authenticated user
    const customer = await customersCollection.findOne({
      userId: sessionUserId,
      'shops.shopId': shopId
    });

    if (!customer) {
      logger.error('🚨 SECURITY: User attempting to upload to unauthorized shop');
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied: Shop not found or unauthorized' 
      });
    }

    const updateData = { 'shops.$.updatedAt': new Date() };
    const responseData = { success: true, message: 'Banners uploaded successfully' };
    const uploadedFiles = [];

    // Process desktop banner if uploaded
    if (req.files.desktopBanner) {
      const file = req.files.desktopBanner[0];
      const fileBuffer = await fs.promises.readFile(file.path);
      
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const fileName = `${timestamp}-${randomString}${fileExtension}`;
      const s3Key = `shops/shop-${shopId}/desktopBanner/${fileName}`;
      
      logger.debug(`[CUSTOMER BANNER UPLOAD] Uploading desktop banner to S3 with key: ${s3Key}`);
      
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: file.mimetype,
        ACL: 'private'
      });
      
      await s3.send(uploadCommand);
      const signedUrl = await getSignedUrl(s3Key);
      
      logger.debug(`[CUSTOMER BANNER UPLOAD] Desktop banner S3 Key to store: ${s3Key}`);
      logger.debug(`[CUSTOMER BANNER UPLOAD] Desktop banner signed URL: ${signedUrl.substring(0, 100)}...`);
      
      updateData['shops.$.desktopBannerUrl'] = signedUrl; // Full URL for frontend
      updateData['shops.$.desktopBannerS3Key'] = s3Key;      // Clean key for proxy
      responseData.desktopBannerUrl = signedUrl;
      uploadedFiles.push(file.path);
    }

    // Process mobile banner if uploaded
    if (req.files.mobileBanner) {
      const file = req.files.mobileBanner[0];
      const fileBuffer = await fs.promises.readFile(file.path);
      
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const fileName = `${timestamp}-${randomString}${fileExtension}`;
      const s3Key = `shops/shop-${shopId}/mobileBanner/${fileName}`;
      
      logger.debug(`[CUSTOMER BANNER UPLOAD] Uploading mobile banner to S3 with key: ${s3Key}`);
      
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: file.mimetype,
        ACL: 'private'
      });
      
      await s3.send(uploadCommand);
      const signedUrl = await getSignedUrl(s3Key);
      
      logger.debug(`[CUSTOMER BANNER UPLOAD] Mobile banner S3 Key to store: ${s3Key}`);
      logger.debug(`[CUSTOMER BANNER UPLOAD] Mobile banner signed URL: ${signedUrl.substring(0, 100)}...`);
      
      updateData['shops.$.mobileBannerUrl'] = signedUrl; // Full URL for frontend
      updateData['shops.$.mobileBannerS3Key'] = s3Key;      // Clean key for proxy
      responseData.mobileBannerUrl = signedUrl;
      uploadedFiles.push(file.path);
    }

    // Clean up temporary files
    for (const filePath of uploadedFiles) {
      try {
        await fs.promises.unlink(filePath);
      } catch (unlinkError) {
        console.warn(`[CUSTOMER BANNER UPLOAD] Failed to delete temp file:`, unlinkError);
      }
    }

    const result = await customersCollection.updateOne(
      { userId: sessionUserId, 'shops.shopId': shopId },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    res.json(responseData);
  } catch (error) {
    logger.error('Error uploading banners:', error);
    
    // Clean up temporary files on error
    if (req.files) {
      const filesToClean = [];
      if (req.files.desktopBanner) filesToClean.push(req.files.desktopBanner[0].path);
      if (req.files.mobileBanner) filesToClean.push(req.files.mobileBanner[0].path);
      
      for (const filePath of filesToClean) {
        try {
          await fs.promises.unlink(filePath);
        } catch (unlinkError) {
          console.warn(`[CUSTOMER BANNER UPLOAD] Failed to delete temp file on error:`, unlinkError);
        }
      }
    }
    
    res.status(500).json({ success: false, message: 'Error uploading banners' });
  }
});

// NEW: Route to upload favicon
router.post('/shops/:shopId/upload/favicon', addRequestSecurity, validateShopUploadAccess, customerImageUpload.single('favicon'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No favicon file uploaded' });
    }

    const customersCollection = await getCustomersCollection();
    const shopId = req.params.shopId;
    const sessionUserId = req.session.userInfo?.sub || req.session.userInfo?.userId;
    
    // Verify that the shop belongs to the authenticated user
    const customer = await customersCollection.findOne({
      userId: sessionUserId,
      'shops.shopId': shopId
    });

    if (!customer) {
      logger.error('🚨 SECURITY: User attempting to upload to unauthorized shop');
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied: Shop not found or unauthorized' 
      });
    }

    // Read the uploaded file
    const fileBuffer = await fs.promises.readFile(req.file.path);
    
    // Generate unique key for S3
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const fileName = `${timestamp}-${randomString}${fileExtension}`;
    const s3Key = `shops/shop-${shopId}/favicon/${fileName}`;
    
    logger.debug(`[CUSTOMER FAVICON UPLOAD] Uploading to S3 with key: ${s3Key}`);
    
    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: req.file.mimetype,
      ACL: 'private'
    });
    
    await s3.send(uploadCommand);
    
    // Generate signed URL for the uploaded image
    const signedUrl = await getSignedUrl(s3Key);
    
    logger.debug(`[CUSTOMER FAVICON UPLOAD] Successfully uploaded to S3, signed URL generated`);
    logger.debug(`[CUSTOMER FAVICON UPLOAD] S3 Key to store: ${s3Key}`);
    logger.debug(`[CUSTOMER FAVICON UPLOAD] Signed URL: ${signedUrl.substring(0, 100)}...`);
    
    // Clean up temporary file
    try {
      await fs.promises.unlink(req.file.path);
    } catch (unlinkError) {
      console.warn(`[CUSTOMER FAVICON UPLOAD] Failed to delete temp file:`, unlinkError);
    }
    
    // Update shop with favicon URL and the clean S3 key
    const result = await customersCollection.updateOne(
      { userId: sessionUserId, 'shops.shopId': shopId },
      { 
        $set: { 
          'shops.$.faviconUrl': signedUrl, // Full URL for frontend
          'shops.$.faviconS3Key': s3Key,      // Clean key for proxy
          'shops.$.updatedAt': new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    res.json({ 
      success: true, 
      faviconUrl: signedUrl,
      message: 'Favicon uploaded successfully' 
    });
  } catch (error) {
    logger.error('Error uploading favicon:', error);
    
    // Clean up temporary file on error
    if (req.file && req.file.path) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (unlinkError) {
        console.warn(`[CUSTOMER FAVICON UPLOAD] Failed to delete temp file on error:`, unlinkError);
      }
    }
    
    res.status(500).json({ success: false, message: 'Error uploading favicon' });
  }
});

// UPLOAD ROUTE MOVED TO customerUpload.js TO AVOID BODY PARSER CONFLICTS

// Debug: Log all registered routes
logger.debug('🔍 [DEBUG] Customer routes loaded. Available routes:');
router.stack.forEach((layer) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods);
    logger.debug(`  ${methods.join(',').toUpperCase()} ${layer.route.path}`);
  }
});

// Route to delete a specific product image
// SECURITY: This endpoint is protected by:
// - Rate limiting (50 operations per 15 minutes per user)
// - Request security logging and tracking
// - User access validation (users can only access their own data)
// - Input validation (parameter format and type checking)
// - Ownership validation (ensures product belongs to authenticated user)
// - Audit logging (all operations are logged for security monitoring)
router.delete('/shops/:userId/:shopId/products/:productId/images/:imageIndex', 
  imageOperationLimiter, // Rate limiting to prevent abuse
  addRequestSecurity, 
  validateUserAccess, 
  validateImageOperation, // Input validation
  async (req, res) => {
  try {
    const { userId, shopId, productId, imageIndex } = req.params;
    
    logger.debug('==== DELETE PRODUCT IMAGE DEBUG INFO ====');
    logger.debug('Deleting product image for userId:', userId);
    logger.debug('Shop ID:', shopId);
    logger.debug('Product ID:', productId);
    logger.debug('Image index:', imageIndex);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      logger.error('🔒 [SECURITY] Unauthorized access attempt - customer not found for userId:', userId);
      logger.debug('==== END DELETE PRODUCT IMAGE DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId,
        securityAlert: 'CUSTOMER_NOT_FOUND'
      });
    }
    
    // SECURITY: Additional validation - ensure the authenticated user matches the requested userId
    const sessionUserId = req.session.userInfo?.sub || req.session.userInfo?.userId;
    if (sessionUserId !== userId) {
      logger.error('🔒 [SECURITY] User ID mismatch in delete operation:', {
        sessionUserId: sessionUserId,
        requestedUserId: userId,
        userEmail: req.session.userInfo?.email,
        ip: req.ip
      });
      return res.status(403).json({
        success: false,
        message: 'Access denied: User ID mismatch',
        securityAlert: 'USER_ID_MISMATCH'
      });
    }
    
    // Find the specific shop
    const shop = customer.shops?.find(s => s.shopId === shopId);
    
    if (!shop) {
      logger.debug(`FAILURE: No shop found with shopId: ${shopId}`);
      logger.debug('==== END DELETE PRODUCT IMAGE DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Find the specific product
    const productIndex = shop.products?.findIndex(p => p.productId === productId);
    
    if (productIndex === -1 || productIndex === undefined) {
      logger.debug(`FAILURE: No product found with productId: ${productId}`);
      logger.debug('==== END DELETE PRODUCT IMAGE DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    const product = shop.products[productIndex];
    
    if (!product.imageUrls || !Array.isArray(product.imageUrls)) {
      logger.debug(`FAILURE: No images found for product ${productId}`);
      logger.debug('==== END DELETE PRODUCT IMAGE DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'No images found for this product'
      });
    }
    
    const imageIndexNum = parseInt(imageIndex);
    if (isNaN(imageIndexNum) || imageIndexNum < 0 || imageIndexNum >= product.imageUrls.length) {
      logger.debug(`FAILURE: Invalid image index: ${imageIndex}`);
      logger.debug('==== END DELETE PRODUCT IMAGE DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Invalid image index'
      });
    }
    
    // Get the image URL to delete from S3
    const imageUrlToDelete = product.imageUrls[imageIndexNum];
    
    // SECURITY: Log the deletion attempt for audit purposes
    logger.debug('🔒 [SECURITY] Image deletion attempt:', {
      userId: userId,
      shopId: shopId,
      productId: productId,
      imageIndex: imageIndexNum,
      imageUrl: imageUrlToDelete,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('User-Agent')?.substring(0, 100)
    });
    
    // Delete from S3
    const s3Service = require('../services/s3Service');
    try {
      // Extract key from full URL or use as is if it's already a key
      let s3Key;
      if (imageUrlToDelete.startsWith('https://')) {
        // Full S3 URL - extract the key
        s3Key = decodeURIComponent(new URL(imageUrlToDelete).pathname.substring(1));
      } else {
        // Already an S3 key
        s3Key = imageUrlToDelete;
      }
      
      const deleteResult = await s3Service.deleteImage(s3Key);
      if (!deleteResult.success) {
        logger.error('Failed to delete image from S3:', deleteResult.error);
        // Continue with database update even if S3 deletion fails
      }
    } catch (s3Error) {
      logger.error('Error deleting image from S3:', s3Error);
      // Continue with database update even if S3 deletion fails
    }
    
    // Remove the image from the product's imageUrls array
    const updatedImageUrls = product.imageUrls.filter((_, index) => index !== imageIndexNum);
    
    // Update the product in the database
    const result = await customersCollection.updateOne(
      { userId, 'shops.shopId': shopId },
      { 
        $set: { 
          [`shops.$.products.${productIndex}.imageUrls`]: updatedImageUrls,
          [`shops.$.products.${productIndex}.updatedAt`]: new Date(),
          'shops.$.updatedAt': new Date()
        }
      }
    );
    
    if (result.modifiedCount === 0) {
      logger.debug('Failed to update product imageUrls in database');
      logger.debug('==== END DELETE PRODUCT IMAGE DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to update product images'
      });
    }
    
    logger.debug('Product image deleted successfully');
    logger.debug('==== END DELETE PRODUCT IMAGE DEBUG INFO ====');
    
    res.status(200).json({
      success: true,
      message: 'Product image deleted successfully',
      remainingImages: updatedImageUrls.length
    });
  } catch (error) {
    logger.error('Error deleting product image:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the product image',
      error: error.message
    });
  }
});

// Route to reorder product images
// SECURITY: This endpoint is protected by:
// - Rate limiting (50 operations per 15 minutes per user)
// - Request security logging and tracking
// - User access validation (users can only access their own data)
// - Input validation (parameter format and type checking)
// - Request body validation (array format, URL validation, length limits)
// - Ownership validation (ensures product belongs to authenticated user)
// - Audit logging (all operations are logged for security monitoring)
router.put('/shops/:userId/:shopId/products/:productId/images/reorder', 
  imageOperationLimiter, // Rate limiting to prevent abuse
  addRequestSecurity, 
  validateUserAccess, 
  validateImageOperation, // Input validation
  async (req, res) => {
  try {
    const { userId, shopId, productId } = req.params;
    const { newOrder } = req.body; // Array of image URLs in the new order
    
    logger.debug('==== REORDER PRODUCT IMAGES DEBUG INFO ====');
    logger.debug('Reordering product images for userId:', userId);
    logger.debug('Shop ID:', shopId);
    logger.debug('Product ID:', productId);
    logger.debug('New order:', newOrder);
    
    if (!newOrder || !Array.isArray(newOrder)) {
      logger.error('🔒 [SECURITY] Invalid newOrder format:', typeof newOrder);
      return res.status(400).json({
        success: false,
        message: 'New order must be an array of image URLs',
        securityAlert: 'INVALID_REQUEST_BODY_FORMAT'
      });
    }
    
    // SECURITY: Validate array length to prevent abuse
    if (newOrder.length > 10) {
      logger.error('🔒 [SECURITY] Too many images in reorder request:', newOrder.length);
      return res.status(400).json({
        success: false,
        message: 'Too many images in reorder request',
        securityAlert: 'TOO_MANY_IMAGES_IN_REQUEST'
      });
    }
    
    // SECURITY: Validate each URL in the array
    for (let i = 0; i < newOrder.length; i++) {
      const url = newOrder[i];
      if (typeof url !== 'string' || url.length === 0) {
        logger.error('🔒 [SECURITY] Invalid URL at index', i, ':', url);
        return res.status(400).json({
          success: false,
          message: 'Invalid image URL in reorder request',
          securityAlert: 'INVALID_IMAGE_URL_IN_REQUEST'
        });
      }
      
      // SECURITY: Validate URL format (should be S3 URL or key)
      if (!url.startsWith('https://') && !url.includes('/')) {
        logger.error('🔒 [SECURITY] Invalid URL format at index', i, ':', url);
        return res.status(400).json({
          success: false,
          message: 'Invalid image URL format',
          securityAlert: 'INVALID_URL_FORMAT'
        });
      }
    }
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      logger.error('🔒 [SECURITY] Unauthorized access attempt - customer not found for userId:', userId);
      logger.debug('==== END REORDER PRODUCT IMAGES DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId,
        securityAlert: 'CUSTOMER_NOT_FOUND'
      });
    }
    
    // SECURITY: Additional validation - ensure the authenticated user matches the requested userId
    const sessionUserId = req.session.userInfo?.sub || req.session.userInfo?.userId;
    if (sessionUserId !== userId) {
      logger.error('🔒 [SECURITY] User ID mismatch in reorder operation:', {
        sessionUserId: sessionUserId,
        requestedUserId: userId,
        userEmail: req.session.userInfo?.email,
        ip: req.ip
      });
      return res.status(403).json({
        success: false,
        message: 'Access denied: User ID mismatch',
        securityAlert: 'USER_ID_MISMATCH'
      });
    }
    
    // Find the specific shop
    const shop = customer.shops?.find(s => s.shopId === shopId);
    
    if (!shop) {
      logger.debug(`FAILURE: No shop found with shopId: ${shopId}`);
      logger.debug('==== END REORDER PRODUCT IMAGES DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Find the specific product
    const productIndex = shop.products?.findIndex(p => p.productId === productId);
    
    if (productIndex === -1 || productIndex === undefined) {
      logger.debug(`FAILURE: No product found with productId: ${productId}`);
      logger.debug('==== END REORDER PRODUCT IMAGES DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    const product = shop.products[productIndex];
    
    if (!product.imageUrls || !Array.isArray(product.imageUrls)) {
      logger.debug(`FAILURE: No images found for product ${productId}`);
      logger.debug('==== END REORDER PRODUCT IMAGES DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'No images found for this product'
      });
    }
    
    // SECURITY: Log the reorder attempt for audit purposes
    logger.debug('🔒 [SECURITY] Image reorder attempt:', {
      userId: userId,
      shopId: shopId,
      productId: productId,
      currentImageCount: product.imageUrls.length,
      newOrderCount: newOrder.length,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('User-Agent')?.substring(0, 100)
    });
    
    // SECURITY: Validate that all images in newOrder exist in the current imageUrls
    // Since we're dealing with signed URLs that change, we need to extract the S3 keys for comparison
    const extractS3Key = (url) => {
      if (url.startsWith('https://')) {
        // Full S3 URL - extract the key
        try {
          return decodeURIComponent(new URL(url).pathname.substring(1));
        } catch (e) {
          return url; // Return as-is if URL parsing fails
        }
      } else {
        // Already an S3 key
        return url;
      }
    };
    
    // Extract S3 keys for comparison
    const currentImageKeys = new Set(product.imageUrls.map(extractS3Key));
    const newOrderKeys = new Set(newOrder.map(extractS3Key));
    
    if (currentImageKeys.size !== newOrderKeys.size) {
      logger.error('🔒 [SECURITY] Image count mismatch in reorder request:', {
        currentCount: currentImageKeys.size,
        newOrderCount: newOrderKeys.size
      });
      return res.status(400).json({
        success: false,
        message: 'New order must contain exactly the same images as the current order',
        securityAlert: 'IMAGE_COUNT_MISMATCH'
      });
    }
    
    // Validate that all images in newOrder exist in the current product
    for (const imageUrl of newOrder) {
      const imageKey = extractS3Key(imageUrl);
      if (!currentImageKeys.has(imageKey)) {
        logger.error('🔒 [SECURITY] Invalid image in reorder request:', imageKey);
        return res.status(400).json({
          success: false,
          message: 'New order contains images that do not exist in the current product',
          securityAlert: 'INVALID_IMAGE_IN_REQUEST'
        });
      }
    }
    
    // Update the product with the new image order
    const result = await customersCollection.updateOne(
      { userId, 'shops.shopId': shopId },
      { 
        $set: { 
          [`shops.$.products.${productIndex}.imageUrls`]: newOrder,
          [`shops.$.products.${productIndex}.updatedAt`]: new Date(),
          'shops.$.updatedAt': new Date()
        }
      }
    );
    
    if (result.modifiedCount === 0) {
      logger.debug('Failed to update product imageUrls order in database');
      logger.debug('==== END REORDER PRODUCT IMAGES DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to update product image order'
      });
    }
    
    logger.debug('Product images reordered successfully');
    logger.debug('==== END REORDER PRODUCT IMAGES DEBUG INFO ====');
    
    res.status(200).json({
      success: true,
      message: 'Product images reordered successfully',
      newOrder: newOrder
    });
  } catch (error) {
    logger.error('Error reordering product images:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while reordering the product images',
      error: error.message
    });
  }
});

module.exports = router;

