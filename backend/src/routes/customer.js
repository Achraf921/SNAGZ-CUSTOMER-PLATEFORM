const express = require('express');
const router = express.Router();
const { getCustomersCollection } = require('../config/db');
const { ObjectId } = require('mongodb');
const { generateDocumentation } = require('../services/sharepointService');
const path = require('path');
const fs = require('fs');

// Route to get all shops for all customers (for internal portal)
router.get('/all-shops', async (req, res) => {
  try {
    const customersCollection = await getCustomersCollection();
    const customers = await customersCollection.find({}).toArray();
    // Aggregate all shops from all customers, attach client info
    const allShops = [];
    customers.forEach(customer => {
      const clientName = customer.raisonSociale || customer.name || '-';
      const clientId = customer._id?.toString() || customer.id || '-';
      if (Array.isArray(customer.shops)) {
        customer.shops.forEach(shop => {
          allShops.push({
            shopId: shop.shopId || shop.id,
            name: shop.nomProjet || shop.name || '-',
            clientName,
            clientId,
            productsCount: Array.isArray(shop.products) ? shop.products.length : (shop.productsCount || 0),
            status: shop.status || '-',
            hasShopify: shop.hasShopify === true || shop.shopifyConfigured === true,
            documented: shop.documented || 'undocumented'
          });
        });
      }
    });
    res.status(200).json({ success: true, shops: allShops });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de toutes les boutiques',
      error: error.message
    });
  }
});

// Route to get all customers (for internal portal)
router.get('/all', async (req, res) => {
  try {
    const customersCollection = await getCustomersCollection();
    const customers = await customersCollection.find({}).toArray();
    res.status(200).json({
      success: true,
      customers: customers.map(c => ({
        _id: c._id,
        raisonSociale: c.raisonSociale || c.name || '-',
        email: c.email || c.contact1Email || c.contactFacturationEmail || '-',
        status: c.status || 'inactive',
        shops: c.shops || [],
        shopsCount: Array.isArray(c.shops) ? c.shops.length : (c.shopsCount || 0),
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des clients',
      error: error.message
    });
  }
});

// Route to handle welcome form submissions
router.post('/welcome-form', async (req, res) => {
  try {
    const formData = req.body;
    
    // Add timestamp to the submission
    const submission = {
      ...formData,
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
    console.error('Error saving welcome form:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while saving the welcome form',
      error: error.message
    });
  }
});

// Route to get customer data by MongoDB ID
router.get('/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
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
    res.status(200).json({
      success: true,
      customer
    });
  } catch (error) {
    console.error('Error fetching customer data:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching customer data',
      error: error.message
    });
  }
});

// Route to get customer data by userId
router.get('/by-user-id/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('==== CUSTOMER ROUTE DEBUG INFO ====');
    console.log('Request params:', req.params);
    console.log('Request query:', req.query);
    console.log('Request headers:', req.headers);
    console.log('Fetching customer with userId:', userId);
    console.log('Timestamp:', new Date().toISOString());
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Log all customers in the collection for debugging
    console.log('Checking all documents in the customers collection...');
    const allCustomers = await customersCollection.find({}).toArray();
    console.log('Total documents in customers collection:', allCustomers.length);
    
    // Log the first few customers (limit to avoid excessive logging)
    const customerSample = allCustomers.slice(0, Math.min(5, allCustomers.length));
    console.log('Sample of customers in database:');
    customerSample.forEach((doc, index) => {
      console.log(`Document ${index + 1}:`, {
        _id: doc._id,
        userId: doc.userId,
        raisonSociale: doc.raisonSociale || 'N/A'
      });
    });
    
    // Use the userId directly as provided - no transformations or alternatives
    console.log('==== CUSTOMER LOOKUP DEBUG INFO ====');
    console.log('Searching for customer with EXACT userId:', userId);
    console.log('This should be the sub from Cognito for the logged-in user');
    console.log('Timestamp:', new Date().toISOString());
    
    // Find customer by exact userId match only
    let customer = await customersCollection.findOne({ userId: userId });
    
    if (customer) {
      console.log(`SUCCESS: Found customer with exact userId: ${userId}`);
      console.log('Customer details:', {
        _id: customer._id,
        userId: customer.userId,
        raisonSociale: customer.raisonSociale || 'N/A'
      });
    } else {
      console.log(`FAILURE: No customer found with exact userId: ${userId}`);
      console.log('Make sure the customer document in the database has the correct userId (sub)');
    }
    console.log('==== END CUSTOMER LOOKUP DEBUG INFO ====');
    
    console.log('Customer search result:', customer ? 'Found' : 'Not found');
    
    // If customer not found, return 404 with appropriate message
    if (!customer) {
      console.log('No customer found with userId:', userId);
      console.log('==== END DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    console.log('Customer found with _id:', customer._id);
    console.log('==== END DEBUG INFO ====');
    
    // Return the customer data
    res.status(200).json({
      success: true,
      customer
    });
  } catch (error) {
    console.error('Error fetching customer data by userId:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching customer data',
      error: error.message
    });
  }
});

// Route to update customer data by userId
router.put('/update/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;
    
    console.log('Updating customer with userId:', userId);
    console.log('Update data:', updateData);
    
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
    console.error('Error updating customer data:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the customer profile',
      error: error.message
    });
  }
});

// Route to get all shops for a specific customer
router.get('/shops/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('==== FETCH SHOPS DEBUG INFO ====');
    console.log('Fetching shops for userId (sub):', userId);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      console.log(`FAILURE: No customer found with userId: ${userId}`);
      console.log('==== END FETCH SHOPS DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    console.log(`SUCCESS: Found customer with userId: ${userId}`);
    
    // Check if customer has shops
    const shops = customer.shops || [];
    console.log(`Found ${shops.length} shops for this customer`);
    console.log('==== END FETCH SHOPS DEBUG INFO ====');
    
    // Return shops array
    res.status(200).json({
      success: true,
      shops: shops
    });
  } catch (error) {
    console.error('Error fetching shops:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching shops',
      error: error.message
    });
  }
});

// Route to add a new shop to a customer's document
router.post('/shops/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const shopData = req.body;
    
    console.log('==== CREATE SHOP DEBUG INFO ====');
    console.log('Creating shop for userId (sub):', userId);
    console.log('Shop data:', shopData);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      console.log(`FAILURE: No customer found with userId: ${userId}`);
      console.log('==== END CREATE SHOP DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    console.log(`SUCCESS: Found customer with userId: ${userId}`);
    
    // Add timestamp and unique ID to the shop data
    const newShop = {
      ...shopData,
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
      console.log('Failed to add shop to customer document');
      console.log('==== END CREATE SHOP DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to add shop to customer profile'
      });
    }
    
    console.log('Shop added successfully to customer document');
    console.log('Shop ID:', newShop.shopId);
    console.log('==== END CREATE SHOP DEBUG INFO ====');
    
    // Return success response
    res.status(201).json({
      success: true,
      message: 'Shop created successfully',
      shopId: newShop.shopId,
      shop: newShop
    });
  } catch (error) {
    console.error('Error creating shop:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating the shop',
      error: error.message
    });
  }
});

// Route to update an existing shop in a customer's document
router.put('/shops/:userId/:shopId', async (req, res) => {
  try {
    const { userId, shopId } = req.params;
    const updatedShopData = req.body;
    
    console.log('==== UPDATE SHOP DEBUG INFO ====');
    console.log('Updating shop for userId (sub):', userId);
    console.log('Shop ID:', shopId);
    console.log('Updated shop data:', updatedShopData);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      console.log(`FAILURE: No customer found with userId: ${userId}`);
      console.log('==== END UPDATE SHOP DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    console.log(`SUCCESS: Found customer with userId: ${userId}`);
    
    // Check if customer has shops array
    if (!customer.shops || !Array.isArray(customer.shops)) {
      console.log('FAILURE: Customer has no shops array');
      console.log('==== END UPDATE SHOP DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'No shops found for this customer'
      });
    }
    
    // Find the shop index in the array
    const shopIndex = customer.shops.findIndex(shop => shop.shopId === shopId);
    
    if (shopIndex === -1) {
      console.log(`FAILURE: No shop found with ID: ${shopId}`);
      console.log('==== END UPDATE SHOP DEBUG INFO ====');
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
      console.log('Updating shop status:', {
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
      console.log('FAILURE: Failed to update shop');
      console.log('==== END UPDATE SHOP DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to update shop'
      });
    }
    
    console.log('SUCCESS: Shop updated successfully');
    console.log('==== END UPDATE SHOP DEBUG INFO ====');
    
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
      updatedClient: await customersCollection.findOne({ _id: new ObjectId(userId) }),
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

// Clean GET route to fetch a customer by clientId (for internal portal)
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

// Route to update shop documentation status
router.post('/shop/:shopId/documentation', async (req, res) => {
  console.log('Received request to update shop documentation status');
  console.log('Params:', req.params);
  console.log('Body:', req.body);
  
  try {
    const { shopId } = req.params;
    const { action, forceOverwrite } = req.body;
    if (!['document','mark_documented','undocument'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    if (!shopId || !action) {
      console.log('Missing required parameters');
      return res.status(400).json({
        success: false,
        message: 'Shop ID and action are required'
      });
    }

    const customersCollection = await getCustomersCollection();
    
    // Find the customer document that contains the shop
    console.log('Searching for customer with shopId:', shopId);
    const customer = await customersCollection.findOne({
      'shops.shopId': shopId
    });
    // Find specific shop object
    const shop = customer.shops.find(s => s.shopId === shopId);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    if (!customer) {
      console.log('Shop not found');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    console.log('Found customer:', customer._id);
    console.log('Found shop in customer document');

    // Handle SharePoint documentation generation
    if (action === 'document') {
      try {
        // Determine paths for XLSX append logic
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
          console.log(`Appending product to existing XLSX: ${templatePath}`);
        } else {
          // No existing file, use the base template and create a new file
          templatePath = path.join(
            __dirname,
            '../services/FichesProduitTemplate/FICHES.PRODUITS_SHOPIFY_CLIENT_PROJET.xlsx'
          );
          outputPath = path.join(docsDir, `${filenamePrefix}_${Date.now()}.xlsx`);
          console.log(`Creating new XLSX for product documentation: ${outputPath}`);
        }

        // Generate SharePoint documentation and wait for completion
        await generateDocumentation(customer, shop, forceOverwrite);
        console.log('Documentation generated in SharePoint');
        
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
          console.log('No documents were modified');
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
          console.error('Error regenerating merchandising XLSX after single product doc:', regenErr);
        }

        res.status(200).json({
          success: true,
          message: `Documentation SharePoint générée avec succès`,
          shopId,
          documented: 'documented'
        });
      } catch (err) {
        console.error('Error generating documentation:', err);
        
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
      console.log('Updating status to:', newStatus);
      console.log('Updating all products documented status to:', productDocumentedStatus);
      
      // Find the shop and get products count for logging
      const shopData = customer.shops.find(s => s.shopId === shopId);
      const productsCount = shopData?.products?.length || 0;
      
      // Update the shop and all its products documentation status
      const updateOperations = {
        'shops.$.documented': newStatus,
        'shops.$.updatedAt': new Date()
      };
      
      // Update all products' documented status
      if (productsCount > 0) {
        for (let i = 0; i < productsCount; i++) {
          updateOperations[`shops.$.products.${i}.documented`] = productDocumentedStatus;
        }
      }
      
      const updateResult = await customersCollection.updateOne(
        { 'shops.shopId': shopId },
        { $set: updateOperations }
      );

      console.log('Update result:', updateResult);

      if (updateResult.modifiedCount === 0) {
        console.log('No documents were modified');
        return res.status(500).json({
          success: false,
          message: 'Failed to update shop documentation status'
        });
      }

      console.log(`Successfully updated shop documentation status and ${productsCount} products`);
      
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
    console.error('Error updating shop documentation status:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating shop documentation status',
      error: error.message
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
    console.error('Error fetching shop products:', error);
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
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
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
          console.log(`Appending product to existing XLSX: ${templatePath}`);
        } else {
          // No existing file, use the base template and create a new file
          templatePath = path.join(
            __dirname,
            '../services/FichesProduitTemplate/FICHES.PRODUITS_SHOPIFY_CLIENT_PROJET.xlsx'
          );
          outputPath = path.join(docsDir, `${filenamePrefix}_${Date.now()}.xlsx`);
          console.log(`Creating new XLSX for product documentation: ${outputPath}`);
        }
        
        console.log('Calling merch XLSX processor for single product...');
        const command = `python3 "${path.join(__dirname, '../services/merch_xlsx_processor.py')}" "${templatePath}" "${encodedShopData}" "${outputPath}"`;
        
        const { stdout, stderr } = await execPromise(command);
        
        // Log any stderr output as a warning, but do NOT treat it as a fatal error.
        // openpyxl (used by merch_xlsx_processor.py) prints benign warnings such as
        // "Data Validation extension is not supported" on stderr. These do not
        // indicate a failure and should be ignored.
        if (stderr) {
          console.warn('[merch_xlsx_processor warning]', stderr);
        }
        
        console.log('XLSX processor stdout:', stdout);
        console.log(`Product documentation generated successfully: ${outputPath}`);
        
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
          console.error('Error regenerating merchandising XLSX after single product doc:', regenErr);
        }

        res.status(200).json({
          success: true,
          message: `Produit "${product.titre}" documenté avec succès dans SharePoint`,
          productId,
          documented: true
        });
        
      } catch (error) {
        console.error('Error generating product documentation:', error);
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
    console.error('Error updating product documentation:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating product documentation',
      error: error.message
    });
  }
});

// Route to add a product to a shop
router.post('/shops/:userId/:shopId/products', async (req, res) => {
  try {
    const { userId, shopId } = req.params;
    const productData = req.body;
    
    console.log('==== CREATE PRODUCT DEBUG INFO ====');
    console.log('Creating product for userId:', userId);
    console.log('Shop ID:', shopId);
    console.log('Product data:', productData);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      console.log(`FAILURE: No customer found with userId: ${userId}`);
      console.log('==== END CREATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    // Find the specific shop
    const shop = customer.shops?.find(s => s.shopId === shopId);
    
    if (!shop) {
      console.log(`FAILURE: No shop found with shopId: ${shopId}`);
      console.log('==== END CREATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Check if shop is valid
    if (shop.status !== 'valid') {
      console.log(`FAILURE: Shop doesn't meet requirements - Status: ${shop.status}`);
      console.log('==== END CREATE PRODUCT DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Shop must be valid to create products'
      });
    }
    
    console.log(`SUCCESS: Found valid shop with shopId: ${shopId}`);
    
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
      console.log('Failed to add product to shop');
      console.log('==== END CREATE PRODUCT DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to add product to shop'
      });
    }
    
    console.log('Product added successfully to shop');
    console.log('Product ID:', newProduct.productId);
    console.log('==== END CREATE PRODUCT DEBUG INFO ====');
    
    // Return success response
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      productId: newProduct.productId,
      product: newProduct
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating the product',
      error: error.message
    });
  }
});

// Route to get all products for a specific shop
router.get('/shops/:userId/:shopId/products', async (req, res) => {
  try {
    const { userId, shopId } = req.params;
    
    console.log('==== FETCH PRODUCTS DEBUG INFO ====');
    console.log('Fetching products for userId:', userId);
    console.log('Shop ID:', shopId);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      console.log(`FAILURE: No customer found with userId: ${userId}`);
      console.log('==== END FETCH PRODUCTS DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    // Find the specific shop
    const shop = customer.shops?.find(s => s.shopId === shopId);
    
    if (!shop) {
      console.log(`FAILURE: No shop found with shopId: ${shopId}`);
      console.log('==== END FETCH PRODUCTS DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    console.log(`SUCCESS: Found shop with shopId: ${shopId}`);
    
    // Get products array (initialize if doesn't exist)
    const products = shop.products || [];
    console.log(`Found ${products.length} products for this shop`);
    console.log('==== END FETCH PRODUCTS DEBUG INFO ====');
    
    // Return products array
    res.status(200).json({
      success: true,
      products: products,
      shopName: shop.nomProjet || shop.name || 'Shop',
      shopStatus: shop.status
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching products',
      error: error.message
    });
  }
});

// Route to update a product in a shop
router.put('/shops/:userId/:shopId/products/:productId', async (req, res) => {
  try {
    const { userId, shopId, productId } = req.params;
    const productData = req.body;
    
    console.log('==== UPDATE PRODUCT DEBUG INFO ====');
    console.log('Updating product for userId:', userId);
    console.log('Shop ID:', shopId);
    console.log('Product ID:', productId);
    console.log('Product data:', productData);
    
    // Get the customers collection
    const customersCollection = await getCustomersCollection();
    
    // Find the customer document using the userId (sub from Cognito)
    const customer = await customersCollection.findOne({ userId });
    
    if (!customer) {
      console.log(`FAILURE: No customer found with userId: ${userId}`);
      console.log('==== END UPDATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Customer profile not found for this user',
        userIdProvided: userId
      });
    }
    
    // Find the specific shop
    const shop = customer.shops?.find(s => s.shopId === shopId);
    
    if (!shop) {
      console.log(`FAILURE: No shop found with shopId: ${shopId}`);
      console.log('==== END UPDATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    // Find the specific product
    const productIndex = shop.products?.findIndex(p => p.productId === productId);
    
    if (productIndex === -1 || productIndex === undefined) {
      console.log(`FAILURE: No product found with productId: ${productId}`);
      console.log('==== END UPDATE PRODUCT DEBUG INFO ====');
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    console.log(`SUCCESS: Found product with productId: ${productId}`);
    
    // Remove status fields that customers shouldn't be able to modify
    const { active, documented, hasShopify, hasEC, ...allowedProductData } = productData;
    
    // Update the product data
    const updatedProduct = {
      ...allowedProductData,
      productId: productId, // Keep the original product ID
      updatedAt: new Date(),
      // Preserve original creation timestamp
      createdAt: shop.products[productIndex].createdAt,
      // Preserve existing status fields (customers can't modify these)
      active: shop.products[productIndex].active,
      documented: shop.products[productIndex].documented,
      hasShopify: shop.products[productIndex].hasShopify,
      hasEC: shop.products[productIndex].hasEC
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
      console.log('Failed to update product in shop');
      console.log('==== END UPDATE PRODUCT DEBUG INFO ====');
      return res.status(400).json({
        success: false,
        message: 'Failed to update product in shop'
      });
    }
    
    console.log('Product updated successfully in shop');
    console.log('==== END UPDATE PRODUCT DEBUG INFO ====');
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      productId: productId,
      product: updatedProduct
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

// Route to get all products from all customers (for internal portal)
router.get('/all-products', async (req, res) => {
  try {
    const { status } = req.query;
    
    console.log('==== FETCH ALL PRODUCTS DEBUG INFO ====');
    console.log('Fetching all products from all customers');
    console.log('Status filter:', status);
    
    const customersCollection = await getCustomersCollection();
    
    // Get all customers with their shops and products
    const customers = await customersCollection.find({}).toArray();
    
    const allProducts = [];
    
    customers.forEach(customer => {
      const clientName = customer.raisonSociale || customer.name || 'Client inconnu';
      const clientId = customer._id?.toString() || customer.userId;
      
      if (Array.isArray(customer.shops)) {
        customer.shops.forEach(shop => {
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
    
    console.log(`Found ${allProducts.length} products total`);
    console.log('==== END FETCH ALL PRODUCTS DEBUG INFO ====');
    
    res.status(200).json({
      success: true,
      products: allProducts
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

module.exports = router;
