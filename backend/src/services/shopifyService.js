const axios = require('axios');

/**
 * Creates products in Shopify using the 2025-07 GraphQL Admin API
 * @param {Object} shop - Shop document with shopifyConfig credentials
 * @param {Array} products - Array of product objects to create
 * @returns {Object} - Results with success status and details
 */
async function publishProductsToShopify(shop, products) {
  // Extract Shopify domain
  const rawDomain = shop.shopifyDomain || shop.myshopify_domain || shop.domain;
  const domain = rawDomain?.includes('.myshopify.com') 
    ? rawDomain 
    : `${rawDomain}.myshopify.com`;
  
  console.log(`[Shopify] Publishing to domain: ${domain}`);

  // Get access credentials (supports nested or flattened storage)
  const config = shop.shopifyConfig || {};
  const accessToken = config.accessToken || 
                     shop.accessToken || 
                     shop["shopifyConfig.accessToken"];
  const apiKey = config.apiKey || 
                shop.apiKey || 
                shop["shopifyConfig.apiKey"];
  const apiSecret = config.apiSecret || 
                   shop.apiSecret || 
                   shop["shopifyConfig.apiSecret"];

  // Validate all required credentials
  if (!accessToken || !apiKey || !apiSecret) {
    const missing = [];
    if (!accessToken) missing.push('accessToken');
    if (!apiKey) missing.push('apiKey');
    if (!apiSecret) missing.push('apiSecret');
    
    throw new Error(`Missing Shopify credentials: ${missing.join(', ')}`);
  }

  console.log(`[Shopify] Using credentials - API Key: ${apiKey.substring(0, 6)}******, Access Token: ${accessToken.substring(0, 8)}******`);

  const apiUrl = `https://${domain}/admin/api/2025-07/graphql.json`;
  const results = [];

  for (const prod of products) {
    try {
      console.log(`[Shopify] Processing product: ${prod.titre || prod.title || 'Untitled'}`);

      /* ===============================================
         STEP 1: Create the base product (no variants)
      ================================================*/
      const PRODUCT_CREATE_MUTATION = `
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id
              title
              handle
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      // Prepare metafields for product specifications
      const metafields = [];
      if (prod.caracteristiques && Object.keys(prod.caracteristiques).length > 0) {
        metafields.push({
          namespace: 'custom',
          key: 'specifications',
          value: JSON.stringify(prod.caracteristiques),
          type: 'json_string'
        });
      }

      // Product creation payload
      const productInput = {
        title: prod.titre || prod.title || 'Produit Sans Titre',
        descriptionHtml: prod.description || '',
        vendor: shop.nomClient || shop.customerName || 'Boutique',
        productType: prod.typeProduit || prod.productType || 'Général',
        status: 'ACTIVE',
        metafields: metafields.length > 0 ? metafields : undefined
      };

      console.log(`[Shopify] Creating product with input:`, JSON.stringify(productInput, null, 2));

      const productResponse = await axios.post(apiUrl, {
        query: PRODUCT_CREATE_MUTATION,
        variables: { input: productInput }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        }
      });

      const productData = productResponse.data;
      console.log(`[Shopify] Product creation response:`, JSON.stringify(productData, null, 2));

      // Check for product creation errors
      if (productData.errors || productData.data?.productCreate?.userErrors?.length > 0) {
        const errorMsg = productData.errors?.[0]?.message || 
                        productData.data.productCreate.userErrors[0]?.message;
        results.push({
          productId: prod.productId || prod._id,
          title: prod.titre || prod.title,
          success: false,
          error: `Product creation failed: ${errorMsg}`
        });
        continue;
      }

      const createdProductId = productData.data.productCreate.product.id;
      console.log(`[Shopify] Product created successfully with ID: ${createdProductId}`);

      /* ===============================================
         STEP 2: Replace default variant with custom data
      ================================================*/
      const VARIANT_BULK_CREATE_MUTATION = `
        mutation productVariantsBulkCreate(
          $productId: ID!,
          $strategy: ProductVariantsBulkCreateStrategy!,
          $variants: [ProductVariantsBulkInput!]!
        ) {
          productVariantsBulkCreate(
            productId: $productId,
            strategy: $strategy,
            variants: $variants
          ) {
            productVariants {
              id
              sku
              price
              barcode
              selectedOptions {
                name
                value
              }
              inventoryItem {
                id
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      // Get sizes and colors
      const sizes = prod.tailles || prod.sizes || [];
      const colors = prod.couleurs || prod.colors || [];
      const stock = prod.stock || {};

      // Generate variants based on size/color combinations
      let variants = [];
      
      if (sizes.length > 0 && colors.length > 0) {
        // Both sizes and colors - create all combinations
        sizes.forEach(size => {
          colors.forEach(color => {
            const stockKey = `${size}-${color}`;
            const variantObj = {
              price: String(prod.prix || prod.price || 0),
              barcode: prod.ean || prod.codeEAN || undefined,
              optionValues: [
                { optionName: 'Size', name: size },
                { optionName: 'Color', name: color }
              ],
              stockQuantity: stock[stockKey] || 0
            };

            // Leave inventoryItem empty during creation; weight will be set after variant creation
            variants.push(variantObj);
          });
        });
      } else if (sizes.length > 0) {
        // Only sizes
        sizes.forEach(size => {
          const variantObj = {
            price: String(prod.prix || prod.price || 0),
            barcode: prod.ean || prod.codeEAN || undefined,
            optionValues: [
              { optionName: 'Size', name: size }
            ],
            stockQuantity: stock[size] || 0
          };

          // Leave inventoryItem empty during creation; weight will be set after variant creation
          variants.push(variantObj);
        });
      } else if (colors.length > 0) {
        // Only colors
        colors.forEach(color => {
          const variantObj = {
            price: String(prod.prix || prod.price || 0),
            barcode: prod.ean || prod.codeEAN || undefined,
            optionValues: [
              { optionName: 'Color', name: color }
            ],
            stockQuantity: stock[color] || 0
          };

          // Leave inventoryItem empty during creation; weight will be set after variant creation
          variants.push(variantObj);
        });
      } else {
        // No variants - single product
        const singleVariant = {
          price: String(prod.prix || prod.price || 0),
          barcode: prod.ean || prod.codeEAN || undefined,
          stockQuantity: stock.default || stock || 0
        };

        // Leave inventoryItem empty during creation; weight will be set after variant creation
        variants.push(singleVariant);
      }

      // Prepare options for Shopify (only if we have variants with options)
      let productOptions = [];
      if (sizes.length > 0) {
        productOptions.push({
          name: 'Size',
          values: sizes
        });
      }
      if (colors.length > 0) {
        productOptions.push({
          name: 'Color', 
          values: colors
        });
      }

      // If we have options, we need to update the product first to add them
      if (productOptions.length > 0) {
        const PRODUCT_OPTIONS_CREATE_MUTATION = `
          mutation productOptionsCreate($productId: ID!, $options: [OptionCreateInput!]!) {
            productOptionsCreate(productId: $productId, options: $options) {
              product {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        // Format options correctly: each value must be an object { name: <value> }
        const formattedOptions = productOptions.map(option => ({
          name: option.name,
          values: option.values.map(v => ({ name: v }))
        }));

        console.log('[Shopify] Formatted options for creation:', JSON.stringify(formattedOptions, null, 2));

        const optionsResponse = await axios.post(apiUrl, {
          query: PRODUCT_OPTIONS_CREATE_MUTATION,
          variables: {
            productId: createdProductId,
            options: formattedOptions
          }
        }, {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken
          }
        });

        const optionsData = optionsResponse.data;
        console.log(`[Shopify] Product options update response:`, JSON.stringify(optionsData, null, 2));

        if (optionsData.errors || optionsData.data?.productOptionsCreate?.userErrors?.length > 0) {
          const optionsError = optionsData.errors?.[0]?.message || 
                             optionsData.data.productOptionsCreate.userErrors[0]?.message;
          console.warn(`[Shopify] Options update failed: ${optionsError}`);
        }
      }

      // Exclude local-only fields (stockQuantity) before sending to Shopify
      const variantInputs = variants.map(({ stockQuantity, ...variantInput }) => variantInput);

      console.log(`[Shopify] Creating ${variants.length} variant(s) with input:`, JSON.stringify(variantInputs, null, 2));

      const variantResponse = await axios.post(apiUrl, {
        query: VARIANT_BULK_CREATE_MUTATION,
        variables: {
          productId: createdProductId,
          strategy: 'REMOVE_STANDALONE_VARIANT', // Replace the default variant
          variants: variantInputs
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        }
      });

      const variantData = variantResponse.data;
      console.log(`[Shopify] Variant creation response:`, JSON.stringify(variantData, null, 2));

      // Check for variant creation errors
      if (variantData.errors || variantData.data?.productVariantsBulkCreate?.userErrors?.length > 0) {
        const variantError = variantData.errors?.[0]?.message || 
                           variantData.data.productVariantsBulkCreate.userErrors[0]?.message;
        results.push({
          productId: prod.productId || prod._id,
          title: prod.titre || prod.title,
          success: false,
          error: `Variant creation failed: ${variantError}`
        });
        continue;
      }

      // Success for now - variants created; now bulk-update them with weight, inventory management, and initial stock
      const createdVariants = variantData.data.productVariantsBulkCreate.productVariants;

      // STEP 2b: Fetch primary location for inventoryQuantities
      const LOCATIONS_QUERY = `
        query locations($first: Int!) {
          locations(first: $first) {
            edges { node { id primary } }
          }
        }
      `;
      const locResp = await axios.post(apiUrl, { query: LOCATIONS_QUERY, variables: { first: 10 } }, { headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken } });
      const locData = locResp.data;
      const edges = locData.data.locations.edges;
      const primaryLoc = edges.find(e => e.node.primary) || edges[0];
      const primaryLocationId = primaryLoc?.node.id;
      console.log(`[Shopify] Using location ${primaryLocationId} for initial stock`);

      // STEP 2c: Bulk update variants to set weight, track inventory, and initial stock
      const VARIANT_BULK_UPDATE_MUTATION = `
        mutation productVariantsBulkUpdate($variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(variants: $variants) {
            productVariants { id weight weightUnit inventoryManagement }
            userErrors { field message }
          }
        }
      `;
      const variantUpdateInputs = createdVariants.map((v, i) => {
        const original = variants[i];
        const qty = original.stockQuantity || 0;
        const input = { id: v.id };
        if (prod.weight) {
          input.weight = Number(prod.weight);
          input.weightUnit = 'GRAMS';
        }
        input.inventoryManagement = 'SHOPIFY';
        if (primaryLocationId) {
          input.inventoryQuantities = [{ availableQuantity: qty, locationId: primaryLocationId }];
        }
        return input;
      });
      console.log('[Shopify] Bulk updating variants with weight & stock:', JSON.stringify(variantUpdateInputs, null, 2));
      try {
        const bulkUpdResp = await axios.post(apiUrl, { query: VARIANT_BULK_UPDATE_MUTATION, variables: { variants: variantUpdateInputs } }, { headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken } });
        const bulkData = bulkUpdResp.data;
        if (bulkData.errors || bulkData.data.productVariantsBulkUpdate.userErrors.length) {
          console.warn('[Shopify] Bulk variant update errors:', JSON.stringify(bulkData, null, 2));
        } else {
          console.log('[Shopify] Variants updated with weight & stock successfully');
        }
      } catch (err) {
        console.warn('[Shopify] Exception during variants bulk update:', err.message);
      }

      results.push({
        productId: prod.productId || prod._id,
        title: prod.titre || prod.title,
        success: true,
        shopifyProductId: createdProductId,
        variants: createdVariants.map(v => ({
          shopifyVariantId: v.id,
          sku: v.sku,
          price: v.price,
          options: v.selectedOptions
        }))
      });

      console.log(`[Shopify] Product "${prod.titre || prod.title}" successfully created with ${createdVariants.length} variant(s)`);

    } catch (error) {
      console.error(`[Shopify] Error processing product "${prod.titre || prod.title}":`, error.message);
      
      results.push({
        productId: prod.productId || prod._id,
        title: prod.titre || prod.title,
        success: false,
        error: error.response?.data?.errors?.[0]?.message || error.message
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;

  console.log(`[Shopify] Publication completed: ${successCount}/${totalCount} products successfully created`);

  return {
    success: successCount > 0,
    totalProcessed: totalCount,
    successCount: successCount,
    failureCount: totalCount - successCount,
    results: results
  };
}

/**
 * Validates if shop has all required Shopify credentials
 * @param {Object} shop - Shop document
 * @returns {Object} - Validation result with missing fields
 */
function validateShopifyCredentials(shop) {
  const config = shop.shopifyConfig || {};
  const required = {
    accessToken: config.accessToken || shop.accessToken || shop["shopifyConfig.accessToken"],
    apiKey: config.apiKey || shop.apiKey || shop["shopifyConfig.apiKey"],  
    apiSecret: config.apiSecret || shop.apiSecret || shop["shopifyConfig.apiSecret"]
  };

  const missing = Object.keys(required).filter(key => !required[key]);
  
  return {
    isValid: missing.length === 0,
    missing: missing,
    present: Object.keys(required).filter(key => required[key])
  };
}

module.exports = {
  publishProductsToShopify,
  validateShopifyCredentials
}; 