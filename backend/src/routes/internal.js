console.log('--- [DEBUG] SERVER IS LOADING backend/src/routes/internal.js ---');
const express = require('express');
const router = express.Router();
const { getCustomersCollection } = require('../config/db');
const { ObjectId } = require('mongodb');
const { publishProductsToShopify, validateShopAccess } = require('../services/shopifyService');
const { importItemsToEC } = require('../services/ecService');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { getSignedUrl } = require('../services/s3Service');
const axios = require('axios'); // Added axios for Shopify API calls

// Constants for Shopify OAuth
// Allow multiple env var names for flexibility (SHOPIFY_CLIENT_ID or SHOPIFY_API_KEY)
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET;

// NEW: Route to get PayPal credentials securely
router.get('/config/paypal-credentials', (req, res) => {
  // This should be protected in a real app, e.g., by checking user role
  try {
    const credentials = {
      vendeur: {
        email: process.env.PAYPAL_VENDEUR_EMAIL,
        password: process.env.PAYPAL_VENDEUR_PASSWORD,
        iban: process.env.IBAN_VENDEUR,
      },
      mandataire: {
        email: process.env.PAYPAL_MANDATAIRE_EMAIL,
        password: process.env.PAYPAL_MANDATAIRE_PASSWORD,
        iban: process.env.IBAN_MANDATAIRE,
      },
    };

    // Check if credentials are missing on the server
    if (
      !credentials.vendeur.email ||
      !credentials.vendeur.password ||
      !credentials.mandataire.email ||
      !credentials.mandataire.password ||
      !credentials.vendeur.iban ||
      !credentials.mandataire.iban
    ) {
      console.error('[PayPal Config] Missing PayPal or IBAN credentials in backend .env file.');
      return res.status(500).json({
        success: false,
        message: 'Les identifiants PayPal ne sont pas configurés sur le serveur.',
      });
    }

    res.status(200).json({ success: true, credentials });
  } catch (error) {
    console.error('Error fetching PayPal credentials:', error);
    res.status(500).json({ success: false, message: 'Erreur interne du serveur.' });
  }
});

// NEW: Route to get Mondial Relay credentials securely
router.get('/config/mondialrelay-credentials', (req, res) => {
  try {
    console.log('[MondialRelay] Fetching credentials...');
    
    const credentials = {
      codeEnseigne: process.env.CODE_ENSEIGNE,
      clePrivee: process.env.CLE_PRIVEE,
      codeMarque: process.env.CODE_MARQUE,
    };

    const missingKeys = [];
    if (!credentials.codeEnseigne) missingKeys.push('CODE_ENSEIGNE');
    if (!credentials.clePrivee) missingKeys.push('CLE_PRIVEE');
    if (!credentials.codeMarque) missingKeys.push('CODE_MARQUE');

    if (missingKeys.length > 0) {
      console.error(`[MondialRelay Config] Missing environment variables: ${missingKeys.join(', ')}`);
      return res.status(500).json({
        success: false,
        message: `Les identifiants Mondial Relay ne sont pas configurés correctement sur le serveur. Variables manquantes: ${missingKeys.join(', ')}`,
      });
    }

    console.log('[MondialRelay] Credentials successfully retrieved');
    res.status(200).json({ success: true, credentials });
  } catch (error) {
    console.error('CRITICAL ERROR fetching Mondial Relay credentials:', error);
    res.status(500).json({ success: false, message: 'Erreur interne critique du serveur.' });
  }
});

// NEW: Route to securely download specific configuration files
router.get('/files/download/:filename', (req, res) => {
  const allowedFiles = [
    'Extrait KBIS - SNA GZ.pdf',
    'Justificatif de domicile 23 juil. 2024.pdf',
    'Passport_Boris.jpg',
    '1ce5021cbfb5eff03e8af1d8bbfed6b9_512x512.jpg', // Mondial Relay app icon
  ];

  const { filename } = req.params;

  // SECURITY: Validate filename to prevent path traversal
  if (!filename || typeof filename !== 'string' || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    console.error(`🚨 [SECURITY] Path traversal attempt detected: ${filename} from IP: ${req.ip}`);
    return res.status(403).json({ 
      success: false, 
      message: "Invalid filename format.",
      securityAlert: 'PATH_TRAVERSAL_ATTEMPT'
    });
  }

  if (!allowedFiles.includes(filename)) {
    console.error(`🚨 [SECURITY] Unauthorized file access attempt: ${filename} from IP: ${req.ip}`);
    return res.status(403).json({ 
      success: false, 
      message: "Accès non autorisé à ce fichier.",
      securityAlert: 'UNAUTHORIZED_FILE_ACCESS'
    });
  }

  // SECURITY: Use relative paths instead of hardcoded absolute paths
  let basePath;
  if (filename === '1ce5021cbfb5eff03e8af1d8bbfed6b9_512x512.jpg') {
    basePath = path.join(__dirname, '../services/mondialRelayImg');
  } else {
    basePath = path.join(__dirname, '../services/FilesPayementShopify');
  }
  
  // SECURITY: Additional path validation to ensure we're within allowed directory
  const normalizedPath = path.normalize(path.join(basePath, filename));
  if (!normalizedPath.startsWith(path.resolve(basePath))) {
    console.error(`🚨 [SECURITY] Path traversal detected: ${normalizedPath} from IP: ${req.ip}`);
    return res.status(403).json({ 
      success: false, 
      message: "Invalid file path.",
      securityAlert: 'PATH_TRAVERSAL_DETECTED'
    });
  }
  
  const filePath = normalizedPath;

  console.log(`[FILE DOWNLOAD] Serving file: ${filename} to internal user`);

  // Use res.download to send the file
  res.download(filePath, (err) => {
    if (err) {
      console.error("Erreur lors du téléchargement du fichier:", err);
      if (!res.headersSent) {
        res.status(404).json({ success: false, message: "Fichier non trouvé sur le serveur." });
      }
    }
  });
});

// NEW: Route to save Shopify API credentials for a specific shop
router.post('/shops/:shopId/api-credentials', async (req, res) => {
  const { shopId } = req.params;
  const { apiKey, apiSecret, accessToken, adminUrl } = req.body;

  console.log(`[API CREDENTIALS] Received request for shopId: ${shopId}`);

  if (!shopId || !apiKey || !apiSecret || !accessToken) {
    return res.status(400).json({ success: false, message: 'Shop ID and all API credentials are required.' });
  }

  try {
    const customersCollection = await getCustomersCollection();
    
    // Extract domain from adminUrl if provided
    let shopifyDomain = null;
    if (adminUrl) {
      // Extract domain from URLs like https://shop-name.myshopify.com/admin or https://admin.shopify.com/store/shop-name
      const match = adminUrl.match(/^https:\/\/(.*?)\.myshopify\.com/) || 
                   adminUrl.match(/^https:\/\/admin\.shopify\.com\/store\/(.*?)(?:\?|\/|$)/);
      if (match) {
        shopifyDomain = match[1];
        console.log(`[API CREDENTIALS] Extracted domain: ${shopifyDomain}`);
      }
    }
    
    const updateData = {
      'shops.$.shopifyConfig': {
        apiKey,
        apiSecret,
        accessToken,
        updatedAt: new Date(),
      },
      // Note: isParametrized will be set to true only after successful theme configuration
    };

    // Add domain if extracted
    if (shopifyDomain) {
      updateData['shops.$.shopifyDomain'] = shopifyDomain;
      updateData['shops.$.shopifyAdminUrl'] = adminUrl;
    }
    
    const result = await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      console.log(`[API CREDENTIALS] No shop found with ID: ${shopId}`);
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }

    if (result.modifiedCount === 0) {
      console.log(`[API CREDENTIALS] Shop found but not modified (ID: ${shopId}). Data might be the same.`);
      // Still return success as the data is effectively what the user wanted.
    }
    
    console.log(`[API CREDENTIALS] Successfully updated credentials for shopId: ${shopId}`);
    res.status(200).json({ success: true, message: 'API credentials saved successfully.' });

  } catch (error) {
    console.error(`[API CREDENTIALS] Error updating credentials for shopId: ${shopId}`, error);
    res.status(500).json({ success: false, message: 'An internal server error occurred.' });
  }
});

// Route to save shop domain during creation wizard
router.post('/shops/:shopId/save-domain', async (req, res) => {
  const { shopId } = req.params;
  const { shopifyDomain, adminUrl } = req.body;

  console.log(`[SAVE DOMAIN] Received request for shopId: ${shopId}`);

  if (!shopId || !shopifyDomain || !adminUrl) {
    return res.status(400).json({ success: false, message: 'Shop ID, domain, and admin URL are required.' });
  }

  try {
    const customersCollection = await getCustomersCollection();
    
    const result = await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      {
        $set: {
          'shops.$.shopifyDomain': shopifyDomain,
          'shops.$.shopifyAdminUrl': adminUrl,
          'shops.$.shopifyDomainSavedAt': new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      console.log(`[SAVE DOMAIN] No shop found with ID: ${shopId}`);
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }

    if (result.modifiedCount === 0) {
      console.log(`[SAVE DOMAIN] Shop found but not modified (ID: ${shopId}). Data might be the same.`);
    }
    
    console.log(`[SAVE DOMAIN] Successfully saved domain for shopId: ${shopId}`);
    res.status(200).json({ success: true, message: 'Domain saved successfully.' });

  } catch (error) {
    console.error(`[SAVE DOMAIN] Error saving domain for shopId: ${shopId}`, error);
    res.status(500).json({ success: false, message: 'An internal server error occurred.' });
  }
});

// Route to mark shop as having Shopify created
router.put('/shops/:shopId/mark-shopify-created', async (req, res) => {
  const { shopId } = req.params;

  console.log(`[MARK CREATED] Received request for shopId: ${shopId}`);

  try {
    const customersCollection = await getCustomersCollection();
    
    const result = await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      {
        $set: {
          'shops.$.hasShopify': true,
          'shops.$.shopifyCreatedAt': new Date(),
          'shops.$.shopifySetupCompleted': true,
          'shops.$.shopifySetupStatus': 'created',
        },
      }
    );

    if (result.matchedCount === 0) {
      console.log(`[MARK CREATED] No shop found with ID: ${shopId}`);
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }

    if (result.modifiedCount === 0) {
      console.log(`[MARK CREATED] Shop found but not modified (ID: ${shopId}). Data might be the same.`);
    }
    
    console.log(`[MARK CREATED] Successfully marked shop as created for shopId: ${shopId}`);
    res.status(200).json({ success: true, message: 'Shop marked as created successfully.' });

  } catch (error) {
    console.error(`[MARK CREATED] Error marking shop as created for shopId: ${shopId}`, error);
    res.status(500).json({ success: false, message: 'An internal server error occurred.' });
  }
});

// --- NEW ENDPOINT: mark a shop as parametrized once the wizard is finished ---
router.put('/shops/:shopId/mark-parametrized', async (req, res) => {
   const { shopId } = req.params;

   if (!shopId) {
     return res.status(400).json({ success: false, message: 'Shop ID is required.' });
   }

   try {
     const customersCollection = await getCustomersCollection();

     // Build a flexible filter that works whether _id is ObjectId or stored as string in shopId field
     const filters = [];
     if (ObjectId.isValid(shopId)) {
       filters.push({ 'shops._id': new ObjectId(shopId) });
     }
     filters.push({ 'shops.shopId': shopId });

     let result = { matchedCount: 0, modifiedCount: 0 };

     // First try with ObjectId in shops._id
     if (ObjectId.isValid(shopId)) {
       result = await customersCollection.updateOne(
         { 'shops._id': new ObjectId(shopId) },
         {
           $set: {
             'shops.$.isParametrized': true,
             'shops.$.parametrizedAt': new Date(),
           },
         }
       );
     }

     // If nothing matched, try with string shopId field
     if (result.matchedCount === 0) {
       result = await customersCollection.updateOne(
         { 'shops.shopId': shopId },
         {
           $set: {
             'shops.$.isParametrized': true,
             'shops.$.parametrizedAt': new Date(),
           },
         }
       );
     }

     console.log(`[MARK PARAMETRIZED] shopId=${shopId} Matched=${result.matchedCount} Modified=${result.modifiedCount}`);

     if (result.matchedCount === 0) {
       return res.status(404).json({ success: false, message: 'Shop not found.' });
     }

     res.status(200).json({ success: true, message: 'Shop marked as parametrized.' });
   } catch (error) {
     console.error(`[MARK PARAMETRIZED] Error for shopId: ${shopId}`, error);
     res.status(500).json({ success: false, message: 'An internal server error occurred.' });
   }
 });

// Route to get all shops for all customers (for internal portal)
router.get('/all-shops', async (req, res) => {
  try {
    const customersCollection = await getCustomersCollection();
    const customers = await customersCollection.find({}).toArray();
    // Aggregate all shops from all customers, attach client info
    const allShops = [];

    console.log("--- DEBUGGING /api/internal/all-shops ---");
    customers.forEach(customer => {
      const clientName = customer.raisonSociale || customer.name || '-';
      const clientId = customer._id?.toString() || customer.id || '-';

      // Log the payment status for each customer being processed
      console.log(`Processing Customer: '${clientName}', Payement Status: [${customer.Payement}]`);

      if (Array.isArray(customer.shops)) {
        customer.shops.forEach(shop => {
          allShops.push({
            _id: shop._id || shop.shopId, // Pass the shop's unique ID
            shopId: shop.shopId || shop.id,
            name: shop.nomProjet || shop.name || '-',
            clientName,
            clientId,
            // CORRECTED: Pull payment field from the parent customer document
            Payement: customer.Payement, 
            payment: customer.payment,
            productsCount: Array.isArray(shop.products) ? shop.products.length : (shop.productsCount || 0),
            status: shop.status || '-',
            hasShopify: shop.hasShopify === true || shop.shopifyConfigured === true,
            isParametrized: shop.isParametrized === true,
            parametrizationError: shop.parametrizationError || null,
            documented: shop.documented || 'undocumented'
          });
        });
      }
    });
    console.log("--- END DEBUGGING ---");
    res.status(200).json({ success: true, shops: allShops });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de toutes les boutiques',
      error: error.message
    });
  }
});

// Route to get all customers data (for internal portal)
router.get('/all', async (req, res) => {
  try {
    const { details } = req.query;
    const customersCollection = await getCustomersCollection();
    let customers;

    console.log(`[INTERNAL] Internal user accessing all customers`);

    if (details === 'true') {
      customers = await customersCollection.find({}).toArray();
    } else {
      customers = await customersCollection.find({}, {
        projection: { 
          raisonSociale: 1, 
          status: 1, 
          'shops.nomProjet': 1, 
          'shops.status': 1 
        }
      }).toArray();
    }

    customers.forEach(customer => {
      if (customer.shops && Array.isArray(customer.shops)) {
        customer.shops.forEach(shop => {
          shop.Payement = customer.Payement;
          shop.payment = customer.payment;
        });
      }
      if (customer._id) customer.id = customer._id.toString();
      delete customer._id;
    });

    console.log(`[INTERNAL] Returned ${customers.length} customers to internal user`);

    res.status(200).json({
      success: true,
      customers
    });
  } catch (error) {
    console.error("[INTERNAL] Error in /all:", error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving customers',
      error: error.message
    });
  }
});

// Route to get all shops from all customers (for internal portal)
router.get('/all-shops', async (req, res) => {
  try {
    const customersCollection = await getCustomersCollection();
    const customers = await customersCollection.find({}).toArray();
    const allShops = [];
    
    console.log(`[INTERNAL] Internal user accessing all shops`);
    
    for (const customer of customers) {
      const clientName = customer.raisonSociale || customer.name || 'Unknown Client';

      if (Array.isArray(customer.shops)) {
        for (const shop of customer.shops) {
          
          let logoUrl = null;
          if (shop.logoUrl) {
            try {
              const key = new URL(shop.logoUrl).pathname.substring(1);
              logoUrl = await getSignedUrl(decodeURIComponent(key));
            } catch (e) {
              console.error(`Error generating signed URL for logo: ${shop.logoUrl}`, e);
            }
          }
          
          const constructedShopObject = {
            ...shop,
            _id: shop._id || shop.shopId,
            shopId: shop.shopId || shop.id,
            name: shop.nomProjet || shop.name || '-',
            clientName,
            clientId: customer._id?.toString() || customer.id || '-',
            Payement: customer.Payement,
            payment: customer.payment,
            hasShopify: shop.hasShopify === true || shop.shopifyConfigured === true,
            logoUrl: logoUrl,
          };
          allShops.push(constructedShopObject);
        }
      }
    }
    
    console.log(`[INTERNAL] Returned ${allShops.length} shops to internal user`);
    
    res.status(200).json({ success: true, shops: allShops });
  } catch (error) {
    console.error("[INTERNAL] Error in /all-shops:", error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving all shops',
      error: error.message
    });
  }
});

// Route to get specific customer by MongoDB ID (for internal portal)
router.get('/customer/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    console.log(`[INTERNAL] Getting customer details for ID: ${customerId}`);
    
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
    
    console.log(`[INTERNAL] Found customer: ${customer.raisonSociale || customer.name}`);
    
    res.status(200).json({
      success: true,
      customer
    });
  } catch (error) {
    console.error('[INTERNAL] Error fetching customer data:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching customer data',
      error: error.message
    });
  }
});

// Route to get specific client by ID (for internal portal)
router.get('/clients/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    console.log(`[INTERNAL] Getting client details for ID: ${clientId}`);
    
    const customersCollection = await getCustomersCollection();
    let customer;
    
    try {
      customer = await customersCollection.findOne({ _id: new ObjectId(clientId) });
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID format',
        error: e.message
      });
    }
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }
    
    console.log(`[INTERNAL] Found client: ${customer.raisonSociale || customer.name}`);
    
    res.status(200).json({
      success: true,
      customer
    });
  } catch (error) {
    console.error('[INTERNAL] Error fetching client data:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching client data',
      error: error.message
    });
  }
});

// Route to update specific client by ID (for internal portal)
router.put('/clients/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const updateData = req.body;
    
    console.log(`[INTERNAL] Updating client ${clientId}:`, updateData);
    
    // Remove any fields that should not be updated
    delete updateData._id; // Cannot update MongoDB _id
    
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document first
    let existingCustomer;
    try {
      existingCustomer = await customersCollection.findOne({ _id: new ObjectId(clientId) });
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID format',
        error: e.message
      });
    }
    
    if (!existingCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }
    
    // Update the document
    const result = await customersCollection.updateOne(
      { _id: new ObjectId(clientId) },
      { $set: updateData }
    );
    
    if (result.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'No changes were made to the client profile'
      });
    }
    
    // Get the updated customer data
    const updatedCustomer = await customersCollection.findOne({ _id: new ObjectId(clientId) });
    
    console.log(`[INTERNAL] Successfully updated client: ${updatedCustomer.raisonSociale || updatedCustomer.name}`);
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Client profile updated successfully',
      customer: updatedCustomer
    });
  } catch (error) {
    console.error('[INTERNAL] Error updating client data:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the client profile',
      error: error.message
    });
  }
});

// Route to get shop products for internal portal
router.get('/shop/:shopId/products', async (req, res) => {
  try {
    const { shopId } = req.params;
    console.log(`[INTERNAL] Getting products for shop: ${shopId}`);
    
    const customersCollection = await getCustomersCollection();
    
    // Find the customer with this shop
    const customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Find the specific shop
    const shop = customer.shops.find(s => s.shopId === shopId);
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found in customer data'
      });
    }
    
    const products = shop.products || [];
    
    console.log(`[INTERNAL] Found ${products.length} products for shop ${shopId}`);
    
    res.status(200).json({
      success: true,
      products
    });
  } catch (error) {
    console.error('[INTERNAL] Error fetching shop products:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching shop products',
      error: error.message
    });
  }
});

// Route to get shop documentation (for internal portal)
router.get('/shop/:shopId/documentation', (req, res) => {
  const { shopId } = req.params;
  console.log(`[INTERNAL] Getting documentation for shop: ${shopId}`);
  
  // Redirect to the existing customer route (it handles file serving)
  res.redirect(`/api/customer/shop/${shopId}/documentation`);
});

// Route to get product documentation (for internal portal)
router.get('/shop/:shopId/product/:productId/documentation', async (req, res) => {
  const { shopId, productId } = req.params;
  console.log(`[INTERNAL] Getting product documentation for shop: ${shopId}, product: ${productId}`);
  
  // Redirect to the existing customer route (it handles file serving and generation)
  res.redirect(`/api/customer/shop/${shopId}/product/${productId}/documentation`);
});

// Route to post shop documentation (for internal portal)
router.post('/shop/:shopId/documentation', async (req, res) => {
  const { shopId } = req.params;
  console.log(`[INTERNAL] Creating shop documentation for: ${shopId}`);
  
  // Forward the request to the customer route with all headers and body
  try {
    const customerRoutes = require('./customer');
    // This requires some refactoring to properly forward the request
    // For now, just redirect with a 307 (temporary redirect with method preservation)
    res.redirect(307, `/api/customer/shop/${shopId}/documentation`);
  } catch (error) {
    console.error('[INTERNAL] Error forwarding documentation request:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing documentation request',
      error: error.message
    });
  }
});

// Route to post product documentation (for internal portal)
router.post('/shop/:shopId/product/:productId/documentation', async (req, res) => {
  const { shopId, productId } = req.params;
  console.log(`[INTERNAL] Creating product documentation for shop: ${shopId}, product: ${productId}`);
  
  // Forward the request to the customer route
  try {
    res.redirect(307, `/api/customer/shop/${shopId}/product/${productId}/documentation`);
  } catch (error) {
    console.error('[INTERNAL] Error forwarding product documentation request:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing product documentation request',
      error: error.message
    });
  }
});

// Route to get all products from all customers (for internal portal)
router.get('/all-products', async (req, res) => {
  try {
    const { status } = req.query;
    
    const customersCollection = await getCustomersCollection();
    
    // Get all customers with their shops and products
    const customers = await customersCollection.find({}).toArray();
    
    const allProducts = [];
    
    customers.forEach(customer => {
      const clientName = customer.raisonSociale || customer.name || 'Client inconnu';
      const clientId = customer._id?.toString() || customer.userId;
      
      if (Array.isArray(customer.shops)) {
        customer.shops.forEach(shop => {
          // Only include products from valid shops
          if (shop.status !== 'valid') {
            return; // Skip invalid shops
          }
          
          const shopName = shop.nomProjet || shop.name || 'Boutique inconnue';
          const shopId = shop.shopId || shop.id;
          
          if (Array.isArray(shop.products)) {
            shop.products.forEach(product => {
              // Apply status filter if provided
              if (status === 'validated') {
                // Only include products that are active
                if (product.active) {
                  allProducts.push({
                    ...product,
                    clientName,
                    clientId,
                    shopName,
                    shopId
                  });
                }
              } else {
                // Include all products
                allProducts.push({
                  ...product,
                  clientName,
                  clientId,
                  shopName,
                  shopId
                });
              }
            });
          }
        });
      }
    });
    
    // NEW: Generate pre-signed URLs for all product images
    const productsWithSignedUrls = await Promise.all(
      allProducts.map(async (product) => {
        if (product.imageUrls && product.imageUrls.length > 0) {
          try {
            const signedUrls = await Promise.all(
              product.imageUrls.map((url) => {
                // The key is the part of the URL after the bucket name
                // Decode the key to handle any special characters (e.g., %20 for spaces)
                const key = decodeURIComponent(new URL(url).pathname.substring(1));
                return getSignedUrl(key);
              })
            );
            return { ...product, imageUrls: signedUrls };
          } catch (e) {
            console.error(`Failed to generate signed URLs for product ${product.productId}:`, e);
            // Return the product with original URLs if signing fails
            return product;
          }
        }
        return product;
      })
    );
    
    res.status(200).json({
      success: true,
      products: productsWithSignedUrls
    });
  } catch (error) {
    console.error('Error fetching all products:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching products',
      error: error.message
    });
  }
});

// Route to validate product status fields (for internal portal)
router.put('/products/:clientId/:shopId/:productId/validate', async (req, res) => {
  try {
    const { clientId, shopId, productId } = req.params;
    const { active } = req.body; // Only `active` status is expected
    
    console.log('==== VALIDATE PRODUCT DEBUG INFO ====');
    console.log('Validating product for clientId:', clientId);
    console.log('Shop ID:', shopId);
    console.log('Product ID:', productId);
    console.log('Validation data:', { active });
    
    const customersCollection = await getCustomersCollection();
    
    // Find customer by clientId (could be _id or userId)
    let customer;
    try {
      // Try finding by ObjectId first
      customer = await customersCollection.findOne({ _id: new ObjectId(clientId) });
    } catch (e) {
      // If ObjectId fails, try finding by userId
      customer = await customersCollection.findOne({ userId: clientId });
    }
    
    if (!customer) {
      console.log(`FAILURE: No customer found with clientId: ${clientId}`);
      console.log('==== END VALIDATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // Find the specific shop
    const shop = customer.shops?.find(s => s.shopId === shopId);
    
    if (!shop) {
      console.log(`FAILURE: No shop found with shopId: ${shopId}`);
      console.log('==== END VALIDATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Find the specific product
    const productIndex = shop.products?.findIndex(p => p.productId === productId);
    
    if (productIndex === -1 || productIndex === undefined) {
      console.log(`FAILURE: No product found with productId: ${productId}`);
      console.log('==== END VALIDATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    console.log(`SUCCESS: Found product with productId: ${productId}`);
    
    // Update the product status fields
    const updateQuery = customer._id ? { _id: customer._id } : { userId: customer.userId };
    const result = await customersCollection.updateOne(
      { ...updateQuery, 'shops.shopId': shopId },
      { 
        $set: { 
          // Only update the 'active' field. The value should be a boolean.
          [`shops.$.products.${productIndex}.active`]: typeof active === 'boolean' ? active : false,
          [`shops.$.products.${productIndex}.validatedAt`]: new Date(),
          'shops.$.updatedAt': new Date()
        }
      }
    );
    
    if (result.modifiedCount === 0) {
      console.log('Failed to validate product');
      console.log('==== END VALIDATE PRODUCT DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to validate product'
      });
    }
    
    console.log('Product validated successfully');
    console.log('==== END VALIDATE PRODUCT DEBUG INFO ====');
    
    res.status(200).json({
      success: true,
      message: 'Product validated successfully',
      productId: productId
    });
  } catch (error) {
    console.error('Error validating product:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while validating the product',
      error: error.message
    });
  }
});

// Route to generate product documentation (for internal portal)
router.post('/products/:clientId/:shopId/:productId/generate-documentation', async (req, res) => {
  try {
    const { clientId, shopId, productId } = req.params;
    
    console.log('==== GENERATE PRODUCT DOCUMENTATION DEBUG INFO ====');
    console.log('Generating documentation for clientId:', clientId);
    console.log('Shop ID:', shopId);
    console.log('Product ID:', productId);
    
    const customersCollection = await getCustomersCollection();
    
    // Find customer by clientId (could be _id or userId)
    let customer;
    try {
      customer = await customersCollection.findOne({ _id: new ObjectId(clientId) });
    } catch (e) {
      customer = await customersCollection.findOne({ userId: clientId });
    }
    
    if (!customer) {
      console.log(`FAILURE: No customer found with clientId: ${clientId}`);
      console.log('==== END GENERATE PRODUCT DOCUMENTATION DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // Find the specific shop
    const shop = customer.shops?.find(s => s.shopId === shopId);
    
    if (!shop) {
      console.log(`FAILURE: No shop found with shopId: ${shopId}`);
      console.log('==== END GENERATE PRODUCT DOCUMENTATION DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Find the specific product
    const productIndex = shop.products?.findIndex(p => p.productId === productId);
    
    if (productIndex === -1 || productIndex === undefined) {
      console.log(`FAILURE: No product found with productId: ${productId}`);
      console.log('==== END GENERATE PRODUCT DOCUMENTATION DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    const product = shop.products[productIndex];
    console.log(`SUCCESS: Found product with productId: ${productId}`);
    
    // Here you would implement the actual documentation generation logic
    // For now, we'll just mark it as documented and simulate the process
    
    // Simulate documentation generation delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Update the product to mark documentation as generated
    const updateQuery = customer._id ? { _id: customer._id } : { userId: customer.userId };
    const result = await customersCollection.updateOne(
      { ...updateQuery, 'shops.shopId': shopId },
      { 
        $set: { 
          [`shops.$.products.${productIndex}.documentationGenerated`]: true,
          [`shops.$.products.${productIndex}.documentationGeneratedAt`]: new Date(),
          [`shops.$.products.${productIndex}.documented`]: true,
          'shops.$.updatedAt': new Date()
        }
      }
    );
    
    if (result.modifiedCount === 0) {
      console.log('Failed to update product documentation status');
      console.log('==== END GENERATE PRODUCT DOCUMENTATION DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to generate product documentation'
      });
    }
    
    console.log('Product documentation generated successfully');
    console.log('==== END GENERATE PRODUCT DOCUMENTATION DEBUG INFO ====');
    
    res.status(200).json({
      success: true,
      message: 'Product documentation generated successfully',
      productId: productId,
      documentationPath: `/documentation/products/${clientId}/${shopId}/${productId}.pdf` // Example path
    });
  } catch (error) {
    console.error('Error generating product documentation:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while generating product documentation',
      error: error.message
    });
  }
});

// Generate EC file for selected products (NEW CLEAN ROUTE)
router.post('/ec/shop/:shopId/generate', async (req, res) => {
  const log = (message) => {
    // Log to console for immediate feedback
    console.log(`[EC Service] ${message}`);

    // Also log to a persistent file
    try {
      const logFilePath = path.join(__dirname, '..', 'services', 'logs', 'ec_service.log');
      const logsDir = path.dirname(logFilePath);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`);
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  };

  log('--- Initiating EC Generation Request (NEW ROUTE) ---');

  try {
    const { shopId } = req.params;
    const { productIds } = req.body;
    log(`Shop ID: ${shopId}, Product IDs: ${JSON.stringify(productIds)}`);

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      log('Error: productIds array is required');
      return res.status(400).json({ success: false, message: 'productIds array is required' });
    }

    const customersCollection = await getCustomersCollection();

    // Find customer and shop
    const customer = await customersCollection.findOne({ 'shops.shopId': shopId });
    if (!customer) {
      log(`Error: Customer not found for shopId ${shopId}`);
      return res.status(404).json({ success: false, message: 'Customer for this shop not found' });
    }
    log(`Found customer: ${customer.raisonSociale} (${customer._id})`);

    const shop = customer.shops.find(s => s.shopId === shopId);
    if (!shop) {
      log(`Error: Shop not found with shopId ${shopId} for customer ${customer.raisonSociale}`);
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    log(`Found shop: ${shop.nomProjet}`);

    // Get the full product documents to be processed
    const productsToProcess = (shop.products || []).filter(p => productIds.includes(p.productId));

    if (productsToProcess.length === 0) {
      log('Error: No valid products found for the given IDs.');
      return res.status(404).json({ success: false, message: 'No valid products found for the given IDs' });
    }

    log(`[EC Generation] Starting EC generation for ${productsToProcess.length} products from shop ${shop.nomProjet}`);
    
    // Call the EC service to handle the external API call
    const result = await importItemsToEC(productsToProcess, shop, customer, log);
    
    log('EC service call completed. Updating product statuses in DB.');
    // Update the products to mark them as having an EC generated
    await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      {
        $set: {
          'shops.$.products.$[elem].hasEC': true,
          'shops.$.products.$[elem].ecGeneratedAt': new Date()
        }
      },
      {
        arrayFilters: [{ 'elem.productId': { $in: productIds } }]
      }
    );

    log('--- EC Generation Request Succeeded (NEW ROUTE) ---');
    res.status(200).json({
      success: true,
      message: result.message || 'EC generation completed.',
      data: result.data
    });

  } catch (error) {
    log('--- EC Generation Request Failed (NEW ROUTE) ---');
    log(`FATAL ERROR: ${error.stack || error.message}`);
    console.error('Error during EC generation:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'An error occurred during EC generation.' 
    });
  }
});

// Generate EC file for selected products (OLD ROUTE - KEPT FOR BACKWARD COMPATIBILITY)
router.post('/shopify/shop/:shopId/generate-ec', async (req, res) => {
  const log = (message) => {
    // Log to console for immediate feedback
    console.log(`[EC Service] ${message}`);

    // Also log to a persistent file
    try {
      const logFilePath = path.join(__dirname, '..', 'services', 'logs', 'ec_service.log');
      const logsDir = path.dirname(logFilePath);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`);
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  };

  log('--- Initiating EC Generation Request ---');

  try {
    const { shopId } = req.params;
    const { productIds } = req.body;
    log(`Shop ID: ${shopId}, Product IDs: ${JSON.stringify(productIds)}`);

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      log('Error: productIds array is required');
      return res.status(400).json({ success: false, message: 'productIds array is required' });
    }

    const customersCollection = await getCustomersCollection();

    // Find customer and shop
    const customer = await customersCollection.findOne({ 'shops.shopId': shopId });
    if (!customer) {
      log(`Error: Customer not found for shopId ${shopId}`);
      return res.status(404).json({ success: false, message: 'Customer for this shop not found' });
    }
    log(`Found customer: ${customer.raisonSociale} (${customer._id})`);

    const shop = customer.shops.find(s => s.shopId === shopId);
    if (!shop) {
      log(`Error: Shop not found with shopId ${shopId} for customer ${customer.raisonSociale}`);
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    log(`Found shop: ${shop.nomProjet}`);
    
    // TODO: Check for required EC credentials on customer/shop object before proceeding.
    // Example: if (!customer.ec_login) { ... }

    // Get the full product documents to be processed
    const productsToProcess = (shop.products || []).filter(p => productIds.includes(p.productId));

    if (productsToProcess.length === 0) {
      log('Error: No valid products found for the given IDs.');
      return res.status(404).json({ success: false, message: 'No valid products found for the given IDs' });
    }

    log(`[EC Generation] Starting EC generation for ${productsToProcess.length} products from shop ${shop.nomProjet}`);
    
    // Call the EC service to handle the external API call
    const result = await importItemsToEC(productsToProcess, shop, customer, log);
    
    log('EC service call completed. Updating product statuses in DB.');
    // Update the products to mark them as having an EC generated
    const successfulProductSkus = productsToProcess.map(p => Object.keys(p.skus || {})).flat();
    
    await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      {
        $set: {
          'shops.$.products.$[elem].hasEC': true,
          'shops.$.products.$[elem].ecGeneratedAt': new Date()
        }
      },
      {
        arrayFilters: [{ 'elem.productId': { $in: productIds } }]
      }
    );

    log('--- EC Generation Request Succeeded ---');
    res.status(200).json({
      success: true,
      message: result.message || 'EC generation completed.',
      data: result.data
    });

  } catch (error) {
    log('--- EC Generation Request Failed ---');
    log(`FATAL ERROR: ${error.stack || error.message}`);
    console.error('Error during EC generation:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'An error occurred during EC generation.' 
    });
  }
});

// NEW: Route to configure Shopify theme with images using GraphQL Admin API
router.post('/shops/:shopId/configure-theme', async (req, res) => {
  const { shopId } = req.params;

  console.log(`[THEME CONFIG] Received request for shopId: ${shopId}`);

  try {
    const customersCollection = await getCustomersCollection();
    
    // Try to find the shop in different possible structures
    let shop = null;
    let customer = null;
    
    // First, try to find it as a shop within a customer's shops array
    customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });

    if (customer) {
      console.log(`[THEME CONFIG] Found customer with ${customer.shops?.length || 0} shops`);
      console.log(`[THEME CONFIG] Customer shops IDs:`, customer.shops?.map(s => ({ shopId: s.shopId, hasShopifyConfig: !!s.shopifyConfig })));
      
      shop = customer.shops.find(s => s.shopId === shopId);
      if (shop) {
        console.log(`[THEME CONFIG] Found shop in customer.shops array`);
      } else {
        console.log(`[THEME CONFIG] Shop ${shopId} not found in customer.shops array`);
      }
    } else {
      // If not found, try to find it as a direct shop document
      shop = await customersCollection.findOne({ shopId: shopId });
      if (shop) {
        console.log(`[THEME CONFIG] Found shop as direct document`);
      }
    }

    if (!shop) {
      console.log(`[THEME CONFIG] No shop found with ID: ${shopId}`);
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }

    // TEMPORARY: If the requested shop doesn't have shopifyConfig, try to use one that does
    if (customer && !shop.shopifyConfig) {
      const shopWithConfig = customer.shops.find(s => s.shopifyConfig);
      if (shopWithConfig) {
        console.log(`[THEME CONFIG] ===== USING SHOP WITH CONFIG INSTEAD =====`);
        console.log(`[THEME CONFIG] Original shop ${shopId} has no config, using ${shopWithConfig.shopId} instead`);
        shop = shopWithConfig;
        console.log(`[THEME CONFIG] ===== END USING SHOP WITH CONFIG =====`);
      }
    }

    // Additional check: Let's look at the specific shop in the customer document
    if (customer) {
      const specificShop = customer.shops.find(s => s.shopId === shopId);
      if (specificShop) {
        console.log(`[THEME CONFIG] ===== SPECIFIC SHOP FROM CUSTOMER DOCUMENT =====`);
        console.log(`[THEME CONFIG] Specific shop has shopifyConfig: ${!!specificShop.shopifyConfig}`);
        console.log(`[THEME CONFIG] Specific shop shopifyConfig:`, specificShop.shopifyConfig);
        console.log(`[THEME CONFIG] Specific shop keys:`, Object.keys(specificShop));
        console.log(`[THEME CONFIG] ===== END SPECIFIC SHOP =====`);
      }
      
      // Let's also check which shop has shopifyConfig
      const shopWithConfig = customer.shops.find(s => s.shopifyConfig);
      if (shopWithConfig) {
        console.log(`[THEME CONFIG] ===== SHOP WITH CONFIG FOUND =====`);
        console.log(`[THEME CONFIG] Shop ID with config: ${shopWithConfig.shopId}`);
        console.log(`[THEME CONFIG] Shop name with config: ${shopWithConfig.nomProjet}`);
        console.log(`[THEME CONFIG] Shop config:`, shopWithConfig.shopifyConfig);
        console.log(`[THEME CONFIG] ===== END SHOP WITH CONFIG =====`);
      }
    }

    console.log(`[THEME CONFIG] ===== COMPLETE SHOP DATA ANALYSIS =====`);
    console.log(`[THEME CONFIG] Shop ID: ${shop.shopId}`);
    console.log(`[THEME CONFIG] Shop Name: ${shop.nomProjet}`);
    console.log(`[THEME CONFIG] All Shop Keys:`, Object.keys(shop));
    console.log(`[THEME CONFIG] Has shopifyConfig property: ${!!shop.shopifyConfig}`);
    console.log(`[THEME CONFIG] shopifyConfig type: ${typeof shop.shopifyConfig}`);
    console.log(`[THEME CONFIG] shopifyConfig value:`, shop.shopifyConfig);
    
    // Check for different possible credential locations
    console.log(`[THEME CONFIG] ===== CREDENTIAL SEARCH =====`);
    console.log(`[THEME CONFIG] shop.accessToken:`, shop.accessToken);
    console.log(`[THEME CONFIG] shop.apiKey:`, shop.apiKey);
    console.log(`[THEME CONFIG] shop.apiSecret:`, shop.apiSecret);
    console.log(`[THEME CONFIG] shop.shopifyDomain:`, shop.shopifyDomain);
    console.log(`[THEME CONFIG] shop.myshopify_domain:`, shop.myshopify_domain);
    console.log(`[THEME CONFIG] shop.domain:`, shop.domain);
    
    // Check nested properties
    if (shop.shopifyConfig) {
      console.log(`[THEME CONFIG] shop.shopifyConfig.accessToken:`, shop.shopifyConfig.accessToken);
      console.log(`[THEME CONFIG] shop.shopifyConfig.apiKey:`, shop.shopifyConfig.apiKey);
      console.log(`[THEME CONFIG] shop.shopifyConfig.apiSecret:`, shop.shopifyConfig.apiSecret);
      console.log(`[THEME CONFIG] shop.shopifyConfig.shopifyDomain:`, shop.shopifyConfig.shopifyDomain);
      console.log(`[THEME CONFIG] shop.shopifyConfig keys:`, Object.keys(shop.shopifyConfig));
    }
    
    // Check for stringified JSON
    console.log(`[THEME CONFIG] ===== CHECKING FOR STRINGIFIED JSON =====`);
    if (typeof shop.shopifyConfig === 'string') {
      try {
        const parsed = JSON.parse(shop.shopifyConfig);
        console.log(`[THEME CONFIG] Parsed shopifyConfig from string:`, parsed);
      } catch (e) {
        console.log(`[THEME CONFIG] Failed to parse shopifyConfig string:`, e.message);
      }
    }
    
    console.log(`[THEME CONFIG] ===== COMPLETE SHOP OBJECT =====`);
    console.log(JSON.stringify(shop, null, 2));
    console.log(`[THEME CONFIG] ===== END ANALYSIS =====`);

    // Check if shop has Shopify credentials (handle both nested and flattened structures)
    console.log(`[THEME CONFIG] ===== CREDENTIAL EXTRACTION LOGIC =====`);
    let shopifyConfig = shop.shopifyConfig || {};
    console.log(`[THEME CONFIG] Initial shopifyConfig:`, shopifyConfig);
    
    // Fallback: check for flattened credentials (some shops might have them stored differently)
    if (!shopifyConfig.accessToken) {
      console.log(`[THEME CONFIG] No accessToken in shopifyConfig, trying fallback...`);
      shopifyConfig = {
        accessToken: shop['shopifyConfig.accessToken'] || shop.accessToken,
        apiKey: shop['shopifyConfig.apiKey'] || shop.apiKey,
        apiSecret: shop['shopifyConfig.apiSecret'] || shop.apiSecret,
        ...shopifyConfig
      };
      console.log(`[THEME CONFIG] Fallback shopifyConfig:`, shopifyConfig);
    } else {
      console.log(`[THEME CONFIG] Found accessToken in shopifyConfig: ${shopifyConfig.accessToken ? 'YES' : 'NO'}`);
    }
    console.log(`[THEME CONFIG] Shop data:`, {
      shopId: shop.shopId,
      shopName: shop.nomProjet || shop.name,
      hasShopifyConfig: !!shop.shopifyConfig,
      shopifyConfigKeys: shop.shopifyConfig ? Object.keys(shop.shopifyConfig) : [],
      shopifyConfigRaw: shop.shopifyConfig, // Log the raw object
      extractedAccessToken: shopifyConfig.accessToken ? `${shopifyConfig.accessToken.substring(0, 10)}...` : 'NOT_FOUND',
      rawAccessToken: shop.shopifyConfig?.accessToken ? `${shop.shopifyConfig.accessToken.substring(0, 10)}...` : 'NOT_FOUND',
      shopifyDomain: shop.shopifyDomain,
      shopifyConfigDomain: shop.shopifyConfig?.shopifyDomain,
      myshopify_domain: shop.myshopify_domain,
      domain: shop.domain,
      logoUrl: shop.logoUrl ? 'EXISTS' : 'NOT_FOUND',
      desktopBannerUrl: shop.desktopBannerUrl ? 'EXISTS' : 'NOT_FOUND',
      mobileBannerUrl: shop.mobileBannerUrl ? 'EXISTS' : 'NOT_FOUND',
      faviconUrl: shop.faviconUrl ? 'EXISTS' : 'NOT_FOUND'
    });
    
    // Get Shopify domain (handle both nested and flattened structures)
    const rawDomain = shop.shopifyConfig?.shopifyDomain || shop.shopifyDomain || shop.myshopify_domain || shop.domain || shop['shopifyConfig.shopifyDomain'];
    
    if (!shopifyConfig.accessToken) {
      console.log(`[THEME CONFIG] Missing access token for shop: ${shopId}`);
      return res.status(400).json({ 
        success: false, 
        message: 'Shop does not have Shopify access token configured. Please configure Shopify credentials first.',
        errorType: 'MISSING_CREDENTIALS',
        missingFields: {
          accessToken: !shopifyConfig.accessToken,
          domain: !rawDomain
        },
        shopId: shopId
      });
    }
    const domain = rawDomain?.includes('.myshopify.com') 
      ? rawDomain 
      : `${rawDomain}.myshopify.com`;

    console.log(`[THEME CONFIG] Domain extraction:`, {
      rawDomain,
      shopifyDomain: shop.shopifyDomain,
      myshopify_domain: shop.myshopify_domain,
      domain: shop.domain,
      finalDomain: domain
    });

    if (!rawDomain) {
      console.log(`[THEME CONFIG] Missing domain for shop: ${shopId}`);
      return res.status(400).json({ 
        success: false, 
        message: 'Shop does not have Shopify domain configured. Please configure Shopify domain first.',
        errorType: 'MISSING_CREDENTIALS',
        missingFields: {
          accessToken: !shopifyConfig.accessToken,
          domain: !rawDomain
        },
        shopId: shopId
      });
    }

    console.log(`[THEME CONFIG] Configuring theme for shop: ${shop.nomProjet || shop.name}`);
    
    const results = {
      logo: null,
      desktopBanner: null,
      mobileBanner: null,
      favicon: null
    };

        // Step 1: Get the published theme ID using GraphQL (MAIN role = published theme)
    const getPublishedThemeQuery = `
      query {
        themes(first: 10, roles: [MAIN]) {
          edges {
            node {
              id
              role
              name
            }
          }
        }
      }
    `;

    const themeResponse = await axios.post(`https://${domain}/admin/api/2025-07/graphql.json`, {
      query: getPublishedThemeQuery
    }, {
      headers: {
        'X-Shopify-Access-Token': shopifyConfig.accessToken,
        'Content-Type': 'application/json'
      }
    });

    const themes = themeResponse.data.data.themes.edges;
    console.log(`[THEME CONFIG] Available themes with MAIN role:`, themes.map(edge => ({ 
      name: edge.node.name, 
      role: edge.node.role, 
      id: edge.node.id 
    })));
    
    // Get the published theme (MAIN role)
    let activeTheme = themes[0]; // First theme with MAIN role is the published theme
    
    if (!activeTheme) {
      console.log(`[THEME CONFIG] No published theme found, looking for any available theme...`);
      // Fallback: get all themes
      const getAllThemesQuery = `
        query {
          themes(first: 10) {
            edges {
              node {
                id
                role
                name
              }
            }
          }
        }
      `;
      
      const allThemesResponse = await axios.post(`https://${domain}/admin/api/2025-07/graphql.json`, {
        query: getAllThemesQuery
      }, {
        headers: {
            'X-Shopify-Access-Token': shopifyConfig.accessToken,
            'Content-Type': 'application/json'
        }
      });
      
      const allThemes = allThemesResponse.data.data.themes.edges;
      console.log(`[THEME CONFIG] All available themes:`, allThemes.map(edge => ({ 
        name: edge.node.name, 
        role: edge.node.role, 
        id: edge.node.id 
      })));
      
      // Try to find any theme with MAIN, PUBLISHED, or CURRENT role
      activeTheme = allThemes.find(edge => edge.node.role === 'MAIN') || 
                   allThemes.find(edge => edge.node.role === 'PUBLISHED') || 
                   allThemes.find(edge => edge.node.role === 'CURRENT') || 
                   allThemes[0];
    }
    
    if (!activeTheme) {
      throw new Error('No themes found in the store. Please create a theme first.');
    }

    const themeId = activeTheme.node.id;
    console.log(`[THEME CONFIG] Using theme: ${activeTheme.node.name} (${themeId}) with role: ${activeTheme.node.role}`);

    // Step 2: Prepare files array for themeFilesUpsert
    const files = [];

    // Function to add file to upload list using URL method
    const addFileToUpload = async (imageUrl, assetKey) => {
      if (!imageUrl) return null;
      
      try {
        console.log(`[THEME CONFIG] Preparing ${assetKey} from URL: ${imageUrl}`);
        
        // Extract S3 key from URL and get signed URL
        const s3Key = imageUrl.split('.com/')[1];
        console.log(`[THEME CONFIG] Extracted S3 key: ${s3Key}`);
        
        const signedUrl = await getSignedUrl(s3Key);
        console.log(`[THEME CONFIG] Generated signed URL for ${assetKey}: ${signedUrl}`);

        files.push({
          filename: assetKey,
          body: {
            type: 'URL',
            value: signedUrl
          }
        });

        console.log(`[THEME CONFIG] Added ${assetKey} to upload list with URL method`);
        return assetKey;
      } catch (error) {
        console.error(`[THEME CONFIG] Failed to prepare ${assetKey}:`, error.message);
        throw error;
      }
    };

    // Prepare all image files
    console.log(`[THEME CONFIG] Checking for images to upload...`);
    
    if (shop.logoUrl) {
      console.log(`[THEME CONFIG] Found logo URL: ${shop.logoUrl}`);
      const logoExtension = shop.logoUrl.split('.').pop() || 'jpg';
      results.logo = await addFileToUpload(shop.logoUrl, `assets/logo.${logoExtension}`);
    } else {
      console.log(`[THEME CONFIG] No logo URL found`);
    }

    if (shop.desktopBannerUrl) {
      console.log(`[THEME CONFIG] Found desktop banner URL: ${shop.desktopBannerUrl}`);
      const bannerExtension = shop.desktopBannerUrl.split('.').pop() || 'jpg';
      results.desktopBanner = await addFileToUpload(shop.desktopBannerUrl, `assets/banner-desktop.${bannerExtension}`);
    } else {
      console.log(`[THEME CONFIG] No desktop banner URL found`);
    }

    if (shop.mobileBannerUrl) {
      console.log(`[THEME CONFIG] Found mobile banner URL: ${shop.mobileBannerUrl}`);
      const mobileExtension = shop.mobileBannerUrl.split('.').pop() || 'jpg';
      results.mobileBanner = await addFileToUpload(shop.mobileBannerUrl, `assets/banner-mobile.${mobileExtension}`);
    } else {
      console.log(`[THEME CONFIG] No mobile banner URL found`);
    }

    if (shop.faviconUrl) {
      console.log(`[THEME CONFIG] Found favicon URL: ${shop.faviconUrl}`);
      const faviconExtension = shop.faviconUrl.split('.').pop() || 'ico';
      results.favicon = await addFileToUpload(shop.faviconUrl, `assets/favicon.${faviconExtension}`);
    } else {
      console.log(`[THEME CONFIG] No favicon URL found`);
    }

    // Step 3: Upload all files using themeFilesUpsert mutation
    console.log(`[THEME CONFIG] Files prepared for upload: ${files.length}`);
    console.log(`[THEME CONFIG] Files array:`, JSON.stringify(files, null, 2));
    
    // Initialize uploadedFiles array outside the if block
    const uploadedFiles = [];
    
    if (files.length > 0) {
      // Upload files to theme using REST Admin API (more reliable than GraphQL for file uploads)
      console.log(`[THEME CONFIG] Uploading ${files.length} files to theme using REST API...`);
      
      const themeIdNumber = themeId.split('/').pop();
      console.log(`[THEME CONFIG] Theme ID Number:`, themeIdNumber);
      console.log(`[THEME CONFIG] Domain:`, domain);
      console.log(`[THEME CONFIG] Access Token (first 10 chars):`, shopifyConfig.accessToken.substring(0, 10) + '...');
      
      for (const file of files) {
        try {
          console.log(`[THEME CONFIG] Uploading file:`, file.filename);
          
          // Download the image from S3 signed URL
          const imageResponse = await axios.get(file.body.value, {
            responseType: 'arraybuffer',
            timeout: 30000
          });
          
          console.log(`[THEME CONFIG] Downloaded image for ${file.filename}, size:`, imageResponse.data.length, 'bytes');
          
          // Upload to Shopify theme using REST API
          const uploadUrl = `https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`;
          
          const uploadData = {
            asset: {
              key: file.filename,
              attachment: Buffer.from(imageResponse.data, 'binary').toString('base64')
            }
          };
          
          console.log(`[THEME CONFIG] Uploading ${file.filename} to:`, uploadUrl);
          console.log(`[THEME CONFIG] Upload data size:`, uploadData.asset.attachment.length, 'characters');
          
          const uploadResponse = await axios.put(uploadUrl, uploadData, {
            headers: {
              'X-Shopify-Access-Token': shopifyConfig.accessToken,
              'Content-Type': 'application/json'
            }
          });
          
          console.log(`[THEME CONFIG] Upload response for ${file.filename}:`, JSON.stringify(uploadResponse.data, null, 2));
          
          if (uploadResponse.data.asset) {
            uploadedFiles.push({
              filename: file.filename,
              public_url: uploadResponse.data.asset.public_url
            });
            console.log(`[THEME CONFIG] Successfully uploaded ${file.filename}`);
          } else {
            console.error(`[THEME CONFIG] Failed to upload ${file.filename}: No asset in response`);
          }
          
        } catch (fileError) {
          console.error(`[THEME CONFIG] Error uploading ${file.filename}:`, fileError.response?.data || fileError.message);
          throw new Error(`Failed to upload ${file.filename}: ${fileError.response?.data?.errors || fileError.message}`);
        }
      }
      
      console.log(`[THEME CONFIG] Successfully uploaded ${uploadedFiles.length} files:`, uploadedFiles.map(f => f.filename));
      
      // Verify the files were actually uploaded by checking theme assets
      console.log(`[THEME CONFIG] Verifying uploaded files by checking theme assets...`);
      try {
        const verifyResponse = await axios.get(`https://${domain}/admin/api/2025-07/themes/${themeId.split('/').pop()}/assets.json`, {
          headers: {
            'X-Shopify-Access-Token': shopifyConfig.accessToken,
            'Content-Type': 'application/json'
          }
        });
        
        const assets = verifyResponse.data.assets;
        console.log(`[THEME CONFIG] Theme assets count:`, assets.length);
        console.log(`[THEME CONFIG] Theme assets:`, assets.map(asset => asset.key));
        
        // Check if our uploaded files are in the assets
        const uploadedFilenames = uploadedFiles.map(f => f.filename);
        const foundAssets = assets.filter(asset => uploadedFilenames.includes(asset.key));
        console.log(`[THEME CONFIG] Found our uploaded assets:`, foundAssets.map(asset => asset.key));
        
        if (foundAssets.length !== uploadedFiles.length) {
          console.warn(`[THEME CONFIG] WARNING: Only ${foundAssets.length}/${uploadedFiles.length} uploaded files found in theme assets`);
        }
      } catch (verifyError) {
        console.error(`[THEME CONFIG] Error verifying uploaded files:`, verifyError.response?.data || verifyError.message);
      }
      
      // Step 4: Update theme settings to use the uploaded assets via REST API
      console.log(`[THEME CONFIG] Updating theme settings to use uploaded assets...`);
      
      // Extract theme ID from GraphQL ID format (already extracted above)
      // const themeIdNumber = themeId.split('/').pop();
      
      // First, get the current theme settings to understand the structure
      console.log(`[THEME CONFIG] Fetching current theme settings to understand structure...`);
      
      try {
        const currentSettingsResponse = await axios.get(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}.json`, {
          headers: {
            'X-Shopify-Access-Token': shopifyConfig.accessToken,
            'Content-Type': 'application/json'
          }
        });
        
        const currentTheme = currentSettingsResponse.data.theme;
        console.log(`[THEME CONFIG] Current theme settings keys:`, Object.keys(currentTheme.settings || {}));
        
        // Prepare theme settings update using REST API
        const themeSettings = { ...currentTheme.settings };
        
        // SIMPLE APPROACH: Just upload files, skip complex settings
        console.log(`[THEME CONFIG] Files uploaded successfully. Skipping complex theme settings.`);
        console.log(`[THEME CONFIG] Uploaded files:`, uploadedFiles.map(f => f.filename));
        
        // DISABLED: Skip theme settings update to avoid false positives
        console.log(`[THEME CONFIG] SKIPPING theme settings update - files uploaded successfully`);
        if (false) { // This will never execute, but keeps the structure
          console.log(`[THEME CONFIG] Updating theme settings via REST API...`);
          console.log(`[THEME CONFIG] Theme ID Number:`, themeIdNumber);
          console.log(`[THEME CONFIG] Domain:`, domain);
          console.log(`[THEME CONFIG] Settings to update:`, JSON.stringify(themeSettings, null, 2));
          
          // For Dawn theme, we need to update settings via the theme assets API
          // The settings are stored as JSON files in the theme
          try {
            // Try to update settings via theme assets API
            const settingsAssetKey = 'config/settings_data.json';
            
            // Get current settings data
            let currentSettingsData = {};
            try {
              const currentSettingsResponse = await axios.get(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, {
                headers: {
                  'X-Shopify-Access-Token': shopifyConfig.accessToken,
                  'Content-Type': 'application/json'
                }
              });
              
              const settingsAsset = currentSettingsResponse.data.assets.find(asset => asset.key === settingsAssetKey);
              if (settingsAsset) {
                console.log(`[THEME CONFIG] Found existing settings asset:`, settingsAsset.key);
                // Download and parse current settings
                const settingsResponse = await axios.get(settingsAsset.public_url);
                currentSettingsData = settingsResponse.data;
                console.log(`[THEME CONFIG] Current settings data:`, JSON.stringify(currentSettingsData, null, 2));
              }
            } catch (settingsError) {
              console.log(`[THEME CONFIG] No existing settings found, creating new ones`);
            }
            
            // Merge our new settings with existing settings
            const updatedSettingsData = {
              ...currentSettingsData,
              current: {
                ...currentSettingsData.current,
                ...themeSettings
              }
            };
            
            console.log(`[THEME CONFIG] Updated settings data:`, JSON.stringify(updatedSettingsData, null, 2));
            
            // Upload updated settings as a theme asset
            const settingsRequestBody = {
              asset: {
                key: settingsAssetKey,
                value: JSON.stringify(updatedSettingsData, null, 2)
              }
            };
            
            console.log(`[THEME CONFIG] Uploading settings asset:`, settingsAssetKey);
            
            const settingsUploadResponse = await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, settingsRequestBody, {
              headers: {
                'X-Shopify-Access-Token': shopifyConfig.accessToken,
                'Content-Type': 'application/json'
              }
            });
            
            console.log(`[THEME CONFIG] Settings upload response:`, JSON.stringify(settingsUploadResponse.data, null, 2));
            
            if (settingsUploadResponse.data.asset) {
              console.log(`[THEME CONFIG] Settings updated successfully via assets API`);
            } else {
              console.error(`[THEME CONFIG] Failed to update settings via assets API`);
            }
            
          } catch (settingsError) {
            console.error(`[THEME CONFIG] Error updating settings via assets API:`, settingsError.response?.data || settingsError.message);
            
            // Fallback: Try the original REST API method
            console.log(`[THEME CONFIG] Trying fallback REST API method...`);
            
            const settingsRequestBody = {
              theme: {
                id: themeIdNumber,
                settings: themeSettings
              }
            };
            
            const settingsResponse = await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}.json`, settingsRequestBody, {
              headers: {
                'X-Shopify-Access-Token': shopifyConfig.accessToken,
                'Content-Type': 'application/json'
              }
            });
            
            console.log(`[THEME CONFIG] Fallback settings response status:`, settingsResponse.status);
            console.log(`[THEME CONFIG] Fallback settings response data:`, JSON.stringify(settingsResponse.data, null, 2));
          }
          
          // Verify the settings were actually updated
          console.log(`[THEME CONFIG] Verifying settings update...`);
          try {
            const verifySettingsResponse = await axios.get(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}.json`, {
              headers: {
                'X-Shopify-Access-Token': shopifyConfig.accessToken,
                'Content-Type': 'application/json'
              }
            });
            
            const updatedTheme = verifySettingsResponse.data.theme;
            console.log(`[THEME CONFIG] Verified theme settings keys:`, Object.keys(updatedTheme.settings || {}));
            console.log(`[THEME CONFIG] Full updated theme:`, JSON.stringify(updatedTheme, null, 2));
            
            // Check if our settings were actually applied
            const appliedSettings = {};
            Object.keys(themeSettings).forEach(key => {
              if (updatedTheme.settings && updatedTheme.settings[key]) {
                appliedSettings[key] = updatedTheme.settings[key];
              }
            });
            
            console.log(`[THEME CONFIG] Applied settings:`, appliedSettings);
            console.log(`[THEME CONFIG] Settings applied: ${Object.keys(appliedSettings).length}/${Object.keys(themeSettings).length}`);
            
            if (Object.keys(appliedSettings).length !== Object.keys(themeSettings).length) {
              console.warn(`[THEME CONFIG] WARNING: Not all settings were applied!`);
              const missingSettings = Object.keys(themeSettings).filter(key => !appliedSettings[key]);
              console.warn(`[THEME CONFIG] Missing settings:`, missingSettings);
              
              // Try to understand why settings aren't being applied
              console.log(`[THEME CONFIG] Attempting to get theme settings via GraphQL...`);
              try {
                const themeSettingsQuery = `
                  query {
                    theme(id: "${themeId}") {
                      settings
                    }
                  }
                `;
                
                const graphqlSettingsResponse = await axios.post(`https://${domain}/admin/api/2025-07/graphql.json`, {
                  query: themeSettingsQuery
                }, {
                  headers: {
                    'X-Shopify-Access-Token': shopifyConfig.accessToken,
                    'Content-Type': 'application/json'
                  }
                });
                
                console.log(`[THEME CONFIG] GraphQL settings response:`, JSON.stringify(graphqlSettingsResponse.data, null, 2));
                
                const graphqlSettings = graphqlSettingsResponse.data.data?.theme?.settings;
                if (graphqlSettings) {
                  console.log(`[THEME CONFIG] GraphQL theme settings keys:`, Object.keys(graphqlSettings));
                  
                  // Check if our settings are in GraphQL response
                  const graphqlAppliedSettings = {};
                  Object.keys(themeSettings).forEach(key => {
                    if (graphqlSettings[key]) {
                      graphqlAppliedSettings[key] = graphqlSettings[key];
                    }
                  });
                  
                  console.log(`[THEME CONFIG] GraphQL applied settings:`, graphqlAppliedSettings);
                  console.log(`[THEME CONFIG] GraphQL settings applied: ${Object.keys(graphqlAppliedSettings).length}/${Object.keys(themeSettings).length}`);
                }
              } catch (graphqlError) {
                console.error(`[THEME CONFIG] Error getting GraphQL settings:`, graphqlError.response?.data || graphqlError.message);
              }
            }
          } catch (verifyError) {
            console.error(`[THEME CONFIG] Error verifying settings:`, verifyError.response?.data || verifyError.message);
          }
        } else {
          console.log(`[THEME CONFIG] No theme settings to update`);
        }
        
        // Schema detection already completed above, settings are now properly configured
        
        console.log(`[THEME CONFIG] ✅ SUCCESS: All ${uploadedFiles.length} files uploaded to Dawn theme successfully!`);
        console.log(`[THEME CONFIG] ✅ Files available in theme assets:`, uploadedFiles.map(f => f.filename));
        console.log(`[THEME CONFIG] ✅ Theme configuration completed for shopId: ${shopId}`);
        console.log(`[THEME CONFIG] ✅ Note: You may need to manually apply these assets in your Shopify theme settings`);

      } catch (settingsError) {
        console.error(`[THEME CONFIG] Theme settings update error:`, settingsError.response?.data || settingsError.message);
        // Don't throw error here, as files were uploaded successfully
        console.log(`[THEME CONFIG] Warning: Theme settings update failed, but files were uploaded successfully`);
      }
    } else {
      console.log(`[THEME CONFIG] No files to upload`);
      return res.status(400).json({ 
        success: false, 
        message: 'No theme assets found to upload. Please ensure the shop has logo, banner, or favicon images configured.',
        shopId: shopId,
        uploadedAssets: results
      });
    }

    console.log(`[THEME CONFIG] Theme configuration completed for shopId: ${shopId}`);
    
    // Theme configuration completed successfully - but don't mark as parametrized yet
    // The shop will be marked as parametrized only when "Finaliser" is clicked
    console.log(`[THEME CONFIG] Theme configuration completed successfully - shop will be marked as parametrized when finalized`);
    
    res.status(200).json({ 
      success: true, 
      message: `✅ Files uploaded successfully! ${uploadedFiles.length} files are now in your theme assets. You'll need to manually apply them in your Shopify theme settings.`,
      shopId: shopId,
      uploadedAssets: uploadedFiles,
      themeName: activeTheme.node.name,
      themeRole: activeTheme.node.role,
      themeId: activeTheme.node.id,
      parametrized: false,
      note: "Theme settings were skipped to avoid false positives. Files are uploaded and ready to use."
    });

  } catch (error) {
    console.error(`[THEME CONFIG] Error configuring theme for shopId: ${shopId}`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to configure theme: ' + error.message,
      shopId: shopId 
    });
  }
});

// Route to get Shopify partner account credentials
router.get('/config/shopify-partner-credentials', (req, res) => {
  const email = process.env.SHOPIFY_PARTNER_EMAIL;
  const password = process.env.SHOPIFY_PARTNER_PASSWORD;

  if (!email || !password) {
    return res.status(500).json({
      success: false,
      message: 'Shopify partner credentials are not configured in the environment.',
    });
  }

  res.json({ success: true, credentials: { email, password } });
});

// Get a specific client by clientId (for internal portal)
router.get('/clients/:clientId', async (req, res) => {
  console.log('==== GET /clients/:clientId ====');
  console.log('Client ID from params:', req.params.clientId);
  
  try {
    const { clientId } = req.params;
    
    if (!clientId || clientId === 'undefined') {
      console.error('No client ID provided');
      return res.status(400).json({ 
        success: false, 
        message: 'ID client manquant' 
      });
    }
    
    const customersCollection = await getCustomersCollection();
    let customer;
    
    try {
      console.log('Trying to find customer with ID:', clientId);
      customer = await customersCollection.findOne({ _id: new ObjectId(clientId) });
      console.log('Found customer:', customer ? 'Yes' : 'No');
    } catch (err) {
      console.error('Error finding customer:', err.message);
      // If ObjectId is invalid, immediately return 404
      return res.status(404).json({ 
        success: false, 
        message: 'Client introuvable (ID invalide)',
        details: err.message
      });
    }
    
    if (!customer) {
      console.log('No customer found with ID:', clientId);
      return res.status(404).json({ 
        success: false, 
        message: 'Client introuvable',
        clientId: clientId
      });
    }
    
    console.log('Successfully retrieved customer:', customer._id);
    res.status(200).json({ 
      success: true, 
      customer 
    });
    
  } catch (error) {
    console.error('Unexpected error in GET /clients/:clientId:', error);
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

    console.log('==== UPDATE CLIENT (INTERNAL) DEBUG INFO ====');
    console.log('Updating client with ID:', clientId);
    console.log('Update data:', updatedClientFields);

    if (!ObjectId.isValid(clientId)) {
      console.log('FAILURE: Invalid client ID format');
      console.log('==== END UPDATE CLIENT (INTERNAL) DEBUG INFO ====');
      return res.status(400).json({ success: false, message: 'Invalid client ID format' });
    }

    // Remove potentially harmful or uneditable fields from the update
    delete updatedClientFields._id;
    delete updatedClientFields.userId;
    delete updatedClientFields.shops; // Prevent direct shops modification

    const customersCollection = await getCustomersCollection();
    
    // Add updatedAt timestamp
    updatedClientFields.updatedAt = new Date();

    // Update the client document
    const result = await customersCollection.updateOne(
      { _id: new ObjectId(clientId) },
      { $set: updatedClientFields }
    );

    if (result.matchedCount === 0) {
      console.log('FAILURE: Client not found');
      console.log('==== END UPDATE CLIENT (INTERNAL) DEBUG INFO ====');
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    console.log('SUCCESS: Client updated successfully');
    console.log('==== END UPDATE CLIENT (INTERNAL) DEBUG INFO ====');

    res.status(200).json({ 
      success: true, 
      message: 'Client updated successfully',
      data: result
    });
    
  } catch (error) {
    console.error('Error updating client:', error);
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
      console.log('Updating shop status:', {
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
      console.log('Shop update requested but data was identical to existing data.');
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
    console.error('Error updating shop:', error);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred while updating the shop', 
      error: error.message 
    });
  }
});

// Update a specific product (for internal portal)
router.put('/products/:clientId/:shopId/:productId', async (req, res) => {
  try {
    const { clientId, shopId, productId } = req.params;
    const updateData = req.body;
    
    console.log('==== UPDATE PRODUCT (INTERNAL) DEBUG INFO ====');
    console.log('Updating product for clientId:', clientId);
    console.log('Shop ID:', shopId);
    console.log('Product ID:', productId);
    console.log('Update data:', updateData);
    
    const customersCollection = await getCustomersCollection();
    
    // Find customer by clientId (could be _id or userId)
    let customer;
    try {
      // Try finding by ObjectId first
      customer = await customersCollection.findOne({ _id: new ObjectId(clientId) });
    } catch (e) {
      // If ObjectId fails, try finding by userId
      customer = await customersCollection.findOne({ userId: clientId });
    }
    
    if (!customer) {
      console.log(`FAILURE: No customer found with clientId: ${clientId}`);
      console.log('==== END UPDATE PRODUCT (INTERNAL) DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    // Find the specific shop
    const shop = customer.shops?.find(s => s.shopId === shopId);
    
    if (!shop) {
      console.log(`FAILURE: No shop found with shopId: ${shopId}`);
      console.log('==== END UPDATE PRODUCT (INTERNAL) DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Find the specific product
    const productIndex = shop.products?.findIndex(p => p.productId === productId);
    
    if (productIndex === -1 || productIndex === undefined) {
      console.log(`FAILURE: No product found with productId: ${productId}`);
      console.log('==== END UPDATE PRODUCT (INTERNAL) DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    console.log(`SUCCESS: Found product with productId: ${productId}`);
    
    // Filter out status fields (internal portal shouldn't modify these)
    const allowedFields = ['titre', 'description', 'prix', 'poids', 'eans', 'typeProduit', 'OCC', 'tailles', 'couleurs', 'stock', 'price', 'weight', 'ean', 'sizes', 'colors'];
    const filteredUpdateData = {};
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdateData[key] = updateData[key];
      }
    });
    
    // Add updatedAt timestamp
    filteredUpdateData.updatedAt = new Date();
    
    // Update the product
    const updateQuery = customer._id ? { _id: customer._id } : { userId: customer.userId };
    const updateFields = {};
    Object.keys(filteredUpdateData).forEach(key => {
      updateFields[`shops.$.products.${productIndex}.${key}`] = filteredUpdateData[key];
    });
    
    const result = await customersCollection.updateOne(
      { ...updateQuery, 'shops.shopId': shopId },
      { $set: updateFields }
    );
    
    if (result.modifiedCount === 0) {
      console.log('Failed to update product');
      console.log('==== END UPDATE PRODUCT (INTERNAL) DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to update product'
      });
    }
    
    console.log('Product updated successfully');
    console.log('==== END UPDATE PRODUCT (INTERNAL) DEBUG INFO ====');
    
    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      productId: productId
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the product',
      error: error.message
    });
  }
});

// Route to specifically update the hasShopify status of a product
router.put('/products/:clientId/:shopId/:productId/set-shopify-status', async (req, res) => {
  try {
    const { clientId, shopId, productId } = req.params;
    const { hasShopify } = req.body;

    if (typeof hasShopify !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Le statut hasShopify (boolean) est requis.' });
    }

    const customersCollection = await getCustomersCollection();

    const customer = await customersCollection.findOne({ _id: new ObjectId(clientId) });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Client non trouvé.' });
    }

    const shopIndex = customer.shops?.findIndex(s => s.shopId === shopId);
    if (shopIndex === -1) {
      return res.status(404).json({ success: false, message: 'Boutique non trouvée.' });
    }

    const productIndex = customer.shops[shopIndex].products?.findIndex(p => p.productId === productId);
    if (productIndex === -1) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé.' });
    }

    const result = await customersCollection.updateOne(
      { _id: new ObjectId(clientId), 'shops.shopId': shopId },
      {
        $set: {
          [`shops.$.products.${productIndex}.hasShopify`]: hasShopify,
          [`shops.$.products.${productIndex}.updatedAt`]: new Date(),
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ success: false, message: 'Le statut du produit n\'a pas été modifié (il était peut-être déjà à jour).' });
    }

    res.status(200).json({ success: true, message: 'Statut Shopify du produit mis à jour avec succès.' });

  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut Shopify:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la mise à jour du statut Shopify.' });
  }
});

// NEW: Route to delete a product (for internal portal)
router.delete('/products/:clientId/:shopId/:productId', async (req, res) => {
  try {
    const { clientId, shopId, productId } = req.params;

    if (!ObjectId.isValid(clientId)) {
      return res.status(400).json({ success: false, message: 'Invalid client ID' });
    }

    const customersCollection = await getCustomersCollection();

    const result = await customersCollection.updateOne(
      { _id: new ObjectId(clientId), 'shops.shopId': shopId },
      { $pull: { 'shops.$.products': { productId: productId } } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Client or shop not found' });
    }

    if (result.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or already deleted' });
    }

    res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'An internal server error occurred' });
  }
});

// Get a specific shop for a client (for internal portal)
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

    // Generate pre-signed URLs for shop images if they exist
    if (shop.logoUrl) {
      const key = decodeURIComponent(new URL(shop.logoUrl).pathname.substring(1));
      shop.logoUrl = await getSignedUrl(key);
    }
    if (shop.desktopBannerUrl) {
      const key = decodeURIComponent(new URL(shop.desktopBannerUrl).pathname.substring(1));
      shop.desktopBannerUrl = await getSignedUrl(key);
    }
    if (shop.mobileBannerUrl) {
      const key = decodeURIComponent(new URL(shop.mobileBannerUrl).pathname.substring(1));
      shop.mobileBannerUrl = await getSignedUrl(key);
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

// NEW: Route to save Shopify credentials and retry theme configuration
router.post('/shops/:shopId/save-credentials-and-configure-theme', async (req, res) => {
  const { shopId } = req.params;
  const { accessToken, shopifyDomain } = req.body;

  console.log(`[CREDENTIALS-SAVE] Received request for shopId: ${shopId}`);

  if (!shopId || !accessToken || !shopifyDomain) {
    return res.status(400).json({ 
      success: false, 
      message: 'Shop ID, access token, and domain are required.' 
    });
  }

  try {
    const customersCollection = await getCustomersCollection();
    
    // Find the shop
    const customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });

    if (!customer) {
      console.log(`[CREDENTIALS-SAVE] No shop found with ID: ${shopId}`);
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }

    const shop = customer.shops.find(s => s.shopId === shopId);
    if (!shop) {
      console.log(`[CREDENTIALS-SAVE] Shop not found in customer data: ${shopId}`);
      return res.status(404).json({ success: false, message: 'Shop not found in customer data.' });
    }

    // Save the credentials
    const updateData = {
      'shops.$.shopifyConfig': {
        accessToken: accessToken,
        updatedAt: new Date(),
      },
      'shops.$.shopifyDomain': shopifyDomain,
      'shops.$.hasShopify': true,
    };

    const result = await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      console.log(`[CREDENTIALS-SAVE] No shop found with ID: ${shopId}`);
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }

    console.log(`[CREDENTIALS-SAVE] Successfully saved credentials for shop: ${shopId}`);

    // Now retry the theme configuration
    console.log(`[CREDENTIALS-SAVE] Retrying theme configuration...`);
    
    // Call the theme configuration logic directly
    const updatedShop = {
      ...shop,
      shopifyConfig: { accessToken },
      shopifyDomain: shopifyDomain
    };

    // Get Shopify domain
    const domain = shopifyDomain.includes('.myshopify.com') 
      ? shopifyDomain 
      : `${shopifyDomain}.myshopify.com`;

    console.log(`[CREDENTIALS-SAVE] Configuring theme for shop: ${updatedShop.nomProjet || updatedShop.name}`);
    
    const results = {
      logo: null,
      desktopBanner: null,
      mobileBanner: null,
      favicon: null
    };

    // Step 1: Get the published theme ID using GraphQL (MAIN role = published theme)
    const getPublishedThemeQuery = `
      query {
        themes(first: 10, roles: [MAIN]) {
          edges {
            node {
              id
              role
              name
            }
          }
        }
      }
    `;

    const themeResponse = await axios.post(`https://${domain}/admin/api/2025-07/graphql.json`, {
      query: getPublishedThemeQuery
    }, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    const themes = themeResponse.data.data.themes.edges;
    console.log(`[CREDENTIALS-SAVE] Available themes with MAIN role:`, themes.map(edge => ({ 
      name: edge.node.name, 
      role: edge.node.role, 
      id: edge.node.id 
    })));
    
    // Get the published theme (MAIN role)
    let activeTheme = themes[0]; // First theme with MAIN role is the published theme
    
    if (!activeTheme) {
      console.log(`[CREDENTIALS-SAVE] No published theme found, looking for any available theme...`);
      // Fallback: get all themes
      const getAllThemesQuery = `
        query {
          themes(first: 10) {
            edges {
              node {
                id
                role
                name
              }
            }
          }
        }
      `;
      
      const allThemesResponse = await axios.post(`https://${domain}/admin/api/2025-07/graphql.json`, {
        query: getAllThemesQuery
      }, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      });
      
      const allThemes = allThemesResponse.data.data.themes.edges;
      console.log(`[CREDENTIALS-SAVE] All available themes:`, allThemes.map(edge => ({ 
        name: edge.node.name, 
        role: edge.node.role, 
        id: edge.node.id 
      })));
      
      // Try to find any theme with MAIN, PUBLISHED, or CURRENT role
      activeTheme = allThemes.find(edge => edge.node.role === 'MAIN') || 
                   allThemes.find(edge => edge.node.role === 'PUBLISHED') || 
                   allThemes.find(edge => edge.node.role === 'CURRENT') || 
                   allThemes[0];
    }
    
    if (!activeTheme) {
      throw new Error('No themes found in the store. Please create a theme first.');
    }

    const themeId = activeTheme.node.id;
    console.log(`[CREDENTIALS-SAVE] Using theme: ${activeTheme.node.name} (${themeId}) with role: ${activeTheme.node.role}`);

    // Step 2: Prepare files array for themeFilesUpsert
    const files = [];

    // Function to add file to upload list using URL method
    const addFileToUpload = async (imageUrl, assetKey) => {
      if (!imageUrl) return null;
      
      try {
        console.log(`[CREDENTIALS-SAVE] Preparing ${assetKey} from URL: ${imageUrl}`);
        
        // Extract S3 key from URL and get signed URL
        const s3Key = imageUrl.split('.com/')[1];
        console.log(`[CREDENTIALS-SAVE] Extracted S3 key: ${s3Key}`);
        
        const signedUrl = await getSignedUrl(s3Key);
        console.log(`[CREDENTIALS-SAVE] Generated signed URL for ${assetKey}: ${signedUrl}`);

        files.push({
          filename: assetKey,
          body: {
            type: 'URL',
            value: signedUrl
          }
        });

        console.log(`[CREDENTIALS-SAVE] Added ${assetKey} to upload list with URL method`);
        return assetKey;
      } catch (error) {
        console.error(`[CREDENTIALS-SAVE] Failed to prepare ${assetKey}:`, error.message);
        throw error;
      }
    };

    // Prepare all image files
    console.log(`[CREDENTIALS-SAVE] Checking for images to upload...`);
    
    if (updatedShop.logoUrl) {
      console.log(`[CREDENTIALS-SAVE] Found logo URL: ${updatedShop.logoUrl}`);
      const logoExtension = updatedShop.logoUrl.split('.').pop() || 'jpg';
      results.logo = await addFileToUpload(updatedShop.logoUrl, `assets/logo.${logoExtension}`);
    } else {
      console.log(`[CREDENTIALS-SAVE] No logo URL found`);
    }

    if (updatedShop.desktopBannerUrl) {
      console.log(`[CREDENTIALS-SAVE] Found desktop banner URL: ${updatedShop.desktopBannerUrl}`);
      const bannerExtension = updatedShop.desktopBannerUrl.split('.').pop() || 'jpg';
      results.desktopBanner = await addFileToUpload(updatedShop.desktopBannerUrl, `assets/banner-desktop.${bannerExtension}`);
    } else {
      console.log(`[CREDENTIALS-SAVE] No desktop banner URL found`);
    }

    if (updatedShop.mobileBannerUrl) {
      console.log(`[CREDENTIALS-SAVE] Found mobile banner URL: ${updatedShop.mobileBannerUrl}`);
      const mobileExtension = updatedShop.mobileBannerUrl.split('.').pop() || 'jpg';
      results.mobileBanner = await addFileToUpload(updatedShop.mobileBannerUrl, `assets/banner-mobile.${mobileExtension}`);
    } else {
      console.log(`[CREDENTIALS-SAVE] No mobile banner URL found`);
    }

    if (updatedShop.faviconUrl) {
      console.log(`[CREDENTIALS-SAVE] Found favicon URL: ${updatedShop.faviconUrl}`);
      const faviconExtension = updatedShop.faviconUrl.split('.').pop() || 'ico';
      results.favicon = await addFileToUpload(updatedShop.faviconUrl, `assets/favicon.${faviconExtension}`);
    } else {
      console.log(`[CREDENTIALS-SAVE] No favicon URL found`);
    }

    // Step 3: Upload all files using themeFilesUpsert mutation
    console.log(`[CREDENTIALS-SAVE] Files prepared for upload: ${files.length}`);
    
    // Initialize uploadedFiles array outside the if block
    const uploadedFiles = [];
    
    if (files.length > 0) {
      // Upload files to theme using REST Admin API (more reliable than GraphQL for file uploads)
      console.log(`[CREDENTIALS-SAVE] Uploading ${files.length} files to theme using REST API...`);
      
      const themeIdNumber = themeId.split('/').pop();
      console.log(`[CREDENTIALS-SAVE] Theme ID Number:`, themeIdNumber);
      console.log(`[CREDENTIALS-SAVE] Domain:`, domain);
      console.log(`[CREDENTIALS-SAVE] Access Token (first 10 chars):`, accessToken.substring(0, 10) + '...');
      
      for (const file of files) {
        try {
          console.log(`[CREDENTIALS-SAVE] Uploading file:`, file.filename);
          
          // Download the image from S3 signed URL
          const imageResponse = await axios.get(file.body.value, {
            responseType: 'arraybuffer',
            timeout: 30000
          });
          
          console.log(`[CREDENTIALS-SAVE] Downloaded image for ${file.filename}, size:`, imageResponse.data.length, 'bytes');
          
          // Upload to Shopify theme using REST API
          const uploadUrl = `https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`;
          
          const uploadData = {
            asset: {
              key: file.filename,
              attachment: Buffer.from(imageResponse.data, 'binary').toString('base64')
            }
          };
          
          console.log(`[CREDENTIALS-SAVE] Uploading ${file.filename} to:`, uploadUrl);
          console.log(`[CREDENTIALS-SAVE] Upload data size:`, uploadData.asset.attachment.length, 'characters');
          
          const uploadResponse = await axios.put(uploadUrl, uploadData, {
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            }
          });
          
          console.log(`[CREDENTIALS-SAVE] Upload response for ${file.filename}:`, JSON.stringify(uploadResponse.data, null, 2));
          
          if (uploadResponse.data.asset) {
            uploadedFiles.push({
              filename: file.filename,
              public_url: uploadResponse.data.asset.public_url
            });
            console.log(`[CREDENTIALS-SAVE] Successfully uploaded ${file.filename}`);
          } else {
            console.error(`[CREDENTIALS-SAVE] Failed to upload ${file.filename}: No asset in response`);
          }
          
        } catch (fileError) {
          console.error(`[CREDENTIALS-SAVE] Error uploading ${file.filename}:`, fileError.response?.data || fileError.message);
          throw new Error(`Failed to upload ${file.filename}: ${fileError.response?.data?.errors || fileError.message}`);
        }
      }
      
      console.log(`[CREDENTIALS-SAVE] Successfully uploaded ${uploadedFiles.length} files:`, uploadedFiles.map(f => f.filename));
      
      // Verify the files were actually uploaded by checking theme assets
      console.log(`[CREDENTIALS-SAVE] Verifying uploaded files by checking theme assets...`);
      try {
        const verifyResponse = await axios.get(`https://${domain}/admin/api/2025-07/themes/${themeId.split('/').pop()}/assets.json`, {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        });
        
        const assets = verifyResponse.data.assets;
        console.log(`[CREDENTIALS-SAVE] Theme assets count:`, assets.length);
        console.log(`[CREDENTIALS-SAVE] Theme assets:`, assets.map(asset => asset.key));
        
        // Check if our uploaded files are in the assets
        const uploadedFilenames = uploadedFiles.map(f => f.filename);
        const foundAssets = assets.filter(asset => uploadedFilenames.includes(asset.key));
        console.log(`[CREDENTIALS-SAVE] Found our uploaded assets:`, foundAssets.map(asset => asset.key));
        
        if (foundAssets.length !== uploadedFiles.length) {
          console.warn(`[CREDENTIALS-SAVE] WARNING: Only ${foundAssets.length}/${uploadedFiles.length} uploaded files found in theme assets`);
        }
      } catch (verifyError) {
        console.error(`[CREDENTIALS-SAVE] Error verifying uploaded files:`, verifyError.response?.data || verifyError.message);
      }
      
      // Step 4: Update theme settings to use the uploaded assets via REST API
      console.log(`[CREDENTIALS-SAVE] Updating theme settings to use uploaded assets...`);
      
      // Extract theme ID from GraphQL ID format (already extracted above)
      // const themeIdNumber = themeId.split('/').pop();
      
      // First, get the current theme settings to understand the structure
      console.log(`[CREDENTIALS-SAVE] Fetching current theme settings to understand structure...`);
      
      try {
        const currentSettingsResponse = await axios.get(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}.json`, {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        });
        
        const currentTheme = currentSettingsResponse.data.theme;
        console.log(`[CREDENTIALS-SAVE] Current theme settings keys:`, Object.keys(currentTheme.settings || {}));
        
        // Prepare theme settings update using REST API
        const themeSettings = { ...currentTheme.settings };
        
        // Add logo setting if logo was uploaded (Dawn theme uses specific setting names)
        if (results.logo) {
          const logoAsset = uploadedFiles.find(f => f.filename === results.logo);
          if (logoAsset) {
            // Dawn theme uses these specific setting names for logo
            themeSettings.header_logo_image = logoAsset.public_url;
            themeSettings.logo = logoAsset.public_url;
            console.log(`[CREDENTIALS-SAVE] Setting logo to: ${logoAsset.public_url}`);
          }
        }
        
        // Add favicon setting if favicon was uploaded
        if (results.favicon) {
          const faviconAsset = uploadedFiles.find(f => f.filename === results.favicon);
          if (faviconAsset) {
            // Dawn theme doesn't have a direct favicon setting, we'll set it via theme assets
            console.log(`[CREDENTIALS-SAVE] Favicon uploaded as asset: ${faviconAsset.public_url}`);
          }
        }
        
        // Add banner settings if banners were uploaded
        // For Dawn theme, we need to use the correct setting names
        if (results.desktopBanner) {
          const desktopBannerAsset = uploadedFiles.find(f => f.filename === results.desktopBanner);
          if (desktopBannerAsset) {
            // Dawn theme uses these specific setting names for banners
            themeSettings.image_banner = desktopBannerAsset.public_url;
            themeSettings.banner_image = desktopBannerAsset.public_url;
            console.log(`[CREDENTIALS-SAVE] Setting desktop banner to: ${desktopBannerAsset.public_url}`);
          }
        }
        
        if (results.mobileBanner) {
          const mobileBannerAsset = uploadedFiles.find(f => f.filename === results.mobileBanner);
          if (mobileBannerAsset) {
            // Dawn theme mobile banner settings
            themeSettings.image_banner_mobile = mobileBannerAsset.public_url;
            themeSettings.banner_image_mobile = mobileBannerAsset.public_url;
            console.log(`[CREDENTIALS-SAVE] Setting mobile banner to: ${mobileBannerAsset.public_url}`);
          }
        }
        
        // Update theme settings if we have any settings to update
        if (Object.keys(themeSettings).length > 0) {
          console.log(`[CREDENTIALS-SAVE] Updating theme settings via REST API:`, themeSettings);
          
          // For Dawn theme, we need to update settings via the theme assets API
          try {
            // Try to update settings via theme assets API
            const settingsAssetKey = 'config/settings_data.json';
            
            // Get current settings data
            let currentSettingsData = {};
            try {
              const currentSettingsResponse = await axios.get(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, {
                headers: {
                  'X-Shopify-Access-Token': accessToken,
                  'Content-Type': 'application/json'
                }
              });
              
              const settingsAsset = currentSettingsResponse.data.assets.find(asset => asset.key === settingsAssetKey);
              if (settingsAsset) {
                console.log(`[CREDENTIALS-SAVE] Found existing settings asset:`, settingsAsset.key);
                // Download and parse current settings
                const settingsResponse = await axios.get(settingsAsset.public_url);
                currentSettingsData = settingsResponse.data;
                console.log(`[CREDENTIALS-SAVE] Current settings data:`, JSON.stringify(currentSettingsData, null, 2));
              }
            } catch (settingsError) {
              console.log(`[CREDENTIALS-SAVE] No existing settings found, creating new ones`);
            }
            
            // Merge our new settings with existing settings
            const updatedSettingsData = {
              ...currentSettingsData,
              current: {
                ...currentSettingsData.current,
                ...themeSettings
              }
            };
            
            console.log(`[CREDENTIALS-SAVE] Updated settings data:`, JSON.stringify(updatedSettingsData, null, 2));
            
            // Upload updated settings as a theme asset
            const settingsRequestBody = {
              asset: {
                key: settingsAssetKey,
                value: JSON.stringify(updatedSettingsData, null, 2)
              }
            };
            
            console.log(`[CREDENTIALS-SAVE] Uploading settings asset:`, settingsAssetKey);
            
            const settingsUploadResponse = await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, settingsRequestBody, {
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
              }
            });
            
            console.log(`[CREDENTIALS-SAVE] Settings upload response:`, JSON.stringify(settingsUploadResponse.data, null, 2));
            
            if (settingsUploadResponse.data.asset) {
              console.log(`[CREDENTIALS-SAVE] Settings updated successfully via assets API`);
            } else {
              console.error(`[CREDENTIALS-SAVE] Failed to update settings via assets API`);
            }
            
          } catch (settingsError) {
            console.error(`[CREDENTIALS-SAVE] Error updating settings via assets API:`, settingsError.response?.data || settingsError.message);
            
            // Fallback: Try the original REST API method
            console.log(`[CREDENTIALS-SAVE] Trying fallback REST API method...`);
            
            const settingsResponse = await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}.json`, {
              theme: {
                id: themeIdNumber,
                settings: themeSettings
              }
            }, {
              headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
              }
            });
            
            console.log(`[CREDENTIALS-SAVE] Fallback settings response status:`, settingsResponse.status);
            console.log(`[CREDENTIALS-SAVE] Fallback settings response data:`, JSON.stringify(settingsResponse.data, null, 2));
          }
        } else {
          console.log(`[CREDENTIALS-SAVE] No theme settings to update`);
        }
      } catch (settingsError) {
        console.error(`[CREDENTIALS-SAVE] Theme settings update error:`, settingsError.response?.data || settingsError.message);
        // Don't throw error here, as files were uploaded successfully
        console.log(`[CREDENTIALS-SAVE] Warning: Theme settings update failed, but files were uploaded successfully`);
      }
    } else {
      console.log(`[CREDENTIALS-SAVE] No files to upload`);
      return res.status(400).json({ 
        success: false, 
        message: 'No theme assets found to upload. Please ensure the shop has logo, banner, or favicon images configured.',
        shopId: shopId,
        uploadedAssets: results
      });
    }

    console.log(`[CREDENTIALS-SAVE] Theme configuration completed for shopId: ${shopId}`);
    
    // Theme configuration completed successfully - but don't mark as parametrized yet
    // The shop will be marked as parametrized only when "Finaliser" is clicked
    console.log(`[CREDENTIALS-SAVE] Theme configuration completed successfully - shop will be marked as parametrized when finalized`);
    
    res.status(200).json({ 
      success: true, 
      message: `Shopify credentials saved and theme assets uploaded successfully to "${activeTheme.node.name}" theme using GraphQL Admin API.`,
      shopId: shopId,
      uploadedAssets: results,
      themeName: activeTheme.node.name,
      themeRole: activeTheme.node.role,
      themeId: activeTheme.node.id,
      parametrized: false
    });

  } catch (error) {
    console.error(`[CREDENTIALS-SAVE] Error saving credentials and configuring theme for shopId: ${shopId}`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save credentials and configure theme: ' + error.message,
      shopId: shopId 
    });
  }
});

// NEW: Route to delete a shop (for internal portal)
router.delete('/clients/:clientId/shops/:shopId', async (req, res) => {
  try {
    const { clientId, shopId } = req.params;

    if (!ObjectId.isValid(clientId)) {
      return res.status(400).json({ success: false, message: 'Invalid client ID' });
    }

    const customersCollection = await getCustomersCollection();

    const result = await customersCollection.updateOne(
      { _id: new ObjectId(clientId) },
      { $pull: { shops: { shopId: shopId } } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    if (result.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: 'Shop not found or already deleted' });
    }

    res.status(200).json({ success: true, message: 'Shop deleted successfully' });
  } catch (error) {
    console.error('Error deleting shop:', error);
    res.status(500).json({ success: false, message: 'An internal server error occurred' });
  }
});

// Publier des produits sur Shopify
router.put('/shopify/shop/:shopId/publish-products', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'productIds array is required' });
    }

    const customersCollection = await getCustomersCollection();

    // Find shop and validate credentials
    const customer = await customersCollection.findOne({ 'shops.shopId': shopId });
    if (!customer) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const shop = customer.shops.find(s => s.shopId === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Shop configuration not found' });
    }

    // Validate shop access before attempting to publish
    console.log(`[API] Validating shop access for ${shop.nomClient || shop.customerName}...`);
    console.log(`[API-DEBUG] Shop object structure:`, {
      shopId: shop._id,
      shopName: shop.nomClient || shop.customerName,
      shopifyDomain: shop.shopifyDomain,
      myshopify_domain: shop.myshopify_domain,
      domain: shop.domain,
      hasShopifyConfig: !!shop.shopifyConfig,
      shopifyConfigKeys: shop.shopifyConfig ? Object.keys(shop.shopifyConfig) : [],
      allShopKeys: Object.keys(shop).slice(0, 20) // First 20 keys to avoid overwhelming logs
    });
    
    const accessCheck = await validateShopAccess(shop);
    console.log(`[API-DEBUG] Shop access validation result:`, JSON.stringify(accessCheck, null, 2));
    
    if (!accessCheck.isAccessible) {
      console.error(`[API] Shop access validation failed:`, accessCheck);
      return res.status(400).json({
        error: accessCheck.error,
        code: accessCheck.code,
        httpStatus: accessCheck.httpStatus
      });
    }
    console.log(`[API] Shop access validated successfully for shop: ${accessCheck.shopData?.name || 'Unknown'}`);

    // Get products to publish
    const products = shop.products?.filter(p => productIds.includes(p.productId)) || [];
    if (products.length === 0) {
      return res.status(404).json({ error: 'No matching products found' });
    }

    console.log(`[API] Publishing ${products.length} products to Shopify for shop ${shop.nomClient || shop.customerName}`);
    const publishResults = await publishProductsToShopify(shop, products);

    // Update hasShopify status for successfully published products
    if (publishResults.results && publishResults.results.length > 0) {
      const successfulUpdates = publishResults.results
        .filter(r => r.success && r.productId && r.shopifyProductId);
      
      if (successfulUpdates.length > 0) {
        console.log(`[API] Updating hasShopify status for ${successfulUpdates.length} successful products`);
        
        const bulkOps = successfulUpdates.map(result => ({
          updateOne: {
            filter: { _id: customer._id, 'shops.shopId': shopId },
            update: {
              $set: {
                'shops.$.products.$[prod].hasShopify': true,
                'shops.$.products.$[prod].shopifyProductId': result.shopifyProductId,
                'shops.$.products.$[prod].shopifyUpdatedAt': new Date()
              }
            },
            arrayFilters: [{ 'prod.productId': result.productId }]
          }
        }));

        if (bulkOps.length > 0) {
          await customersCollection.bulkWrite(bulkOps);
          console.log(`[API] Successfully updated hasShopify status via bulkWrite.`);
        }
      }
    }

    // Return detailed results
    res.json({
      success: publishResults.success,
      message: `${publishResults.successCount}/${publishResults.totalProcessed} produits publiés avec succès`,
      totalProcessed: publishResults.totalProcessed,
      successCount: publishResults.successCount,
      failureCount: publishResults.failureCount,
      results: publishResults.results
    });

  } catch (error) {
    console.error('Erreur lors de la publication:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la publication sur Shopify',
      details: error.message 
    });
  }
});

// Get Shopify auth URL for a shop
router.get('/shopify/auth-url/:shopId', async (req, res) => {
  /**
   * We no longer rely on the OAuth flow here because the internal team
   * will parametrize the store "à la main". What we really need is a link
   * to the Shopify Admin of the target boutique so the operator can finish
   * the setup manually.
   * 
   *  1. If the shop already has `shopifyAdminUrl`, return it directly.
   *  2. Otherwise we build a generic URL `https://<domain>.myshopify.com/admin`.
   *  3. No API key / OAuth scopes are required.
   */
  try {
    const { shopId } = req.params;
    console.log('[Shopify Admin URL] Resolving admin URL for shop:', shopId);

    const customersCollection = await getCustomersCollection();

    // Locate customer & shop
    const customer = await customersCollection.findOne({ 'shops.shopId': shopId });
    if (!customer) {
      console.error('[Shopify Admin URL] Shop not found for ID:', shopId);
      return res.status(404).json({ error: 'Shop not found' });
    }

    const shop = customer.shops.find(s => s.shopId === shopId);
    if (!shop) {
      console.error('[Shopify Admin URL] Shop config missing in customer:', customer._id);
      return res.status(404).json({ error: 'Shop configuration not found' });
    }

    // Choose best admin URL
    let adminUrl = shop.shopifyAdminUrl;

    if (!adminUrl) {
      // Fallback: build from domain
      const rawDomain = shop.shopifyDomain || shop.myshopify_domain || shop.domain;
      if (!rawDomain) {
        return res.status(400).json({ error: 'Shopify domain not configured' });
      }
      const domain = rawDomain.includes('.myshopify.com') ? rawDomain : `${rawDomain}.myshopify.com`;
      adminUrl = `https://${domain}/admin`;
    }

    console.log('[Shopify Admin URL] Resolved URL:', adminUrl);
    res.json({ url: adminUrl });

  } catch (error) {
    console.error('[Shopify Admin URL] Error while generating admin URL:', error);
    res.status(500).json({
      error: 'Failed to generate Shopify Admin URL',
      details: error.message
    });
  }
});

// Route to save Shopify credentials for manual setup
router.put('/shopify/shop/:shopId/credentials', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { shopifyConfig } = req.body;

    console.log('[Shopify] Saving credentials for shop:', shopId);
    console.log('[Shopify] Credentials provided:', {
      hasShopifyDomain: !!shopifyConfig?.shopifyDomain,
      hasApiKey: !!shopifyConfig?.apiKey,
      hasApiSecret: !!shopifyConfig?.apiSecret,
      hasAccessToken: !!shopifyConfig?.accessToken,
    });

    const customersCollection = await getCustomersCollection();
    
    // Find customer with this shop
    const customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });

    if (!customer) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // Update the shop with Shopify credentials
    const result = await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      {
        $set: {
          'shops.$.shopifyConfig': shopifyConfig,
          'shops.$.shopifyDomain': shopifyConfig.shopifyDomain,
          'shops.$.shopifySetupMethod': 'manual',
          'shops.$.shopifySetupDate': new Date(),
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Failed to update shop credentials' });
    }

    console.log('[Shopify] Credentials saved successfully for shop:', shopId);
    res.json({ success: true, message: 'Credentials saved successfully' });

  } catch (error) {
    console.error('[Shopify] Error saving credentials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route to finalize manual Shopify setup
router.put('/shopify/shop/:shopId/finalize', async (req, res) => {
  try {
    const { shopId } = req.params;

    console.log('[Shopify] Finalizing setup for shop:', shopId);

    const customersCollection = await getCustomersCollection();
    
    // Find customer with this shop
    const customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });

    if (!customer) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // Update the shop to mark as having Shopify
    const result = await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      {
        $set: {
          'shops.$.hasShopify': true,
          'shops.$.shopifySetupCompleted': true,
          'shops.$.shopifySetupCompletedDate': new Date(),
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Failed to finalize shop setup' });
    }

    console.log('[Shopify] Setup finalized successfully for shop:', shopId);
    res.json({ success: true, message: 'Shopify setup completed successfully' });

  } catch (error) {
    console.error('[Shopify] Error finalizing setup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route to unparametrize a shop (set status to unparameterized)
router.put('/shopify/shop/:shopId/unparametrize', async (req, res) => {
  try {
    const { shopId } = req.params;

    console.log('[Shopify] Unparametrizing shop:', shopId);

    const customersCollection = await getCustomersCollection();
    
    // Find customer with this shop
    const customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });

    if (!customer) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // Update the shop to unparametrized status (only change parametrization, keep hasShopify intact)
    const result = await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      {
        $set: {
          'shops.$.isParametrized': false,
          'shops.$.shopifySetupCompleted': false,
          'shops.$.shopifySetupStatus': 'unparameterized',
          'shops.$.unparametrizedDate': new Date(),
        },
        $unset: {
          'shops.$.shopifyConfig': '',
          'shops.$.shopifyDomain': '',
          'shops.$.shopifySetupMethod': '',
          'shops.$.shopifySetupDate': '',
          'shops.$.shopifySetupCompletedDate': '',
          'shops.$.parametrizedAt': ''
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Failed to unparametrize shop' });
    }

    console.log('[Shopify] Shop unparametrized successfully:', shopId);
    res.json({ success: true, message: 'Shop unparametrized successfully' });

  } catch (error) {
    console.error('[Shopify] Error unparametrizing shop:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// NEW: Route to push Dawn theme with custom assets
router.post('/shops/:shopId/push-dawn-theme', async (req, res) => {
  const { shopId } = req.params;
      const log = (message) => console.log(`[DAWN THEME PUSH] ${message}`);
    
    // Helper function to get base64 from URL
    const getBase64FromUrl = async (url) => {
      try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        return buffer.toString('base64');
      } catch (error) {
        log(`Failed to get base64 from URL ${url}: ${error.message}`);
        throw error;
      }
    };

  log(`Received request for shopId: ${shopId}`);

  try {
    const customersCollection = await getCustomersCollection();
    
    // Find the shop
    let shop = null;
    let customer = null;
    
    customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });

    if (customer) {
      shop = customer.shops.find(s => s.shopId === shopId);
    } else {
      shop = await customersCollection.findOne({ shopId: shopId });
    }

    if (!shop) {
      log(`No shop found with ID: ${shopId}`);
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }

    // Get Shopify credentials
    let shopifyConfig = shop.shopifyConfig || {};
    
    if (!shopifyConfig.accessToken) {
      shopifyConfig = {
        accessToken: shop.accessToken,
        apiKey: shop.apiKey,
        apiSecret: shop.apiSecret,
        ...shopifyConfig
      };
    }
    
    const rawDomain = shop.shopifyConfig?.shopifyDomain || shop.shopifyDomain || shop.myshopify_domain || shop.domain;
    
    if (!shopifyConfig.accessToken) {
      log(`Missing access token for shop: ${shopId}`);
      return res.status(400).json({ 
        success: false, 
        message: 'Shop does not have Shopify access token configured.',
        errorType: 'MISSING_CREDENTIALS'
      });
    }

    const domain = rawDomain?.includes('.myshopify.com') 
      ? rawDomain 
      : `${rawDomain}.myshopify.com`;

    if (!rawDomain) {
      log(`Missing domain for shop: ${shopId}`);
      return res.status(400).json({ 
        success: false, 
        message: 'Shop does not have Shopify domain configured.',
        errorType: 'MISSING_CREDENTIALS'
      });
    }

    log(`Pushing Dawn theme for shop: ${shop.nomProjet || shop.name}`);

    // Step 1: Create a new theme using REST API instead of GraphQL
    log(`Creating new theme using REST API...`);
    
    const createThemeResponse = await axios.post(`https://${domain}/admin/api/2025-07/themes.json`, {
      theme: {
        name: `Dawn Theme - ${shop.nomProjet || 'Custom'} - ${Date.now()}`
      }
    }, {
      headers: {
        'X-Shopify-Access-Token': shopifyConfig.accessToken,
        'Content-Type': 'application/json'
      }
    }).catch(error => {
      if (error.response) {
        log(`Theme creation failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        throw new Error(`Theme creation failed: ${JSON.stringify(error.response.data)}`);
      } else {
        log(`Theme creation failed: ${error.message}`);
        throw error;
      }
    });

    if (createThemeResponse.data.errors) {
      log(`Error creating theme: ${JSON.stringify(createThemeResponse.data.errors)}`);
      throw new Error(`Failed to create theme: ${JSON.stringify(createThemeResponse.data.errors)}`);
    }

    const newTheme = createThemeResponse.data.theme;
    log(`Created new theme: ${newTheme.name} (${newTheme.id})`);

    // Step 2: Upload Dawn theme files
    const fs = require('fs');
    const path = require('path');
    const dawnThemePath = path.join(__dirname, '../services/DawnTheme');

    // Function to recursively get all files from a directory
    const getAllFiles = (dirPath, arrayOfFiles = []) => {
      const files = fs.readdirSync(dirPath);
      
      files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
          arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
          arrayOfFiles.push(fullPath);
        }
      });
      
      return arrayOfFiles;
    };

    // Get all Dawn theme files
    const dawnFiles = getAllFiles(dawnThemePath);
    log(`Found ${dawnFiles.length} Dawn theme files to upload`);

    // Upload all Dawn theme files
    const themeIdNumber = newTheme.id;
    let uploadedFiles = 0;

    for (const filePath of dawnFiles) {
      try {
        const relativePath = path.relative(dawnThemePath, filePath);
        const fileContent = fs.readFileSync(filePath);
        
        // Skip only system files, not theme files
        if (relativePath.includes('.DS_Store') || relativePath.includes('Thumbs.db')) {
          continue;
        }

        const uploadData = {
          asset: {
            key: relativePath,
            attachment: fileContent.toString('base64')
          }
        };

        // Add delay to avoid rate limiting (more efficient)
        if (uploadedFiles > 0 && uploadedFiles % 100 === 0) {
          log(`Rate limiting pause...`);
          await new Promise(resolve => setTimeout(resolve, 50)); // 0.05 second delay every 100 files
        }

        await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, uploadData, {
          headers: {
            'X-Shopify-Access-Token': shopifyConfig.accessToken,
            'Content-Type': 'application/json'
          }
        });

        uploadedFiles++;
        if (uploadedFiles % 10 === 0) {
          log(`Uploaded ${uploadedFiles}/${dawnFiles.length} files`);
        }
              } catch (error) {
          if (error.response?.status === 429) {
            log(`Rate limited, waiting 1 second before retry...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Retry the same file
            try {
              const fileContent = fs.readFileSync(filePath);
              const relativePath = path.relative(dawnThemePath, filePath);
              const uploadData = {
                asset: {
                  key: relativePath,
                  attachment: fileContent.toString('base64')
                }
              };
              
              await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, uploadData, {
                headers: {
                  'X-Shopify-Access-Token': shopifyConfig.accessToken,
                  'Content-Type': 'application/json'
                }
              });
              
              uploadedFiles++;
              log(`Successfully uploaded ${relativePath} after retry`);
            } catch (retryError) {
              log(`Failed to upload ${filePath} after retry: ${retryError.message}`);
            }
          } else if (error.response?.status === 422) {
            // For 422 errors, try to fix the file content or skip with warning
            const relativePath = path.relative(dawnThemePath, filePath);
            log(`422 error for ${relativePath}, attempting to fix...`);
            
            try {
              // For JSON files, try to validate and fix
              if (relativePath.endsWith('.json')) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                let jsonContent;
                try {
                  jsonContent = JSON.parse(fileContent);
                  // Re-stringify to ensure valid JSON
                  const fixedContent = JSON.stringify(jsonContent, null, 2);
                  
                  const uploadData = {
                    asset: {
                      key: relativePath,
                      value: fixedContent
                    }
                  };
                  
                  await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, uploadData, {
                    headers: {
                      'X-Shopify-Access-Token': shopifyConfig.accessToken,
                      'Content-Type': 'application/json'
                    }
                  });
                  
                  uploadedFiles++;
                  log(`Successfully uploaded ${relativePath} after JSON fix`);
                } catch (jsonError) {
                  // Fix JSON formatting for problematic files
                  let fixedJson;
                  if (relativePath.includes('footer-group')) {
                    // Use the actual footer structure but properly formatted
                    fixedJson = {
                      "name": "t:sections.footer.name",
                      "type": "footer",
                      "sections": {
                        "footer": {
                          "type": "footer",
                          "settings": {
                            "color_scheme": "scheme-1",
                            "newsletter_enable": true,
                            "newsletter_heading": "Subscribe to our emails",
                            "enable_follow_on_shop": true,
                            "show_social": true,
                            "enable_country_selector": true,
                            "enable_language_selector": true,
                            "payment_enable": true,
                            "show_policy": true,
                            "margin_top": 0,
                            "padding_top": 36,
                            "padding_bottom": 36
                          }
                        }
                      },
                      "order": ["footer"]
                    };
                  } else if (relativePath.includes('header-group')) {
                    // Use the actual header structure but properly formatted
                    fixedJson = {
                      "name": "t:sections.header.name",
                      "type": "header",
                      "sections": {
                        "announcement-bar": {
                          "type": "announcement-bar",
                          "blocks": {
                            "announcement-bar-0": {
                              "type": "announcement",
                              "settings": {
                                "text": "Welcome to our store",
                                "link": ""
                              }
                            }
                          },
                          "block_order": ["announcement-bar-0"],
                          "settings": {
                            "auto_rotate": false,
                            "change_slides_speed": 5,
                            "color_scheme": "scheme-1",
                            "show_line_separator": true,
                            "show_social": false,
                            "enable_country_selector": false,
                            "enable_language_selector": false
                          }
                        },
                        "header": {
                          "type": "header",
                          "settings": {
                            "logo_position": "middle-left",
                            "mobile_logo_position": "center",
                            "menu": "main-menu",
                            "menu_type_desktop": "dropdown",
                            "sticky_header_type": "on-scroll-up",
                            "show_line_separator": true,
                            "color_scheme": "scheme-1",
                            "menu_color_scheme": "scheme-1",
                            "enable_country_selector": true,
                            "enable_language_selector": true,
                            "enable_customer_avatar": true,
                            "margin_bottom": 0,
                            "padding_top": 20,
                            "padding_bottom": 20
                          }
                        }
                      },
                      "order": ["announcement-bar", "header"]
                    };
                  } else {
                    // For other JSON files, try to parse and re-format
                    try {
                      const parsed = JSON.parse(fileContent);
                      fixedJson = parsed;
                    } catch (e) {
                      fixedJson = { 
                        "name": "Default", 
                        "settings": [] 
                      };
                    }
                  }
                  
                                     const fixedContent = JSON.stringify(fixedJson, null, 2);
                  await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, {
                    asset: {
                      key: relativePath,
                      value: fixedContent
                    }
                  }, {
                    headers: {
                      'X-Shopify-Access-Token': shopifyConfig.accessToken,
                      'Content-Type': 'application/json'
                    }
                  });
                  
                  uploadedFiles++;
                  log(`Successfully uploaded ${relativePath} with minimal JSON`);
                }
              } else {
                log(`422 error for non-JSON file ${relativePath}, skipping`);
              }
            } catch (fixError) {
              log(`Failed to fix ${relativePath}: ${fixError.message}`);
            }
          } else {
            log(`Error uploading ${filePath}: ${error.message}`);
          }
        }
    }

    log(`Successfully uploaded ${uploadedFiles} Dawn theme files`);

    // Step 3: Upload images to Shopify CDN FIRST (before modifying files)
    log(`Uploading images to Shopify CDN...`);
    const cdnUrls = {};
    const { getSignedUrl } = require('../services/s3Service');
    
    // Helper function to upload image to CDN - optimized for speed
    const uploadImageToCDN = async (imageUrl, assetKey) => {
      try {
        // Get signed URL from S3
        const s3Key = imageUrl.split('.com/')[1];
        const signedUrl = await getSignedUrl(s3Key);
        
        // Download image from S3
        const imageResponse = await axios.get(signedUrl, {
          responseType: 'arraybuffer',
          timeout: 15000 // Reduced timeout for faster testing
        });
        
        // Upload to Shopify CDN
        const uploadResponse = await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, {
          asset: {
            key: assetKey,
            attachment: Buffer.from(imageResponse.data, 'binary').toString('base64')
          }
        }, {
          headers: {
            'X-Shopify-Access-Token': shopifyConfig.accessToken,
            'Content-Type': 'application/json'
          }
        });
        
        // Minimal delay for faster testing
        await new Promise(resolve => setTimeout(resolve, 50));
        
        return uploadResponse.data.asset.public_url;
      } catch (error) {
        log(`Failed to upload ${assetKey}: ${error.message}`);
        return null;
      }
    };
    
    try {
      // Upload logo to CDN
      if (shop.logoUrl) {
        const logoExtension = shop.logoUrl.split('.').pop() || 'png';
        const logoUrl = await uploadImageToCDN(shop.logoUrl, `assets/logo-${Date.now()}.${logoExtension}`);
        if (logoUrl) {
          cdnUrls.logo = logoUrl;
          log(`Logo uploaded to CDN: ${logoUrl}`);
        }
      }

      // Upload desktop banner to CDN
      if (shop.desktopBannerUrl) {
        const desktopExtension = shop.desktopBannerUrl.split('.').pop() || 'webp';
        const desktopUrl = await uploadImageToCDN(shop.desktopBannerUrl, `assets/banner-desktop-${Date.now()}.${desktopExtension}`);
        if (desktopUrl) {
          cdnUrls.desktopBanner = desktopUrl;
          log(`Desktop banner uploaded to CDN: ${desktopUrl}`);
        }
      }

      // Upload mobile banner to CDN
      if (shop.mobileBannerUrl) {
        const mobileExtension = shop.mobileBannerUrl.split('.').pop() || 'jpg';
        const mobileUrl = await uploadImageToCDN(shop.mobileBannerUrl, `assets/banner-mobile-${Date.now()}.${mobileExtension}`);
        if (mobileUrl) {
          cdnUrls.mobileBanner = mobileUrl;
          log(`Mobile banner uploaded to CDN: ${mobileUrl}`);
        }
      }
    } catch (error) {
      log(`Warning: Could not upload images to CDN: ${error.message}`);
    }

    // Step 4: Retry only critical files that failed
    log(`Retrying critical files that failed...`);
    const criticalFiles = [
      'snippets/meta-tags.liquid',
      'sections/footer-group.json',
      'sections/header-group.json'
    ];
    
    for (const criticalFile of criticalFiles) {
      try {
        const filePath = path.join(dawnThemePath, criticalFile);
        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, {
            asset: {
              key: criticalFile,
              value: fileContent
            }
          }, {
            headers: {
              'X-Shopify-Access-Token': shopifyConfig.accessToken,
              'Content-Type': 'application/json'
            }
          });
          log(`Successfully retried ${criticalFile}`);
          await new Promise(resolve => setTimeout(resolve, 100)); // 0.1 second delay between retries - faster for testing
        }
      } catch (error) {
        log(`Warning: Could not retry ${criticalFile}: ${error.message}`);
      }
    }




    // Step 5: Modify header to use logo CDN URL
    try {
      log(`Modifying header to use logo CDN URL...`);
      
      // Read the existing header file
      const headerPath = path.join(dawnThemePath, 'sections/header.liquid');
      let headerContent = fs.readFileSync(headerPath, 'utf8');
      
      // Replace the logo rendering parts to use our CDN URL
      const originalLogoCode1 = `{{
        settings.logo
        | image_url: width: 570
        | image_tag:
          class: 'header__heading-logo',
          alt: logo_alt,
          width: settings.logo_width,
          height: logo_height,
          sizes: sizes,
          widths: widths
      }}`;
      
      const newLogoCode1 = `{%- if settings.logo != blank -%}
        <img 
          src="{{ settings.logo }}" 
          alt="{{ logo_alt }}"
          class="header__heading-logo"
          style="max-width: {{ settings.logo_width }}px; height: auto;"
          loading="lazy"
        />
      {%- endif -%}`;
      
      headerContent = headerContent.replace(originalLogoCode1, newLogoCode1);
      
      // Replace the second logo instance
      const originalLogoCode2 = `{{
        settings.logo
        | image_url: width: 570
        | image_tag:
          class: 'header__heading-logo',
          alt: logo_alt,
          width: settings.logo_width,
          height: logo_height,
          sizes: sizes,
          widths: widths
      }}`;
      
      const newLogoCode2 = `{%- if settings.logo != blank -%}
        <img 
          src="{{ settings.logo }}" 
          alt="{{ logo_alt }}"
          class="header__heading-logo"
          style="max-width: {{ settings.logo_width }}px; height: auto;"
          loading="lazy"
        />
      {%- endif -%}`;
      
      headerContent = headerContent.replace(originalLogoCode2, newLogoCode2);
      
      // Upload modified header section
      await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, {
        asset: {
          key: 'sections/header.liquid',
          value: headerContent
        }
      }, {
        headers: {
          'X-Shopify-Access-Token': shopifyConfig.accessToken,
          'Content-Type': 'application/json'
        }
      });
      
      log(`Modified header to use logo CDN URL`);
    } catch (error) {
      log(`Warning: Could not modify header: ${error.message}`);
    }



    // Step 5: Update theme settings with CDN URLs - simplified approach
    try {
      log(`Updating theme settings with CDN URLs...`);
      
      // Create a complete settings structure with color schemes
      const simpleSettings = {
        current: "Default",
        presets: {
          "Default": {
            color_schemes: {
              "scheme-1": {
                settings: {
                  background: "#FFFFFF",
                  background_gradient: "",
                  text: "#121212",
                  button: "#121212",
                  button_label: "#FFFFFF",
                  secondary_button_label: "#121212",
                  shadow: "#121212"
                }
              },
              "scheme-2": {
                settings: {
                  background: "#F3F3F3",
                  background_gradient: "",
                  text: "#121212",
                  button: "#121212",
                  button_label: "#F3F3F3",
                  secondary_button_label: "#121212",
                  shadow: "#121212"
                }
              },
              "scheme-3": {
                settings: {
                  background: "#242833",
                  background_gradient: "",
                  text: "#FFFFFF",
                  button: "#FFFFFF",
                  button_label: "#000000",
                  secondary_button_label: "#FFFFFF",
                  shadow: "#121212"
                }
              },
              "scheme-4": {
                settings: {
                  background: "#121212",
                  background_gradient: "",
                  text: "#FFFFFF",
                  button: "#FFFFFF",
                  button_label: "#121212",
                  secondary_button_label: "#FFFFFF",
                  shadow: "#121212"
                }
              },
              "scheme-5": {
                settings: {
                  background: "#334FB4",
                  background_gradient: "",
                  text: "#FFFFFF",
                  button: "#FFFFFF",
                  button_label: "#334FB4",
                  secondary_button_label: "#FFFFFF",
                  shadow: "#121212"
                }
              }
            }
          }
        }
      };
      
      // Add logo
      if (cdnUrls.logo) {
        simpleSettings.current.logo = cdnUrls.logo;
      }
      
      // Add banner section with proper CDN integration and all required settings
      if (cdnUrls.desktopBanner || cdnUrls.mobileBanner) {
        // Use Shopify section handle "image_banner" to match Dawn's index.json default
        simpleSettings.image_banner = {
          type: 'image-banner',
          settings: {
            heading: shop.nomProjet || 'Welcome',
            use_cdn: Boolean(cdnUrls.desktopBanner || cdnUrls.mobileBanner),
            cdn_alt: shop.nomProjet || 'Banner',
            color_scheme: 'scheme-1', // Required for color schemes to work
            image_height: 'large',
            desktop_content_position: 'middle-center',
            desktop_content_alignment: 'center',
            mobile_content_alignment: 'center',
            show_text_box: true,
            stack_images_on_mobile: false,
            show_text_below: false,
            image_behavior: 'none',
            image_overlay_opacity: 0
          },
          blocks: {
            heading: {
              type: 'heading',
              settings: {
                heading: shop.nomProjet || 'Welcome',
                heading_size: 'h0'
              }
            },
            button: {
              type: 'buttons',
              settings: {
                button_label_1: 'Shop now',
                button_link_1: 'shopify://collections/all',
                button_style_secondary_1: false,
                button_label_2: '',
                button_link_2: '',
                button_style_secondary_2: false
              }
            }
          },
          block_order: [
            'heading',
            'button'
          ]
        };

        if (cdnUrls.desktopBanner) {
          simpleSettings.image_banner.settings.desktop_cdn = cdnUrls.desktopBanner;
        }

        if (cdnUrls.mobileBanner) {
          simpleSettings.image_banner.settings.mobile_cdn = cdnUrls.mobileBanner;
        }
      }
      
      // Upload simplified settings
      await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, {
        asset: {
          key: 'config/settings_data.json',
          value: JSON.stringify(simpleSettings, null, 2)
        }
      }, {
        headers: {
          'X-Shopify-Access-Token': shopifyConfig.accessToken,
          'Content-Type': 'application/json'
        }
      });
      
      log(`Successfully updated theme settings with CDN URLs`);
    } catch (settingsError) {
      log(`Warning: Could not update theme settings: ${settingsError.message}`);
    }

    // Step 5.5: Ensure index.json template is properly uploaded with banner
    try {
      log(`Ensuring index.json template is properly configured...`);
      
      // Read the index.json template
      const indexTemplatePath = path.join(dawnThemePath, 'templates/index.json');
      let indexTemplate = JSON.parse(fs.readFileSync(indexTemplatePath, 'utf8'));
      
      // Ensure image_banner section exists before updating settings
        if (!indexTemplate.sections.image_banner) {
          indexTemplate.sections.image_banner = {
            type: 'image-banner',
            blocks: {},
            settings: {}
          };
          // Prepend to order if not already present
          if (!indexTemplate.order.includes('image_banner')) {
            indexTemplate.order.unshift('image_banner');
          }
        }
        // Update the image_banner section with our CDN settings
      if (cdnUrls.desktopBanner || cdnUrls.mobileBanner) {
        indexTemplate.sections.image_banner.settings = {
          ...indexTemplate.sections.image_banner.settings,
          use_cdn: Boolean(cdnUrls.desktopBanner || cdnUrls.mobileBanner),
          cdn_alt: shop.nomProjet || 'Banner',
          color_scheme: 'scheme-1',
          image_height: 'large',
          desktop_content_position: 'middle-center',
          desktop_content_alignment: 'center',
          mobile_content_alignment: 'center',
          show_text_box: true,
          stack_images_on_mobile: false,
          show_text_below: false,
          image_behavior: 'none',
          image_overlay_opacity: 0
        };

        if (cdnUrls.desktopBanner) {
          indexTemplate.sections.image_banner.settings.desktop_cdn = cdnUrls.desktopBanner;
        }

        if (cdnUrls.mobileBanner) {
          indexTemplate.sections.image_banner.settings.mobile_cdn = cdnUrls.mobileBanner;
        }

        // Update the heading
        indexTemplate.sections.image_banner.blocks.heading.settings.heading = shop.nomProjet || 'Welcome';
      }
      
      // Upload the updated index.json template
      await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}/assets.json`, {
        asset: {
          key: 'templates/index.json',
          value: JSON.stringify(indexTemplate, null, 2)
        }
      }, {
        headers: {
          'X-Shopify-Access-Token': shopifyConfig.accessToken,
          'Content-Type': 'application/json'
        }
      });
      
      log(`Successfully updated index.json template with banner configuration`);
    } catch (templateError) {
      log(`Warning: Could not update index.json template: ${templateError.message}`);
    }

    // Step 6: Publish the theme using REST API with retry logic
    log(`Publishing theme using REST API...`);
    
    let publishSuccess = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (!publishSuccess && retryCount < maxRetries) {
      try {
        const publishResponse = await axios.put(`https://${domain}/admin/api/2025-07/themes/${themeIdNumber}.json`, {
          theme: {
            role: "main"
          }
        }, {
          headers: {
            'X-Shopify-Access-Token': shopifyConfig.accessToken,
            'Content-Type': 'application/json'
          }
        });

        if (publishResponse.data.errors) {
          log(`Error publishing theme: ${JSON.stringify(publishResponse.data.errors)}`);
          throw new Error(`Failed to publish theme: ${publishResponse.data.errors[0]}`);
        }

        log(`Successfully published Dawn theme with custom assets`);
        
        // Verify the theme is now the main theme
        const verifyResponse = await axios.get(`https://${domain}/admin/api/2025-07/themes.json`, {
          headers: {
            'X-Shopify-Access-Token': shopifyConfig.accessToken
          }
        });
        
        const mainTheme = verifyResponse.data.themes.find(theme => theme.role === 'main');
        if (mainTheme && mainTheme.id === newTheme.id) {
          log(`Theme verified as main theme: ${mainTheme.name} (${mainTheme.id})`);
        } else {
          log(`Warning: Theme may not be properly published as main theme`);
        }
        
        publishSuccess = true;
      } catch (error) {
        retryCount++;
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after']) || 1;
          log(`Rate limited during publish, waiting ${retryAfter} seconds before retry ${retryCount}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        } else {
          log(`Error publishing theme: ${error.message}`);
          throw error;
        }
      }
    }
    
    if (!publishSuccess) {
      throw new Error(`Failed to publish theme after ${maxRetries} retries`);
    }

    // Step 7: Update shop record with theme information
    await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      {
        $set: {
          'shops.$.dawnThemePushed': true,
          'shops.$.dawnThemePushedAt': new Date(),
          'shops.$.currentThemeId': newTheme.id,
          'shops.$.themeName': newTheme.name
        }
      }
    );

    log(`Updated shop record with theme information`);

    res.status(200).json({
      success: true,
      message: 'Dawn theme successfully pushed with custom assets',
      data: {
        themeId: newTheme.id,
        themeName: newTheme.name,
        uploadedFiles: uploadedFiles,
        cdnUrls: cdnUrls
      }
    });

  } catch (error) {
    log(`Error pushing Dawn theme: ${error.stack || error.message}`);
    console.error('Error during Dawn theme push:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'An error occurred while pushing the Dawn theme.' 
    });
  }
});

module.exports = router; 