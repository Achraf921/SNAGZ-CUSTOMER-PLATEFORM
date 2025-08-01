const axios = require('axios');
const { logger } = require('../utils/secureLogger');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const FormData = require('form-data');

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-3',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * Fetch image stream from private S3 bucket
 */
async function fetchImageFromS3(bucketName, key) {
  try {
    logger.debug(`[S3-DEBUG] Fetching image from bucket: ${bucketName}, key: ${key}`);
    
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    
    const response = await s3Client.send(command);
    
    // Fix MIME type detection for common image formats
    let contentType = response.ContentType || 'image/jpeg';
    const filename = key.split('/').pop();
    const extension = filename.split('.').pop().toLowerCase();
    
    // Override incorrect MIME types based on file extension
    if (contentType === 'application/octet-stream' || !contentType.startsWith('image/')) {
      const mimeMap = {
        'webp': 'image/webp',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'svg': 'image/svg+xml'
      };
      contentType = mimeMap[extension] || 'image/jpeg';
    }
    
    return {
      stream: response.Body,
      contentType: contentType,
      contentLength: response.ContentLength,
      filename: filename
    };
  } catch (error) {
    logger.error(`[S3-ERROR] Failed to fetch image from S3:`, error);
    throw error;
  }
}

/**
 * Create staged upload target in Shopify
 */
async function createStagedUpload(shopifyUrl, accessToken, filename, mimeType) {
  try {
    logger.debug(`[STAGED-UPLOAD-DEBUG] =============================================`);
    logger.debug(`[STAGED-UPLOAD-DEBUG] Creating staged upload`);
    logger.debug(`[STAGED-UPLOAD-DEBUG] Filename: ${filename}`);
    logger.debug(`[STAGED-UPLOAD-DEBUG] MIME Type: ${mimeType}`);
    logger.debug(`[STAGED-UPLOAD-DEBUG] Shopify URL: ${shopifyUrl}`);
    logger.debug(`[STAGED-UPLOAD-DEBUG] Access Token Preview: ${accessToken ? `${accessToken.substring(0, 15)}...` : 'MISSING'}`);
    
    const mutation = `
      mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

    const variables = {
      input: [{
        filename: filename,
        mimeType: mimeType,
        httpMethod: "POST",
        resource: "PRODUCT_IMAGE"
      }]
    };
    
    logger.debug(`[STAGED-UPLOAD-DEBUG] GraphQL Variables:`, JSON.stringify(variables, null, 2));
    logger.debug(`[STAGED-UPLOAD-DEBUG] Sending request to Shopify...`);
    
    const response = await axios.post(shopifyUrl, {
      query: mutation,
      variables: variables
      }, {
        headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    
    logger.debug(`[STAGED-UPLOAD-DEBUG] HTTP Status: ${response.status} ${response.statusText}`);
    logger.debug("Upload operation");
    logger.debug(`[STAGED-UPLOAD-DEBUG] Staged upload response:`, JSON.stringify(response.data, null, 2));
    
    if (response.data.data?.stagedUploadsCreate?.userErrors?.length > 0) {
      throw new Error(`Staged upload errors: ${JSON.stringify(response.data.data.stagedUploadsCreate.userErrors)}`);
    }
    
    const stagedTarget = response.data.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!stagedTarget) {
      throw new Error('No staged target returned from Shopify');
    }
    
    return stagedTarget;
  } catch (error) {
    logger.error(`[STAGED-UPLOAD-ERROR] Failed to create staged upload:`, error);
    throw error;
  }
}

/**
 * Upload file to staged upload target
 */
async function uploadToStagedTarget(stagedTarget, imageStream, filename, contentType, contentLength) {
  try {
    logger.debug(`[UPLOAD-DEBUG] =============================================`);
    logger.debug(`[UPLOAD-DEBUG] Starting upload to staged target`);
    logger.debug(`[UPLOAD-DEBUG] Upload URL: ${stagedTarget.url}`);
    logger.debug(`[UPLOAD-DEBUG] Resource URL: ${stagedTarget.resourceUrl}`);
    logger.debug(`[UPLOAD-DEBUG] Filename: ${filename}`);
    logger.debug(`[UPLOAD-DEBUG] Content Type: ${contentType}`);
    logger.debug(`[UPLOAD-DEBUG] Content Length: ${contentLength} bytes`);
    logger.debug(`[UPLOAD-DEBUG] Parameters count: ${stagedTarget.parameters.length}`);
    
    // Log all parameters (excluding sensitive ones)
    stagedTarget.parameters.forEach((param, index) => {
      if (param.name.toLowerCase().includes('signature') || param.name.toLowerCase().includes('policy')) {
        logger.debug(`[UPLOAD-DEBUG] Parameter ${index + 1}: ${param.name} = [REDACTED]`);
      } else {
        logger.debug(`[UPLOAD-DEBUG] Parameter ${index + 1}: ${param.name} = ${param.value}`);
      }
    });
    
    const form = new FormData();
    
    // Add all parameters from Shopify
    stagedTarget.parameters.forEach(param => {
      form.append(param.name, param.value);
    });
    
    logger.debug(`[UPLOAD-DEBUG] Form parameters added to FormData`);
    
    // Add the file
    form.append('file', imageStream, {
      filename: filename,
      contentType: contentType,
      knownLength: contentLength
    });
    
    logger.debug(`[UPLOAD-DEBUG] File added to FormData`);
    logger.debug(`[UPLOAD-DEBUG] FormData headers:`, form.getHeaders());
    logger.debug(`[UPLOAD-DEBUG] Starting POST request...`);
    
    const startTime = Date.now();
    
    const uploadResponse = await axios.post(stagedTarget.url, form, {
      headers: {
        ...form.getHeaders()
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 30000 // 30 second timeout
    });
    
    const uploadTime = Date.now() - startTime;
    
    logger.debug(`[UPLOAD-DEBUG] Upload completed in ${uploadTime}ms`);
    logger.debug(`[UPLOAD-DEBUG] HTTP Status: ${uploadResponse.status} ${uploadResponse.statusText}`);
    logger.debug(`[UPLOAD-DEBUG] Response Headers:`, uploadResponse.headers);
    logger.debug(`[UPLOAD-DEBUG] Response Data Length: ${uploadResponse.data ? uploadResponse.data.length : 'No data'} bytes`);
    
    if (uploadResponse.status !== 201 && uploadResponse.status !== 204) {
      throw new Error(`Upload failed with status: ${uploadResponse.status}`);
    }
    
    // Construct the correct resourceUrl using the key parameter
    // The resourceUrl from Shopify is just the base URL, we need to add the key path
    const keyParam = stagedTarget.parameters.find(p => p.name === 'key');
    if (!keyParam) {
      throw new Error('No key parameter found in staged upload target');
    }
    
    const fullResourceUrl = `${stagedTarget.url}${keyParam.value}`;
    logger.debug(`[UPLOAD-DEBUG] Constructed full resource URL: ${fullResourceUrl}`);
    logger.debug(`[UPLOAD-DEBUG] Resource URL length: ${fullResourceUrl.length} characters`);
    
    return fullResourceUrl;
  } catch (error) {
    logger.error(`[UPLOAD-ERROR] Failed to upload to staged target:`, error);
    throw error;
  }
}

/**
 * Process images using staged uploads
 */
async function processImagesWithStagedUploads(shopifyUrl, accessToken, imageUrls) {
  const processedImages = [];
  
  for (const imageUrl of imageUrls.slice(0, 10)) { // Shopify supports max 10 images
    try {
      logger.debug(`[IMAGE-PROCESSING] Processing image: ${imageUrl}`);
      
      // Extract S3 key from URL - the imageUrl is actually the S3 key, not a full URL
      let key = imageUrl;
      
      // Remove query parameters from the key if present
      const queryIndex = key.indexOf('?');
      if (queryIndex !== -1) {
        key = key.substring(0, queryIndex);
      }
      
      // Use the correct S3 bucket name from environment
      const bucketName = process.env.AWS_S3_BUCKET_NAME || 'snagz';
      
      logger.debug(`[IMAGE-PROCESSING] Using bucket: ${bucketName}, key: ${key}`);
      
      // Fetch image from S3
      const imageData = await fetchImageFromS3(bucketName, key);
      
      // Create staged upload target
      const stagedTarget = await createStagedUpload(
        shopifyUrl, 
        accessToken, 
        imageData.filename, 
        imageData.contentType
      );
      
      // Upload to staged target
      const resourceUrl = await uploadToStagedTarget(
        stagedTarget,
        imageData.stream,
        imageData.filename,
        imageData.contentType,
        imageData.contentLength
      );
      
      // Validate the staged upload URL before using it
      if (!resourceUrl || !resourceUrl.startsWith('https://')) {
        throw new Error(`Invalid resourceUrl returned from staged upload: ${resourceUrl}`);
      }
      
      logger.debug(`[IMAGE-PROCESSING] Staged upload validation successful`);
      logger.debug(`[IMAGE-PROCESSING] Final resourceUrl: ${resourceUrl}`);
      logger.debug(`[IMAGE-PROCESSING] Resource URL length: ${resourceUrl.length} characters`);
      
      const mediaObject = {
        originalSource: resourceUrl,
        mediaContentType: 'IMAGE',
        alt: `Product image ${processedImages.length + 1}`
      };
      
      logger.debug(`[IMAGE-PROCESSING] Created media object:`, mediaObject);
      
      processedImages.push(mediaObject);
      
      logger.debug(`[IMAGE-PROCESSING] Successfully processed image: ${imageData.filename}`);
      logger.debug(`[IMAGE-PROCESSING] Total processed so far: ${processedImages.length}`);
    } catch (error) {
      logger.error(`[IMAGE-PROCESSING-ERROR] Failed to process image ${imageUrl}:`, error);
      // Continue with other images
    }
  }
  
  return processedImages;
}

/**
 * Generate SKU for a product
 */
function generateSKU(productTitle) {
  const cleanTitle = productTitle
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .toUpperCase();
  
  return `MERCH-${cleanTitle}`;
}

/**
 * Map product type to Shopify category
 */
function mapProductType(productType) {
  const typeMapping = {
    'CD': 'Music',
    'VINYLE': 'Music', 
    'DVD': 'Movies & TV',
    'T-Shirt': 'Clothing',
    'Hoodie': 'Clothing',
    'LIVRE': 'Books',
    'ACCESSOIRE': 'Accessories'
  };
  
  return typeMapping[productType] || 'Miscellaneous';
}

/**
 * Find the appropriate Shopify Standard Product Taxonomy category
 */
async function findProductCategory(shopifyUrl, accessToken, searchTerm) {
  logger.debug(`[CATEGORY-SEARCH] 🔍 ===============================================`);
  logger.debug(`[CATEGORY-SEARCH] 🔍 Searching for category with term: "${searchTerm}"`);
  logger.debug(`[CATEGORY-SEARCH] 🔍 Shopify URL: ${shopifyUrl}`);
  logger.debug(`[CATEGORY-SEARCH] 🔍 Access Token present: ${!!accessToken}`);
  logger.debug(`[CATEGORY-SEARCH] 🔍 ===============================================`);
  
  const TAXONOMY_SEARCH_QUERY = `
    query taxonomySearch($search: String!, $first: Int!) {
      taxonomy {
        categories(search: $search, first: $first) {
          nodes {
            id
            fullName
            isLeaf
          }
        }
      }
    }
  `;
  
  try {
    logger.debug(`[CATEGORY-SEARCH] 📡 Making GraphQL request...`);
    const response = await fetch(`${shopifyUrl}/admin/api/2025-07/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({
        query: TAXONOMY_SEARCH_QUERY,
        variables: { 
          search: searchTerm,
          first: 10
        }
      })
    });
    
    logger.debug(`[CATEGORY-SEARCH] 📡 Response status: ${response.status}`);
    logger.debug(`[CATEGORY-SEARCH] 📡 Response ok: ${response.ok}`);
    
    const data = await response.json();
    logger.debug(`[CATEGORY-SEARCH] 📡 Raw response data:`, JSON.stringify(data, null, 2));
    
    if (data.errors) {
      logger.error(`[CATEGORY-SEARCH] ❌ GraphQL errors:`, data.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }
    
    const categories = data.data?.taxonomy?.categories?.nodes || [];
    logger.debug(`[CATEGORY-SEARCH] 📊 Found ${categories.length} categories for "${searchTerm}"`);
    
    if (categories.length > 0) {
      logger.debug("Category operation");));
    } else {
      logger.debug(`[CATEGORY-SEARCH] 📋 No categories found for search term: "${searchTerm}"`);
    }
    
    // Find the first leaf category
    const leafCategory = categories.find(category => category.isLeaf);
    
    if (leafCategory) {
      logger.debug(`[CATEGORY-SEARCH] ✅ Selected leaf category: ${leafCategory.fullName} (${leafCategory.id})`);
      return leafCategory.id;
    } else {
      logger.debug(`[CATEGORY-SEARCH] ❌ No leaf categories found for "${searchTerm}"`);
      throw new Error(`No leaf categories found for "${searchTerm}"`);
    }
  } catch (error) {
    logger.error(`[CATEGORY-SEARCH] 💥 Error searching for category: ${error.message}`);
    logger.error(`[CATEGORY-SEARCH] 💥 Error stack:`, error.stack);
    throw error;
  }
}

/**
 * Publish products to Shopify store
 */
async function publishProductsToShopify(shop, products) {
  try {
    logger.debug(`🔥🔥🔥 [RESTART-TEST] SERVER RESTARTED - NEW CHANGES APPLIED! 🔥🔥🔥`);
    logger.debug(`🚨🚨🚨 [CRITICAL-FUNCTION-START] publishProductsToShopify FUNCTION HAS STARTED!`);
    logger.debug(`🚨🚨🚨 [CRITICAL-FUNCTION-START] THIS LOG MUST APPEAR IN YOUR LOGS!`);
    logger.debug(`🚨🚨🚨 [CRITICAL-FUNCTION-START] ===============================================`);
    
    logger.debug(`[SHOPIFY-DEBUG] Starting publishProductsToShopify for shop: { shopId: ${shop._id}, shopName: ${shop.nomProjet}, productsCount: ${products.length} }`);
    
    // Extract domain and credentials
    const rawDomain = shop.shopifyDomain || shop.domain || shop.myshopify_domain;
    const shopifyDomain = rawDomain.includes('.myshopify.com') ? rawDomain : `${rawDomain}.myshopify.com`;
    const accessToken = shop.shopifyConfig?.accessToken;
    
    if (!accessToken) {
      throw new Error('No access token found in shop configuration');
    }
    
    logger.debug(`[SHOPIFY-DEBUG] Publishing to domain: ${shopifyDomain} (raw: ${rawDomain})`);
    logger.debug(`[SHOPIFY-DEBUG] Using access token: ${accessToken.substring(0, 10)}******`);
    
    const shopifyUrl = `https://${shopifyDomain}/admin/api/2025-07/graphql.json`;
    logger.debug(`[SHOPIFY-DEBUG] API URL: ${shopifyUrl}`);
  
  const results = [];

    for (const product of products) {
      try {
        // 🚨 SUPER CRITICAL: Mark the start of product processing
        logger.debug(`🚨🚨🚨 [SUPER-CRITICAL] ===============================================`);
        logger.debug(`🚨🚨🚨 [SUPER-CRITICAL] STARTING PRODUCT PROCESSING LOOP`);
        logger.debug(`🚨🚨🚨 [SUPER-CRITICAL] Product title: ${product.title || product.titre || 'NO TITLE'}`);
        logger.debug(`🚨🚨🚨 [SUPER-CRITICAL] ===============================================`);
        
        // Basic product info for debugging
        logger.debug(`[SHOPIFY-DEBUG] Processing product: ${product.title || product.titre}`);
        logger.debug(`[SHOPIFY-DEBUG] Product type: ${product.type || product.typeProduit || 'Not specified'}`);
        
        // Handle different possible product data structures
        const productTitle = product.title || product.titre || product.nom || 'Product Without Title';
        const productDescription = product.description || product.desc || 'Product description';
        const productTypeRaw = product.type || product.typeProduit || product.productType || 'Miscellaneous';
        const productPrice = product.price || product.prix || '0.00';
        const productEan = product.ean || product.codeEAN || product.barcode;
        const productImages = product.imageUrls || product.images || [];
        const productWeight = product.poids || product.weight || 400;
        
        // Process images using staged uploads
        let mediaItems = [];
        if (productImages && productImages.length > 0) {
          logger.debug(`[SHOPIFY-DEBUG] Processing ${productImages.length} images`);
          mediaItems = await processImagesWithStagedUploads(shopifyUrl, accessToken, productImages);
        }
        
        // Generate SKU
        const sku = generateSKU(productTitle);
        
        logger.debug(`🚨🚨🚨 [FLOW-DEBUG] Generated SKU: ${sku}`);
        logger.debug(`🚨🚨🚨 [FLOW-DEBUG] About to proceed to category section...`);
        
        logger.debug(`🚨🚨🚨 [CRITICAL-DEBUG] Starting category and product creation section...`);
        
        // Map category
        const productType = mapProductType(productTypeRaw);
        
        logger.debug(`🚨🚨🚨 [CRITICAL-DEBUG] ProductType mapped: ${productType}`);
        
        // 🚨 EXECUTION CHECK: Verify we reached this point
        logger.debug(`🔥��🔥 [EXECUTION-CHECK] REACHED CATEGORY SECTION!`);
        logger.debug(`🔥🔥🔥 [EXECUTION-CHECK] productType: "${productType}"`);
        logger.debug(`🔥🔥🔥 [EXECUTION-CHECK] SKU: "${sku}"`);
        logger.debug(`🔥🔥🔥 [EXECUTION-CHECK] Media Items: ${mediaItems.length}`);
        
        // ✅ COMPLETE CATEGORY MAPPING - Using correct Shopify Standard Product Taxonomy GIDs
        let categoryGID = null;
        const productCategory = product.produit || productTypeRaw || 'Miscellaneous';
        
        // Mapping based on your actual form dropdown values with correct GIDs
        const categoryMapping = {
          // Media categories (Music & Movies)
          'CD': 'gid://shopify/TaxonomyCategory/me-3-3',           // Media > Music & Sound Recordings > Music CDs
          'Vinyl': 'gid://shopify/TaxonomyCategory/me-3-6',        // Media > Music & Sound Recordings > Vinyl Records
          'DVD': 'gid://shopify/TaxonomyCategory/me-7-3',          // Media > Videos > DVDs
          'Blue-Ray': 'gid://shopify/TaxonomyCategory/me-7-1',     // Media > Videos > Blu-ray
          'Blu-ray': 'gid://shopify/TaxonomyCategory/me-7-1',      // Same as above (alternative spelling)
          
          // Clothing & Apparel categories
          'T-Shirt': 'gid://shopify/TaxonomyCategory/aa-1-13-8',   // Apparel & Accessories > Clothing > Clothing Tops > T-Shirts
          'Tshirt': 'gid://shopify/TaxonomyCategory/aa-1-13-8',    // Same as above (synonym)
          'T Shirt': 'gid://shopify/TaxonomyCategory/aa-1-13-8',   // Same as above (synonym)
          'Chemise': 'gid://shopify/TaxonomyCategory/aa-1-13-7',   // Apparel & Accessories > Clothing > Clothing Tops > Shirts (Dress Shirts)
          'Hoodie': 'gid://shopify/TaxonomyCategory/aa-1-13-13',   // Apparel & Accessories > Clothing > Clothing Tops > Hoodies
          'Sweat': 'gid://shopify/TaxonomyCategory/aa-1-13-14',    // Apparel & Accessories > Clothing > Clothing Tops > Sweatshirts
          'Polo': 'gid://shopify/TaxonomyCategory/aa-1-13-6',      // Apparel & Accessories > Clothing > Clothing Tops > Polos (Polo Shirts)
          'Débardeur': 'gid://shopify/TaxonomyCategory/aa-1-13-9', // Apparel & Accessories > Clothing > Clothing Tops > Tank Tops
          'Tank': 'gid://shopify/TaxonomyCategory/aa-1-13-9',      // Same as above (synonym)
          'Pantalon': 'gid://shopify/TaxonomyCategory/aa-1-12-11', // Apparel & Accessories > Clothing > Pants > Trousers (casual/general pants)
          'Short': 'gid://shopify/TaxonomyCategory/aa-1-14-1',     // Apparel & Accessories > Clothing > Shorts > Bermudas (general casual shorts)
          
          // Accessories categories
          'Casquette': 'gid://shopify/TaxonomyCategory/aa-2-17-1',  // Apparel & Accessories > Clothing Accessories > Hats > Baseball Caps
          'Bonnet': 'gid://shopify/TaxonomyCategory/aa-2-17-2',     // Apparel & Accessories > Clothing Accessories > Hats > Beanies
          'Bracelet': 'gid://shopify/TaxonomyCategory/aa-6-3',      // Apparel & Accessories > Jewelry > Bracelets
          
          // Other product categories
          'Coque': 'gid://shopify/TaxonomyCategory/el-4-8-4-2',     // Electronics > Communications > Telephony > Mobile & Smart Phone Accessories > Mobile Phone Cases
          'Mug': 'gid://shopify/TaxonomyCategory/hg-11-10-5-5',     // Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs
          'Sticker': 'gid://shopify/TaxonomyCategory/ae-2-1-2-8-4', // Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Embellishments & Trims > Decorative Stickers
          'Lithographie': 'gid://shopify/TaxonomyCategory/hg-3-4-2-2', // Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork > Prints
          'Livre': 'gid://shopify/TaxonomyCategory/me-1-3',         // Media > Books > Print Books
          'Photographie': 'gid://shopify/TaxonomyCategory/hg-3-4-2-2', // Same as Lithographie (Art Prints)
          'Autre': 'gid://shopify/TaxonomyCategory/aa-1-13-8',      // Default to T-Shirts
        };
        
        categoryGID = categoryMapping[productCategory];
        
        if (categoryGID) {
          logger.debug(`[CATEGORY] ✅ Assigned category for "${productCategory}": ${categoryGID}`);
        } else {
          logger.debug(`[CATEGORY] ❌ No category mapping found for: "${productCategory}"`);
          // Default to T-Shirts for unmapped products
          categoryGID = 'gid://shopify/TaxonomyCategory/aa-1-13-7';
          logger.debug(`[CATEGORY] 🔄 Using default T-Shirts category: ${categoryGID}`);
        }
        
        logger.debug(`[SHOPIFY-DEBUG] Product: ${productTitle}, Produit: ${productCategory}, Weight: ${productWeight}g, Images: ${productImages.length}`);
        
        // Create product WITHOUT media first (better for trial accounts)
        logger.debug(`[SHOPIFY-DEBUG] Creating product first, then adding ${mediaItems.length} media items`);
        
        const createProductMutation = `
          mutation CreateProduct($product: ProductCreateInput!) {
            productCreate(product: $product) {
            product {
              id
              title
              status
              category {
                id
                fullName
              }
                variants(first: 1) {
                  nodes {
                    id
                    title
                  }
                }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      logger.debug(`🚨🚨🚨 [MUTATION-DEBUG] ===============================================`);
      logger.debug(`🚨🚨🚨 [MUTATION-DEBUG] About to execute GraphQL product creation mutation`);
      logger.debug(`🚨🚨🚨 [MUTATION-DEBUG] ===============================================`);
      
      logger.debug(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] ===============================================`);
      logger.debug(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] About to create productInput object`);
      logger.debug(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] categoryGID value: ${categoryGID}`);
      logger.debug(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] categoryGID type: ${typeof categoryGID}`);
      logger.debug(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] categoryGID is null: ${categoryGID === null}`);
      logger.debug(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] categoryGID is undefined: ${categoryGID === undefined}`);
      logger.debug(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] ===============================================`);

      const productInput = {
          title: productTitle,
          descriptionHtml: `<p>${productDescription}</p>`,
          productType: productType,
          status: 'ACTIVE',
          vendor: shop.nomClient || 'SNA'
        };
        
        // Only add category if we found a valid GID
        if (categoryGID) {
          logger.debug(`🎯 [PRODUCT-INPUT-SUCCESS] Adding category to productInput: ${categoryGID}`);
          productInput.category = categoryGID;
        } else {
          logger.debug(`🎯 [PRODUCT-INPUT-WARNING] No categoryGID found - product will be created without category`);
        }
        
        // Log the product input with category
        logger.debug(`[PRODUCT-INPUT] Creating product with category: ${productInput.category || 'None'}`);
        logger.debug(`[PRODUCT-INPUT] Product title: ${productInput.title}, Type: ${productInput.productType}`);
        logger.debug(`[PRODUCT-INPUT] Full productInput object:`, JSON.stringify(productInput, null, 2));
        
        const createVariables = {
          product: productInput
        };
        
        const createResponse = await axios.post(shopifyUrl, {
          query: createProductMutation,
          variables: createVariables
      }, {
        headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        });
        
        logger.debug(`[SHOPIFY-DEBUG] Product creation completed`);
        
        if (createResponse.data.errors) {
          throw new Error(`GraphQL errors: ${JSON.stringify(createResponse.data.errors)}`);
        }
        
        if (createResponse.data.data?.productCreate?.userErrors?.length > 0) {
          throw new Error(`Product creation errors: ${JSON.stringify(createResponse.data.data.productCreate.userErrors)}`);
        }
        
        const createdProduct = createResponse.data.data?.productCreate?.product;
        if (!createdProduct) {
          throw new Error('No product returned from creation');
        }
        
        logger.debug(`[SHOPIFY-DEBUG] Product created successfully: { productId: ${createdProduct.id}, defaultVariantId: ${createdProduct.variants.nodes[0]?.id}, title: ${createdProduct.title} }`);
        
        // 🚨 CRITICAL DEBUG: Check what's in the product response
        logger.debug(`🚨🚨🚨 [PRODUCT-RESPONSE-DEBUG] ===============================================`);
        logger.debug(`🚨🚨🚨 [PRODUCT-RESPONSE-DEBUG] Full createdProduct object:`, JSON.stringify(createdProduct, null, 2));
        logger.debug(`🚨🚨🚨 [PRODUCT-RESPONSE-DEBUG] createdProduct.category:`, createdProduct.category);
        logger.debug(`🚨🚨🚨 [PRODUCT-RESPONSE-DEBUG] Has category: ${!!createdProduct.category}`);
        logger.debug(`🚨🚨🚨 [PRODUCT-RESPONSE-DEBUG] ===============================================`);
        
        // Log category assignment result
        if (createdProduct.category) {
          logger.debug(`[CATEGORY-SUCCESS] ✅ Product assigned to category: ${createdProduct.category.fullName}`);
        } else {
          logger.debug(`[CATEGORY-INFO] ⚠️ Product created without category assignment`);
        }
        
        // Add media to product separately with extensive logging
        if (mediaItems.length > 0) {
          logger.debug(`[MEDIA-PROCESSING] ===============================================`);
          logger.debug(`[MEDIA-PROCESSING] Starting media processing for ${mediaItems.length} items`);
          logger.debug(`[MEDIA-PROCESSING] Product ID: ${createdProduct.id}`);
          logger.debug(`[MEDIA-PROCESSING] Shopify URL: ${shopifyUrl}`);
          logger.debug(`[MEDIA-PROCESSING] ===============================================`);
          
          // Log all media items before processing
          mediaItems.forEach((item, index) => {
            logger.debug(`[MEDIA-ITEM-${index + 1}] Original Source: ${item.originalSource}`);
            logger.debug(`[MEDIA-ITEM-${index + 1}] Media Content Type: ${item.mediaContentType}`);
            logger.debug(`[MEDIA-ITEM-${index + 1}] Alt Text: ${item.alt}`);
            
            // Validate URL format
            if (!item.originalSource || !item.originalSource.startsWith('https://')) {
              logger.error(`[MEDIA-VALIDATION-ERROR] Invalid originalSource URL for item ${index + 1}: ${item.originalSource}`);
            }
            
            // Check if URL is accessible (basic validation)
            try {
              const url = new URL(item.originalSource);
              logger.debug(`[MEDIA-VALIDATION] Item ${index + 1} URL appears valid: ${url.hostname}${url.pathname}`);
            } catch (urlError) {
              logger.error(`[MEDIA-VALIDATION-ERROR] Item ${index + 1} URL is malformed:`, urlError.message);
            }
          });
          
          let successfulMediaCount = 0;
          let failedMediaCount = 0;
          
          for (let i = 0; i < mediaItems.length; i++) {
            logger.debug(`[MEDIA-PROCESSING-${i + 1}] ==========================================`);
            logger.debug(`[MEDIA-PROCESSING-${i + 1}] Processing media item ${i + 1} of ${mediaItems.length}`);
            
            try {
              const mediaItem = mediaItems[i];
              
              logger.debug("Media operation");
              
              const addMediaMutation = `
                mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
                  productCreateMedia(productId: $productId, media: $media) {
                    media {
                      id
                      status
                      alt
                      mediaContentType
                      preview {
                        status
                      }
                    }
                    mediaUserErrors {
                      field
                      message
                      code
                    }
            userErrors {
              field
              message
            }
          }
        }
      `;

              const mediaInput = {
                originalSource: mediaItem.originalSource,
                mediaContentType: 'IMAGE',
                alt: `${productTitle} - Image ${i + 1}`
              };
              
              logger.debug("Media operation");
              
              const mediaResponse = await axios.post(shopifyUrl, {
                query: addMediaMutation,
        variables: {
                  productId: createdProduct.id,
                  media: [mediaInput]
        }
      }, {
        headers: {
                  'X-Shopify-Access-Token': accessToken,
                  'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
              });
              
              logger.debug(`[MEDIA-RESPONSE-${i + 1}] HTTP Status: ${mediaResponse.status} ${mediaResponse.statusText}`);
              logger.debug(`[MEDIA-RESPONSE-${i + 1}] Full response:`, JSON.stringify(mediaResponse.data, null, 2));
              
              // Detailed error analysis
              if (mediaResponse.data.errors) {
                logger.error(`[MEDIA-ERROR-${i + 1}] GraphQL Errors:`, mediaResponse.data.errors);
                failedMediaCount++;
                continue;
              }
              
              const mediaData = mediaResponse.data.data?.productCreateMedia;
              if (!mediaData) {
                logger.error(`[MEDIA-ERROR-${i + 1}] No productCreateMedia data in response`);
                failedMediaCount++;
                continue;
              }
              
              // Check for media user errors
              if (mediaData.mediaUserErrors && mediaData.mediaUserErrors.length > 0) {
                logger.error(`[MEDIA-ERROR-${i + 1}] Media User Errors:`, mediaData.mediaUserErrors);
                mediaData.mediaUserErrors.forEach((error, errorIndex) => {
                  logger.error(`[MEDIA-ERROR-${i + 1}-${errorIndex}] Field: ${error.field}, Message: ${error.message}, Code: ${error.code}`);
                });
                failedMediaCount++;
        continue;
      }

              // Check for general user errors
              if (mediaData.userErrors && mediaData.userErrors.length > 0) {
                logger.error(`[MEDIA-ERROR-${i + 1}] General User Errors:`, mediaData.userErrors);
                failedMediaCount++;
        continue;
      }

              // Check media creation success
              if (mediaData.media && mediaData.media.length > 0) {
                const createdMedia = mediaData.media[0];
                logger.debug("Media operation");
                successfulMediaCount++;
              } else {
                logger.error(`[MEDIA-ERROR-${i + 1}] No media objects returned despite no errors`);
                failedMediaCount++;
              }
              
            } catch (error) {
              console.error(`[MEDIA-ERROR-${i + 1}] Exception during media processing:`, {
                message: error.message,
                stack: error.stack,
                response: error.response?.data ? JSON.stringify(error.response.data, null, 2) : 'No response data'
              });
              failedMediaCount++;
            }
            
            logger.debug(`[MEDIA-PROCESSING-${i + 1}] ========================================== END`);
            
            // Add delay between requests to avoid rate limiting
            if (i < mediaItems.length - 1) {
              logger.debug(`[MEDIA-PROCESSING] Waiting 1 second before next media item...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          logger.debug(`[MEDIA-SUMMARY] ===============================================`);
          logger.debug(`[MEDIA-SUMMARY] Media processing completed`);
          logger.debug(`[MEDIA-SUMMARY] Total items: ${mediaItems.length}`);
          logger.debug(`[MEDIA-SUMMARY] Successful: ${successfulMediaCount}`);
          logger.debug(`[MEDIA-SUMMARY] Failed: ${failedMediaCount}`);
          logger.debug(`[MEDIA-SUMMARY] Success rate: ${Math.round((successfulMediaCount / mediaItems.length) * 100)}%`);
          logger.debug(`[MEDIA-SUMMARY] ===============================================`);
        }
        
        // Process and create/update variants using bulk approach
        logger.debug(`[VARIANT-MANAGEMENT] ===============================================`);
        logger.debug(`[VARIANT-MANAGEMENT] Starting variant processing using bulk approach`);
        
        // Get sizes and colors from product data
        const rawSizes = product.tailles || product.sizes || [];
        const colors = product.couleurs || product.colors || [];
        const stock = product.stock || {};
        const skus = product.skus || {};
        const eans = product.eans || {};

        // ✅ CRITICAL FIX: Sort sizes in proper order (XS, S, M, L, XL, XXL, etc.)
        const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
        const sizes = rawSizes.sort((a, b) => {
          const indexA = sizeOrder.indexOf(a);
          const indexB = sizeOrder.indexOf(b);
          
          // If both sizes are in the standard order, sort by their position
          if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
          }
          
          // If only one size is in the standard order, prioritize it
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          
          // If neither size is in the standard order, sort alphabetically
          return a.localeCompare(b);
        });

        logger.debug(`[VARIANT-MANAGEMENT] Found ${sizes.length} sizes, ${colors.length} colors`);
        logger.debug(`[VARIANT-MANAGEMENT] Raw sizes:`, rawSizes);
        logger.debug(`[VARIANT-MANAGEMENT] Sorted sizes:`, sizes);
        logger.debug(`[VARIANT-MANAGEMENT] Colors:`, colors);
        logger.debug(`[VARIANT-MANAGEMENT] Stock data:`, stock);
        logger.debug(`[VARIANT-MANAGEMENT] SKUs data:`, skus);
        logger.debug(`[VARIANT-MANAGEMENT] EANs data:`, eans);
        
        // Apply EAN fallback strategy
        const hasProductLevelEan = eans.default || productEan || product.ean || product.codeEAN || product.barcode;
        if (hasProductLevelEan) {
          if (sizes.length > 0 && colors.length > 0) {
            sizes.forEach(size => {
              colors.forEach(color => {
                const key = `${size}-${color}`;
                if (!eans[key]) eans[key] = hasProductLevelEan;
              });
            });
          } else if (sizes.length > 0) {
            sizes.forEach(size => {
              if (!eans[size]) eans[size] = hasProductLevelEan;
            });
          } else if (colors.length > 0) {
            colors.forEach(color => {
              if (!eans[color]) eans[color] = hasProductLevelEan;
            });
          } else {
            if (!eans.default) eans.default = hasProductLevelEan;
          }
        }
        


      // Generate variants based on size/color combinations
      let variants = [];
      
      if (sizes.length > 0 && colors.length > 0) {
        // Both sizes and colors - create all combinations
          logger.debug(`[VARIANT-MANAGEMENT] Creating size+color combinations`);
        sizes.forEach(size => {
          colors.forEach(color => {
            const stockKey = `${size}-${color}`;
              const skuKey = `${size}-${color}`;
            
            // ENHANCED EAN LOOKUP WITH EXPLICIT FALLBACK
            let eanValue = eans[skuKey];
            logger.debug(`[VARIANT-EAN-LOOKUP] Initial lookup for ${skuKey}: ${eanValue}`);
            
            // CRITICAL: Always use fallback if variant-specific EAN is missing
            if (!eanValue) {
              // Try eans.default first, then other fallbacks
              eanValue = eans.default || hasProductLevelEan;
              logger.debug(`[VARIANT-EAN-EXPLICIT] Applied fallback EAN for ${skuKey}: ${eanValue} (source: ${eans.default ? 'eans.default' : 'hasProductLevelEan'})`);
            }
            
            logger.debug(`[VARIANT-EAN-DEBUG] Size-Color variant ${size}-${color}:`);
            logger.debug(`[VARIANT-EAN-DEBUG] - Looking for EAN with key: ${skuKey}`);
            logger.debug(`[VARIANT-EAN-DEBUG] - Found EAN value: ${eanValue}`);
            logger.debug(`[VARIANT-EAN-DEBUG] - EAN source: ${eans[skuKey] ? 'variant-specific' : 'fallback'}`);
            
            const variantObj = {
                price: String(product.prix || product.price || 0),
                sku: skus[skuKey] || undefined,
                barcode: eanValue,
              optionValues: [
                { optionName: 'Size', name: size },
                { optionName: 'Color', name: color }
              ],
              stockQuantity: stock[stockKey] || 0
            };
            logger.debug(`[VARIANT-EAN-DEBUG] - Final variant barcode: ${variantObj.barcode}`);
            variants.push(variantObj);
          });
        });
      } else if (sizes.length > 0) {
        // Only sizes
          logger.debug(`[VARIANT-MANAGEMENT] Creating size-only variants`);
        sizes.forEach(size => {
          // ENHANCED EAN LOOKUP WITH EXPLICIT FALLBACK
          let eanValue = eans[size];
          logger.debug(`[VARIANT-EAN-LOOKUP] Initial lookup for ${size}: ${eanValue}`);
          
          // CRITICAL: Always use fallback if variant-specific EAN is missing
          if (!eanValue) {
            // Try eans.default first, then other fallbacks
            eanValue = eans.default || hasProductLevelEan;
            logger.debug(`[VARIANT-EAN-EXPLICIT] Applied fallback EAN for ${size}: ${eanValue} (source: ${eans.default ? 'eans.default' : 'hasProductLevelEan'})`);
          }
          
          logger.debug(`[VARIANT-EAN-DEBUG] Size-only variant ${size}:`);
          logger.debug(`[VARIANT-EAN-DEBUG] - Looking for EAN with key: ${size}`);
          logger.debug(`[VARIANT-EAN-DEBUG] - Found EAN value: ${eanValue}`);
          logger.debug(`[VARIANT-EAN-DEBUG] - EAN source: ${eans[size] ? 'variant-specific' : 'fallback'}`);
          
          const variantObj = {
              price: String(product.prix || product.price || 0),
              sku: skus[size] || undefined,
              barcode: eanValue,
            optionValues: [
              { optionName: 'Size', name: size }
            ],
            stockQuantity: stock[size] || 0
          };
          logger.debug(`[VARIANT-EAN-DEBUG] - Final variant barcode: ${variantObj.barcode}`);
          variants.push(variantObj);
        });
      } else if (colors.length > 0) {
        // Only colors
          logger.debug(`[VARIANT-MANAGEMENT] Creating color-only variants`);
        colors.forEach(color => {
          // ENHANCED EAN LOOKUP WITH EXPLICIT FALLBACK
          let eanValue = eans[color];
          logger.debug(`[VARIANT-EAN-LOOKUP] Initial lookup for ${color}: ${eanValue}`);
          
          // CRITICAL: Always use fallback if variant-specific EAN is missing
          if (!eanValue) {
            // Try eans.default first, then other fallbacks
            eanValue = eans.default || hasProductLevelEan;
            logger.debug(`[VARIANT-EAN-EXPLICIT] Applied fallback EAN for ${color}: ${eanValue} (source: ${eans.default ? 'eans.default' : 'hasProductLevelEan'})`);
          }
          
          logger.debug(`[VARIANT-EAN-DEBUG] Color-only variant ${color}:`);
          logger.debug(`[VARIANT-EAN-DEBUG] - Looking for EAN with key: ${color}`);
          logger.debug(`[VARIANT-EAN-DEBUG] - Found EAN value: ${eanValue}`);
          logger.debug(`[VARIANT-EAN-DEBUG] - EAN source: ${eans[color] ? 'variant-specific' : 'fallback'}`);
          
          const variantObj = {
              price: String(product.prix || product.price || 0),
              sku: skus[color] || undefined,
              barcode: eanValue,
            optionValues: [
              { optionName: 'Color', name: color }
            ],
            stockQuantity: stock[color] || 0
          };
          logger.debug(`[VARIANT-EAN-DEBUG] - Final variant barcode: ${variantObj.barcode}`);
          variants.push(variantObj);
        });
      } else {
          // No variants - single product, update default variant
          logger.debug(`[VARIANT-MANAGEMENT] Single product, updating default variant`);
          
          // ENHANCED EAN LOOKUP WITH EXPLICIT FALLBACK FOR SINGLE PRODUCT
          let singleEan = eans.default || product.ean || product.codeEAN;
          if (!singleEan && hasProductLevelEan) {
            singleEan = hasProductLevelEan;
            logger.debug(`[VARIANT-EAN-EXPLICIT] Applied fallback EAN for single product: ${singleEan}`);
          }
          
          logger.debug(`[VARIANT-EAN-DEBUG] Single product variant:`);
          logger.debug(`[VARIANT-EAN-DEBUG] - product.ean: ${product.ean}`);
          logger.debug(`[VARIANT-EAN-DEBUG] - product.codeEAN: ${product.codeEAN}`);
          logger.debug(`[VARIANT-EAN-DEBUG] - eans.default: ${eans.default}`);
          logger.debug(`[VARIANT-EAN-DEBUG] - productEan (extracted earlier): ${productEan}`);
          logger.debug(`[VARIANT-EAN-DEBUG] - Final EAN value: ${singleEan}`);
          logger.debug(`[VARIANT-EAN-DEBUG] - EAN source: ${eans.default ? 'eans.default' : 'fallback'}`);
          
        const singleVariant = {
            price: String(product.prix || product.price || 0),
            sku: product.sku || skus.default || undefined,
            barcode: singleEan,
          stockQuantity: stock.default || stock || 0
        };
        logger.debug(`[VARIANT-EAN-DEBUG] - Final single variant barcode: ${singleVariant.barcode}`);
        variants.push(singleVariant);
      }

        logger.debug(`[VARIANT-MANAGEMENT] Generated ${variants.length} variants`);
        // Don't log full array to avoid truncation
        logger.debug(`[VARIANT-MANAGEMENT] Generated ${variants.length} variants with data`);

        // If we have options, we need to create them first
        if ((sizes.length > 0 || colors.length > 0) && variants.length > 1) {
        const PRODUCT_OPTIONS_CREATE_MUTATION = `
          mutation productOptionsCreate($productId: ID!, $options: [OptionCreateInput!]!) {
            productOptionsCreate(productId: $productId, options: $options) {
              product {
                id
                  options {
                    id
                    name
                    values
                  }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

          const productOptions = [];
          if (sizes.length > 0) {
            productOptions.push({
              name: 'Size',
              values: sizes.map(v => ({ name: v }))
            });
          }
          if (colors.length > 0) {
            productOptions.push({
              name: 'Color', 
              values: colors.map(v => ({ name: v }))
            });
          }

          logger.debug('[VARIANT-MANAGEMENT] Creating product options:', JSON.stringify(productOptions, null, 2));

          const optionsResponse = await axios.post(shopifyUrl, {
          query: PRODUCT_OPTIONS_CREATE_MUTATION,
          variables: {
              productId: createdProduct.id,
              options: productOptions
          }
        }, {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken
          }
        });

          logger.debug(`[VARIANT-MANAGEMENT] Options response:`, JSON.stringify(optionsResponse.data, null, 2));
        }

        // Use bulk variant creation/update
        if (variants.length > 1) {
          logger.debug(`[VARIANT-MANAGEMENT] Using bulk variant creation for ${variants.length} variants`);
          
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
                    sku
                    tracked
                    requiresShipping
                    measurement {
                      weight {
                        value
                        unit
                      }
                    }
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          // Create variants with weight in inventoryItem.measurement.weight (2025-07 pattern)
          const weightInKilograms = (Number(productWeight) || 300) / 1000; // Convert grams to kilograms
          
          const variantInputs = variants.map(variant => ({
            price: variant.price,
            optionValues: variant.optionValues,
            inventoryItem: {
              sku: variant.sku || undefined,
              tracked: true,
              requiresShipping: true,
              measurement: {
                weight: {
                  value: weightInKilograms,
                  unit: 'KILOGRAMS'
                }
              }
            }
            // barcode will be set in separate update step
          }));

          logger.debug(`[VARIANT-MANAGEMENT] Creating variants with weight in inventoryItem.measurement:`, JSON.stringify(variantInputs, null, 2));

          const variantResponse = await axios.post(shopifyUrl, {
        query: VARIANT_BULK_CREATE_MUTATION,
        variables: {
              productId: createdProduct.id,
          strategy: 'REMOVE_STANDALONE_VARIANT', // Replace the default variant
          variants: variantInputs
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        }
      });

          logger.debug(`[VARIANT-MANAGEMENT] Variant creation response:`, JSON.stringify(variantResponse.data, null, 2));

      // Check for variant creation errors
          if (variantResponse.data.errors || variantResponse.data.data?.productVariantsBulkCreate?.userErrors?.length > 0) {
            const variantError = variantResponse.data.errors?.[0]?.message || 
                               variantResponse.data.data.productVariantsBulkCreate.userErrors[0]?.message;
            logger.error(`[VARIANT-MANAGEMENT-ERROR] Variant creation failed: ${variantError}`);
          } else {
            const createdVariants = variantResponse.data.data.productVariantsBulkCreate.productVariants;
            logger.debug(`[VARIANT-MANAGEMENT-SUCCESS] Created ${createdVariants.length} variants successfully`);
            
            // LOG WEIGHT VERIFICATION
            logger.debug(`[VARIANT-WEIGHT-VERIFICATION] ===============================================`);
            createdVariants.forEach((variant, index) => {
              const weightValue = variant.inventoryItem?.measurement?.weight?.value;
              const weightUnit = variant.inventoryItem?.measurement?.weight?.unit;
              logger.debug("Variant operation");
            });
            logger.debug(`[VARIANT-WEIGHT-VERIFICATION] ===============================================`);

            logger.debug(`[VARIANT-MANAGEMENT] About to call updateVariantsWithDetails`);
            logger.debug(`[VARIANT-MANAGEMENT] Created variants count: ${createdVariants.length}`);
            logger.debug(`[VARIANT-MANAGEMENT] Original variants count: ${variants.length}`);
            logger.debug(`[VARIANT-MANAGEMENT] Product weight: ${product.poids || product.weight}`);
            logger.debug(`[VARIANT-MANAGEMENT] Product data keys:`, Object.keys(product));
            logger.debug(`[VARIANT-MANAGEMENT] Product poids: ${product.poids}`);
            logger.debug(`[VARIANT-MANAGEMENT] Product weight: ${product.weight}`);
            // Don't log full arrays to avoid truncation
            logger.debug(`[VARIANT-MANAGEMENT] Created variants count: ${createdVariants.length}`);
            logger.debug(`[VARIANT-MANAGEMENT] Original variants count: ${variants.length}`);
            
            // Now update variants with SKU, barcode, and inventory
            logger.debug(`[VARIANT-MANAGEMENT] Calling updateVariantsWithDetails...`);
            try {
              // LOG WEIGHT BEFORE PASSING TO UPDATE FUNCTION
logger.debug(`[WEIGHT-PASS-DEBUG] ===============================================`);
logger.debug(`[WEIGHT-PASS-DEBUG] Passing weight to updateVariantsWithDetails:`);
logger.debug(`[WEIGHT-PASS-DEBUG] - product.poids: ${product.poids}`);
logger.debug(`[WEIGHT-PASS-DEBUG] - product.weight: ${product.weight}`);
logger.debug(`[WEIGHT-PASS-DEBUG] - productWeight variable: ${productWeight}`);
logger.debug(`[WEIGHT-PASS-DEBUG] - Passing value: ${product.poids || product.weight}`);
logger.debug(`[WEIGHT-PASS-DEBUG] ===============================================`);

await updateVariantsWithDetails(shopifyUrl, accessToken, createdVariants, variants, productWeight, productTitle, createdProduct.id);
              logger.debug(`[VARIANT-MANAGEMENT] updateVariantsWithDetails completed successfully`);
            } catch (error) {
              logger.error(`[VARIANT-MANAGEMENT-ERROR] updateVariantsWithDetails failed:`, error.message);
              logger.error(`[VARIANT-MANAGEMENT-ERROR] Full error:`, error);
            }
          }
        } else if (variants.length === 1) {
          // Single variant - use bulk variant create to replace default variant with proper data
          logger.debug(`[VARIANT-MANAGEMENT] Single variant - replacing default variant with proper data`);
          
          const variant = variants[0];
          const weightInKilograms = (Number(product.poids || product.weight) || 400) / 1000; // Convert grams to kilograms
          
          // Create proper variant input following the same pattern as multi-variants
          const variantInput = {
            price: variant.price,
            inventoryItem: {
              sku: variant.sku || generateSKU(productTitle),
              tracked: true,
              requiresShipping: true,
              measurement: {
                weight: {
                  value: weightInKilograms,
                  unit: 'KILOGRAMS'
                }
              }
            }
            // barcode will be set in updateVariantsWithDetails step
          };
          
          logger.debug("Variant operation");

          const VARIANT_BULK_CREATE_MUTATION = `
            mutation productVariantsBulkCreate($productId: ID!, $strategy: ProductVariantsBulkCreateStrategy!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkCreate(productId: $productId, strategy: $strategy, variants: $variants) {
                productVariants {
                  id
                  sku
                  price
                  barcode
                  inventoryItem {
                    id
                    sku
                    tracked
                    requiresShipping
                    measurement {
                      weight {
                        value
                        unit
                      }
                    }
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const variantCreateResponse = await axios.post(shopifyUrl, {
            query: VARIANT_BULK_CREATE_MUTATION,
            variables: {
              productId: createdProduct.id,
              strategy: 'REMOVE_STANDALONE_VARIANT', // Replace the default variant
              variants: [variantInput]
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken
            }
          });

          logger.debug(`[VARIANT-MANAGEMENT] Single variant create response:`, JSON.stringify(variantCreateResponse.data, null, 2));

          if (variantCreateResponse.data.errors || variantCreateResponse.data.data?.productVariantsBulkCreate?.userErrors?.length > 0) {
            const variantError = variantCreateResponse.data.errors?.[0]?.message || 
                               variantCreateResponse.data.data.productVariantsBulkCreate.userErrors[0]?.message;
            logger.error(`[VARIANT-MANAGEMENT-ERROR] Single variant creation failed: ${variantError}`);
          } else {
            const createdVariants = variantCreateResponse.data.data.productVariantsBulkCreate.productVariants;
            logger.debug(`[VARIANT-MANAGEMENT-SUCCESS] Created single variant successfully`);
            
            // LOG WEIGHT VERIFICATION
            logger.debug(`[VARIANT-WEIGHT-VERIFICATION] Single variant weight verification:`);
            const createdVariant = createdVariants[0];
            const weightValue = createdVariant.inventoryItem?.measurement?.weight?.value;
            const weightUnit = createdVariant.inventoryItem?.measurement?.weight?.unit;
            logger.debug("Variant operation");
            
            // Update with SKU, barcode, and inventory using the same function as multi-variants
            logger.debug(`[VARIANT-MANAGEMENT] Calling updateVariantsWithDetails for single variant...`);
            try {
              await updateVariantsWithDetails(shopifyUrl, accessToken, createdVariants, [variant], productWeight, productTitle, createdProduct.id);
              logger.debug(`[VARIANT-MANAGEMENT] Single variant updateVariantsWithDetails completed successfully`);
            } catch (error) {
              logger.error(`[VARIANT-MANAGEMENT-ERROR] Single variant updateVariantsWithDetails failed:`, error.message);
              logger.error(`[VARIANT-MANAGEMENT-ERROR] Full error:`, error);
            }
          }
        }
        
        logger.debug(`[VARIANT-MANAGEMENT] ===============================================`);
        
        // Skip explicit publishing - product is already ACTIVE and visible
        // Trial accounts often have issues with explicit publishing mutations
        logger.debug(`[SHOPIFY-DEBUG] Product created with ACTIVE status - skipping explicit publish for trial account compatibility`);

      results.push({
        success: true,
          productId: product.productId || product._id, // MongoDB product ID
          shopifyProductId: createdProduct.id, // Shopify GraphQL ID
          title: productTitle,
          shopifyUrl: `https://${shopifyDomain}/admin/products/${createdProduct.id.split('/').pop()}`
        });
        
        logger.debug(`[SHOPIFY-DEBUG] Product "${productTitle}" processing completed successfully`);

    } catch (error) {
        // Get title for error reporting - fallback to 'Unknown Product' if extraction failed
        const errorTitle = (product.title || product.titre || product.nom || 'Unknown Product');
        logger.error(`[SHOPIFY-ERROR] Failed to publish product "${errorTitle}":`, error);
      results.push({
        success: false,
          productId: product.productId || product._id, // MongoDB product ID
          title: errorTitle,
          error: error.message
      });
    }
  }

    const successfulProducts = results.filter(r => r.success);
    logger.debug(`[SHOPIFY-DEBUG] Publication completed: ${successfulProducts.length}/${products.length} products successfully created`);

  return {
      success: successfulProducts.length > 0,
      publishedCount: successfulProducts.length,
      totalCount: products.length,
    results: results
  };
    
  } catch (error) {
    logger.error('[SHOPIFY-ERROR] Fatal error in publishProductsToShopify:', error);
    return {
      success: false,
      error: error.message,
      publishedCount: 0,
      totalCount: products.length
    };
  }
}

/**
 * Validate shop access and return shop information
 */
async function validateShopAccess(shop) {
  try {
    logger.debug(`[SHOP-ACCESS-DEBUG] Starting validation for shop: { shopId: ${shop._id}, shopName: ${shop.nomProjet}, hasShopifyConfig: ${!!shop.shopifyConfig}, shopifyConfigKeys: ${shop.shopifyConfig ? Object.keys(shop.shopifyConfig) : []}, allShopKeys: ${Object.keys(shop)} }`);
    
    // Extract domain
    const rawDomain = shop.shopifyDomain || shop.domain || shop.myshopify_domain;
    logger.debug(`[SHOP-ACCESS-DEBUG] Domain extraction: { rawDomain: ${rawDomain}, shopifyDomain: ${shop.shopifyDomain}, myshopify_domain: ${shop.myshopify_domain}, domain: ${shop.domain} }`);

    if (!rawDomain) {
      return { isAccessible: false, error: 'No Shopify domain configured' };
    }
    
    const shopifyDomain = rawDomain.includes('.myshopify.com') ? rawDomain : `${rawDomain}.myshopify.com`;
    logger.debug(`[SHOP-ACCESS-DEBUG] Final domain: ${shopifyDomain}`);
    
    // Extract credentials
    const credentials = shop.shopifyConfig;
    if (!credentials || !credentials.accessToken) {
      return { isAccessible: false, error: 'No Shopify credentials configured' };
    }
    
    logger.debug(`[SHOP-ACCESS-DEBUG] Credentials found: { hasAccessToken: ${!!credentials.accessToken}, accessTokenLength: ${credentials.accessToken?.length}, accessTokenPreview: ${credentials.accessToken?.substring(0, 10)}..., hasApiKey: ${!!credentials.apiKey}, apiKeyLength: ${credentials.apiKey?.length}, apiKeyPreview: ${credentials.apiKey?.substring(0, 6)}..., configStructure: ${JSON.stringify(credentials)} }`);
    
    // Test API access
    const shopifyUrl = `https://${shopifyDomain}/admin/api/2025-07/graphql.json`;
    logger.debug(`[SHOP-ACCESS-DEBUG] Testing API access at: ${shopifyUrl}`);

    const testQuery = `
      query {
        shop {
          id
          name
          myshopifyDomain
          plan {
            displayName
          }
        }
      }
    `;

    logger.debug(`[SHOP-ACCESS-DEBUG] Sending test query: ${testQuery}`);

    const response = await axios.post(shopifyUrl, {
      query: testQuery
    }, {
      headers: {
        'X-Shopify-Access-Token': credentials.accessToken,
        'Content-Type': 'application/json'
      }
    });

    console.log(`[SHOP-ACCESS-DEBUG] API Response:`, {
      status: response.status,
      statusText: response.statusText,
      data: response.data
    });
    
    if (response.data.errors) {
      return { isAccessible: false, error: `API errors: ${JSON.stringify(response.data.errors)}` };
    }
    
    const shopData = response.data.data?.shop;
    if (!shopData) {
      return { isAccessible: false, error: 'No shop data returned from API' };
    }
    
    logger.debug(`[SHOP-ACCESS-DEBUG] Shop access validated successfully: { shopId: ${shopData.id}, shopName: ${shopData.name}, domain: ${shopData.myshopifyDomain}, plan: ${shopData.plan?.displayName} }`);

      return {
      isAccessible: true,
      shopData: shopData
    };

  } catch (error) {
    logger.error('[SHOP-ACCESS-ERROR] Failed to validate shop access:', error);
      return {
        isAccessible: false,
      error: error.response?.data?.errors?.[0]?.message || error.message 
    };
  }
}

/**
 * Get the shop's primary location ID
 */
async function getShopPrimaryLocation(shopifyUrl, accessToken) {
  try {
    // Try a simpler location query without the name field
    const LOCATION_QUERY = `
      query {
        locations(first: 10) {
          edges {
            node {
              id
              isActive
              fulfillsOnlineOrders
            }
          }
        }
      }
    `;

    const response = await axios.post(shopifyUrl, {
      query: LOCATION_QUERY
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      }
    });

    console.log(`[LOCATION] Location query response:`, {
      hasData: !!response.data.data,
      locationCount: response.data.data?.locations?.edges?.length || 0,
      errors: response.data.errors
    });

    if (response.data.data?.locations?.edges?.length > 0) {
      const locations = response.data.data.locations.edges;
      
      // Try to find a location that fulfills online orders first
      let selectedLocation = locations.find(edge => edge.node.fulfillsOnlineOrders && edge.node.isActive)?.node;
      
      // If not found, use the first active location
      if (!selectedLocation) {
        selectedLocation = locations.find(edge => edge.node.isActive)?.node;
      }
      
      // If still not found, use the first location
      if (!selectedLocation) {
        selectedLocation = locations[0].node;
      }
      
      logger.debug(`[LOCATION] Found location: ${selectedLocation.id}`);
      console.log(`[LOCATION] Location details:`, {
        id: selectedLocation.id,
        isActive: selectedLocation.isActive,
        fulfillsOnlineOrders: selectedLocation.fulfillsOnlineOrders
      });
      return selectedLocation.id;
    }

    logger.warn(`[LOCATION] No locations found for this shop`);
    return null;
  } catch (error) {
    logger.error(`[LOCATION-ERROR] Failed to fetch location:`, error.message);
    logger.error(`[LOCATION-ERROR] Full error:`, error);
    
    // If we can't get locations due to permissions, try to use a default location ID
    // This is a fallback for shops that might have a standard location
    logger.debug(`[LOCATION] Trying fallback location ID...`);
    return null;
  }
}

/**
 * Update variants with SKU, barcode, weight and inventory details using the correct 2025-07 pattern
 */
async function updateVariantsWithDetails(shopifyUrl, accessToken, createdVariants, variants, weight, productTitle, productId) {
  logger.debug(`🚀 [VARIANT-UPDATE-FUNCTION-CALLED] Function updateVariantsWithDetails was called!`);
  logger.debug(`[VARIANT-UPDATE] Weight parameter received: ${weight}`);
  logger.debug(`[VARIANT-UPDATE] Created variants count: ${createdVariants?.length || 0}`);
  logger.debug(`[VARIANT-UPDATE] Original variants count: ${variants?.length || 0}`);
  
  // Simple check to see if we have data
  if (variants && variants.length > 0) {
    logger.debug(`[VARIANT-UPDATE] First variant has SKU: ${variants[0].sku}`);
    logger.debug(`[VARIANT-UPDATE] First variant has barcode: ${variants[0].barcode}`);
    logger.debug(`[VARIANT-UPDATE] First variant has stock: ${variants[0].stockQuantity}`);
  }
  
  logger.debug(`[VARIANT-UPDATE] ============ STARTING VARIANT UPDATE (2025-07 PATTERN) ============`);
  logger.debug(`[VARIANT-UPDATE] Updating ${createdVariants.length} variants with SKU, barcode, weight, and stock`);
  logger.debug(`[VARIANT-UPDATE] Weight parameter: ${weight}`);
  // Don't log full arrays to avoid truncation
  logger.debug(`[VARIANT-UPDATE] Created variants count: ${createdVariants?.length || 0}`);
  logger.debug(`[VARIANT-UPDATE] Original variants count: ${variants?.length || 0}`);

  if (!createdVariants || createdVariants.length === 0) {
    logger.debug(`[VARIANT-UPDATE] No variants to update`);
    return;
  }

  if (!variants || variants.length === 0) {
    logger.debug(`[VARIANT-UPDATE] No original variants data provided`);
    return;
  }

  logger.debug(`[VARIANT-UPDATE] Data validation passed - proceeding with updates`);

  // Check if original variants have the required data
  logger.debug(`[VARIANT-UPDATE] Checking original variants data...`);
  logger.debug(`[VARIANT-UPDATE] Original variants array length: ${variants.length}`);
  
  // LOG ALL VARIANTS WITH DETAILED BARCODE INFO
  logger.debug(`[VARIANT-UPDATE-BARCODES] ===============================================`);
  logger.debug(`[VARIANT-UPDATE-BARCODES] Detailed barcode information for ALL variants:`);
  variants.forEach((variant, index) => {
    logger.debug("Variant operation");.length : 0,
      hasBarcode: !!variant.barcode,
      stockQuantity: variant.stockQuantity,
      price: variant.price
    });
  });
  logger.debug(`[VARIANT-UPDATE-BARCODES] ===============================================`);

  // Check if created variants have the required structure
  logger.debug(`[VARIANT-UPDATE] Checking created variants structure...`);
  logger.debug(`[VARIANT-UPDATE] Created variants array length: ${createdVariants.length}`);
  
  // Only log first few created variants to avoid truncation
  const createdVariantsToLog = createdVariants.slice(0, 3);
  createdVariantsToLog.forEach((variant, index) => {
    logger.debug("Variant operation");
  });
  if (createdVariants.length > 3) {
    logger.debug(`[VARIANT-UPDATE] ... and ${createdVariants.length - 3} more created variants`);
  }

  try {
    // Step 1: Update inventory items for SKU, barcode, and weight (2025-07 pattern)
    logger.debug(`[VARIANT-UPDATE] Step 1: Updating inventory items for SKU/barcode/weight...`);
    
    const INVENTORY_ITEM_UPDATE_MUTATION = `
      mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          inventoryItem {
            id
            sku
            tracked
            requiresShipping
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    for (let i = 0; i < createdVariants.length; i++) {
      const variant = createdVariants[i];
      const originalVariant = variants[i];
      const inventoryItemId = variant.inventoryItem?.id;

      if (!inventoryItemId) {
        logger.error(`[VARIANT-UPDATE-${i + 1}] No inventory item ID found for variant ${variant.id}`);
        continue;
      }

      logger.debug(`[VARIANT-UPDATE-${i + 1}] ==========================================`);
      logger.debug(`[VARIANT-UPDATE-${i + 1}] Updating inventory item ${inventoryItemId}`);
      logger.debug("Variant operation");
      logger.debug(`[VARIANT-UPDATE-${i + 1}] Setting SKU: "${originalVariant.sku}", Barcode: "${originalVariant.barcode}", Weight: ${weight || 'N/A'}`);

      // Ensure SKU exists (generate if needed)
      const skuValue = originalVariant.sku || generateSKU(productTitle);
      
      const inventoryItemInput = {
        sku: skuValue,
        tracked: true,
        requiresShipping: true
      };

      // Note: barcode is NOT supported in inventoryItemUpdate - will be handled in productVariantUpdate

      logger.debug("Variant operation");

      try {
        logger.debug(`[VARIANT-UPDATE-${i + 1}] About to call inventory item update API...`);
        const inventoryResponse = await axios.post(shopifyUrl, {
          query: INVENTORY_ITEM_UPDATE_MUTATION,
          variables: {
            id: inventoryItemId,
            input: inventoryItemInput
          }
        }, {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken
          }
        });
        logger.debug(`[VARIANT-UPDATE-${i + 1}] Inventory item update API call completed`);

        // Only log essential response info to avoid truncation
        const hasErrors = !!(inventoryResponse.data.errors && inventoryResponse.data.errors.length) || 
                         !!(inventoryResponse.data.data?.inventoryItemUpdate?.userErrors && inventoryResponse.data.data.inventoryItemUpdate.userErrors.length);
        logger.debug("Variant operation"); + (inventoryResponse.data.data?.inventoryItemUpdate?.userErrors?.length || 0)
        });

        const invErrors = inventoryResponse.data.errors;
        const invUserErrors = inventoryResponse.data.data?.inventoryItemUpdate?.userErrors;
        
        logger.debug("Variant operation"); || !!(invUserErrors && invUserErrors.length),
          errorMessage: invErrors?.[0]?.message || invUserErrors?.[0]?.message || 'No errors'
        });
        
        if ((invErrors && invErrors.length) || (invUserErrors && invUserErrors.length)) {
          const msg = invErrors?.[0]?.message || invUserErrors?.[0]?.message;
          logger.error(`[VARIANT-UPDATE-ERROR-${i + 1}] Inventory item update failed: ${msg}`);
          // Log specific user errors for debugging
          if (invUserErrors && invUserErrors.length > 0) {
            invUserErrors.forEach((error) => {
              logger.error(`[VARIANT-UPDATE-ERROR-${i + 1}] Field: ${error.field}, Message: ${error.message}`);
            });
          }
        } else {
          const updatedItem = inventoryResponse.data.data.inventoryItemUpdate.inventoryItem;
          logger.debug("Variant operation");
        }
      } catch (error) {
        logger.error(`[VARIANT-UPDATE-EXCEPTION-${i + 1}] Error updating inventory item:`, error.message);
      }

      // Small delay between updates
      await new Promise(resolve => setTimeout(resolve, 200));
    }

        // Step 2: Update variant barcode and weight using productVariantsBulkUpdate (2025-07 pattern)
    logger.debug(`[VARIANT-UPDATE] Step 2: Updating variant barcode using productVariantsBulkUpdate...`);
    
    // Prepare bulk update data
    logger.debug(`[VARIANT-BULK-UPDATE-PREP] ===============================================`);
    logger.debug(`[VARIANT-BULK-UPDATE-PREP] Weight parameter received:`, weight);
    logger.debug(`[VARIANT-BULK-UPDATE-PREP] Weight type:`, typeof weight);
    logger.debug(`[VARIANT-BULK-UPDATE-PREP] Weight converted to number:`, Number(weight));
    logger.debug(`[VARIANT-BULK-UPDATE-PREP] ===============================================`);
    
    const variantUpdates = [];
    for (let i = 0; i < createdVariants.length; i++) {
      const variant = createdVariants[i];
      const originalVariant = variants[i];

      logger.debug(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] ==============================`);
      logger.debug(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] Original variant barcode:`, originalVariant.barcode);
      logger.debug(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] Barcode type:`, typeof originalVariant.barcode);
      logger.debug(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] Has barcode:`, !!originalVariant.barcode);
      logger.debug(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] Barcode after String():`, originalVariant.barcode ? String(originalVariant.barcode) : 'null');
      logger.debug(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] Barcode after trim():`, originalVariant.barcode ? String(originalVariant.barcode).trim() : 'null');
      
      // CRITICAL FIX: Ensure barcode is always passed, even if it's the same for all variants
      let barcodeValue = originalVariant.barcode ? String(originalVariant.barcode).trim() : null;
      
      // Convert "0000000000000" EAN to empty string for Shopify
      if (barcodeValue === "0000000000000") {
        logger.debug(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] Converting "0000000000000" EAN to empty string for Shopify`);
        barcodeValue = "";
      }
      
      const variantInput = {
        id: variant.id,
        barcode: barcodeValue
      };

      variantUpdates.push(variantInput);
      
      logger.debug("Variant operation");
      logger.debug(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] ==============================`);
    }

    // CRITICAL: Log all variant updates before sending
    logger.debug(`[VARIANT-BARCODE-FINAL-CHECK] ===============================================`);
    logger.debug(`[VARIANT-BARCODE-FINAL-CHECK] ALL VARIANT UPDATES TO BE SENT:`);
    variantUpdates.forEach((update, index) => {
      logger.debug("Variant operation");
    });
    logger.debug(`[VARIANT-BARCODE-FINAL-CHECK] ===============================================`);
    
    // Use productVariantsBulkUpdate to set barcode and weight
          logger.debug(`[VARIANT-BARCODE] Using productVariantsBulkUpdate for barcode only...`);
    
          const PRODUCT_VARIANT_BULK_UPDATE_MUTATION = `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants {
              id
              barcode
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
    
    try {
      const variantResponse = await axios.post(shopifyUrl, {
        query: PRODUCT_VARIANT_BULK_UPDATE_MUTATION,
        variables: {
          productId: productId,
          variants: variantUpdates
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        }
      });

      const varErrors = variantResponse.data.errors;
      const varUserErrors = variantResponse.data.data?.productVariantsBulkUpdate?.userErrors;
      
      logger.debug(`[VARIANT-BULK-UPDATE-RESPONSE] ===============================================`);
      logger.debug(`[VARIANT-BULK-UPDATE-RESPONSE] Full response data:`, JSON.stringify(variantResponse.data, null, 2));
      logger.debug(`[VARIANT-BULK-UPDATE-RESPONSE] ===============================================`);
      
      if (!varErrors && (!varUserErrors || varUserErrors.length === 0)) {
        const updatedVariants = variantResponse.data.data?.productVariantsBulkUpdate?.productVariants;
        logger.debug(`[VARIANT-BARCODE-SUCCESS] Updated ${updatedVariants?.length || 0} variants with barcode`);
        
        updatedVariants?.forEach((variant, index) => {
          logger.debug("Variant operation");
        });
      } else {
        const errorMsg = varErrors?.[0]?.message || varUserErrors?.[0]?.message;
        logger.error(`[VARIANT-BARCODE-ERROR] Variant bulk update failed: ${errorMsg}`);
        
        logger.error(`[VARIANT-BARCODE-ERROR] GraphQL errors:`, varErrors);
        logger.error(`[VARIANT-BARCODE-ERROR] User errors:`, varUserErrors);
        
        if (varUserErrors && varUserErrors.length > 0) {
          varUserErrors.forEach((error, idx) => {
            logger.error(`[VARIANT-BARCODE-ERROR-${idx}] Field: ${error.field}, Message: ${error.message}`);
          });
        }
      }
    } catch (error) {
      logger.error(`[VARIANT-BARCODE-EXCEPTION] Error updating variants:`, error.message);
    }



    // Step 3: Handle stock levels using inventorySetQuantities (2025-07 pattern)
    logger.debug(`[VARIANT-UPDATE] Step 3: Setting stock levels using inventorySetQuantities...`);
    
    // Get the shop's primary location
    const locationId = await getShopPrimaryLocation(shopifyUrl, accessToken);
    
    if (!locationId) {
      logger.error(`[VARIANT-UPDATE] Cannot set stock levels - no valid location found`);
      logger.debug(`[VARIANT-UPDATE] Stock update skipped due to missing location`);
      
      // Try alternative approach: use inventoryAdjustQuantity without location
      logger.debug(`[VARIANT-UPDATE] Trying alternative stock update method...`);
      try {
        for (let i = 0; i < createdVariants.length; i++) {
          const variant = createdVariants[i];
          const originalVariant = variants[i];
          
          if (originalVariant.stockQuantity && originalVariant.stockQuantity > 0) {
            const ADJUST_MUTATION = `
              mutation inventoryAdjustQuantity($input: InventoryAdjustQuantityInput!) {
                inventoryAdjustQuantity(input: $input) {
                  inventoryLevel {
                    available
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;
            
            const adjustResponse = await axios.post(shopifyUrl, {
              query: ADJUST_MUTATION,
              variables: {
                input: {
                  inventoryItemId: variant.inventoryItem.id,
                  delta: parseInt(originalVariant.stockQuantity, 10)
                }
              }
            }, {
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken
              }
            });
            
            const adjustErrors = adjustResponse.data.errors;
            const adjustUserErrors = adjustResponse.data.data?.inventoryAdjustQuantity?.userErrors;
            
            if (!adjustErrors && (!adjustUserErrors || adjustUserErrors.length === 0)) {
              logger.debug(`[VARIANT-UPDATE-STOCK-ALT-SUCCESS-${i + 1}] Successfully adjusted stock for variant ${i + 1}`);
            } else {
              const errorMsg = adjustErrors?.[0]?.message || adjustUserErrors?.[0]?.message;
              logger.error(`[VARIANT-UPDATE-STOCK-ALT-ERROR-${i + 1}] Stock adjustment failed: ${errorMsg}`);
            }
            
            // Small delay between adjustments
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } catch (error) {
        logger.error(`[VARIANT-UPDATE-STOCK-ALT-EXCEPTION] Error in alternative stock update:`, error.message);
      }
    } else {
      logger.debug(`[VARIANT-UPDATE] Using location ID: ${locationId} for stock updates`);
    }

    // Set up stock for each variant using inventorySetQuantities
    if (locationId) {
      // Collect all inventory items that need stock updates
      const inventoryUpdates = [];
      
      for (let i = 0; i < createdVariants.length; i++) {
        const variant = createdVariants[i];
        const originalVariant = variants[i];
        const stockQuantity = originalVariant.stockQuantity || 0;
        const inventoryItemId = variant.inventoryItem?.id;

        if (!inventoryItemId || stockQuantity <= 0) {
          logger.debug(`[VARIANT-UPDATE-STOCK-${i + 1}] Skipping stock (itemId: ${inventoryItemId}, qty: ${stockQuantity})`);
          continue;
        }

        inventoryUpdates.push({
          inventoryItemId: inventoryItemId,
          locationId: locationId,
          quantity: parseInt(stockQuantity, 10)
        });
        
        logger.debug(`[VARIANT-UPDATE-STOCK-${i + 1}] Preparing stock update for ${inventoryItemId}: ${stockQuantity} units`);
      }

      if (inventoryUpdates.length > 0) {
        logger.debug(`[VARIANT-UPDATE] Updating stock for ${inventoryUpdates.length} variants in batch...`);

        const INVENTORY_SET_MUTATION = `
          mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
            inventorySetQuantities(input: $input) {
              userErrors {
                field
                message
              }
            }
          }
        `;

        try {
          const stockResponse = await axios.post(shopifyUrl, {
            query: INVENTORY_SET_MUTATION,
            variables: {
              input: {
                name: "available",
                reason: "correction",
                ignoreCompareQuantity: true,
                quantities: inventoryUpdates
              }
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken
            }
          });

          logger.debug("Variant operation"); || 
                      !!(stockResponse.data.data?.inventorySetQuantities?.userErrors && stockResponse.data.data.inventorySetQuantities.userErrors.length),
            errorCount: (stockResponse.data.errors?.length || 0) + (stockResponse.data.data?.inventorySetQuantities?.userErrors?.length || 0)
          });
          
          const stockErrors = stockResponse.data.errors;
          const stockUserErrors = stockResponse.data.data?.inventorySetQuantities?.userErrors;
          
          if (!stockErrors && (!stockUserErrors || stockUserErrors.length === 0)) {
            logger.debug(`[VARIANT-UPDATE-STOCK-SUCCESS] Successfully set stock levels for ${inventoryUpdates.length} variants`);
          } else {
            const errorMsg = stockErrors?.[0]?.message || stockUserErrors?.[0]?.message;
            logger.error(`[VARIANT-UPDATE-STOCK-ERROR] Failed to set stock levels: ${errorMsg}`);
            
            // Log specific errors for debugging
            if (stockUserErrors && stockUserErrors.length > 0) {
              stockUserErrors.forEach((error, index) => {
                logger.error(`[VARIANT-UPDATE-STOCK-ERROR-${index + 1}] Field: ${error.field}, Message: ${error.message}`);
              });
            }
          }
        } catch (error) {
          logger.error(`[VARIANT-UPDATE-STOCK-EXCEPTION] Error setting stock levels:`, error.message);
        }
      }
    }

    // Step 4: Weight was already set during variant creation in inventoryItem.measurement.weight
    logger.debug(`[VARIANT-UPDATE] Step 4: Weight was set during variant creation - skipping separate weight update`);
    logger.debug(`[VARIANT-WEIGHT-INFO] All variants created with weight: ${weight || 'N/A'} grams (${((Number(weight) || 300) / 1000).toFixed(3)} kg)`);

          logger.debug(`[VARIANT-UPDATE] ============ VARIANT UPDATE COMPLETED (2025-07 PATTERN) ============`);
      logger.debug(`[VARIANT-UPDATE] ✅ Updated using correct 2025-07 API:`);
      logger.debug(`[VARIANT-UPDATE]    - productVariantsBulkCreate with inventoryItem.measurement.weight (Weight set during creation)`);
      logger.debug(`[VARIANT-UPDATE]    - inventoryItemUpdate for SKU (cleanup step)`);
      logger.debug(`[VARIANT-UPDATE]    - productVariantsBulkUpdate for Barcode`);
      logger.debug(`[VARIANT-UPDATE]    - inventorySetQuantities for Stock`);
      logger.debug(`[VARIANT-UPDATE] 📊 SUMMARY: Processed ${createdVariants.length} variants`);
      logger.debug(`[VARIANT-UPDATE] 📊 SUMMARY: SKU updates attempted for all variants`);
      logger.debug(`[VARIANT-UPDATE] 📊 SUMMARY: Barcode updates attempted for ALL variants with value: ${variants[0]?.barcode || 'N/A'}`);
      logger.debug(`[VARIANT-UPDATE] 📊 SUMMARY: Weight SET DURING CREATION for ALL variants with value: ${weight || 'N/A'} grams (${((Number(weight) || 300) / 1000).toFixed(3)} kg)`);
      logger.debug(`[VARIANT-UPDATE] 📊 SUMMARY: Stock updates attempted using inventorySetQuantities`);
    
  } catch (error) {
    logger.error(`[VARIANT-UPDATE-ERROR] Exception during variant update:`, error.message);
  }
}

/**
 * Note: Inventory levels are now handled directly in updateVariantsWithDetails
 * using the inventoryQuantities field in productVariantsBulkUpdate
 */

/**
 * Set inventory levels for multiple variants using bulk update
 */
async function setBulkInventoryLevels(shopifyUrl, accessToken, createdVariants, variants, weight) {
  logger.debug(`[INVENTORY-BULK] Setting inventory levels for ${createdVariants.length} variants`);
  
  try {
    // First get the primary location for inventory management
    const LOCATIONS_QUERY = `
      query locations($first: Int!) {
        locations(first: $first) {
          edges {
            node {
              id
              primary
              name
            }
          }
        }
      }
    `;
    
    const locationsResponse = await axios.post(shopifyUrl, {
      query: LOCATIONS_QUERY,
      variables: { first: 10 }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      }
    });
    
    const edges = locationsResponse.data.data.locations.edges;
    const primaryLocation = edges.find(edge => edge.node.primary) || edges[0];
    const primaryLocationId = primaryLocation?.node.id;
    
    logger.debug(`[INVENTORY-BULK] Using primary location: ${primaryLocationId}`);
    
    if (!primaryLocationId) {
      logger.error(`[INVENTORY-BULK-ERROR] No location found for inventory management`);
      return;
    }
    
    // Prepare bulk variant update with weight and inventory
    const VARIANT_BULK_UPDATE_MUTATION = `
      mutation productVariantsBulkUpdate($variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(variants: $variants) {
          productVariants {
            id
            weight
            weightUnit
            inventoryManagement
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const variantUpdateInputs = createdVariants.map((variant, index) => {
      const originalVariant = variants[index];
      const input = {
        id: variant.id,
        inventoryManagement: 'SHOPIFY'
      };
      
      if (weight) {
        input.weight = Number(weight);
        input.weightUnit = 'GRAMS';
      }
      
      if (primaryLocationId && originalVariant.stockQuantity > 0) {
        input.inventoryQuantities = [{
          availableQuantity: originalVariant.stockQuantity,
          locationId: primaryLocationId
        }];
      }
      
      return input;
    });
    
    logger.debug(`[INVENTORY-BULK] Updating variants with inventory data:`, JSON.stringify(variantUpdateInputs, null, 2));
    
    const bulkUpdateResponse = await axios.post(shopifyUrl, {
      query: VARIANT_BULK_UPDATE_MUTATION,
      variables: { variants: variantUpdateInputs }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      }
    });
    
    logger.debug(`[INVENTORY-BULK] Bulk update response:`, JSON.stringify(bulkUpdateResponse.data, null, 2));
    
    if (bulkUpdateResponse.data.errors || bulkUpdateResponse.data.data.productVariantsBulkUpdate.userErrors.length > 0) {
      logger.error(`[INVENTORY-BULK-ERROR] Failed to update inventory:`, bulkUpdateResponse.data);
    } else {
      logger.debug(`[INVENTORY-BULK-SUCCESS] Successfully updated inventory for all variants`);
    }
    
  } catch (error) {
    logger.error(`[INVENTORY-BULK-ERROR] Exception during bulk inventory update:`, error.message);
  }
}

/**
 * Set inventory level for a single variant
 */
async function setSingleInventoryLevel(shopifyUrl, accessToken, variantId, quantity, weight) {
  logger.debug(`[INVENTORY-SINGLE] Setting inventory for variant ${variantId}: ${quantity} units`);
  
  try {
    // First get the primary location for inventory management
    const LOCATIONS_QUERY = `
      query locations($first: Int!) {
        locations(first: $first) {
          edges {
            node {
              id
              primary
              name
            }
          }
        }
      }
    `;
    
    const locationsResponse = await axios.post(shopifyUrl, {
      query: LOCATIONS_QUERY,
      variables: { first: 10 }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      }
    });
    
    const edges = locationsResponse.data.data.locations.edges;
    const primaryLocation = edges.find(edge => edge.node.primary) || edges[0];
    const primaryLocationId = primaryLocation?.node.id;
    
    logger.debug(`[INVENTORY-SINGLE] Using primary location: ${primaryLocationId}`);
    
    if (!primaryLocationId) {
      logger.error(`[INVENTORY-SINGLE-ERROR] No location found for inventory management`);
      return;
    }
    
    // Update the variant with weight and inventory management
    const VARIANT_UPDATE_MUTATION = `
      mutation productVariantUpdate($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
            id
            weight
            weightUnit
            inventoryManagement
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const updateInput = {
      id: variantId,
      inventoryManagement: 'SHOPIFY'
    };
    
    if (weight) {
      updateInput.weight = Number(weight);
      updateInput.weightUnit = 'GRAMS';
    }
    
    if (quantity > 0) {
      updateInput.inventoryQuantities = [{
        availableQuantity: quantity,
        locationId: primaryLocationId
      }];
    }
    
    logger.debug(`[INVENTORY-SINGLE] Updating variant with:`, updateInput);
    
    const updateResponse = await axios.post(shopifyUrl, {
      query: VARIANT_UPDATE_MUTATION,
      variables: { input: updateInput }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      }
    });
    
    logger.debug(`[INVENTORY-SINGLE] Update response:`, JSON.stringify(updateResponse.data, null, 2));
    
    if (updateResponse.data.errors || updateResponse.data.data.productVariantUpdate.userErrors.length > 0) {
      logger.error(`[INVENTORY-SINGLE-ERROR] Failed to update inventory:`, updateResponse.data);
    } else {
      logger.debug(`[INVENTORY-SINGLE-SUCCESS] Successfully updated inventory for variant`);
    }
    
  } catch (error) {
    logger.error(`[INVENTORY-SINGLE-ERROR] Exception during single inventory update:`, error.message);
  }
}

module.exports = {
  publishProductsToShopify,
  validateShopAccess
}; 