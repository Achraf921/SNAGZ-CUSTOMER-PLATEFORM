const axios = require('axios');
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
    console.log(`[S3-DEBUG] Fetching image from bucket: ${bucketName}, key: ${key}`);
    
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
    console.error(`[S3-ERROR] Failed to fetch image from S3:`, error);
    throw error;
  }
}

/**
 * Create staged upload target in Shopify
 */
async function createStagedUpload(shopifyUrl, accessToken, filename, mimeType) {
  try {
    console.log(`[STAGED-UPLOAD-DEBUG] =============================================`);
    console.log(`[STAGED-UPLOAD-DEBUG] Creating staged upload`);
    console.log(`[STAGED-UPLOAD-DEBUG] Filename: ${filename}`);
    console.log(`[STAGED-UPLOAD-DEBUG] MIME Type: ${mimeType}`);
    console.log(`[STAGED-UPLOAD-DEBUG] Shopify URL: ${shopifyUrl}`);
    console.log(`[STAGED-UPLOAD-DEBUG] Access Token Preview: ${accessToken ? `${accessToken.substring(0, 15)}...` : 'MISSING'}`);
    
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
    
    console.log(`[STAGED-UPLOAD-DEBUG] GraphQL Variables:`, JSON.stringify(variables, null, 2));
    console.log(`[STAGED-UPLOAD-DEBUG] Sending request to Shopify...`);
    
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
    
    console.log(`[STAGED-UPLOAD-DEBUG] HTTP Status: ${response.status} ${response.statusText}`);
    console.log(`[STAGED-UPLOAD-DEBUG] Response Headers:`, {
      'content-type': response.headers['content-type'],
      'content-length': response.headers['content-length'],
      'x-request-id': response.headers['x-request-id']
    });
    console.log(`[STAGED-UPLOAD-DEBUG] Staged upload response:`, JSON.stringify(response.data, null, 2));
    
    if (response.data.data?.stagedUploadsCreate?.userErrors?.length > 0) {
      throw new Error(`Staged upload errors: ${JSON.stringify(response.data.data.stagedUploadsCreate.userErrors)}`);
    }
    
    const stagedTarget = response.data.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!stagedTarget) {
      throw new Error('No staged target returned from Shopify');
    }
    
    return stagedTarget;
  } catch (error) {
    console.error(`[STAGED-UPLOAD-ERROR] Failed to create staged upload:`, error);
    throw error;
  }
}

/**
 * Upload file to staged upload target
 */
async function uploadToStagedTarget(stagedTarget, imageStream, filename, contentType, contentLength) {
  try {
    console.log(`[UPLOAD-DEBUG] =============================================`);
    console.log(`[UPLOAD-DEBUG] Starting upload to staged target`);
    console.log(`[UPLOAD-DEBUG] Upload URL: ${stagedTarget.url}`);
    console.log(`[UPLOAD-DEBUG] Resource URL: ${stagedTarget.resourceUrl}`);
    console.log(`[UPLOAD-DEBUG] Filename: ${filename}`);
    console.log(`[UPLOAD-DEBUG] Content Type: ${contentType}`);
    console.log(`[UPLOAD-DEBUG] Content Length: ${contentLength} bytes`);
    console.log(`[UPLOAD-DEBUG] Parameters count: ${stagedTarget.parameters.length}`);
    
    // Log all parameters (excluding sensitive ones)
    stagedTarget.parameters.forEach((param, index) => {
      if (param.name.toLowerCase().includes('signature') || param.name.toLowerCase().includes('policy')) {
        console.log(`[UPLOAD-DEBUG] Parameter ${index + 1}: ${param.name} = [REDACTED]`);
      } else {
        console.log(`[UPLOAD-DEBUG] Parameter ${index + 1}: ${param.name} = ${param.value}`);
      }
    });
    
    const form = new FormData();
    
    // Add all parameters from Shopify
    stagedTarget.parameters.forEach(param => {
      form.append(param.name, param.value);
    });
    
    console.log(`[UPLOAD-DEBUG] Form parameters added to FormData`);
    
    // Add the file
    form.append('file', imageStream, {
      filename: filename,
      contentType: contentType,
      knownLength: contentLength
    });
    
    console.log(`[UPLOAD-DEBUG] File added to FormData`);
    console.log(`[UPLOAD-DEBUG] FormData headers:`, form.getHeaders());
    console.log(`[UPLOAD-DEBUG] Starting POST request...`);
    
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
    
    console.log(`[UPLOAD-DEBUG] Upload completed in ${uploadTime}ms`);
    console.log(`[UPLOAD-DEBUG] HTTP Status: ${uploadResponse.status} ${uploadResponse.statusText}`);
    console.log(`[UPLOAD-DEBUG] Response Headers:`, uploadResponse.headers);
    console.log(`[UPLOAD-DEBUG] Response Data Length: ${uploadResponse.data ? uploadResponse.data.length : 'No data'} bytes`);
    
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
    console.log(`[UPLOAD-DEBUG] Constructed full resource URL: ${fullResourceUrl}`);
    console.log(`[UPLOAD-DEBUG] Resource URL length: ${fullResourceUrl.length} characters`);
    
    return fullResourceUrl;
  } catch (error) {
    console.error(`[UPLOAD-ERROR] Failed to upload to staged target:`, error);
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
      console.log(`[IMAGE-PROCESSING] Processing image: ${imageUrl}`);
      
      // Extract S3 bucket and key from URL
      const urlParts = imageUrl.replace('https://', '').split('/');
      const bucketName = urlParts[0].split('.')[0]; // Extract bucket name from domain
      let key = urlParts.slice(1).join('/'); // Rest is the key
      
      // Remove query parameters from the key
      const queryIndex = key.indexOf('?');
      if (queryIndex !== -1) {
        key = key.substring(0, queryIndex);
      }
      
      console.log(`[IMAGE-PROCESSING] Extracted bucket: ${bucketName}, key: ${key}`);
      
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
      
      console.log(`[IMAGE-PROCESSING] Staged upload validation successful`);
      console.log(`[IMAGE-PROCESSING] Final resourceUrl: ${resourceUrl}`);
      console.log(`[IMAGE-PROCESSING] Resource URL length: ${resourceUrl.length} characters`);
      
      const mediaObject = {
        originalSource: resourceUrl,
        mediaContentType: 'IMAGE',
        alt: `Product image ${processedImages.length + 1}`
      };
      
      console.log(`[IMAGE-PROCESSING] Created media object:`, mediaObject);
      
      processedImages.push(mediaObject);
      
      console.log(`[IMAGE-PROCESSING] Successfully processed image: ${imageData.filename}`);
      console.log(`[IMAGE-PROCESSING] Total processed so far: ${processedImages.length}`);
    } catch (error) {
      console.error(`[IMAGE-PROCESSING-ERROR] Failed to process image ${imageUrl}:`, error);
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
  console.log(`[CATEGORY-SEARCH] 🔍 ===============================================`);
  console.log(`[CATEGORY-SEARCH] 🔍 Searching for category with term: "${searchTerm}"`);
  console.log(`[CATEGORY-SEARCH] 🔍 Shopify URL: ${shopifyUrl}`);
  console.log(`[CATEGORY-SEARCH] 🔍 Access Token present: ${!!accessToken}`);
  console.log(`[CATEGORY-SEARCH] 🔍 ===============================================`);
  
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
    console.log(`[CATEGORY-SEARCH] 📡 Making GraphQL request...`);
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
    
    console.log(`[CATEGORY-SEARCH] 📡 Response status: ${response.status}`);
    console.log(`[CATEGORY-SEARCH] 📡 Response ok: ${response.ok}`);
    
    const data = await response.json();
    console.log(`[CATEGORY-SEARCH] 📡 Raw response data:`, JSON.stringify(data, null, 2));
    
    if (data.errors) {
      console.error(`[CATEGORY-SEARCH] ❌ GraphQL errors:`, data.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }
    
    const categories = data.data?.taxonomy?.categories?.nodes || [];
    console.log(`[CATEGORY-SEARCH] 📊 Found ${categories.length} categories for "${searchTerm}"`);
    
    if (categories.length > 0) {
      console.log(`[CATEGORY-SEARCH] 📋 Categories found:`, 
        categories.map(c => ({ id: c.id, fullName: c.fullName, isLeaf: c.isLeaf })));
    } else {
      console.log(`[CATEGORY-SEARCH] 📋 No categories found for search term: "${searchTerm}"`);
    }
    
    // Find the first leaf category
    const leafCategory = categories.find(category => category.isLeaf);
    
    if (leafCategory) {
      console.log(`[CATEGORY-SEARCH] ✅ Selected leaf category: ${leafCategory.fullName} (${leafCategory.id})`);
      return leafCategory.id;
    } else {
      console.log(`[CATEGORY-SEARCH] ❌ No leaf categories found for "${searchTerm}"`);
      throw new Error(`No leaf categories found for "${searchTerm}"`);
    }
  } catch (error) {
    console.error(`[CATEGORY-SEARCH] 💥 Error searching for category: ${error.message}`);
    console.error(`[CATEGORY-SEARCH] 💥 Error stack:`, error.stack);
    throw error;
  }
}

/**
 * Publish products to Shopify store
 */
async function publishProductsToShopify(shop, products) {
  try {
    console.log(`🔥🔥🔥 [RESTART-TEST] SERVER RESTARTED - NEW CHANGES APPLIED! 🔥🔥🔥`);
    console.log(`🚨🚨🚨 [CRITICAL-FUNCTION-START] publishProductsToShopify FUNCTION HAS STARTED!`);
    console.log(`🚨🚨🚨 [CRITICAL-FUNCTION-START] THIS LOG MUST APPEAR IN YOUR LOGS!`);
    console.log(`🚨🚨🚨 [CRITICAL-FUNCTION-START] ===============================================`);
    
    console.log(`[SHOPIFY-DEBUG] Starting publishProductsToShopify for shop: { shopId: ${shop._id}, shopName: ${shop.nomProjet}, productsCount: ${products.length} }`);
    
    // Extract domain and credentials
    const rawDomain = shop.shopifyDomain || shop.domain || shop.myshopify_domain;
    const shopifyDomain = rawDomain.includes('.myshopify.com') ? rawDomain : `${rawDomain}.myshopify.com`;
    const accessToken = shop.shopifyConfig?.accessToken;
    
    if (!accessToken) {
      throw new Error('No access token found in shop configuration');
    }
    
    console.log(`[SHOPIFY-DEBUG] Publishing to domain: ${shopifyDomain} (raw: ${rawDomain})`);
    console.log(`[SHOPIFY-DEBUG] Using access token: ${accessToken.substring(0, 10)}******`);
    
    const shopifyUrl = `https://${shopifyDomain}/admin/api/2025-07/graphql.json`;
    console.log(`[SHOPIFY-DEBUG] API URL: ${shopifyUrl}`);
  
  const results = [];

    for (const product of products) {
      try {
        // 🚨 SUPER CRITICAL: Mark the start of product processing
        console.log(`🚨🚨🚨 [SUPER-CRITICAL] ===============================================`);
        console.log(`🚨🚨🚨 [SUPER-CRITICAL] STARTING PRODUCT PROCESSING LOOP`);
        console.log(`🚨🚨🚨 [SUPER-CRITICAL] Product title: ${product.title || product.titre || 'NO TITLE'}`);
        console.log(`🚨🚨🚨 [SUPER-CRITICAL] ===============================================`);
        
        // Basic product info for debugging
        console.log(`[SHOPIFY-DEBUG] Processing product: ${product.title || product.titre}`);
        console.log(`[SHOPIFY-DEBUG] Product type: ${product.type || product.typeProduit || 'Not specified'}`);
        
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
          console.log(`[SHOPIFY-DEBUG] Processing ${productImages.length} images`);
          mediaItems = await processImagesWithStagedUploads(shopifyUrl, accessToken, productImages);
        }
        
        // Generate SKU
        const sku = generateSKU(productTitle);
        
        console.log(`🚨🚨🚨 [FLOW-DEBUG] Generated SKU: ${sku}`);
        console.log(`🚨🚨🚨 [FLOW-DEBUG] About to proceed to category section...`);
        
        console.log(`🚨🚨🚨 [CRITICAL-DEBUG] Starting category and product creation section...`);
        
        // Map category
        const productType = mapProductType(productTypeRaw);
        
        console.log(`🚨🚨🚨 [CRITICAL-DEBUG] ProductType mapped: ${productType}`);
        
        // 🚨 EXECUTION CHECK: Verify we reached this point
        console.log(`🔥��🔥 [EXECUTION-CHECK] REACHED CATEGORY SECTION!`);
        console.log(`🔥🔥🔥 [EXECUTION-CHECK] productType: "${productType}"`);
        console.log(`🔥🔥🔥 [EXECUTION-CHECK] SKU: "${sku}"`);
        console.log(`🔥🔥🔥 [EXECUTION-CHECK] Media Items: ${mediaItems.length}`);
        
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
          console.log(`[CATEGORY] ✅ Assigned category for "${productCategory}": ${categoryGID}`);
        } else {
          console.log(`[CATEGORY] ❌ No category mapping found for: "${productCategory}"`);
          // Default to T-Shirts for unmapped products
          categoryGID = 'gid://shopify/TaxonomyCategory/aa-1-13-7';
          console.log(`[CATEGORY] 🔄 Using default T-Shirts category: ${categoryGID}`);
        }
        
        console.log(`[SHOPIFY-DEBUG] Product: ${productTitle}, Produit: ${productCategory}, Weight: ${productWeight}g, Images: ${productImages.length}`);
        
        // Create product WITHOUT media first (better for trial accounts)
        console.log(`[SHOPIFY-DEBUG] Creating product first, then adding ${mediaItems.length} media items`);
        
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

      console.log(`🚨🚨🚨 [MUTATION-DEBUG] ===============================================`);
      console.log(`🚨🚨🚨 [MUTATION-DEBUG] About to execute GraphQL product creation mutation`);
      console.log(`🚨🚨🚨 [MUTATION-DEBUG] ===============================================`);
      
      console.log(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] ===============================================`);
      console.log(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] About to create productInput object`);
      console.log(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] categoryGID value: ${categoryGID}`);
      console.log(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] categoryGID type: ${typeof categoryGID}`);
      console.log(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] categoryGID is null: ${categoryGID === null}`);
      console.log(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] categoryGID is undefined: ${categoryGID === undefined}`);
      console.log(`🎯🎯🎯 [PRODUCT-INPUT-DEBUG] ===============================================`);

      const productInput = {
          title: productTitle,
          descriptionHtml: `<p>${productDescription}</p>`,
          productType: productType,
          status: 'ACTIVE',
          vendor: shop.nomClient || 'SNA'
        };
        
        // Only add category if we found a valid GID
        if (categoryGID) {
          console.log(`🎯 [PRODUCT-INPUT-SUCCESS] Adding category to productInput: ${categoryGID}`);
          productInput.category = categoryGID;
        } else {
          console.log(`🎯 [PRODUCT-INPUT-WARNING] No categoryGID found - product will be created without category`);
        }
        
        // Log the product input with category
        console.log(`[PRODUCT-INPUT] Creating product with category: ${productInput.category || 'None'}`);
        console.log(`[PRODUCT-INPUT] Product title: ${productInput.title}, Type: ${productInput.productType}`);
        console.log(`[PRODUCT-INPUT] Full productInput object:`, JSON.stringify(productInput, null, 2));
        
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
        
        console.log(`[SHOPIFY-DEBUG] Product creation completed`);
        
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
        
        console.log(`[SHOPIFY-DEBUG] Product created successfully: { productId: ${createdProduct.id}, defaultVariantId: ${createdProduct.variants.nodes[0]?.id}, title: ${createdProduct.title} }`);
        
        // 🚨 CRITICAL DEBUG: Check what's in the product response
        console.log(`🚨🚨🚨 [PRODUCT-RESPONSE-DEBUG] ===============================================`);
        console.log(`🚨🚨🚨 [PRODUCT-RESPONSE-DEBUG] Full createdProduct object:`, JSON.stringify(createdProduct, null, 2));
        console.log(`🚨🚨🚨 [PRODUCT-RESPONSE-DEBUG] createdProduct.category:`, createdProduct.category);
        console.log(`🚨🚨🚨 [PRODUCT-RESPONSE-DEBUG] Has category: ${!!createdProduct.category}`);
        console.log(`🚨🚨🚨 [PRODUCT-RESPONSE-DEBUG] ===============================================`);
        
        // Log category assignment result
        if (createdProduct.category) {
          console.log(`[CATEGORY-SUCCESS] ✅ Product assigned to category: ${createdProduct.category.fullName}`);
        } else {
          console.log(`[CATEGORY-INFO] ⚠️ Product created without category assignment`);
        }
        
        // Add media to product separately with extensive logging
        if (mediaItems.length > 0) {
          console.log(`[MEDIA-PROCESSING] ===============================================`);
          console.log(`[MEDIA-PROCESSING] Starting media processing for ${mediaItems.length} items`);
          console.log(`[MEDIA-PROCESSING] Product ID: ${createdProduct.id}`);
          console.log(`[MEDIA-PROCESSING] Shopify URL: ${shopifyUrl}`);
          console.log(`[MEDIA-PROCESSING] ===============================================`);
          
          // Log all media items before processing
          mediaItems.forEach((item, index) => {
            console.log(`[MEDIA-ITEM-${index + 1}] Original Source: ${item.originalSource}`);
            console.log(`[MEDIA-ITEM-${index + 1}] Media Content Type: ${item.mediaContentType}`);
            console.log(`[MEDIA-ITEM-${index + 1}] Alt Text: ${item.alt}`);
            
            // Validate URL format
            if (!item.originalSource || !item.originalSource.startsWith('https://')) {
              console.error(`[MEDIA-VALIDATION-ERROR] Invalid originalSource URL for item ${index + 1}: ${item.originalSource}`);
            }
            
            // Check if URL is accessible (basic validation)
            try {
              const url = new URL(item.originalSource);
              console.log(`[MEDIA-VALIDATION] Item ${index + 1} URL appears valid: ${url.hostname}${url.pathname}`);
            } catch (urlError) {
              console.error(`[MEDIA-VALIDATION-ERROR] Item ${index + 1} URL is malformed:`, urlError.message);
            }
          });
          
          let successfulMediaCount = 0;
          let failedMediaCount = 0;
          
          for (let i = 0; i < mediaItems.length; i++) {
            console.log(`[MEDIA-PROCESSING-${i + 1}] ==========================================`);
            console.log(`[MEDIA-PROCESSING-${i + 1}] Processing media item ${i + 1} of ${mediaItems.length}`);
            
            try {
              const mediaItem = mediaItems[i];
              
              console.log(`[MEDIA-PROCESSING-${i + 1}] Media item data:`, {
                originalSource: mediaItem.originalSource,
                mediaContentType: mediaItem.mediaContentType,
                alt: mediaItem.alt || `${productTitle} - Image ${i + 1}`
              });
              
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
              
              console.log(`[MEDIA-PROCESSING-${i + 1}] Sending mutation with variables:`, {
                productId: createdProduct.id,
                media: [mediaInput]
              });
              
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
              
              console.log(`[MEDIA-RESPONSE-${i + 1}] HTTP Status: ${mediaResponse.status} ${mediaResponse.statusText}`);
              console.log(`[MEDIA-RESPONSE-${i + 1}] Full response:`, JSON.stringify(mediaResponse.data, null, 2));
              
              // Detailed error analysis
              if (mediaResponse.data.errors) {
                console.error(`[MEDIA-ERROR-${i + 1}] GraphQL Errors:`, mediaResponse.data.errors);
                failedMediaCount++;
                continue;
              }
              
              const mediaData = mediaResponse.data.data?.productCreateMedia;
              if (!mediaData) {
                console.error(`[MEDIA-ERROR-${i + 1}] No productCreateMedia data in response`);
                failedMediaCount++;
                continue;
              }
              
              // Check for media user errors
              if (mediaData.mediaUserErrors && mediaData.mediaUserErrors.length > 0) {
                console.error(`[MEDIA-ERROR-${i + 1}] Media User Errors:`, mediaData.mediaUserErrors);
                mediaData.mediaUserErrors.forEach((error, errorIndex) => {
                  console.error(`[MEDIA-ERROR-${i + 1}-${errorIndex}] Field: ${error.field}, Message: ${error.message}, Code: ${error.code}`);
                });
                failedMediaCount++;
        continue;
      }

              // Check for general user errors
              if (mediaData.userErrors && mediaData.userErrors.length > 0) {
                console.error(`[MEDIA-ERROR-${i + 1}] General User Errors:`, mediaData.userErrors);
                failedMediaCount++;
        continue;
      }

              // Check media creation success
              if (mediaData.media && mediaData.media.length > 0) {
                const createdMedia = mediaData.media[0];
                console.log(`[MEDIA-SUCCESS-${i + 1}] Media created successfully:`, {
                  id: createdMedia.id,
                  status: createdMedia.status,
                  alt: createdMedia.alt,
                  mediaContentType: createdMedia.mediaContentType,
                  previewStatus: createdMedia.preview?.status
                });
                successfulMediaCount++;
              } else {
                console.error(`[MEDIA-ERROR-${i + 1}] No media objects returned despite no errors`);
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
            
            console.log(`[MEDIA-PROCESSING-${i + 1}] ========================================== END`);
            
            // Add delay between requests to avoid rate limiting
            if (i < mediaItems.length - 1) {
              console.log(`[MEDIA-PROCESSING] Waiting 1 second before next media item...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          console.log(`[MEDIA-SUMMARY] ===============================================`);
          console.log(`[MEDIA-SUMMARY] Media processing completed`);
          console.log(`[MEDIA-SUMMARY] Total items: ${mediaItems.length}`);
          console.log(`[MEDIA-SUMMARY] Successful: ${successfulMediaCount}`);
          console.log(`[MEDIA-SUMMARY] Failed: ${failedMediaCount}`);
          console.log(`[MEDIA-SUMMARY] Success rate: ${Math.round((successfulMediaCount / mediaItems.length) * 100)}%`);
          console.log(`[MEDIA-SUMMARY] ===============================================`);
        }
        
        // Process and create/update variants using bulk approach
        console.log(`[VARIANT-MANAGEMENT] ===============================================`);
        console.log(`[VARIANT-MANAGEMENT] Starting variant processing using bulk approach`);
        
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

        console.log(`[VARIANT-MANAGEMENT] Found ${sizes.length} sizes, ${colors.length} colors`);
        console.log(`[VARIANT-MANAGEMENT] Raw sizes:`, rawSizes);
        console.log(`[VARIANT-MANAGEMENT] Sorted sizes:`, sizes);
        console.log(`[VARIANT-MANAGEMENT] Colors:`, colors);
        console.log(`[VARIANT-MANAGEMENT] Stock data:`, stock);
        console.log(`[VARIANT-MANAGEMENT] SKUs data:`, skus);
        console.log(`[VARIANT-MANAGEMENT] EANs data:`, eans);
        
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
          console.log(`[VARIANT-MANAGEMENT] Creating size+color combinations`);
        sizes.forEach(size => {
          colors.forEach(color => {
            const stockKey = `${size}-${color}`;
              const skuKey = `${size}-${color}`;
            
            // ENHANCED EAN LOOKUP WITH EXPLICIT FALLBACK
            let eanValue = eans[skuKey];
            console.log(`[VARIANT-EAN-LOOKUP] Initial lookup for ${skuKey}: ${eanValue}`);
            
            // CRITICAL: Always use fallback if variant-specific EAN is missing
            if (!eanValue) {
              // Try eans.default first, then other fallbacks
              eanValue = eans.default || hasProductLevelEan;
              console.log(`[VARIANT-EAN-EXPLICIT] Applied fallback EAN for ${skuKey}: ${eanValue} (source: ${eans.default ? 'eans.default' : 'hasProductLevelEan'})`);
            }
            
            console.log(`[VARIANT-EAN-DEBUG] Size-Color variant ${size}-${color}:`);
            console.log(`[VARIANT-EAN-DEBUG] - Looking for EAN with key: ${skuKey}`);
            console.log(`[VARIANT-EAN-DEBUG] - Found EAN value: ${eanValue}`);
            console.log(`[VARIANT-EAN-DEBUG] - EAN source: ${eans[skuKey] ? 'variant-specific' : 'fallback'}`);
            
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
            console.log(`[VARIANT-EAN-DEBUG] - Final variant barcode: ${variantObj.barcode}`);
            variants.push(variantObj);
          });
        });
      } else if (sizes.length > 0) {
        // Only sizes
          console.log(`[VARIANT-MANAGEMENT] Creating size-only variants`);
        sizes.forEach(size => {
          // ENHANCED EAN LOOKUP WITH EXPLICIT FALLBACK
          let eanValue = eans[size];
          console.log(`[VARIANT-EAN-LOOKUP] Initial lookup for ${size}: ${eanValue}`);
          
          // CRITICAL: Always use fallback if variant-specific EAN is missing
          if (!eanValue) {
            // Try eans.default first, then other fallbacks
            eanValue = eans.default || hasProductLevelEan;
            console.log(`[VARIANT-EAN-EXPLICIT] Applied fallback EAN for ${size}: ${eanValue} (source: ${eans.default ? 'eans.default' : 'hasProductLevelEan'})`);
          }
          
          console.log(`[VARIANT-EAN-DEBUG] Size-only variant ${size}:`);
          console.log(`[VARIANT-EAN-DEBUG] - Looking for EAN with key: ${size}`);
          console.log(`[VARIANT-EAN-DEBUG] - Found EAN value: ${eanValue}`);
          console.log(`[VARIANT-EAN-DEBUG] - EAN source: ${eans[size] ? 'variant-specific' : 'fallback'}`);
          
          const variantObj = {
              price: String(product.prix || product.price || 0),
              sku: skus[size] || undefined,
              barcode: eanValue,
            optionValues: [
              { optionName: 'Size', name: size }
            ],
            stockQuantity: stock[size] || 0
          };
          console.log(`[VARIANT-EAN-DEBUG] - Final variant barcode: ${variantObj.barcode}`);
          variants.push(variantObj);
        });
      } else if (colors.length > 0) {
        // Only colors
          console.log(`[VARIANT-MANAGEMENT] Creating color-only variants`);
        colors.forEach(color => {
          // ENHANCED EAN LOOKUP WITH EXPLICIT FALLBACK
          let eanValue = eans[color];
          console.log(`[VARIANT-EAN-LOOKUP] Initial lookup for ${color}: ${eanValue}`);
          
          // CRITICAL: Always use fallback if variant-specific EAN is missing
          if (!eanValue) {
            // Try eans.default first, then other fallbacks
            eanValue = eans.default || hasProductLevelEan;
            console.log(`[VARIANT-EAN-EXPLICIT] Applied fallback EAN for ${color}: ${eanValue} (source: ${eans.default ? 'eans.default' : 'hasProductLevelEan'})`);
          }
          
          console.log(`[VARIANT-EAN-DEBUG] Color-only variant ${color}:`);
          console.log(`[VARIANT-EAN-DEBUG] - Looking for EAN with key: ${color}`);
          console.log(`[VARIANT-EAN-DEBUG] - Found EAN value: ${eanValue}`);
          console.log(`[VARIANT-EAN-DEBUG] - EAN source: ${eans[color] ? 'variant-specific' : 'fallback'}`);
          
          const variantObj = {
              price: String(product.prix || product.price || 0),
              sku: skus[color] || undefined,
              barcode: eanValue,
            optionValues: [
              { optionName: 'Color', name: color }
            ],
            stockQuantity: stock[color] || 0
          };
          console.log(`[VARIANT-EAN-DEBUG] - Final variant barcode: ${variantObj.barcode}`);
          variants.push(variantObj);
        });
      } else {
          // No variants - single product, update default variant
          console.log(`[VARIANT-MANAGEMENT] Single product, updating default variant`);
          
          // ENHANCED EAN LOOKUP WITH EXPLICIT FALLBACK FOR SINGLE PRODUCT
          let singleEan = eans.default || product.ean || product.codeEAN;
          if (!singleEan && hasProductLevelEan) {
            singleEan = hasProductLevelEan;
            console.log(`[VARIANT-EAN-EXPLICIT] Applied fallback EAN for single product: ${singleEan}`);
          }
          
          console.log(`[VARIANT-EAN-DEBUG] Single product variant:`);
          console.log(`[VARIANT-EAN-DEBUG] - product.ean: ${product.ean}`);
          console.log(`[VARIANT-EAN-DEBUG] - product.codeEAN: ${product.codeEAN}`);
          console.log(`[VARIANT-EAN-DEBUG] - eans.default: ${eans.default}`);
          console.log(`[VARIANT-EAN-DEBUG] - productEan (extracted earlier): ${productEan}`);
          console.log(`[VARIANT-EAN-DEBUG] - Final EAN value: ${singleEan}`);
          console.log(`[VARIANT-EAN-DEBUG] - EAN source: ${eans.default ? 'eans.default' : 'fallback'}`);
          
        const singleVariant = {
            price: String(product.prix || product.price || 0),
            sku: product.sku || skus.default || undefined,
            barcode: singleEan,
          stockQuantity: stock.default || stock || 0
        };
        console.log(`[VARIANT-EAN-DEBUG] - Final single variant barcode: ${singleVariant.barcode}`);
        variants.push(singleVariant);
      }

        console.log(`[VARIANT-MANAGEMENT] Generated ${variants.length} variants`);
        // Don't log full array to avoid truncation
        console.log(`[VARIANT-MANAGEMENT] Generated ${variants.length} variants with data`);

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

          console.log('[VARIANT-MANAGEMENT] Creating product options:', JSON.stringify(productOptions, null, 2));

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

          console.log(`[VARIANT-MANAGEMENT] Options response:`, JSON.stringify(optionsResponse.data, null, 2));
        }

        // Use bulk variant creation/update
        if (variants.length > 1) {
          console.log(`[VARIANT-MANAGEMENT] Using bulk variant creation for ${variants.length} variants`);
          
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

          console.log(`[VARIANT-MANAGEMENT] Creating variants with weight in inventoryItem.measurement:`, JSON.stringify(variantInputs, null, 2));

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

          console.log(`[VARIANT-MANAGEMENT] Variant creation response:`, JSON.stringify(variantResponse.data, null, 2));

      // Check for variant creation errors
          if (variantResponse.data.errors || variantResponse.data.data?.productVariantsBulkCreate?.userErrors?.length > 0) {
            const variantError = variantResponse.data.errors?.[0]?.message || 
                               variantResponse.data.data.productVariantsBulkCreate.userErrors[0]?.message;
            console.error(`[VARIANT-MANAGEMENT-ERROR] Variant creation failed: ${variantError}`);
          } else {
            const createdVariants = variantResponse.data.data.productVariantsBulkCreate.productVariants;
            console.log(`[VARIANT-MANAGEMENT-SUCCESS] Created ${createdVariants.length} variants successfully`);
            
            // LOG WEIGHT VERIFICATION
            console.log(`[VARIANT-WEIGHT-VERIFICATION] ===============================================`);
            createdVariants.forEach((variant, index) => {
              const weightValue = variant.inventoryItem?.measurement?.weight?.value;
              const weightUnit = variant.inventoryItem?.measurement?.weight?.unit;
              console.log(`[VARIANT-WEIGHT-VERIFICATION] Variant ${index + 1} (${variant.id}):`, {
                sku: variant.sku,
                weight: weightValue ? `${weightValue} ${weightUnit}` : 'NOT SET',
                weightValue: weightValue,
                weightUnit: weightUnit
              });
            });
            console.log(`[VARIANT-WEIGHT-VERIFICATION] ===============================================`);

            console.log(`[VARIANT-MANAGEMENT] About to call updateVariantsWithDetails`);
            console.log(`[VARIANT-MANAGEMENT] Created variants count: ${createdVariants.length}`);
            console.log(`[VARIANT-MANAGEMENT] Original variants count: ${variants.length}`);
            console.log(`[VARIANT-MANAGEMENT] Product weight: ${product.poids || product.weight}`);
            console.log(`[VARIANT-MANAGEMENT] Product data keys:`, Object.keys(product));
            console.log(`[VARIANT-MANAGEMENT] Product poids: ${product.poids}`);
            console.log(`[VARIANT-MANAGEMENT] Product weight: ${product.weight}`);
            // Don't log full arrays to avoid truncation
            console.log(`[VARIANT-MANAGEMENT] Created variants count: ${createdVariants.length}`);
            console.log(`[VARIANT-MANAGEMENT] Original variants count: ${variants.length}`);
            
            // Now update variants with SKU, barcode, and inventory
            console.log(`[VARIANT-MANAGEMENT] Calling updateVariantsWithDetails...`);
            try {
              // LOG WEIGHT BEFORE PASSING TO UPDATE FUNCTION
console.log(`[WEIGHT-PASS-DEBUG] ===============================================`);
console.log(`[WEIGHT-PASS-DEBUG] Passing weight to updateVariantsWithDetails:`);
console.log(`[WEIGHT-PASS-DEBUG] - product.poids: ${product.poids}`);
console.log(`[WEIGHT-PASS-DEBUG] - product.weight: ${product.weight}`);
console.log(`[WEIGHT-PASS-DEBUG] - productWeight variable: ${productWeight}`);
console.log(`[WEIGHT-PASS-DEBUG] - Passing value: ${product.poids || product.weight}`);
console.log(`[WEIGHT-PASS-DEBUG] ===============================================`);

await updateVariantsWithDetails(shopifyUrl, accessToken, createdVariants, variants, productWeight, productTitle, createdProduct.id);
              console.log(`[VARIANT-MANAGEMENT] updateVariantsWithDetails completed successfully`);
            } catch (error) {
              console.error(`[VARIANT-MANAGEMENT-ERROR] updateVariantsWithDetails failed:`, error.message);
              console.error(`[VARIANT-MANAGEMENT-ERROR] Full error:`, error);
            }
          }
        } else if (variants.length === 1) {
          // Single variant - use bulk variant create to replace default variant with proper data
          console.log(`[VARIANT-MANAGEMENT] Single variant - replacing default variant with proper data`);
          
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
          
          console.log(`[VARIANT-MANAGEMENT] Single variant input:`, {
            price: variantInput.price,
            sku: variantInput.inventoryItem.sku,
            weight: variantInput.inventoryItem.measurement.weight,
            stockQuantity: variant.stockQuantity
          });

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

          console.log(`[VARIANT-MANAGEMENT] Single variant create response:`, JSON.stringify(variantCreateResponse.data, null, 2));

          if (variantCreateResponse.data.errors || variantCreateResponse.data.data?.productVariantsBulkCreate?.userErrors?.length > 0) {
            const variantError = variantCreateResponse.data.errors?.[0]?.message || 
                               variantCreateResponse.data.data.productVariantsBulkCreate.userErrors[0]?.message;
            console.error(`[VARIANT-MANAGEMENT-ERROR] Single variant creation failed: ${variantError}`);
          } else {
            const createdVariants = variantCreateResponse.data.data.productVariantsBulkCreate.productVariants;
            console.log(`[VARIANT-MANAGEMENT-SUCCESS] Created single variant successfully`);
            
            // LOG WEIGHT VERIFICATION
            console.log(`[VARIANT-WEIGHT-VERIFICATION] Single variant weight verification:`);
            const createdVariant = createdVariants[0];
            const weightValue = createdVariant.inventoryItem?.measurement?.weight?.value;
            const weightUnit = createdVariant.inventoryItem?.measurement?.weight?.unit;
            console.log(`[VARIANT-WEIGHT-VERIFICATION] Single variant (${createdVariant.id}):`, {
              sku: createdVariant.sku,
              weight: weightValue ? `${weightValue} ${weightUnit}` : 'NOT SET',
              weightValue: weightValue,
              weightUnit: weightUnit
            });
            
            // Update with SKU, barcode, and inventory using the same function as multi-variants
            console.log(`[VARIANT-MANAGEMENT] Calling updateVariantsWithDetails for single variant...`);
            try {
              await updateVariantsWithDetails(shopifyUrl, accessToken, createdVariants, [variant], productWeight, productTitle, createdProduct.id);
              console.log(`[VARIANT-MANAGEMENT] Single variant updateVariantsWithDetails completed successfully`);
            } catch (error) {
              console.error(`[VARIANT-MANAGEMENT-ERROR] Single variant updateVariantsWithDetails failed:`, error.message);
              console.error(`[VARIANT-MANAGEMENT-ERROR] Full error:`, error);
            }
          }
        }
        
        console.log(`[VARIANT-MANAGEMENT] ===============================================`);
        
        // Skip explicit publishing - product is already ACTIVE and visible
        // Trial accounts often have issues with explicit publishing mutations
        console.log(`[SHOPIFY-DEBUG] Product created with ACTIVE status - skipping explicit publish for trial account compatibility`);

      results.push({
        success: true,
          productId: product.productId || product._id, // MongoDB product ID
          shopifyProductId: createdProduct.id, // Shopify GraphQL ID
          title: productTitle,
          shopifyUrl: `https://${shopifyDomain}/admin/products/${createdProduct.id.split('/').pop()}`
        });
        
        console.log(`[SHOPIFY-DEBUG] Product "${productTitle}" processing completed successfully`);

    } catch (error) {
        // Get title for error reporting - fallback to 'Unknown Product' if extraction failed
        const errorTitle = (product.title || product.titre || product.nom || 'Unknown Product');
        console.error(`[SHOPIFY-ERROR] Failed to publish product "${errorTitle}":`, error);
      results.push({
        success: false,
          productId: product.productId || product._id, // MongoDB product ID
          title: errorTitle,
          error: error.message
      });
    }
  }

    const successfulProducts = results.filter(r => r.success);
    console.log(`[SHOPIFY-DEBUG] Publication completed: ${successfulProducts.length}/${products.length} products successfully created`);

  return {
      success: successfulProducts.length > 0,
      publishedCount: successfulProducts.length,
      totalCount: products.length,
    results: results
  };
    
  } catch (error) {
    console.error('[SHOPIFY-ERROR] Fatal error in publishProductsToShopify:', error);
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
    console.log(`[SHOP-ACCESS-DEBUG] Starting validation for shop: { shopId: ${shop._id}, shopName: ${shop.nomProjet}, hasShopifyConfig: ${!!shop.shopifyConfig}, shopifyConfigKeys: ${shop.shopifyConfig ? Object.keys(shop.shopifyConfig) : []}, allShopKeys: ${Object.keys(shop)} }`);
    
    // Extract domain
    const rawDomain = shop.shopifyDomain || shop.domain || shop.myshopify_domain;
    console.log(`[SHOP-ACCESS-DEBUG] Domain extraction: { rawDomain: ${rawDomain}, shopifyDomain: ${shop.shopifyDomain}, myshopify_domain: ${shop.myshopify_domain}, domain: ${shop.domain} }`);

    if (!rawDomain) {
      return { isAccessible: false, error: 'No Shopify domain configured' };
    }
    
    const shopifyDomain = rawDomain.includes('.myshopify.com') ? rawDomain : `${rawDomain}.myshopify.com`;
    console.log(`[SHOP-ACCESS-DEBUG] Final domain: ${shopifyDomain}`);
    
    // Extract credentials
    const credentials = shop.shopifyConfig;
    if (!credentials || !credentials.accessToken) {
      return { isAccessible: false, error: 'No Shopify credentials configured' };
    }
    
    console.log(`[SHOP-ACCESS-DEBUG] Credentials found: { hasAccessToken: ${!!credentials.accessToken}, accessTokenLength: ${credentials.accessToken?.length}, accessTokenPreview: ${credentials.accessToken?.substring(0, 10)}..., hasApiKey: ${!!credentials.apiKey}, apiKeyLength: ${credentials.apiKey?.length}, apiKeyPreview: ${credentials.apiKey?.substring(0, 6)}..., configStructure: ${JSON.stringify(credentials)} }`);
    
    // Test API access
    const shopifyUrl = `https://${shopifyDomain}/admin/api/2025-07/graphql.json`;
    console.log(`[SHOP-ACCESS-DEBUG] Testing API access at: ${shopifyUrl}`);

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

    console.log(`[SHOP-ACCESS-DEBUG] Sending test query: ${testQuery}`);

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
    
    console.log(`[SHOP-ACCESS-DEBUG] Shop access validated successfully: { shopId: ${shopData.id}, shopName: ${shopData.name}, domain: ${shopData.myshopifyDomain}, plan: ${shopData.plan?.displayName} }`);

      return {
      isAccessible: true,
      shopData: shopData
    };

  } catch (error) {
    console.error('[SHOP-ACCESS-ERROR] Failed to validate shop access:', error);
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
      
      console.log(`[LOCATION] Found location: ${selectedLocation.id}`);
      console.log(`[LOCATION] Location details:`, {
        id: selectedLocation.id,
        isActive: selectedLocation.isActive,
        fulfillsOnlineOrders: selectedLocation.fulfillsOnlineOrders
      });
      return selectedLocation.id;
    }

    console.warn(`[LOCATION] No locations found for this shop`);
    return null;
  } catch (error) {
    console.error(`[LOCATION-ERROR] Failed to fetch location:`, error.message);
    console.error(`[LOCATION-ERROR] Full error:`, error);
    
    // If we can't get locations due to permissions, try to use a default location ID
    // This is a fallback for shops that might have a standard location
    console.log(`[LOCATION] Trying fallback location ID...`);
    return null;
  }
}

/**
 * Update variants with SKU, barcode, weight and inventory details using the correct 2025-07 pattern
 */
async function updateVariantsWithDetails(shopifyUrl, accessToken, createdVariants, variants, weight, productTitle, productId) {
  console.log(`🚀 [VARIANT-UPDATE-FUNCTION-CALLED] Function updateVariantsWithDetails was called!`);
  console.log(`[VARIANT-UPDATE] Weight parameter received: ${weight}`);
  console.log(`[VARIANT-UPDATE] Created variants count: ${createdVariants?.length || 0}`);
  console.log(`[VARIANT-UPDATE] Original variants count: ${variants?.length || 0}`);
  
  // Simple check to see if we have data
  if (variants && variants.length > 0) {
    console.log(`[VARIANT-UPDATE] First variant has SKU: ${variants[0].sku}`);
    console.log(`[VARIANT-UPDATE] First variant has barcode: ${variants[0].barcode}`);
    console.log(`[VARIANT-UPDATE] First variant has stock: ${variants[0].stockQuantity}`);
  }
  
  console.log(`[VARIANT-UPDATE] ============ STARTING VARIANT UPDATE (2025-07 PATTERN) ============`);
  console.log(`[VARIANT-UPDATE] Updating ${createdVariants.length} variants with SKU, barcode, weight, and stock`);
  console.log(`[VARIANT-UPDATE] Weight parameter: ${weight}`);
  // Don't log full arrays to avoid truncation
  console.log(`[VARIANT-UPDATE] Created variants count: ${createdVariants?.length || 0}`);
  console.log(`[VARIANT-UPDATE] Original variants count: ${variants?.length || 0}`);

  if (!createdVariants || createdVariants.length === 0) {
    console.log(`[VARIANT-UPDATE] No variants to update`);
    return;
  }

  if (!variants || variants.length === 0) {
    console.log(`[VARIANT-UPDATE] No original variants data provided`);
    return;
  }

  console.log(`[VARIANT-UPDATE] Data validation passed - proceeding with updates`);

  // Check if original variants have the required data
  console.log(`[VARIANT-UPDATE] Checking original variants data...`);
  console.log(`[VARIANT-UPDATE] Original variants array length: ${variants.length}`);
  
  // LOG ALL VARIANTS WITH DETAILED BARCODE INFO
  console.log(`[VARIANT-UPDATE-BARCODES] ===============================================`);
  console.log(`[VARIANT-UPDATE-BARCODES] Detailed barcode information for ALL variants:`);
  variants.forEach((variant, index) => {
    console.log(`[VARIANT-UPDATE-BARCODES] Variant ${index + 1}:`, {
      sku: variant.sku,
      barcode: variant.barcode,
      barcodeType: typeof variant.barcode,
      barcodeLength: variant.barcode ? String(variant.barcode).length : 0,
      hasBarcode: !!variant.barcode,
      stockQuantity: variant.stockQuantity,
      price: variant.price
    });
  });
  console.log(`[VARIANT-UPDATE-BARCODES] ===============================================`);

  // Check if created variants have the required structure
  console.log(`[VARIANT-UPDATE] Checking created variants structure...`);
  console.log(`[VARIANT-UPDATE] Created variants array length: ${createdVariants.length}`);
  
  // Only log first few created variants to avoid truncation
  const createdVariantsToLog = createdVariants.slice(0, 3);
  createdVariantsToLog.forEach((variant, index) => {
    console.log(`[VARIANT-UPDATE] Created variant ${index + 1}:`, {
      id: variant.id,
      inventoryItem: variant.inventoryItem?.id,
      hasInventoryItem: !!variant.inventoryItem
    });
  });
  if (createdVariants.length > 3) {
    console.log(`[VARIANT-UPDATE] ... and ${createdVariants.length - 3} more created variants`);
  }

  try {
    // Step 1: Update inventory items for SKU, barcode, and weight (2025-07 pattern)
    console.log(`[VARIANT-UPDATE] Step 1: Updating inventory items for SKU/barcode/weight...`);
    
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
        console.error(`[VARIANT-UPDATE-${i + 1}] No inventory item ID found for variant ${variant.id}`);
        continue;
      }

      console.log(`[VARIANT-UPDATE-${i + 1}] ==========================================`);
      console.log(`[VARIANT-UPDATE-${i + 1}] Updating inventory item ${inventoryItemId}`);
      console.log(`[VARIANT-UPDATE-${i + 1}] Original variant data:`, {
        sku: originalVariant.sku,
        barcode: originalVariant.barcode,
        stockQuantity: originalVariant.stockQuantity,
        price: originalVariant.price
      });
      console.log(`[VARIANT-UPDATE-${i + 1}] Setting SKU: "${originalVariant.sku}", Barcode: "${originalVariant.barcode}", Weight: ${weight || 'N/A'}`);

      // Ensure SKU exists (generate if needed)
      const skuValue = originalVariant.sku || generateSKU(productTitle);
      
      const inventoryItemInput = {
        sku: skuValue,
        tracked: true,
        requiresShipping: true
      };

      // Note: barcode is NOT supported in inventoryItemUpdate - will be handled in productVariantUpdate

      console.log(`[VARIANT-UPDATE-${i + 1}] Inventory item input:`, {
        sku: inventoryItemInput.sku,
        tracked: inventoryItemInput.tracked,
        requiresShipping: inventoryItemInput.requiresShipping
      });

      try {
        console.log(`[VARIANT-UPDATE-${i + 1}] About to call inventory item update API...`);
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
        console.log(`[VARIANT-UPDATE-${i + 1}] Inventory item update API call completed`);

        // Only log essential response info to avoid truncation
        const hasErrors = !!(inventoryResponse.data.errors && inventoryResponse.data.errors.length) || 
                         !!(inventoryResponse.data.data?.inventoryItemUpdate?.userErrors && inventoryResponse.data.data.inventoryItemUpdate.userErrors.length);
        console.log(`[VARIANT-UPDATE-${i + 1}] Inventory item update response:`, {
          hasErrors: hasErrors,
          errorCount: (inventoryResponse.data.errors?.length || 0) + (inventoryResponse.data.data?.inventoryItemUpdate?.userErrors?.length || 0)
        });

        const invErrors = inventoryResponse.data.errors;
        const invUserErrors = inventoryResponse.data.data?.inventoryItemUpdate?.userErrors;
        
        console.log(`[VARIANT-UPDATE-${i + 1}] SKU/BARCODE UPDATE STATUS:`, {
          sku: originalVariant.sku,
          barcode: originalVariant.barcode,
          hasErrors: !!(invErrors && invErrors.length) || !!(invUserErrors && invUserErrors.length),
          errorMessage: invErrors?.[0]?.message || invUserErrors?.[0]?.message || 'No errors'
        });
        
        if ((invErrors && invErrors.length) || (invUserErrors && invUserErrors.length)) {
          const msg = invErrors?.[0]?.message || invUserErrors?.[0]?.message;
          console.error(`[VARIANT-UPDATE-ERROR-${i + 1}] Inventory item update failed: ${msg}`);
          // Log specific user errors for debugging
          if (invUserErrors && invUserErrors.length > 0) {
            invUserErrors.forEach((error) => {
              console.error(`[VARIANT-UPDATE-ERROR-${i + 1}] Field: ${error.field}, Message: ${error.message}`);
            });
          }
        } else {
          const updatedItem = inventoryResponse.data.data.inventoryItemUpdate.inventoryItem;
          console.log(`[VARIANT-UPDATE-SUCCESS-${i + 1}] Updated inventory item:`, {
            id: updatedItem.id,
            sku: updatedItem.sku,
            tracked: updatedItem.tracked
          });
        }
      } catch (error) {
        console.error(`[VARIANT-UPDATE-EXCEPTION-${i + 1}] Error updating inventory item:`, error.message);
      }

      // Small delay between updates
      await new Promise(resolve => setTimeout(resolve, 200));
    }

        // Step 2: Update variant barcode and weight using productVariantsBulkUpdate (2025-07 pattern)
    console.log(`[VARIANT-UPDATE] Step 2: Updating variant barcode using productVariantsBulkUpdate...`);
    
    // Prepare bulk update data
    console.log(`[VARIANT-BULK-UPDATE-PREP] ===============================================`);
    console.log(`[VARIANT-BULK-UPDATE-PREP] Weight parameter received:`, weight);
    console.log(`[VARIANT-BULK-UPDATE-PREP] Weight type:`, typeof weight);
    console.log(`[VARIANT-BULK-UPDATE-PREP] Weight converted to number:`, Number(weight));
    console.log(`[VARIANT-BULK-UPDATE-PREP] ===============================================`);
    
    const variantUpdates = [];
    for (let i = 0; i < createdVariants.length; i++) {
      const variant = createdVariants[i];
      const originalVariant = variants[i];

      console.log(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] ==============================`);
      console.log(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] Original variant barcode:`, originalVariant.barcode);
      console.log(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] Barcode type:`, typeof originalVariant.barcode);
      console.log(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] Has barcode:`, !!originalVariant.barcode);
      console.log(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] Barcode after String():`, originalVariant.barcode ? String(originalVariant.barcode) : 'null');
      console.log(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] Barcode after trim():`, originalVariant.barcode ? String(originalVariant.barcode).trim() : 'null');
      
      // CRITICAL FIX: Ensure barcode is always passed, even if it's the same for all variants
      const barcodeValue = originalVariant.barcode ? String(originalVariant.barcode).trim() : null;
      
      const variantInput = {
        id: variant.id,
        barcode: barcodeValue
      };

      variantUpdates.push(variantInput);
      
      console.log(`[VARIANT-BARCODE-${i + 1}] Prepared update:`, {
        id: variantInput.id,
        barcode: variantInput.barcode,
        barcodeIsNull: variantInput.barcode === null,
        barcodeLength: variantInput.barcode ? variantInput.barcode.length : 0
      });
      console.log(`[VARIANT-BARCODE-WEIGHT-PREP-${i + 1}] ==============================`);
    }

    // CRITICAL: Log all variant updates before sending
    console.log(`[VARIANT-BARCODE-FINAL-CHECK] ===============================================`);
    console.log(`[VARIANT-BARCODE-FINAL-CHECK] ALL VARIANT UPDATES TO BE SENT:`);
    variantUpdates.forEach((update, index) => {
      console.log(`[VARIANT-BARCODE-FINAL-CHECK] Variant ${index + 1}:`, {
        id: update.id,
        barcode: update.barcode,
        barcodeLength: update.barcode ? update.barcode.length : 0,
        barcodeType: typeof update.barcode
      });
    });
    console.log(`[VARIANT-BARCODE-FINAL-CHECK] ===============================================`);
    
    // Use productVariantsBulkUpdate to set barcode and weight
          console.log(`[VARIANT-BARCODE] Using productVariantsBulkUpdate for barcode only...`);
    
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
      
      console.log(`[VARIANT-BULK-UPDATE-RESPONSE] ===============================================`);
      console.log(`[VARIANT-BULK-UPDATE-RESPONSE] Full response data:`, JSON.stringify(variantResponse.data, null, 2));
      console.log(`[VARIANT-BULK-UPDATE-RESPONSE] ===============================================`);
      
      if (!varErrors && (!varUserErrors || varUserErrors.length === 0)) {
        const updatedVariants = variantResponse.data.data?.productVariantsBulkUpdate?.productVariants;
        console.log(`[VARIANT-BARCODE-SUCCESS] Updated ${updatedVariants?.length || 0} variants with barcode`);
        
        updatedVariants?.forEach((variant, index) => {
          console.log(`[VARIANT-BARCODE-SUCCESS-${index + 1}] Updated variant:`, {
            id: variant.id,
            barcode: variant.barcode,
            barcodeIsNull: variant.barcode === null,
            barcodeIsUndefined: variant.barcode === undefined
          });
        });
      } else {
        const errorMsg = varErrors?.[0]?.message || varUserErrors?.[0]?.message;
        console.error(`[VARIANT-BARCODE-ERROR] Variant bulk update failed: ${errorMsg}`);
        
        console.error(`[VARIANT-BARCODE-ERROR] GraphQL errors:`, varErrors);
        console.error(`[VARIANT-BARCODE-ERROR] User errors:`, varUserErrors);
        
        if (varUserErrors && varUserErrors.length > 0) {
          varUserErrors.forEach((error, idx) => {
            console.error(`[VARIANT-BARCODE-ERROR-${idx}] Field: ${error.field}, Message: ${error.message}`);
          });
        }
      }
    } catch (error) {
      console.error(`[VARIANT-BARCODE-EXCEPTION] Error updating variants:`, error.message);
    }



    // Step 3: Handle stock levels using inventorySetQuantities (2025-07 pattern)
    console.log(`[VARIANT-UPDATE] Step 3: Setting stock levels using inventorySetQuantities...`);
    
    // Get the shop's primary location
    const locationId = await getShopPrimaryLocation(shopifyUrl, accessToken);
    
    if (!locationId) {
      console.error(`[VARIANT-UPDATE] Cannot set stock levels - no valid location found`);
      console.log(`[VARIANT-UPDATE] Stock update skipped due to missing location`);
      
      // Try alternative approach: use inventoryAdjustQuantity without location
      console.log(`[VARIANT-UPDATE] Trying alternative stock update method...`);
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
              console.log(`[VARIANT-UPDATE-STOCK-ALT-SUCCESS-${i + 1}] Successfully adjusted stock for variant ${i + 1}`);
            } else {
              const errorMsg = adjustErrors?.[0]?.message || adjustUserErrors?.[0]?.message;
              console.error(`[VARIANT-UPDATE-STOCK-ALT-ERROR-${i + 1}] Stock adjustment failed: ${errorMsg}`);
            }
            
            // Small delay between adjustments
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } catch (error) {
        console.error(`[VARIANT-UPDATE-STOCK-ALT-EXCEPTION] Error in alternative stock update:`, error.message);
      }
    } else {
      console.log(`[VARIANT-UPDATE] Using location ID: ${locationId} for stock updates`);
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
          console.log(`[VARIANT-UPDATE-STOCK-${i + 1}] Skipping stock (itemId: ${inventoryItemId}, qty: ${stockQuantity})`);
          continue;
        }

        inventoryUpdates.push({
          inventoryItemId: inventoryItemId,
          locationId: locationId,
          quantity: parseInt(stockQuantity, 10)
        });
        
        console.log(`[VARIANT-UPDATE-STOCK-${i + 1}] Preparing stock update for ${inventoryItemId}: ${stockQuantity} units`);
      }

      if (inventoryUpdates.length > 0) {
        console.log(`[VARIANT-UPDATE] Updating stock for ${inventoryUpdates.length} variants in batch...`);

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

          console.log(`[VARIANT-UPDATE-STOCK] Stock update response:`, {
            hasErrors: !!(stockResponse.data.errors && stockResponse.data.errors.length) || 
                      !!(stockResponse.data.data?.inventorySetQuantities?.userErrors && stockResponse.data.data.inventorySetQuantities.userErrors.length),
            errorCount: (stockResponse.data.errors?.length || 0) + (stockResponse.data.data?.inventorySetQuantities?.userErrors?.length || 0)
          });
          
          const stockErrors = stockResponse.data.errors;
          const stockUserErrors = stockResponse.data.data?.inventorySetQuantities?.userErrors;
          
          if (!stockErrors && (!stockUserErrors || stockUserErrors.length === 0)) {
            console.log(`[VARIANT-UPDATE-STOCK-SUCCESS] Successfully set stock levels for ${inventoryUpdates.length} variants`);
          } else {
            const errorMsg = stockErrors?.[0]?.message || stockUserErrors?.[0]?.message;
            console.error(`[VARIANT-UPDATE-STOCK-ERROR] Failed to set stock levels: ${errorMsg}`);
            
            // Log specific errors for debugging
            if (stockUserErrors && stockUserErrors.length > 0) {
              stockUserErrors.forEach((error, index) => {
                console.error(`[VARIANT-UPDATE-STOCK-ERROR-${index + 1}] Field: ${error.field}, Message: ${error.message}`);
              });
            }
          }
        } catch (error) {
          console.error(`[VARIANT-UPDATE-STOCK-EXCEPTION] Error setting stock levels:`, error.message);
        }
      }
    }

    // Step 4: Weight was already set during variant creation in inventoryItem.measurement.weight
    console.log(`[VARIANT-UPDATE] Step 4: Weight was set during variant creation - skipping separate weight update`);
    console.log(`[VARIANT-WEIGHT-INFO] All variants created with weight: ${weight || 'N/A'} grams (${((Number(weight) || 300) / 1000).toFixed(3)} kg)`);

          console.log(`[VARIANT-UPDATE] ============ VARIANT UPDATE COMPLETED (2025-07 PATTERN) ============`);
      console.log(`[VARIANT-UPDATE] ✅ Updated using correct 2025-07 API:`);
      console.log(`[VARIANT-UPDATE]    - productVariantsBulkCreate with inventoryItem.measurement.weight (Weight set during creation)`);
      console.log(`[VARIANT-UPDATE]    - inventoryItemUpdate for SKU (cleanup step)`);
      console.log(`[VARIANT-UPDATE]    - productVariantsBulkUpdate for Barcode`);
      console.log(`[VARIANT-UPDATE]    - inventorySetQuantities for Stock`);
      console.log(`[VARIANT-UPDATE] 📊 SUMMARY: Processed ${createdVariants.length} variants`);
      console.log(`[VARIANT-UPDATE] 📊 SUMMARY: SKU updates attempted for all variants`);
      console.log(`[VARIANT-UPDATE] 📊 SUMMARY: Barcode updates attempted for ALL variants with value: ${variants[0]?.barcode || 'N/A'}`);
      console.log(`[VARIANT-UPDATE] 📊 SUMMARY: Weight SET DURING CREATION for ALL variants with value: ${weight || 'N/A'} grams (${((Number(weight) || 300) / 1000).toFixed(3)} kg)`);
      console.log(`[VARIANT-UPDATE] 📊 SUMMARY: Stock updates attempted using inventorySetQuantities`);
    
  } catch (error) {
    console.error(`[VARIANT-UPDATE-ERROR] Exception during variant update:`, error.message);
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
  console.log(`[INVENTORY-BULK] Setting inventory levels for ${createdVariants.length} variants`);
  
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
    
    console.log(`[INVENTORY-BULK] Using primary location: ${primaryLocationId}`);
    
    if (!primaryLocationId) {
      console.error(`[INVENTORY-BULK-ERROR] No location found for inventory management`);
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
    
    console.log(`[INVENTORY-BULK] Updating variants with inventory data:`, JSON.stringify(variantUpdateInputs, null, 2));
    
    const bulkUpdateResponse = await axios.post(shopifyUrl, {
      query: VARIANT_BULK_UPDATE_MUTATION,
      variables: { variants: variantUpdateInputs }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      }
    });
    
    console.log(`[INVENTORY-BULK] Bulk update response:`, JSON.stringify(bulkUpdateResponse.data, null, 2));
    
    if (bulkUpdateResponse.data.errors || bulkUpdateResponse.data.data.productVariantsBulkUpdate.userErrors.length > 0) {
      console.error(`[INVENTORY-BULK-ERROR] Failed to update inventory:`, bulkUpdateResponse.data);
    } else {
      console.log(`[INVENTORY-BULK-SUCCESS] Successfully updated inventory for all variants`);
    }
    
  } catch (error) {
    console.error(`[INVENTORY-BULK-ERROR] Exception during bulk inventory update:`, error.message);
  }
}

/**
 * Set inventory level for a single variant
 */
async function setSingleInventoryLevel(shopifyUrl, accessToken, variantId, quantity, weight) {
  console.log(`[INVENTORY-SINGLE] Setting inventory for variant ${variantId}: ${quantity} units`);
  
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
    
    console.log(`[INVENTORY-SINGLE] Using primary location: ${primaryLocationId}`);
    
    if (!primaryLocationId) {
      console.error(`[INVENTORY-SINGLE-ERROR] No location found for inventory management`);
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
    
    console.log(`[INVENTORY-SINGLE] Updating variant with:`, updateInput);
    
    const updateResponse = await axios.post(shopifyUrl, {
      query: VARIANT_UPDATE_MUTATION,
      variables: { input: updateInput }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      }
    });
    
    console.log(`[INVENTORY-SINGLE] Update response:`, JSON.stringify(updateResponse.data, null, 2));
    
    if (updateResponse.data.errors || updateResponse.data.data.productVariantUpdate.userErrors.length > 0) {
      console.error(`[INVENTORY-SINGLE-ERROR] Failed to update inventory:`, updateResponse.data);
    } else {
      console.log(`[INVENTORY-SINGLE-SUCCESS] Successfully updated inventory for variant`);
    }
    
  } catch (error) {
    console.error(`[INVENTORY-SINGLE-ERROR] Exception during single inventory update:`, error.message);
  }
}

module.exports = {
  publishProductsToShopify,
  validateShopAccess
}; 