const express = require('express');
const router = express.Router();
const { getCustomersCollection } = require('../config/db');
const { ObjectId } = require('mongodb');
const { publishProductsToShopify } = require('../services/shopifyService');

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

// Route to get all products from all customers (for internal portal)
router.get('/all-products', async (req, res) => {
  try {
    const { status } = req.query;
    
    console.log('==== FETCH ALL PRODUCTS (INTERNAL) DEBUG INFO ====');
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
    console.log('==== END FETCH ALL PRODUCTS (INTERNAL) DEBUG INFO ====');
    
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

// Route to validate product status fields (for internal portal)
router.put('/products/:clientId/:shopId/:productId/validate', async (req, res) => {
  try {
    const { clientId, shopId, productId } = req.params;
    const { active, documented, hasShopify, hasEC } = req.body;
    
    console.log('==== VALIDATE PRODUCT DEBUG INFO ====');
    console.log('Validating product for clientId:', clientId);
    console.log('Shop ID:', shopId);
    console.log('Product ID:', productId);
    console.log('Validation data:', { active, documented, hasShopify, hasEC });
    
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
          [`shops.$.products.${productIndex}.active`]: active || false,
          [`shops.$.products.${productIndex}.documented`]: documented || false,
          [`shops.$.products.${productIndex}.hasShopify`]: hasShopify || false,
          [`shops.$.products.${productIndex}.hasEC`]: hasEC || false,
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
    const allowedFields = ['titre', 'description', 'prix', 'poids', 'codeEAN', 'typeProduit', 'OCC', 'tailles', 'couleurs', 'stock', 'price', 'weight', 'ean', 'sizes', 'colors'];
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

// Publier des produits sur Shopify
router.put('/shopify/shop/:shopId/publish-products', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds)) {
      return res.status(400).json({ error: 'productIds requis (array)' });
    }

    // Récupérer la boutique depuis la collection customers
    const customersCollection = await getCustomersCollection();
    const customer = await customersCollection.findOne({ 'shops.shopId': shopId });
    if (!customer) {
      return res.status(404).json({ error: 'Boutique non trouvée' });
    }
    
    const shop = customer.shops.find(s => s.shopId === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique non trouvée dans le client' });
    }

    // Valider les credentials Shopify
    const { validateShopifyCredentials } = require('../services/shopifyService');
    const credentialsCheck = validateShopifyCredentials(shop);
    
    if (!credentialsCheck.isValid) {
      return res.status(400).json({ 
        error: 'Credentials Shopify manquants', 
        missing: credentialsCheck.missing,
        present: credentialsCheck.present
      });
    }

    // Récupérer les produits depuis la boutique
    const products = (shop.products || []).filter(product => {
      const productIdStr = product.productId || product._id?.toString();
      return productIds.includes(productIdStr);
    });

    if (products.length === 0) {
      return res.status(404).json({ error: 'Aucun produit trouvé' });
    }

    console.log(`[API] Publishing ${products.length} products to Shopify for shop ${shop.nomClient || shop.customerName}`);
    const publishResults = await publishProductsToShopify(shop, products);

    // Update hasShopify status for successfully published products
    if (publishResults.results && publishResults.results.length > 0) {
      const successfulProducts = publishResults.results.filter(r => r.success);
      
      if (successfulProducts.length > 0) {
        console.log(`[API] Updating hasShopify status for ${successfulProducts.length} successful products`);
        
        // Create update operations for each successful product
        const updatePromises = successfulProducts.map(async (result) => {
          const productIndex = shop.products.findIndex(p => 
            (p.productId === result.productId) || (p._id?.toString() === result.productId)
          );
          
          if (productIndex !== -1) {
            const updateQuery = customer._id ? { _id: customer._id } : { userId: customer.userId };
            
            return customersCollection.updateOne(
              { ...updateQuery, 'shops.shopId': shopId },
              { 
                $set: { 
                  [`shops.$.products.${productIndex}.hasShopify`]: true,
                  [`shops.$.products.${productIndex}.shopifyProductId`]: result.shopifyProductId,
                  [`shops.$.products.${productIndex}.shopifyUpdatedAt`]: new Date()
                }
              }
            );
          }
          return null;
        });

        // Execute all updates
        await Promise.all(updatePromises.filter(p => p !== null));
        console.log(`[API] Successfully updated hasShopify status for published products`);
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

module.exports = router; 