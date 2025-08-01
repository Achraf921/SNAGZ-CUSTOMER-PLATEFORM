const axios = require('axios');
const { logger } = require('../utils/secureLogger');

const isValidEAN13 = (ean) => {
  // Reject if empty, not 13 digits, or all zeros
  if (!ean || !/^\d{13}$/.test(ean) || /^0{13}$/.test(ean)) {
    return false;
  }
  const digits = ean.split('').map(Number);
  const checkDigit = digits.pop();
  const sum = digits.reduce((s, d, i) => s + d * (i % 2 === 0 ? 1 : 3), 0);
  const calculatedCheckDigit = (10 - (sum % 10)) % 10;
  return checkDigit === calculatedCheckDigit;
};

// This mapping needs to be completed based on where the data is stored
// and the logic for choosing the correct productType.
const mapProductToItem = (product, shop, customer, log) => {
  // TODO: Finalize this mapping with the correct data sources.
  log(`  - Mapping product: ${product.titre} (ID: ${product.productId})`);
  
  // Map our internal product types to the exact EC API enum values
  const getExternalProductType = (prod) => {
    // Define the complete mapping based on API documentation
    const productTypeMapping = {
      // Phono products
      'CD': 'CD Client',
      'Vinyl': 'Vinyle Client', 
      'DVD': 'DVD Client',
      'Blue-Ray': 'BD Client',
      
      // Merch products
      'T-Shirt': 'T-shirt Client',
      'Hoodie': 'Hoodie Client',
      'Pantalon': 'Pantalon Client',
      'Chemise': 'Chemise Client',
      'Casquette': 'Casquette Client',
      'Bonnet': 'Bonnet Client',
      'Mug': 'Objet Client',
      'Bracelet': 'Objet Client',
      'Sticker': 'Sticker Client',
      'Lithographie': 'Affiche Client',
      'Livre': 'Livre Disque Client',
             'Photographie': 'Affiche Client',
       'Coque': 'Objet Client',
       'Autre': 'Autre produit',
       
       // POD products (Print on Demand)
      // POD uses same physical products as Merch but different business model
      'POD_T-Shirt': 'T-shirt Client',
      'POD_Hoodie': 'Hoodie Client',
      'POD_Pantalon': 'Pantalon Client', 
      'POD_Chemise': 'Chemise Client',
      'POD_Casquette': 'Casquette Client',
      'POD_Mug': 'Objet Client',
      'POD_Bracelet': 'Objet Client',
      'POD_Sticker': 'Sticker Client',
      'POD_Lithographie': 'Affiche Client',
      'POD_Livre': 'Livre Disque Client',
             'POD_Photographie': 'Affiche Client',
       'POD_Coque': 'Objet Client',
       'POD_Autre': 'Autre produit',
     };

    // Create lookup key based on product type and specific product
    let lookupKey = prod.produit;
    if (prod.typeProduit === 'POD') {
      lookupKey = `POD_${prod.produit}`;
    }
    
    // Return mapped value or fallback
    const mappedType = productTypeMapping[lookupKey];
    if (mappedType) {
      log(`    - Mapped ${prod.typeProduit}/${prod.produit} to: ${mappedType}`);
      return mappedType;
    } else {
      log(`    - WARNING: No mapping found for ${prod.typeProduit}/${prod.produit}, using fallback: Autre produit`);
      return 'Autre produit'; // Default fallback that exists in the enum
    }
  };
  
  // The API expects an array of items, so we create one for each variant.
  const items = [];
  const combinations = generateCombinations(product);
  log(`    - Generated ${combinations.length} variant combinations.`);

  for (const combo of combinations) {
    log(`      - Processing combination: ${combo.key}`);
    const sku = product.skus ? product.skus[combo.key] : undefined;
    let ean = product.eans ? product.eans[combo.key] : undefined;
    
    // Fallback to codeEAN if eans is empty (for backward compatibility)
    if (!ean && product.codeEAN) {
      ean = product.codeEAN;
      log(`        - Using codeEAN as fallback: ${ean}`);
    }

    if (!sku) {
      log(`        - ERROR: SKU is missing for combination ${combo.key}. This is a required field for the EC API.`);
      throw new Error(`SKU is missing for product variant "${combo.key}". All variants must have a valid SKU.`);
    }
    if (!ean) {
      log(`        - WARNING: EAN is missing for combination ${combo.key}.`);
    }

    // Validate EAN13 format and checksum
    const isEanValid = isValidEAN13(ean);
    if (ean && !isEanValid) {
      log(`        - WARNING: Invalid EAN13 code for combination ${combo.key}: "${ean}". Will send empty barCode.`);
      // Do not throw; barCode will be set to "" via isEanValid flag
    }

    const item = {
      // --- Required fields ---
      productType: getExternalProductType(product),
      CptClient: (customer.CompteClientNumber || '').toString().padStart(6, '0').substring(0, 6), // Exactly 6 characters
      sku: sku || '',
      title: (product.titre || '').substring(0, 70),
      CN23Label: (product.titre || '').substring(0, 30), // Simple default, might need refinement
      custodyCode: '00000000', // Exactly 8 characters as required
      
      // --- Optional fields (examples) ---
      artist: (shop.artistName || customer.raisonSociale || '').substring(0, 70),
      barCode: isEanValid ? ean : '', // Only include if valid EAN13
      description: (product.description || '').substring(0, 255),
      size: combo.size || undefined,
      color: combo.color || undefined,
      itemClassification: product.typeProduit, // e.g., 'Merch', 'Phono'
      marketingDate: shop.dateSortie ? new Date(shop.dateSortie).toISOString().split('T')[0] : undefined,
      Boutique: (shop.nomProjet || shop.name || '').substring(0, 100),
      occ: product.occ || false,
      
      // Fields to confirm:
      // AnalytiqueClient1, AnalytiqueClient2, CptClientIntermediaire, etc.
    };

    // Validate each field according to API requirements
    log(`        - Item validation for ${combo.key}:`);
    log(`          productType: "${item.productType}" (required)`);
    log(`          CptClient: "${item.CptClient}" (required, 6 chars, actual: ${item.CptClient.length})`);
    log(`          sku: "${item.sku}" (required, max 38 chars, actual: ${item.sku.length})`);
    log(`          title: "${item.title}" (required, max 70 chars, actual: ${item.title.length})`);
    log(`          CN23Label: "${item.CN23Label}" (required, max 30 chars, actual: ${item.CN23Label.length})`);
    log(`          custodyCode: "${item.custodyCode}" (required, max 8 chars, actual: ${item.custodyCode.length})`);
    log(`          barCode: "${item.barCode}" (max 13 chars, actual: ${item.barCode.length}, valid EAN13: ${isEanValid})`);
    log(`          artist: "${item.artist}" (max 70 chars, actual: ${item.artist.length})`);
    log(`          description: "${item.description}" (max 255 chars, actual: ${item.description.length})`);

    // Check for any field length violations
    if (item.CptClient.length !== 6) log(`          ❌ CptClient must be exactly 6 characters`);
    if (item.sku.length > 38) log(`          ❌ SKU exceeds 38 character limit`);
    if (item.title.length > 70) log(`          ❌ Title exceeds 70 character limit`);
    if (item.CN23Label.length > 30) log(`          ❌ CN23Label exceeds 30 character limit`);
    if (item.custodyCode.length > 8) log(`          ❌ custodyCode exceeds 8 character limit`);
    if (item.barCode && item.barCode.length > 13) log(`          ❌ barCode exceeds 13 character limit`);
    if (item.artist.length > 70) log(`          ❌ artist exceeds 70 character limit`);
    if (item.description.length > 255) log(`          ❌ description exceeds 255 character limit`);

    items.push(item);
  }
  
  return items;
};

const generateCombinations = (product) => {
  const sizes = product.tailles || [];
  const colors = product.couleurs || [];
  const combinations = [];

  if (sizes.length > 0 && colors.length > 0) {
    sizes.forEach(size => {
      colors.forEach(color => {
        combinations.push({ key: `${size}-${color}`, size, color });
      });
    });
  } else if (sizes.length > 0) {
    sizes.forEach(size => {
      combinations.push({ key: size, size, color: null });
    });
  } else if (colors.length > 0) {
    colors.forEach(color => {
      combinations.push({ key: color, size: null, color });
    });
  } else {
    combinations.push({ key: 'default', size: null, color: null });
  }
  return combinations;
};

const importItemsToEC = async (products, shop, customer, log) => {
  const API_BASE_URL = process.env.EC_API_BASE_URL;
  const login = process.env.EC_API_LOGIN;
  const password = process.env.EC_API_PASSWORD;
  const user = process.env.EC_API_USER || customer.raisonSociale;
  const customerAccount = customer.CompteClientNumber; // Fetched from the customer document

  log('Checking for required EC API credentials...');
  log(`Environment variables check:`);
  log(`  EC_API_BASE_URL: ${API_BASE_URL ? `"${API_BASE_URL}" (length: ${API_BASE_URL.length})` : 'UNDEFINED/EMPTY'}`);
  log(`  EC_API_LOGIN: ${login ? `"${login}" (length: ${login.length})` : 'UNDEFINED/EMPTY'}`);
  log(`  EC_API_PASSWORD: ${password ? `"${password.substring(0, 3)}***" (length: ${password.length})` : 'UNDEFINED/EMPTY'}`);
  log(`  EC_API_USER: ${user ? `"${user}" (length: ${user.length})` : 'UNDEFINED/EMPTY'}`);
  log(`  process.env.NODE_ENV: ${process.env.NODE_ENV || 'UNDEFINED'}`);
  log(`  Current working directory: ${process.cwd()}`);
  
  // Also log all environment variables that start with EC_
  log('All EC_* environment variables:');
  Object.keys(process.env).filter(key => key.startsWith('EC_')).forEach(key => {
    const value = process.env[key];
    if (key.includes('PASSWORD')) {
      log(`  ${key}: ${value ? `"${value.substring(0, 3)}***" (length: ${value.length})` : 'UNDEFINED/EMPTY'}`);
    } else {
      log(`  ${key}: ${value ? `"${value}" (length: ${value.length})` : 'UNDEFINED/EMPTY'}`);
    }
  });

  if (!API_BASE_URL || !login || !password) {
    log('ERROR: Missing required EC API credentials in .env file.');
    log(`Details: API_BASE_URL=${!!API_BASE_URL}, login=${!!login}, password=${!!password}`);
    throw new Error('Missing required EC API credentials (URL, login, password) in environment variables.');
  }
  if (!customerAccount) {
    log(`ERROR: Missing CompteClientNumber for customer ${customer.raisonSociale}.`);
    throw new Error(`Le numéro de compte client (CompteClientNumber) est manquant pour le client ${customer.raisonSociale}.`);
  }
  log('Credentials check passed.');

  log('Mapping products to EC items...');
  const allItems = products.flatMap(p => mapProductToItem(p, shop, customer, log));
  log(`Total items to import: ${allItems.length}`);
  
  if (allItems.length === 0) {
    logger.debug('No items to import to EC.');
    return { success: true, message: 'No items needed to be sent.' };
  }

  // For logging, create a sanitized version of the parameters
  const queryParamsForLog = {
    CustomerAccount: customerAccount,
    Login: login,
    Password: '***', // Mask password for security
    uploadType: 'User',
    User: user
  };
  log(`Query Parameters prepared for request: ${JSON.stringify(queryParamsForLog, null, 2)}`);

  const fullApiUrl = `${API_BASE_URL}/api-v1/item?CustomerAccount=${encodeURIComponent(customerAccount)}&Login=${encodeURIComponent(login)}&Password=${encodeURIComponent(password)}&uploadType=User&User=${encodeURIComponent(user)}`;

  const requestHeaders = {
    'Content-Type': 'application/json',
    'User-Agent': 'SNA-GZ-Portal/1.0'
  };

  const importResults = {
    successCount: 0,
    failCount: 0,
    errors: [],
    successData: [],
  };

  log(`--- Starting variant-by-variant import for ${allItems.length} items ---`);

  for (const item of allItems) {
    const requestBody = [item]; // API expects an array of items
    log(`\n--- Sending Variant (SKU: ${item.sku}) ---`);
    log(`URL: ${fullApiUrl}`);
    log(`HEADERS: ${JSON.stringify(requestHeaders, null, 2)}`);
    log(`BODY: ${JSON.stringify(requestBody, null, 2)}`);
    log('-------------------------------------------');

    try {
      const response = await axios.post(fullApiUrl, requestBody, { headers: requestHeaders, timeout: 0 });
      log(`✅ SUCCESS for SKU: ${item.sku}. Status: ${response.status}`);
      importResults.successCount++;
      if(response.data) {
        importResults.successData.push(response.data);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'An unknown error occurred';
      log(`❌ FAILED for SKU: ${item.sku}. Reason: ${errorMessage}`);
      importResults.failCount++;
      importResults.errors.push({ sku: item.sku, error: errorMessage });
    }
  }

  log(`\n--- Import Process Complete ---`);
  log(`Successfully imported: ${importResults.successCount}`);
  log(`Failed to import: ${importResults.failCount}`);
  log(`-----------------------------`);

  if (importResults.failCount > 0) {
    const errorSummary = importResults.errors.map(e => `SKU ${e.sku}: ${e.error}`).join('; ');
    throw new Error(`Failed to import ${importResults.failCount} variant(s). Details: ${errorSummary}`);
  }

  return { 
    success: true, 
    message: `Successfully imported ${importResults.successCount} variants.`, 
    data: importResults.successData 
  };
};

module.exports = { importItemsToEC };
