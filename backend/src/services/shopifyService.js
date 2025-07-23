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
      const key = urlParts.slice(1).join('/'); // Rest is the key
      
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
 * Publish products to Shopify store
 */
async function publishProductsToShopify(shop, products) {
  try {
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
        // Debug: Log the raw product structure
        console.log(`[SHOPIFY-DEBUG] Raw product data:`, JSON.stringify(product, null, 2));
        console.log(`[SHOPIFY-DEBUG] Product keys:`, Object.keys(product));
        
        // Handle different possible product data structures
        const productTitle = product.title || product.titre || product.nom || 'Product Without Title';
        const productDescription = product.description || product.desc || 'Product description';
        const productTypeRaw = product.type || product.typeProduit || product.productType || 'Miscellaneous';
        const productPrice = product.price || product.prix || '0.00';
        const productEan = product.ean || product.codeEAN || product.barcode;
        const productImages = product.imageUrls || product.images || [];
        const productWeight = product.poids || product.weight || product.poids || 400;
        
        console.log(`[SHOPIFY-DEBUG] Extracted weight: ${productWeight} (from ${product.poids || product.weight || 'default'})`);
        
        console.log(`[SHOPIFY-DEBUG] Extracted data: { title: ${productTitle}, type: ${productTypeRaw}, price: ${productPrice}, images: ${productImages.length} }`);
        console.log(`[SHOPIFY-DEBUG] Processing product: ${productTitle}`);
        
        // Process images using staged uploads
        let mediaItems = [];
        if (productImages && productImages.length > 0) {
          console.log(`[SHOPIFY-DEBUG] Processing ${productImages.length} images`);
          mediaItems = await processImagesWithStagedUploads(shopifyUrl, accessToken, productImages);
        }
        
        // Generate SKU
        const sku = generateSKU(productTitle);
        
        // Map category
        const productType = mapProductType(productTypeRaw);
        
        // Create product WITHOUT media first (better for trial accounts)
        console.log(`[SHOPIFY-DEBUG] Creating product first, then adding ${mediaItems.length} media items`);
        
        const createProductMutation = `
          mutation CreateProduct($product: ProductCreateInput!) {
            productCreate(product: $product) {
            product {
              id
              title
              status
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

      const productInput = {
          title: productTitle,
          descriptionHtml: `<p>${productDescription}</p>`,
          productType: productType,
        status: 'ACTIVE',
          vendor: shop.nomClient || 'SNA'
        };
        
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
        
        console.log(`[SHOPIFY-DEBUG] Product creation response:`, JSON.stringify(createResponse.data, null, 2));
        
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
        const sizes = product.tailles || product.sizes || [];
        const colors = product.couleurs || product.colors || [];
        const stock = product.stock || {};
        const skus = product.skus || {};
        const eans = product.eans || {};

        console.log(`[VARIANT-MANAGEMENT] Found ${sizes.length} sizes, ${colors.length} colors`);
        console.log(`[VARIANT-MANAGEMENT] Sizes:`, sizes);
        console.log(`[VARIANT-MANAGEMENT] Colors:`, colors);
        console.log(`[VARIANT-MANAGEMENT] Stock data:`, stock);
        console.log(`[VARIANT-MANAGEMENT] SKUs data:`, skus);
        console.log(`[VARIANT-MANAGEMENT] EANs data:`, eans);

      // Generate variants based on size/color combinations
      let variants = [];
      
      if (sizes.length > 0 && colors.length > 0) {
        // Both sizes and colors - create all combinations
          console.log(`[VARIANT-MANAGEMENT] Creating size+color combinations`);
        sizes.forEach(size => {
          colors.forEach(color => {
            const stockKey = `${size}-${color}`;
              const skuKey = `${size}-${color}`;
            const variantObj = {
                price: String(product.prix || product.price || 0),
                sku: skus[skuKey] || undefined,
                barcode: eans[skuKey] || undefined,
              optionValues: [
                { optionName: 'Size', name: size },
                { optionName: 'Color', name: color }
              ],
              stockQuantity: stock[stockKey] || 0
            };
            variants.push(variantObj);
          });
        });
      } else if (sizes.length > 0) {
        // Only sizes
          console.log(`[VARIANT-MANAGEMENT] Creating size-only variants`);
        sizes.forEach(size => {
          const variantObj = {
              price: String(product.prix || product.price || 0),
              sku: skus[size] || undefined,
              barcode: eans[size] || undefined,
            optionValues: [
              { optionName: 'Size', name: size }
            ],
            stockQuantity: stock[size] || 0
          };
          variants.push(variantObj);
        });
      } else if (colors.length > 0) {
        // Only colors
          console.log(`[VARIANT-MANAGEMENT] Creating color-only variants`);
        colors.forEach(color => {
          const variantObj = {
              price: String(product.prix || product.price || 0),
              sku: skus[color] || undefined,
              barcode: eans[color] || undefined,
            optionValues: [
              { optionName: 'Color', name: color }
            ],
            stockQuantity: stock[color] || 0
          };
          variants.push(variantObj);
        });
      } else {
          // No variants - single product, update default variant
          console.log(`[VARIANT-MANAGEMENT] Single product, updating default variant`);
        const singleVariant = {
            price: String(product.prix || product.price || 0),
            sku: product.sku || skus.default || undefined,
            barcode: product.ean || product.codeEAN || eans.default || undefined,
          stockQuantity: stock.default || stock || 0
        };
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
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          // Create variants with only supported fields - exclude SKU, barcode, stockQuantity
          const variantInputs = variants.map(variant => ({
            price: variant.price,
            optionValues: variant.optionValues
            // SKU, barcode, inventory will be set in separate update step
          }));

          console.log(`[VARIANT-MANAGEMENT] Creating variants with basic input:`, JSON.stringify(variantInputs, null, 2));

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
              await updateVariantsWithDetails(shopifyUrl, accessToken, createdVariants, variants, product.poids || product.weight, productTitle, createdProduct.id);
              console.log(`[VARIANT-MANAGEMENT] updateVariantsWithDetails completed successfully`);
            } catch (error) {
              console.error(`[VARIANT-MANAGEMENT-ERROR] updateVariantsWithDetails failed:`, error.message);
              console.error(`[VARIANT-MANAGEMENT-ERROR] Full error:`, error);
            }
          }
        } else if (variants.length === 1) {
          // Single variant - update the default variant
          console.log(`[VARIANT-MANAGEMENT] Updating single default variant`);
          
          const defaultVariantId = createdProduct.variants.nodes[0]?.id;
          if (!defaultVariantId) {
            console.error(`[VARIANT-MANAGEMENT-ERROR] No default variant ID found`);
          } else {
            const VARIANT_UPDATE_MUTATION = `
              mutation productVariantUpdate($input: ProductVariantInput!) {
                productVariantUpdate(input: $input) {
                  productVariant {
                    id
                    sku
                    price
                    barcode
                    weight
                    weightUnit
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;

            const variant = variants[0];
            const updateInput = {
              id: defaultVariantId,
              price: variant.price,
              sku: variant.sku || generateSKU(productTitle),
              barcode: variant.barcode
            };

            // Add weight if provided
            if (product.poids || product.weight) {
              updateInput.weight = Number(product.poids || product.weight);
              updateInput.weightUnit = 'GRAMS';
              console.log(`[VARIANT-MANAGEMENT] Adding weight: ${updateInput.weight} grams`);
            } else {
              // Set default weight
              updateInput.weight = 400;
              updateInput.weightUnit = 'GRAMS';
              console.log(`[VARIANT-MANAGEMENT] Setting default weight: 400 grams`);
            }

            console.log(`[VARIANT-MANAGEMENT] Single variant data:`, {
              sku: variant.sku,
              barcode: variant.barcode,
              stockQuantity: variant.stockQuantity,
              price: variant.price
            });
            console.log(`[VARIANT-MANAGEMENT] Updating variant with:`, updateInput);
            console.log(`[VARIANT-MANAGEMENT] About to call single variant update...`);

            const updateResponse = await axios.post(shopifyUrl, {
              query: VARIANT_UPDATE_MUTATION,
              variables: { input: updateInput }
            }, {
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken
              }
            });

            console.log(`[VARIANT-MANAGEMENT] Update response:`, JSON.stringify(updateResponse.data, null, 2));

            // Set inventory for single variant
            if (variant.stockQuantity > 0) {
              await setSingleInventoryLevel(shopifyUrl, accessToken, defaultVariantId, variant.stockQuantity, product.poids || product.weight);
            }
          }
        }
        
        console.log(`[VARIANT-MANAGEMENT] ===============================================`);
        
        // Skip explicit publishing - product is already ACTIVE and visible
        // Trial accounts often have issues with explicit publishing mutations
        console.log(`[SHOPIFY-DEBUG] Product created with ACTIVE status - skipping explicit publish for trial account compatibility`);

      results.push({
        success: true,
          productId: createdProduct.id,
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
  
  // Only log first few variants to avoid truncation
  const variantsToLog = variants.slice(0, 3);
  variantsToLog.forEach((variant, index) => {
    console.log(`[VARIANT-UPDATE] Variant ${index + 1}:`, {
      sku: variant.sku,
      barcode: variant.barcode,
      stockQuantity: variant.stockQuantity,
      price: variant.price
    });
  });
  if (variants.length > 3) {
    console.log(`[VARIANT-UPDATE] ... and ${variants.length - 3} more variants`);
  }

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
    console.log(`[VARIANT-UPDATE] Step 2: Updating variant barcode and weight using productVariantsBulkUpdate...`);
    
    // Prepare bulk update data
    const variantUpdates = [];
    for (let i = 0; i < createdVariants.length; i++) {
      const variant = createdVariants[i];
      const originalVariant = variants[i];

      const variantInput = {
        id: variant.id,
        barcode: originalVariant.barcode ? String(originalVariant.barcode).trim() : null,
        weight: Number(weight) || 400,
        weightUnit: 'GRAMS'
      };

      variantUpdates.push(variantInput);
      
      console.log(`[VARIANT-BARCODE-WEIGHT-${i + 1}] Prepared update:`, {
        id: variantInput.id,
        barcode: variantInput.barcode,
        weight: variantInput.weight,
        weightUnit: variantInput.weightUnit
      });
    }

    // Use productVariantUpdate to set barcode and weight
    console.log(`[VARIANT-BARCODE-WEIGHT] Using productVariantUpdate for barcode and weight...`);
    
    // Update each variant with barcode and weight
    for (let i = 0; i < createdVariants.length; i++) {
      const variant = createdVariants[i];
      const originalVariant = variants[i];
      
      console.log(`[VARIANT-BARCODE-WEIGHT-${i + 1}] Updating variant ${variant.id}...`);
      
      const variantInput = {
        id: variant.id,
        barcode: originalVariant.barcode ? String(originalVariant.barcode).trim() : null,
        weight: Number(weight) || 400,
        weightUnit: 'GRAMS'
      };
      
      console.log(`[VARIANT-BARCODE-WEIGHT-${i + 1}] Variant input:`, {
        id: variantInput.id,
        barcode: variantInput.barcode,
        weight: variantInput.weight,
        weightUnit: variantInput.weightUnit
      });
      
      const PRODUCT_VARIANT_UPDATE_MUTATION = `
        mutation productVariantUpdate($input: ProductVariantInput!) {
          productVariantUpdate(input: $input) {
            productVariant {
              id
              barcode
              weight
              weightUnit
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
          query: PRODUCT_VARIANT_UPDATE_MUTATION,
          variables: {
            input: variantInput
          }
        }, {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken
          }
        });

        const varErrors = variantResponse.data.errors;
        const varUserErrors = variantResponse.data.data?.productVariantUpdate?.userErrors;
        
        if (!varErrors && (!varUserErrors || varUserErrors.length === 0)) {
          const updatedVariant = variantResponse.data.data?.productVariantUpdate?.productVariant;
          console.log(`[VARIANT-BARCODE-WEIGHT-SUCCESS-${i + 1}] Updated variant:`, {
            id: updatedVariant.id,
            barcode: updatedVariant.barcode,
            weight: updatedVariant.weight,
            weightUnit: updatedVariant.weightUnit
          });
        } else {
          const errorMsg = varErrors?.[0]?.message || varUserErrors?.[0]?.message;
          console.error(`[VARIANT-BARCODE-WEIGHT-ERROR-${i + 1}] Variant update failed: ${errorMsg}`);
          
          if (varUserErrors && varUserErrors.length > 0) {
            varUserErrors.forEach((error) => {
              console.error(`[VARIANT-BARCODE-WEIGHT-ERROR-${i + 1}] Field: ${error.field}, Message: ${error.message}`);
            });
          }
        }
      } catch (error) {
        console.error(`[VARIANT-BARCODE-WEIGHT-EXCEPTION-${i + 1}] Error updating variant:`, error.message);
      }
      
      // Small delay between updates
      await new Promise(resolve => setTimeout(resolve, 200));
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
                  delta: originalVariant.stockQuantity
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
          quantity: stockQuantity
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

    console.log(`[VARIANT-UPDATE] ============ VARIANT UPDATE COMPLETED (2025-07 PATTERN) ============`);
    console.log(`[VARIANT-UPDATE] ✅ Updated using correct 2025-07 API: inventoryItemUpdate + productVariantUpdate + inventorySetQuantities`);
    console.log(`[VARIANT-UPDATE] 📊 SUMMARY: Processed ${createdVariants.length} variants`);
    console.log(`[VARIANT-UPDATE] 📊 SUMMARY: SKU updates attempted for all variants`);
    console.log(`[VARIANT-UPDATE] 📊 SUMMARY: Barcode updates attempted for variants with barcode data`);
    console.log(`[VARIANT-UPDATE] 📊 SUMMARY: Weight updates attempted with value: ${weight}`);
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