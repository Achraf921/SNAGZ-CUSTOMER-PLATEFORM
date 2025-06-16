const express = require('express');
const router = express.Router();
const { getCustomersCollection } = require('../config/db');
const { ObjectId } = require('mongodb');

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
      documented: 'undocumented'
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
      status: 'pending' // Initial status for new shops
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
    
    // Preserve shopId and createdAt from the original shop
    const originalShop = customer.shops[shopIndex];
    const updatedShop = {
      ...updatedShopData,
      shopId: originalShop.shopId,
      createdAt: originalShop.createdAt,
      updatedAt: new Date()
    };
    
    // Update the shop in the array
    const updateOperation = {
      $set: { [`shops.${shopIndex}`]: updatedShop }
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
    res.status(200).json({
      success: true,
      message: 'Shop updated successfully',
      shop: updatedShop
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

// Route to update a specific shop for a client (for internal portal)
router.put('/clients/:clientId/shops/:shopId', async (req, res) => {
  try {
    const { clientId, shopId } = req.params;
    const updatedShopFields = req.body;

    if (!ObjectId.isValid(clientId)) {
      return res.status(400).json({ success: false, message: 'Invalid client ID format' });
    }
    // shopId might be a string or ObjectId depending on how it's stored/generated.
    // If shopId is consistently a string (like a UUID or custom ID) generated by your app,
    // you might not need ObjectId.isValid(shopId). If it's an ObjectId, you would.
    // For this example, we'll assume shopId is an identifier used to find the shop in the array.

    // Remove potentially harmful or uneditable fields from the update
    delete updatedShopFields._id; // Don't allow changing shop's own _id if it's an ObjectId from a sub-document
    delete updatedShopFields.clientId; // Prevent changing the parent client ID

    const customersCollection = await getCustomersCollection();

    // Find the customer
    const client = await customersCollection.findOne({ _id: new ObjectId(clientId) });
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    let shopFound = false;
    let updatedShop = null;

    const updatedShopsArray = client.shops.map(shop => {
      // Check if this is the shop we want to update
      if (String(shop._id) === shopId || String(shop.id) === shopId || String(shop.shopId) === shopId) { 
        shopFound = true;
        
        // Log the update
        console.log('Updating shop status:', {
          shopId: shop.shopId,
          oldStatus: shop.status,
          newStatus: 'valid',
          timestamp: new Date().toISOString()
        });
        
        // Return the shop with updated status
        return { 
          ...shop, 
          status: 'valid',
          updatedAt: new Date()
        };
      }
      return shop;
    });

    if (!shopFound) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this client'
      });
    }

    // Update the customer document with the modified shops array
    const result = await customersCollection.updateOne(
      { _id: new ObjectId(clientId) },
      { $set: { shops: updatedShopsArray, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      // This should ideally not happen if client was found earlier
      return res.status(404).json({ success: false, message: 'Client not found during update' });
    }
    if (result.modifiedCount === 0 && shopFound) {
        // This can happen if the submitted data is identical to existing data.
        // Still, we can consider it a success as the state matches the request.
        console.log('Shop update requested but data was identical to existing data.');
    }

    res.status(200).json({ 
      success: true, 
      message: 'Shop updated successfully', 
      shop: updatedShop // Return the updated shop object
    });

  } catch (error) {
    console.error('Error updating shop for client:', error);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred while updating the shop.', 
      error: error.message 
    });
  }
});


// Clean PUT route to update a customer by clientId (for internal portal)
router.put('/clients/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const updateFields = req.body;
    // console.log(`[PUT /clients/:clientId] Attempting to update client. Client ID: ${clientId}`);
    // console.log(`[PUT /clients/:clientId] Update fields:`, updateFields);

    if (!clientId || clientId === 'undefined' || !ObjectId.isValid(clientId)) {
      // console.error('[PUT /clients/:clientId] Invalid or missing clientId:', clientId);
      return res.status(400).json({ success: false, message: 'ID client invalide ou manquant' });
    }

    const customersCollection = await getCustomersCollection();
    let updatedCustomerDoc;

    // Ensure _id is not in updateFields to prevent attempts to change it
    if (updateFields._id) {
      // console.warn('[PUT /clients/:clientId] Attempt to update _id field was blocked.');
      delete updateFields._id;
    }
    // Also remove userId if present, as it should not be changed via this route
    if (updateFields.userId) {
        // console.warn('[PUT /clients/:clientId] Attempt to update userId field was blocked.');
        delete updateFields.userId;
    }

    const objectIdForUpdate = new ObjectId(clientId);
    
    const result = await customersCollection.findOneAndUpdate(
      { _id: objectIdForUpdate },
      { $set: updateFields },
      { returnDocument: 'after' } // Returns the updated document
    );
    
    // The result object itself is the updated document if found, or null if not found (for MongoDB driver v4+).
    // For older versions or specific configurations, it might be result.value.
    // Given the previous logs showed 'result' being the document, we'll stick to that, but add a check for 'value' as a fallback.
    updatedCustomerDoc = result.value !== undefined ? result.value : result;

    if (updatedCustomerDoc) {
      // console.log(`[PUT /clients/:clientId] Successfully updated client. Client ID: ${clientId}`, updatedCustomerDoc);
      return res.status(200).json({ success: true, message: 'Client mis à jour avec succès', client: updatedCustomerDoc });
    } else {
      // console.warn(`[PUT /clients/:clientId] Client not found by findOneAndUpdate or no document returned. Client ID: ${clientId}`);
      // Check if the client actually exists if findOneAndUpdate returns null for the value.
      const checkExistence = await customersCollection.findOne({ _id: objectIdForUpdate });
      if (!checkExistence) {
          return res.status(404).json({ success: false, message: 'Client introuvable pour la mise à jour (ID non existant)' });
      }
      return res.status(404).json({ success: false, message: 'Client trouvé mais la mise à jour n\'a pas retourné de document modifié (vérifiez les données ou l\'état du document)' });
    }
  } catch (error) { // Catches errors from ObjectId creation, DB operations, etc.
    // console.error(`[PUT /clients/:clientId] General error for client ID ${req.params.clientId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Erreur générale lors de la tentative de mise à jour du client',
      error: error.message // Provide error message for debugging
    });
  }
});

// Route to delete a specific shop for a client (for internal portal)
router.delete('/clients/:clientId/shops/:shopId', async (req, res) => {
try {
const { clientId, shopId } = req.params;
const customersCollection = await getCustomersCollection();

let objectIdForClient;
try {
  objectIdForClient = new ObjectId(clientId);
} catch (e) {
  return res.status(400).json({
    success: false,
    message: 'Invalid client ID format for deletion.',
    error: e.message
  });
}

// Pull a shop from the shops array. Assuming shops are identified by a 'shopId' field.
// If your shops in the array are identified by their own MongoDB '_id',
// you might need to adjust the $pull condition, e.g., { _id: new ObjectId(shopId) }
// For now, assuming shopId is a direct comparable value like a string or number in shop.shopId
const result = await customersCollection.findOneAndUpdate(
  { _id: objectIdForClient },
  { $pull: { shops: { shopId: shopId } } }, 
  { returnDocument: 'after' }
);

if (!result.value) {
  // Check if the client exists but the shop was not found (or already deleted)
  const clientExists = await customersCollection.findOne({ _id: objectIdForClient });
  if (!clientExists) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.'
    });
  }
  // Client exists, but shop wasn't pulled. Could mean shopId didn't match.
  return res.status(404).json({
    success: false,
    message: 'Shop not found for this client, or already deleted.'
  });
}

res.status(200).json({
  success: true,
  message: 'Shop deleted successfully.',
  updatedClient: result.value
});
} catch (error) {
console.error('Error deleting shop:', error);
res.status(500).json({
  success: false,
  message: 'An error occurred while deleting the shop.',
  error: error.message
});
}
});

// Route to update a specific shop for a client (for internal portal)
router.put('/clients/:clientId/shops/:shopId', async (req, res) => {
  try {
    const { clientId, shopId } = req.params;
    const updatedShopDetails = req.body; // e.g., { nomProjet: 'Nouveau Nom', status: 'active' }
    const customersCollection = await getCustomersCollection();

    let objectIdForClient;
    try {
      objectIdForClient = new ObjectId(clientId);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID format for shop update.',
        error: e.message
      });
    }

    // Construct the update operation
    // We want to update fields of a specific shop in the 'shops' array
    // The shop to update is identified by its 'shopId'
    const updateQuery = {};
    for (const key in updatedShopDetails) {
      if (Object.prototype.hasOwnProperty.call(updatedShopDetails, key)) {
        // Ensure we don't try to update the shopId itself if it's part of the body
        // and only update fields that are actually provided.
        if (key !== 'shopId' && key !== '_id') { 
          updateQuery[`shops.$[elem].${key}`] = updatedShopDetails[key];
        }
      }
    }

    if (Object.keys(updateQuery).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update.'
      });
    }

    const result = await customersCollection.findOneAndUpdate(
      { _id: objectIdForClient },
      { $set: updateQuery },
      {
        arrayFilters: [{ "elem.shopId": shopId }],
        returnDocument: 'after' // Return the modified document
      }
    );

    if (!result.value) {
      // Check if the client exists but the shop was not found or not updated
      const clientExists = await customersCollection.findOne({ _id: objectIdForClient });
      if (!clientExists) {
        return res.status(404).json({
          success: false,
          message: 'Client not found for shop update.'
        });
      }
      // Client exists, but shop wasn't updated. Could mean shopId didn't match or no fields changed.
      return res.status(404).json({
        success: false,
        message: 'Shop not found for this client, or no changes applied.'
      });
    }

    // Find the updated shop to return it specifically, if needed by frontend
    const updatedShop = result.value.shops.find(s => String(s.shopId) === String(shopId));

    res.status(200).json({
      success: true,
      message: 'Shop updated successfully.',
      updatedClient: result.value, // Contains the full client document with the updated shops array
      updatedShop: updatedShop // The specific shop that was updated
    });

  } catch (error) {
    console.error('Error updating shop:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the shop.',
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
    const { action } = req.body;

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

    if (!customer) {
      console.log('Shop not found');
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    console.log('Found customer:', customer._id);
    console.log('Found shop in customer document');

    // Update the shop's documentation status
    const newStatus = action === 'document' || action === 'mark_documented' ? 'documented' : 'undocumented';
    console.log('Updating status to:', newStatus);
    
    // Update the shop in the customer document
    const updateResult = await customersCollection.updateOne(
      { 'shops.shopId': shopId },
      { 
        $set: { 
          'shops.$.documented': newStatus,
          'shops.$.updatedAt': new Date()
        }
      }
    );

    console.log('Update result:', updateResult);

    if (updateResult.modifiedCount === 0) {
      console.log('No documents were modified');
      return res.status(500).json({
        success: false,
        message: 'Failed to update shop documentation status'
      });
    }

    console.log('Successfully updated shop documentation status');
    res.status(200).json({
      success: true,
      message: `Shop documentation status updated to ${newStatus}`,
      shopId,
      documented: newStatus
    });
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

module.exports = router;
