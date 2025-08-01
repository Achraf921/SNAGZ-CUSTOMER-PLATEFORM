const { ClientSecretCredential } = require("@azure/identity");
const { logger } = require('../utils/secureLogger');
const { Client } = require("@microsoft/microsoft-graph-client");
const { Document, Packer, Paragraph, TextRun } = require("docx");
const ExcelJS = require("exceljs");
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getCustomersCollection } = require('../config/db');
require("isomorphic-fetch");

// Ensure these env vars are set
const tenantId = process.env.SHAREPOINT_TENANT_ID;
const clientId = process.env.SHAREPOINT_CLIENT_ID;
const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;
const hostname = process.env.SHAREPOINT_HOSTNAME;
const sitePath = process.env.SHAREPOINT_SITE_PATH;

// Create the credential
const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

// Initialize the Graph client
const graphClient = Client.init({
  authProvider: async (done) => {
    try {
      const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
      done(null, tokenResponse.token);
    } catch (err) {
      done(err, null);
    }
  }
});

async function getSite() {
  try {
    logger.debug('Attempting to get SharePoint site...');
    const site = await graphClient.api(`/sites/${hostname}:${sitePath}`).get();
    logger.debug('Successfully retrieved SharePoint site');
    return site;
  } catch (error) {
    logger.error('Error getting SharePoint site:', error);
    throw error;
  }
}

async function getDrive(siteId) {
  try {
    logger.debug('Attempting to get SharePoint drive for site:', siteId);
    const drive = await graphClient.api(`/sites/${siteId}/drive`).get();
    logger.debug('Successfully retrieved SharePoint drive');
    return drive;
  } catch (error) {
    logger.error('Error getting SharePoint drive:', error);
    throw error;
  }
}

async function getOrCreateFolder(driveId, parentFolderId, folderName) {
  try {
    logger.debug('Creating/Getting folder:', folderName);
    const childrenApi = parentFolderId
      ? `/drives/${driveId}/items/${parentFolderId}/children`
      : `/drives/${driveId}/root/children`;
    
    const list = await graphClient.api(childrenApi).get();
    const found = list.value.find(
      (f) => f.folder && f.name.toUpperCase() === folderName.toUpperCase()
    );
    
    if (found) {
      logger.debug('Found existing folder');
      return found;
    }
    
    logger.debug('Creating new folder');
    const folder = await graphClient
      .api(childrenApi)
      .post({ name: folderName, folder: {}, "@microsoft.graph.conflictBehavior": "rename" });
    
    logger.debug('Successfully created folder');
    return folder;
  } catch (error) {
    logger.error('Error with folder operation:', error);
    throw error;
  }
}

// Helper function to determine MIME type based on file extension
function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.txt': 'text/plain',
    '.csv': 'text/csv'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

async function uploadFile(driveId, parentId, fileName, content, contentType, retryCount = 0) {
  try {
    logger.debug('Uploading file:', fileName);
    const url = `/drives/${driveId}/items/${parentId}:/${fileName}:/content`;
    await graphClient.api(url).headers({ "Content-Type": contentType }).put(content);
    logger.debug('Successfully uploaded file');
  } catch (error) {
    logger.error('Error uploading file:', error);
    
    // If it's a resource locked error and we haven't retried too many times
    if (error.statusCode === 423 && retryCount < 3) {
      logger.debug(`File locked, retrying in ${(retryCount + 1) * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
      return uploadFile(driveId, parentId, fileName, content, contentType, retryCount + 1);
    }
    
    throw error;
  }
}

async function findExistingCustomerFolder(driveId, compteClientNumber) {
  try {
    logger.debug(`Searching for existing customer folder containing: ${compteClientNumber}`);
    
    if (!compteClientNumber || compteClientNumber === 'NOCLIENTNUM') {
      logger.debug('No valid CompteClientNumber provided, skipping search');
      return null;
    }
    
    // Get all folders in the root of the drive
    const response = await graphClient.api(`/drives/${driveId}/root/children`).get();
    const folders = response.value.filter(item => item.folder);
    
    logger.debug(`Found ${folders.length} folders in SharePoint root`);
    
    // Search for a folder that contains the CompteClientNumber in its name
    const matchingFolder = folders.find(folder => 
      folder.name.includes(compteClientNumber)
    );
    
    if (matchingFolder) {
      logger.debug(`Found existing customer folder: ${matchingFolder.name}`);
      return matchingFolder;
    } else {
      logger.debug(`No existing folder found containing CompteClientNumber: ${compteClientNumber}`);
      return null;
    }
  } catch (error) {
    logger.error('Error searching for existing customer folder:', error);
    // Don't throw error, just return null to fall back to creating new folder
    return null;
  }
}

// Helper function to find existing shop folder by name within customer folder
async function findExistingShopFolder(driveId, customerFolderId, shopFolderName) {
  try {
    logger.debug(`Searching for existing shop folder: ${shopFolderName} in customer folder: ${customerFolderId}`);
    
    // Get all folders in customer folder
    const response = await graphClient.api(`/drives/${driveId}/items/${customerFolderId}/children`).get();
    
    logger.debug(`Found ${response.value.length} items in customer folder`);
    
    // Log all folder names for debugging
    const folderNames = response.value.filter(item => item.folder).map(item => item.name);
    logger.debug(`Available shop folders: ${JSON.stringify(folderNames)}`);
    
    // Find shop folder by exact name match
    let shopFolder = response.value.find(item => 
      item.folder && item.name === shopFolderName
    );
    
    // If exact match not found, try partial match (for backward compatibility)
    if (!shopFolder) {
      logger.debug(`Exact match not found for: ${shopFolderName}, trying partial match...`);
      
      // Try different matching strategies
      const compteNumber = shopFolderName.split('_')[0]; // Extract the compte number
      logger.debug(`Looking for folders containing compte number: ${compteNumber}`);
      
      shopFolder = response.value.find(item => 
        item.folder && item.name.includes(compteNumber)
      );
      
      // If still not found, try looser matching
      if (!shopFolder) {
        shopFolder = response.value.find(item => 
          item.folder && (
            item.name.includes(shopFolderName.substring(0, 15)) || 
            shopFolderName.includes(item.name.substring(0, 15))
          )
        );
      }
    }
    
    if (shopFolder) {
      logger.debug(`Found existing shop folder: ${shopFolder.name}`);
      return shopFolder;
    }
    
    logger.debug(`No existing shop folder found for: ${shopFolderName}`);
    return null;
    
  } catch (error) {
    logger.error('Error searching for shop folder:', error);
    return null;
  }
}

async function createBoxMediaStructure(driveId, parentFolderId, customer, shop) {
  try {
    logger.debug('Creating Box Media folder structure...');
    
    // Helper function to format dates as YYYY/MM/DD 
    const formatDateYYYYMMDD = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${year}/${month}/${day}`;
    };
    
    // Create Box Media folder with dynamic naming
    const raisonSocialeForFolder = (customer.raisonSociale || 'CLIENT').toUpperCase().replace(/[^a-zA-Z0-9]/g, '_');
    const nomProjetForFolder = (shop.nomProjet || 'PROJET').toUpperCase().replace(/[^a-zA-Z0-9]/g, '_');
    const boxMediaFolderName = `BOX MÉDIA _ ${raisonSocialeForFolder} _ ${nomProjetForFolder}`;
    
    const boxMediaFolder = await getOrCreateFolder(driveId, parentFolderId, boxMediaFolderName);
    
    // Create Web-Design folder and its subfolders
    const webDesignFolder = await getOrCreateFolder(driveId, boxMediaFolder.id, 'Web-Design');
    
    const webDesignSubFolders = [
      'Bannière - Home Page',
      'Favicon',
      'Logo',
      'Palette Couleurs',
      'Typo'
    ];
    
    for (const folderName of webDesignSubFolders) {
      await getOrCreateFolder(driveId, webDesignFolder.id, folderName);
    }
    
    // Process and upload Web-Design template file
    const webDesignTemplateDir = path.join(__dirname, 'FileWebDesign');
    const webDesignTemplateFile = 'Intro - Textes _ CLIENT _ PROJET.docx';
    const webDesignTemplatePath = path.join(webDesignTemplateDir, webDesignTemplateFile);
    
    if (fs.existsSync(webDesignTemplatePath)) {
      const webDesignOutputName = `Intro - Textes _ ${raisonSocialeForFolder} _ ${nomProjetForFolder}.docx`;
      const processedWebDesignPath = path.join(webDesignTemplateDir, `PROCESSED_${webDesignOutputName}`);
      
      // Prepare shop data for processing (same format as main DOCX)
      const shopDataForWebDesign = JSON.stringify({
        nomProjet: shop.nomProjet, // XXX1
        typeProjet: shop.typeProjet, // XXX2
        contactsClient: shop.contactsClient, // XXX3
        nomClient: customer.raisonSociale || customer.name || '', // XXX4
        compteClientRef: shop.compteClientRef || customer.CompteClientNumber, // XXX5
        dateMiseEnLigne: formatDateYYYYMMDD(shop.dateMiseEnLigne), // XXX7
        dateCommercialisation: formatDateYYYYMMDD(shop.dateCommercialisation), // XXX8
        dateSortieOfficielle: formatDateYYYYMMDD(shop.dateSortieOfficielle), // XXX9
        precommande: shop.precommande ? 'OUI' : 'NON', // XXX10
        dedicaceEnvisagee: shop.dedicaceEnvisagee ? 'OUI' : 'NON', // XXX11
        estBoutiqueEnLigne: shop.estBoutiqueEnLigne ? 'OUI' : 'NON', // XXX12
        chefProjet: `${shop.prenomChefProjet || ''} ${shop.nomChefProjet || ''}`.trim(), // XXX13
        demarrageProjet: formatDateYYYYMMDD(shop.demarrageProjet), // XXX14
        // Additional fields for backwards compatibility
        commercial: shop.commercial,
        raisonSociale: customer.raisonSociale,
        shopifyPlanMonthlySelected: shop.typeAbonnementShopify === 'mensuel',
        shopifyPlanYearlySelected: shop.typeAbonnementShopify === 'annuel',
        // Fields for conditional strikethrough
        typeAbonnementShopify: shop.typeAbonnementShopify || '',
        moduleMondialRelay: !!shop.moduleMondialRelay,
        moduleDelivengo: !!shop.moduleDelivengo,
      });

      const encodedWebDesignData = Buffer.from(shopDataForWebDesign).toString('base64');

      // Process the Web-Design DOCX file using Python script
      await new Promise((resolve, reject) => {
        const command = `python3 "${path.join(__dirname, 'docx_processor.py')}" "${webDesignTemplatePath}" "${encodedWebDesignData}" "${processedWebDesignPath}"`;
        logger.debug(`Processing Web-Design DOCX: ${command}`);

        exec(command, (error, stdout, stderr) => {
          if (error) {
            logger.error(`Web-Design DOCX processing error: ${error}`);
            logger.error(`Python stderr: ${stderr}`);
            return reject(`Failed to process Web-Design DOCX: ${error.message}`);
          }
          if (stderr) {
            logger.warn(`Python stderr: ${stderr}`);
          }
          logger.debug(`Python stdout: ${stdout}`);
          resolve();
        });
      });

      // Upload the processed Web-Design file
      if (fs.existsSync(processedWebDesignPath)) {
        const processedWebDesignContent = fs.readFileSync(processedWebDesignPath);
        await uploadFile(
          driveId,
          webDesignFolder.id,
          webDesignOutputName,
          processedWebDesignContent,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        logger.debug('Processed Web-Design template file uploaded successfully');
        // Clean up temporary file
        fs.unlinkSync(processedWebDesignPath);
      } else {
        logger.warn(`Processed Web-Design file not found at ${processedWebDesignPath}`);
      }
    }
    
    // Create Web-Merchandising folder and its subfolders
    const webMerchFolder = await getOrCreateFolder(driveId, boxMediaFolder.id, 'Web-Merchandising');
    
    const webMerchSubFolders = [
      'CD',
      'MERCH',
      'Pack 1',
      'Pack 2',
      'VINYLE'
    ];
    
    for (const folderName of webMerchSubFolders) {
      await getOrCreateFolder(driveId, webMerchFolder.id, folderName);
    }
    
    // Process and upload Web-Merchandising template file with product data
    const webMerchTemplateDir = path.join(__dirname, 'FichesProduitTemplate');
    const webMerchTemplateFile = 'FICHES.PRODUITS_SHOPIFY_CLIENT_PROJET.xlsx';
    const webMerchTemplatePath = path.join(webMerchTemplateDir, webMerchTemplateFile);
    
    if (fs.existsSync(webMerchTemplatePath)) {
      const webMerchOutputName = `FICHES.PRODUITS_SHOPIFY_${raisonSocialeForFolder}_${nomProjetForFolder}.xlsx`;
      const processedWebMerchPath = path.join(webMerchTemplateDir, `PROCESSED_${webMerchOutputName}`);
      
      // Prepare shop data with products for merchandising
      const shopDataForWebMerch = JSON.stringify({
        nomProjet: shop.nomProjet,
        shopifyDomain: shop.shopifyDomain || '',
        raisonSociale: customer.raisonSociale,
        dateSortieOfficielle: shop.dateSortieOfficielle,
        dateCommercialisation: shop.dateCommercialisation,
        dateMiseEnLigne: shop.dateMiseEnLigne,
        products: shop.products || []
      });

      const encodedWebMerchData = Buffer.from(shopDataForWebMerch).toString('base64');

      // Process the Web-Merchandising XLSX file using specialized merchandising Python script
      await new Promise((resolve, reject) => {
        const command = `python3 "${path.join(__dirname, 'merch_xlsx_processor.py')}" "${webMerchTemplatePath}" "${encodedWebMerchData}" "${processedWebMerchPath}"`;
        logger.debug(`Processing Web-Merchandising XLSX with products: ${command}`);

        exec(command, (error, stdout, stderr) => {
          if (error) {
            logger.error(`Web-Merchandising XLSX processing error: ${error}`);
            logger.error(`Python stderr: ${stderr}`);
            return reject(`Failed to process Web-Merchandising XLSX: ${error.message}`);
          }
          if (stderr) {
            logger.warn(`Python stderr: ${stderr}`);
          }
          logger.debug(`Python stdout: ${stdout}`);
          resolve();
        });
      });

      // Upload the processed Web-Merchandising file
      if (fs.existsSync(processedWebMerchPath)) {
        const processedWebMerchContent = fs.readFileSync(processedWebMerchPath);
        await uploadFile(
          driveId,
          webMerchFolder.id,
          webMerchOutputName,
          processedWebMerchContent,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        logger.debug('Processed Web-Merchandising template file uploaded successfully');
        
        // Mark all products as documented after successful merchandising generation
        if (shop.products && shop.products.length > 0) {
          try {
            const customersCollection = await getCustomersCollection();
            
            // Update all products in this shop to mark them as documented
            const updateOperations = {};
            shop.products.forEach((product, index) => {
              updateOperations[`shops.$.products.${index}.documented`] = true;
            });
            
            // Find customer by either _id or userId
            let updateQuery;
            if (customer._id) {
              updateQuery = { _id: customer._id, 'shops.shopId': shop.shopId };
            } else {
              updateQuery = { userId: customer.userId, 'shops.shopId': shop.shopId };
            }
            
            const result = await customersCollection.updateOne(
              updateQuery,
              { $set: updateOperations }
            );
            
            if (result.modifiedCount > 0) {
              logger.debug(`Successfully marked ${shop.products.length} products as documented for shop ${shop.shopId}`);
            } else {
              logger.warn(`Failed to update product documentation status for shop ${shop.shopId}`);
            }
          } catch (updateError) {
            logger.error('Error updating product documentation status:', updateError);
            // Don't throw error - continue with documentation generation
          }
        }
        
        // Clean up temporary file
        fs.unlinkSync(processedWebMerchPath);
      } else {
        logger.warn(`Processed Web-Merchandising file not found at ${processedWebMerchPath}`);
      }
    }
    
    // Copy PDFs from BoxMediaPDFS directory to the root of Box Media folder
    const pdfsDir = path.join(__dirname, 'BoxMediaPDFS');
    const pdfFiles = fs.readdirSync(pdfsDir).filter(file => file.endsWith('.pdf'));
    
    for (const pdfFile of pdfFiles) {
      const pdfPath = path.join(pdfsDir, pdfFile);
      const pdfContent = fs.readFileSync(pdfPath);
      
      await uploadFile(
        driveId,
        boxMediaFolder.id,
        pdfFile,
        pdfContent,
        'application/pdf'
      );
    }
    
    // Create IMPORTANT folder and upload files from ImportantSharePoint
    const importantFolder = await getOrCreateFolder(driveId, boxMediaFolder.id, 'IMPORTANT');
    const importantDir = path.join(__dirname, 'ImportantSharePoint');
    
    if (fs.existsSync(importantDir)) {
      const importantFiles = fs.readdirSync(importantDir);
      logger.debug(`Found ${importantFiles.length} files in ImportantSharePoint directory`);
      
      for (const fileName of importantFiles) {
        const filePath = path.join(importantDir, fileName);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
          const fileContent = fs.readFileSync(filePath);
          const mimeType = getMimeType(fileName);
          
          await uploadFile(
            driveId,
            importantFolder.id,
            fileName,
            fileContent,
            mimeType
          );
          logger.debug(`Uploaded ${fileName} to IMPORTANT folder`);
        }
      }
    }
    
    // Create CONTENU - Pages d'information folder and upload files from ContenuSharePoint
    const contenuFolder = await getOrCreateFolder(driveId, boxMediaFolder.id, 'CONTENU - Pages d\'information');
    const contenuDir = path.join(__dirname, 'ContenuSharePoint');
    
    if (fs.existsSync(contenuDir)) {
      const contenuFiles = fs.readdirSync(contenuDir);
      logger.debug(`Found ${contenuFiles.length} files in ContenuSharePoint directory`);
      
      for (const fileName of contenuFiles) {
        const filePath = path.join(contenuDir, fileName);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile()) {
          const fileContent = fs.readFileSync(filePath);
          const mimeType = getMimeType(fileName);
          
          await uploadFile(
            driveId,
            contenuFolder.id,
            fileName,
            fileContent,
            mimeType
          );
          logger.debug(`Uploaded ${fileName} to CONTENU - Pages d'information folder`);
        }
      }
    }
    
    logger.debug('Box Media folder structure created successfully');
    return boxMediaFolder;
  } catch (error) {
    logger.error('Error creating Box Media structure:', error);
    throw error;
  }
}

async function createCGVFolder(driveId, parentFolderId) {
  try {
    logger.debug('Creating CGV & Politiques folder...');
    
    // Create CGV & Politiques folder
    const cgvFolder = await getOrCreateFolder(driveId, parentFolderId, 'CGV & Politiques');
    
    // Try to copy CGV document from local directory if it exists
    const cgvDir = path.join(__dirname, 'CGVDocx');
    const cgvFile = 'Modèle CGV _ SNA.Vendeur.docx';
    const cgvPath = path.join(cgvDir, cgvFile);
    
    try {
      if (fs.existsSync(cgvPath)) {
        const cgvContent = fs.readFileSync(cgvPath);
        await uploadFile(
          driveId,
          cgvFolder.id,
          cgvFile,
          cgvContent,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        logger.debug('CGV document uploaded successfully');
      } else {
        logger.debug('CGV document not found in local directory, skipping upload');
      }
    } catch (uploadError) {
      logger.error('Error uploading CGV document:', uploadError);
      // Continue execution even if document upload fails
    }
    
    logger.debug('CGV & Politiques folder created successfully');
    return cgvFolder;
  } catch (error) {
    logger.error('Error creating CGV folder:', error);
    throw error;
  }
}

async function createContratFolder(driveId, parentFolderId) {
  try {
    logger.debug('Creating CONTRAT folder...');
    
    // Create CONTRAT folder (renamed from CONTRAT SIGNÉ) with grey color
    const contratFolder = await getOrCreateFolder(driveId, parentFolderId, 'CONTRAT');
    
    logger.debug('CONTRAT folder created successfully');
    return contratFolder;
  } catch (error) {
    logger.error('Error creating CONTRAT folder:', error);
    throw error;
  }
}

async function createRetroplanningFolder(driveId, parentFolderId) {
  try {
    logger.debug('Creating OFFRE RETROPLANNING D2C folder...');
    
    // Create OFFRE RETROPLANNING D2C folder (green)
    const retroplanningFolder = await getOrCreateFolder(driveId, parentFolderId, 'OFFRE RETROPLANNING D2C');
    
    // Upload all files from RetroplanningSharePoint directory
    const retroplanningDir = path.join(__dirname, 'RetroplanningSharePoint');
    
    try {
      if (fs.existsSync(retroplanningDir)) {
        const files = fs.readdirSync(retroplanningDir);
        logger.debug(`Found ${files.length} files in RetroplanningSharePoint directory`);
        
        for (const fileName of files) {
          const filePath = path.join(retroplanningDir, fileName);
          const stat = fs.statSync(filePath);
          
          if (stat.isFile()) {
            const fileContent = fs.readFileSync(filePath);
            const mimeType = getMimeType(fileName);
            
            await uploadFile(
              driveId,
              retroplanningFolder.id,
              fileName,
              fileContent,
              mimeType
            );
            logger.debug(`Uploaded ${fileName} to OFFRE RETROPLANNING D2C folder`);
          }
        }
      } else {
        logger.debug('RetroplanningSharePoint directory not found, skipping file uploads');
      }
    } catch (uploadError) {
      logger.error('Error uploading RetroplanningSharePoint files:', uploadError);
      // Continue execution even if file uploads fail
    }
    
    logger.debug('OFFRE RETROPLANNING D2C folder created successfully');
    return retroplanningFolder;
  } catch (error) {
    logger.error('Error creating OFFRE RETROPLANNING D2C folder:', error);
    throw error;
  }
}


async function checkDocumentationExists(customer, shop) {
  try {
    logger.debug('Checking if documentation already exists...');
    
    // Get site and drive
    const site = await getSite();
    const drive = await getDrive(site.id);
    
    // Create the same folder paths as generateDocumentation
    const compteClientNumber = customer.CompteClientNumber || 'NOCLIENTNUM';
    const raisonSociale = (customer.raisonSociale || customer.name || `Client_${customer._id.toString().substring(0, 8)}`).toUpperCase();
    const nomProjet = (shop.nomProjet || shop.name || `Shop_${shop.shopId.substring(0, 8)}`).toUpperCase();

    // Format: <CompteClientNumber>_<raisonSociale>
    const clientFolderName = `${compteClientNumber}_${raisonSociale}`.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Format: <CompteClientNumber>_<nomProjet>
    const shopFolderName = `${compteClientNumber}_${nomProjet}`.replace(/[^a-zA-Z0-9_]/g, '_');

    // Check if customer folder exists
    let clientFolder = await findExistingCustomerFolder(drive.id, compteClientNumber);
    if (!clientFolder) {
      logger.debug('No customer folder found, documentation does not exist');
      return false;
    }

    // Check if shop folder exists
    try {
      const shopFolderResponse = await graphClient.api(`/drives/${drive.id}/items/${clientFolder.id}/children`).get();
      const shopFolder = shopFolderResponse.value.find(item => 
        item.folder && item.name === shopFolderName
      );
      
      if (!shopFolder) {
        logger.debug('No shop folder found, documentation does not exist');
        return false;
      }

      // Check if key documentation files exist in the shop folder
      const shopContentsResponse = await graphClient.api(`/drives/${drive.id}/items/${shopFolder.id}/children`).get();
      const files = shopContentsResponse.value.filter(item => !item.folder);
      
      // Look for the main FICHE PROJET file
      const raisonSocialeForFilename = (customer.raisonSociale || 'CLIENT').replace(/[^a-zA-Z0-9]/g, '_');
      const nomProjetForFilename = (shop.nomProjet || 'PROJET').replace(/[^a-zA-Z0-9]/g, '_');
      const compteNumForFilename = (customer.CompteClientNumber || 'COMPTENUM').replace(/[^a-zA-Z0-9]/g, '_');
      const ficheProjetFilename = `FICHE PROJET_ ${raisonSocialeForFilename} _ ${nomProjetForFilename} _ ${compteNumForFilename} _Démarrage Projet.docx`;
      
      const ficheProjetExists = files.some(file => file.name === ficheProjetFilename);
      
      if (ficheProjetExists) {
        logger.debug('FICHE PROJET file found, documentation exists');
        return true;
      } else {
        logger.debug('FICHE PROJET file not found, documentation does not exist');
        return false;
      }
      
    } catch (error) {
      logger.debug('Error checking shop folder contents, assuming documentation does not exist');
      return false;
    }
    
  } catch (error) {
    logger.error('Error checking documentation existence:', error);
    // If we can't check, assume it doesn't exist to be safe
    return false;
  }
}

async function generateDocumentation(customer, shop, forceOverwrite = false) {
  try {
    logger.debug('Starting documentation generation...');
    
    // Check if documentation already exists and forceOverwrite is not set
    if (!forceOverwrite) {
      const exists = await checkDocumentationExists(customer, shop);
      if (exists) {
        throw new Error('DOCUMENTATION_EXISTS');
      }
    }
    
    // Get site and drive
    const site = await getSite();
    const drive = await getDrive(site.id);
    
    // Create customer folder with naming convention: <CompteClientNumber>_<raisonSociale (in caps)>
    const compteClientNumber = customer.CompteClientNumber || 'NOCLIENTNUM';
    const raisonSociale = (customer.raisonSociale || customer.name || `Client_${customer._id.toString().substring(0, 8)}`).toUpperCase();
    const nomProjet = (shop.nomProjet || shop.name || `Shop_${shop.shopId.substring(0, 8)}`).toUpperCase();

    // Format: <CompteClientNumber>_<raisonSociale>
    const clientFolderName = `${compteClientNumber}_${raisonSociale}`.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Format: <CompteClientNumber>_<nomProjet>
    const shopFolderName = `${compteClientNumber}_${nomProjet}`.replace(/[^a-zA-Z0-9_]/g, '_');

    // First, try to find an existing customer folder that contains this CompteClientNumber
    let clientFolder = await findExistingCustomerFolder(drive.id, compteClientNumber);
    
    if (!clientFolder) {
      // No existing folder found, create a new one
      logger.debug(`Creating new customer folder: ${clientFolderName}`);
      clientFolder = await getOrCreateFolder(drive.id, null, clientFolderName);
    } else {
      logger.debug(`Using existing customer folder: ${clientFolder.name}`);
    }
    
    const shopFolder = await getOrCreateFolder(drive.id, clientFolder.id, shopFolderName);

    // Create Box Media structure with new folders
    await createBoxMediaStructure(drive.id, shopFolder.id, customer, shop);

    // Create CONTRAT folder (renamed from CONTRAT SIGNÉ) with grey color
    await createContratFolder(drive.id, shopFolder.id);

    // Create OFFRE RETROPLANNING D2C folder (green) with content
    await createRetroplanningFolder(drive.id, shopFolder.id);

    // Define the path to your DOCX template and the output path for the processed document
    const docxTemplatePath = path.join(__dirname, 'DocxAModifier', 'FICHE PROJET_ CLIENT _ PROJET _ COMPTENUM _Démarrage Projet.docx');
    
    // Generate output filename with CLIENT replaced by raison sociale, PROJET replaced by nom projet, and COMPTENUM replaced by CompteClientNumber
    const raisonSocialeForFilename = (customer.raisonSociale || 'CLIENT').replace(/[^a-zA-Z0-9]/g, '_');
    const nomProjetForFilename = (shop.nomProjet || 'PROJET').replace(/[^a-zA-Z0-9]/g, '_');
    const compteNumForFilename = (customer.CompteClientNumber || 'COMPTENUM').replace(/[^a-zA-Z0-9]/g, '_');
    const outputFilename = `FICHE PROJET_ ${raisonSocialeForFilename} _ ${nomProjetForFilename} _ ${compteNumForFilename} _Démarrage Projet.docx`;
    const processedDocxPath = path.join(__dirname, 'DocxAModifier', `PROCESSED_${outputFilename}`);

    // Helper function to format dates as YYYY/MM/DD for Fiche Projet
    const formatDateYYYYMMDD = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${year}/${month}/${day}`;
    };

    // Helper function to format dates as DD/MM/YYYY for date de mise en ligne
    const formatDateDDMMYYYY = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // Prepare shop data as a JSON string for the Python script
    const shopDataJson = JSON.stringify({
      nomProjet: shop.nomProjet, // XXX1
      typeProjet: shop.typeProjet, // XXX2
      contactsClient: shop.contactsClient, // XXX3
      nomClient: customer.raisonSociale || customer.name || '', // XXX4 - Client name
      compteClientRef: shop.compteClientRef || customer.CompteClientNumber, // XXX5 - Prefer shop reference
      dateMiseEnLigne: formatDateYYYYMMDD(shop.dateMiseEnLigne), // XXX7 - YYYY/MM/DD format
      dateCommercialisation: formatDateYYYYMMDD(shop.dateCommercialisation), // XXX8 - YYYY/MM/DD format
      dateSortieOfficielle: formatDateYYYYMMDD(shop.dateSortieOfficielle), // XXX9 - YYYY/MM/DD format
      precommande: shop.precommande ? 'OUI' : 'NON', // XXX10
      dedicaceEnvisagee: shop.dedicaceEnvisagee ? 'OUI' : 'NON', // XXX11
      estBoutiqueEnLigne: shop.estBoutiqueEnLigne ? 'OUI' : 'NON', // XXX12
      chefProjet: `${shop.prenomChefProjet || ''} ${shop.nomChefProjet || ''}`.trim(), // XXX13
      demarrageProjet: formatDateYYYYMMDD(shop.demarrageProjet), // XXX14 - YYYY/MM/DD format
      pourcentageSNA: shop.pourcentageSNA || '', // XXX69 - NEW: pourcentageSNA value
      dateMiseEnLigneDDMMYYYY: formatDateDDMMYYYY(shop.dateMiseEnLigne), // For specific box in fiche produit
      // Fields for conditional strikethrough
      typeAbonnementShopify: shop.typeAbonnementShopify || '',
      moduleMondialRelay: !!shop.moduleMondialRelay,
      moduleDelivengo: !!shop.moduleDelivengo,
      // Additional fields for backwards compatibility and other processing
      commercial: shop.commercial,
      clientName: clientFolderName,
      raisonSociale: customer.raisonSociale,
      // legacy flags kept for backward compatibility
      shopifyPlanMonthlySelected: shop.typeAbonnementShopify === 'mensuel',
      shopifyPlanYearlySelected: shop.typeAbonnementShopify === 'annuel',
    });

    // Base64 encode the JSON string to avoid shell escaping issues
    const encodedShopData = Buffer.from(shopDataJson).toString('base64');

    // Execute the Python script to process the DOCX
    await new Promise((resolve, reject) => {
      const command = `python3 "${path.join(__dirname, 'docx_processor.py')}" "${docxTemplatePath}" "${encodedShopData}" "${processedDocxPath}"`;
      logger.debug(`Executing Python command: ${command}`);

      exec(command, (error, stdout, stderr) => {
        if (error) {
          logger.error(`exec error: ${error}`);
          logger.error(`Python stderr: ${stderr}`);
          return reject(`Failed to process DOCX: ${error.message}`);
        }
        if (stderr) {
          logger.warn(`Python stderr: ${stderr}`);
        }
        logger.debug(`Python stdout: ${stdout}`);
        resolve();
      });
    });

    // Upload the processed DOCX file to the shop folder
    if (fs.existsSync(processedDocxPath)) {
      const processedDocxContent = fs.readFileSync(processedDocxPath);
      await uploadFile(
        drive.id,
        shopFolder.id,
        outputFilename,
        processedDocxContent,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      logger.debug(`Processed DOCX '${outputFilename}' uploaded successfully.`);
      // Clean up the temporary processed DOCX file
      fs.unlinkSync(processedDocxPath);
    } else {
      logger.warn(`Processed DOCX file not found at ${processedDocxPath}. Skipping upload.`);
    }

    // Generate Template_Questionaire_D2C.xlsx using the template from TemplateSharePoint
    const xlsxTemplatePath = path.join(__dirname, 'TemplateSharePoint', 'Template questionnaire D2C.xlsx');
    const xlsxOutputPath = path.join(__dirname, 'generated_docs', `Template_Questionaire_D2C_${customer.CompteClientNumber}_${Date.now()}.xlsx`);
    const xlsxOutputBasename = `Template_Questionaire_D2C.xlsx`;
    
    // Prepare shop data for template filling
    const templateData = {
      nomProjet: shop.nomProjet || '',
      typeProjet: shop.typeProjet || '',
      commercial: shop.commercial || '',
      boutiqueEnLigne: shop.estBoutiqueEnLigne === true ? 'OUI' : 'NON',
      client: customer.raisonSociale || '',
      contactsClient: shop.contactsClient || '',
      numeroCompteClient: customer.CompteClientNumber || '',
      dateMiseEnLigne: shop.dateMiseEnLigne || '',
      dateCommercialisation: shop.dateCommercialisation || '',
      dateSortieOfficielle: shop.dateSortieOfficielle || '',
      precommande: shop.precommande === 'OUI' ? 'OUI' : 'NON',
      dedicace: shop.dedicaceEnvisagee === 'OUI' ? 'OUI' : 'NON',
      facturation: 'vendeur', // Default to vendeur
      abonnementMensuelShopify: shop.shopifyPlanMonthlySelected === true ? 'OUI' : 'NON',
      abonnementAnnuelShopify: shop.shopifyPlanYearlySelected === true ? 'OUI' : 'NON',
      coutsMondialRelay: shop.moduleMondialRelay === true ? 'OUI' : 'NON',
      coutsDelivengo: shop.moduleDelivengo === true ? 'OUI' : 'NON',
      fraisMensuelMaintenance: '50€',
      fraisOuvertureBoutique: '500€',
      fraisOuvertureSansHabillage: '', // Leave empty as requested
      commissionSnagz: `${shop.pourcentageSNA || 0}%`
    };
    
    const encodedTemplateData = Buffer.from(JSON.stringify(templateData)).toString('base64');
    
    const templateCommand = `python3 "${path.join(__dirname, 'template_processor.py')}" "${xlsxTemplatePath}" "${encodedTemplateData}" "${xlsxOutputPath}"`;
    
    try {
      logger.debug('Executing Template D2C generation command:', templateCommand);
      const templateResult = await new Promise((resolve, reject) => {
        exec(templateCommand, (error, stdout, stderr) => {
          if (error) {
            logger.error('Template D2C generation error:', error);
            logger.error('Template stdout:', stdout);
            logger.error('Template stderr:', stderr);
            reject(error);
          } else {
            logger.debug('Template D2C generation completed successfully');
            resolve(stdout);
          }
        });
      });
      
      logger.debug('Template D2C processing result:', templateResult);
      
      // Upload the generated XLSX to SharePoint
      if (fs.existsSync(xlsxOutputPath)) {
        const xlsxContent = fs.readFileSync(xlsxOutputPath);
        await uploadFile(
          drive.id,
          shopFolder.id,
          xlsxOutputBasename,
          xlsxContent,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        logger.debug('Template_Questionaire_D2C.xlsx uploaded successfully');
        
        // Clean up temporary file
        fs.unlinkSync(xlsxOutputPath);
      }
    } catch (templateError) {
      logger.error('Error generating Template_Questionaire_D2C.xlsx:', templateError);
      // Continue with the rest of the process even if template generation fails
    }
    
    // Add Suivi Tâches.xlsx from SuiviTachesSharePoint directory
    try {
      const suiviTachesPath = path.join(__dirname, 'SuiviTachesSharePoint', 'Suivi Tâches.xlsx');
      if (fs.existsSync(suiviTachesPath)) {
        const suiviTachesContent = fs.readFileSync(suiviTachesPath);
    await uploadFile(
      drive.id,
      shopFolder.id,
          'Suivi Tâches.xlsx',
          suiviTachesContent,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        logger.debug('Suivi Tâches.xlsx uploaded successfully');
      }
    } catch (suiviError) {
      logger.error('Error uploading Suivi Tâches.xlsx:', suiviError);
      // Continue with the rest of the process
    }

    logger.debug('Documentation generated in SharePoint');
  } catch (error) {
    logger.error('Error generating documentation:', error);
    throw error;
  }
}

// Function to append products to existing Fiches Produits or create new one
// NOTE: This function requires SharePoint API permissions for:
// - Files.ReadWrite.All (to read/write files)
// - Sites.ReadWrite.All (to access site structure)
// - Directory.Read.All (for authentication)
async function appendToFichesProduitsOrCreate(customer, shop) {
  try {
    logger.debug('Starting Fiches Produits append/create process...');
    
    // Security: Validate input parameters
    if (!customer || !shop) {
      throw new Error('Invalid customer or shop data provided');
    }
    
    if (!customer._id || !customer.CompteClientNumber) {
      throw new Error('Customer missing required identification data');
    }
    
    if (!shop.shopId || !shop.products || shop.products.length === 0) {
      throw new Error('Shop missing required data or no products to document');
    }
    
    // Get site and drive with error handling
    let site, drive;
    try {
      site = await getSite();
      drive = await getDrive(site.id);
    } catch (error) {
      logger.error('Failed to connect to SharePoint:', error);
      throw new Error('Unable to connect to SharePoint service. Please check network connectivity.');
    }
    
    // Sanitize folder names for security
    const compteClientNumber = customer.CompteClientNumber || 'NOCLIENTNUM';
    const raisonSociale = (customer.raisonSociale || customer.name || `Client_${customer._id.toString().substring(0, 8)}`).toUpperCase();
    const nomProjet = (shop.nomProjet || shop.name || `Shop_${shop.shopId.substring(0, 8)}`).toUpperCase();

    // Security: Sanitize folder names to prevent path traversal
    const clientFolderName = `${compteClientNumber}_${raisonSociale}`.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 100);
    const shopFolderName = `${compteClientNumber}_${nomProjet}`.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 100);
    
    logger.debug(`🔍 FOLDER NAMES: Client='${clientFolderName}', Shop='${shopFolderName}'`);
    logger.debug(`🔍 RAW VALUES: CompteClient='${compteClientNumber}', RaisonSociale='${raisonSociale}', NomProjet='${nomProjet}'`);

    logger.debug(`Looking for customer folder: ${clientFolderName} and shop folder: ${shopFolderName}`);
    logger.debug(`🔍 DEBUG: Shop object keys: ${Object.keys(shop)}`);
    logger.debug(`🔍 DEBUG: shop.name: '${shop.name}', shop.nomProjet: '${shop.nomProjet}', shop.shopId: '${shop.shopId}'`);

    // Find existing customer folder with enhanced error handling
    let clientFolder;
    try {
      clientFolder = await findExistingCustomerFolder(drive.id, compteClientNumber);
      if (!clientFolder) {
        logger.error(`Customer folder not found for client: ${compteClientNumber}`);
        throw new Error(`Customer documentation folder not found. Please ensure initial documentation has been generated for client ${compteClientNumber}.`);
      }
    } catch (error) {
      logger.error('Error finding customer folder:', error);
      throw new Error('Unable to locate customer documentation folder. Please contact support.');
    }

    // Find existing shop folder with enhanced error handling
    let shopFolder;
    try {
      shopFolder = await findExistingShopFolder(drive.id, clientFolder.id, shopFolderName);
      if (!shopFolder) {
        logger.error(`Shop folder not found for shop: ${shopFolderName} in customer: ${compteClientNumber}`);
        throw new Error(`Shop documentation folder not found. Please ensure initial shop documentation has been generated.`);
      }
    } catch (error) {
      logger.error('Error finding shop folder:', error);
      throw new Error('Unable to locate shop documentation folder. Please contact support.');
    }

    // Check if required folder structure exists with enhanced error handling
    let boxMediaFolderId, webMerchFolderId;
    try {
      // First, let's see what's actually in the shop folder
      logger.debug(`Examining contents of shop folder: ${shopFolder.name} (ID: ${shopFolder.id})`);
      
      try {
        const shopContents = await graphClient.api(`/drives/${drive.id}/items/${shopFolder.id}/children`).get();
        const folderNames = shopContents.value.filter(item => item.folder).map(item => item.name);
        const fileNames = shopContents.value.filter(item => item.file).map(item => item.name);
        
        logger.debug(`Shop folder contains ${shopContents.value.length} items:`);
        logger.debug(`Folders: ${JSON.stringify(folderNames)}`);
        logger.debug(`Files: ${JSON.stringify(fileNames.slice(0, 10))}${fileNames.length > 10 ? ' ...' : ''}`);
      } catch (listError) {
        logger.error('Error listing shop folder contents:', listError);
        throw new Error('Unable to access shop folder contents. Please check SharePoint permissions.');
      }
      
      // Look for Box Media folder with proper naming convention: BOX MÉDIA _ <ClientName> _ <ShopName>
      // Note: Using accent in MÉDIA and SPACES around underscores as per actual folder structure
      const expectedBoxMediaName = `BOX MÉDIA _ ${raisonSociale} _ ${nomProjet}`;
      logger.debug(`Looking for Box Media folder with name: ${expectedBoxMediaName}`);
      logger.debug(`Variables: raisonSociale='${raisonSociale}', nomProjet='${nomProjet}'`);
      
      boxMediaFolderId = await findFolderByName(drive.id, shopFolder.id, expectedBoxMediaName);
      
      if (!boxMediaFolderId) {
        // Try alternative naming patterns for Box Media folder
        logger.debug('Expected Box Media folder not found, trying alternative names...');
        const alternativeNames = [
          'Box Media',
          'Box media', 
          'BOX MEDIA',
          'BOX MÉDIA',
          'BoxMedia',
          'box media',
          'Box_Media',
          `Box Media _ ${raisonSociale} _ ${nomProjet}`,
          `BOX MEDIA _ ${raisonSociale} _ ${nomProjet}`,
          `BOX MÉDIA_${raisonSociale}_${nomProjet}`,
          `Box Media_${raisonSociale}_${nomProjet}`,
          `Box_Media_${raisonSociale}_${nomProjet}`,
          `BOX MEDIA_${raisonSociale}_${nomProjet}`,
          `BOXMEDIA_${raisonSociale}_${nomProjet}`,
          `BOX_MÉDIA_${raisonSociale}_${nomProjet}`
        ];
        
        for (const altName of alternativeNames) {
          boxMediaFolderId = await findFolderByName(drive.id, shopFolder.id, altName);
          if (boxMediaFolderId) {
            logger.debug(`Found Box Media folder with alternative name: ${altName}`);
            break;
          }
        }
        
        if (!boxMediaFolderId) {
          logger.error(`Box Media folder not found in shop: ${shopFolderName}`);
          logger.error(`Expected name: ${expectedBoxMediaName}`);
          throw new Error('Box Media folder not found. Please ensure complete initial documentation has been generated for this shop.');
        }
      }

      // Check Box Media folder contents
      logger.debug(`Examining contents of Box Media folder (ID: ${boxMediaFolderId})`);
      try {
        const boxMediaContents = await graphClient.api(`/drives/${drive.id}/items/${boxMediaFolderId}/children`).get();
        const boxMediaFolders = boxMediaContents.value.filter(item => item.folder).map(item => item.name);
        logger.debug(`Box Media contains folders: ${JSON.stringify(boxMediaFolders)}`);
      } catch (boxListError) {
        logger.error('Error listing Box Media contents:', boxListError);
      }

      webMerchFolderId = await findFolderByName(drive.id, boxMediaFolderId, 'Web-Merchandising');
      if (!webMerchFolderId) {
        // Try alternative names for Web-Merchandising folder
        logger.debug('Web-Merchandising not found, trying alternative names...');
        const webMerchAltNames = ['Web-merchandising', 'WEB-MERCHANDISING', 'Web Merchandising', 'WebMerchandising', 'web-merchandising'];
        
        for (const altName of webMerchAltNames) {
          webMerchFolderId = await findFolderByName(drive.id, boxMediaFolderId, altName);
          if (webMerchFolderId) {
            logger.debug(`Found Web-Merchandising folder with alternative name: ${altName}`);
            break;
          }
        }
        
        if (!webMerchFolderId) {
          logger.error(`Web-Merchandising folder not found in Box Media for shop: ${shopFolderName}`);
          throw new Error('Web-Merchandising folder not found. Please ensure complete initial documentation structure exists.');
        }
      }
    } catch (error) {
      logger.error('Error accessing required folder structure:', error);
      
      // Only create folders if they're genuinely missing, not if there's a permission error
      if (error.message && error.message.includes('not found')) {
        logger.debug('Folders missing - attempting to create missing folder structure...');
      } else {
        logger.error('Non-folder-missing error, re-throwing:', error);
        throw error; // Re-throw permission or other errors
      }
      logger.debug('Attempting to create missing folder structure...');
      try {
        // Create Box Media folder if it doesn't exist
        if (!boxMediaFolderId) {
          logger.debug('Creating Box Media folder...');
          const boxMediaFolder = await getOrCreateFolder(drive.id, shopFolder.id, 'Box Media');
          boxMediaFolderId = boxMediaFolder.id;
        }
        
        // Create Web-Merchandising folder if it doesn't exist
        if (!webMerchFolderId) {
          logger.debug('Creating Web-Merchandising folder...');
          const webMerchFolder = await getOrCreateFolder(drive.id, boxMediaFolderId, 'Web-Merchandising');
          webMerchFolderId = webMerchFolder.id;
        }
        
        logger.debug('Successfully created missing folder structure');
      } catch (createError) {
        logger.error('Error creating folder structure:', createError);
        throw new Error('Unable to access or create required documentation folders. Please check SharePoint permissions or contact support.');
      }
    }

    // Look for existing Fiches Produits file following your structure: FICHES.PRODUITS_SHOPIFY_<ClientName>_<ShopName>.xlsx
    const fichesProduitsFileName = `FICHES.PRODUITS_SHOPIFY_${raisonSociale}_${nomProjet}.xlsx`;
    let existingFileId = null;
    
    logger.debug(`Expected file name: ${fichesProduitsFileName}`);
    
    logger.debug(`🔍 DETAILED SEARCH: Looking for existing file: ${fichesProduitsFileName}`);
    logger.debug(`🔍 DETAILED SEARCH: In Web-Merchandising folder ID: ${webMerchFolderId}`);
    logger.debug(`🔍 DETAILED SEARCH: Customer: ${raisonSociale}, Project: ${nomProjet}`);

    // If webMerchFolderId is null/undefined, this is a critical error
    if (!webMerchFolderId) {
      logger.error('❌ CRITICAL: Web-Merchandising folder ID is null/undefined!');
      logger.error('This means the folder structure detection failed completely.');
      logger.error('Searching entire shop folder as emergency fallback...');
      
      try {
        const shopContents = await graphClient.api(`/drives/${drive.id}/items/${shopFolder.id}/children`).get();
        const allFiles = shopContents.value.filter(item => item.file);
        const allFolders = shopContents.value.filter(item => item.folder);
        const fichesFiles = allFiles.filter(file => file.name.includes('FICHES.PRODUITS_SHOPIFY'));
        
        logger.debug(`🔍 EMERGENCY SEARCH: Found ${allFolders.length} folders in shop:`);
        allFolders.forEach(folder => logger.debug(`  📁 ${folder.name}`));
        
        logger.debug(`🔍 EMERGENCY SEARCH: Found ${fichesFiles.length} Fiches Produits files in shop folder:`);
        fichesFiles.forEach(file => logger.debug(`  📄 ${file.name}`));
        
        // Try to find the specific one for this shop
        const matchingFile = fichesFiles.find(file => 
          file.name.includes(raisonSociale) || file.name.includes(nomProjet)
        );
        
        if (matchingFile) {
          existingFileId = matchingFile.id;
          logger.debug(`✅ EMERGENCY: Found existing Fiches Produits file in shop root: ${matchingFile.name}`);
        } else {
          logger.error(`❌ EMERGENCY: No matching Fiches Produits file found even in shop root`);
        }
      } catch (shopSearchError) {
        logger.error('❌ EMERGENCY SEARCH FAILED:', shopSearchError);
      }
    }

        if (webMerchFolderId && !existingFileId) {
      try {
        logger.debug(`🔍 SEARCHING Web-Merchandising folder (ID: ${webMerchFolderId})...`);
        const folderContents = await graphClient.api(`/drives/${drive.id}/items/${webMerchFolderId}/children`).get();
      
        logger.debug(`📂 Web-Merchandising folder contains ${folderContents.value.length} items:`);
        const fileNames = folderContents.value.filter(item => item.file).map(item => item.name);
        const folderNames = folderContents.value.filter(item => item.folder).map(item => item.name);
        
        logger.debug(`📄 Files in Web-Merchandising: ${JSON.stringify(fileNames)}`);
        logger.debug(`📁 Folders in Web-Merchandising: ${JSON.stringify(folderNames)}`);
        
        // Try exact match first
        logger.debug(`🎯 Looking for EXACT match: "${fichesProduitsFileName}"`);
        let existingFile = folderContents.value.find(item => 
          item.name === fichesProduitsFileName && item.file
        );
        
        // If exact match not found, try partial match
        if (!existingFile) {
          logger.debug(`❌ Exact match not found for: ${fichesProduitsFileName}`);
          logger.debug(`🔍 Trying partial match with pattern: FICHES.PRODUITS_SHOPIFY + ${raisonSociale} + .xlsx`);
          
          existingFile = folderContents.value.find(item => 
            item.file && 
            item.name.includes('FICHES.PRODUITS_SHOPIFY') && 
            item.name.includes(raisonSociale) && 
            item.name.includes('.xlsx')
          );
          
          if (existingFile) {
            logger.debug(`✅ Found existing file with partial match: ${existingFile.name}`);
          } else {
            logger.debug(`❌ No partial match found either`);
            
            // Show all FICHES.PRODUITS files for debugging
            const allFichesFiles = folderContents.value.filter(item => 
              item.file && item.name.includes('FICHES.PRODUITS')
            );
            logger.debug(`🔍 All FICHES.PRODUITS files found: ${JSON.stringify(allFichesFiles.map(f => f.name))}`);
          }
        } else {
          logger.debug(`✅ EXACT MATCH FOUND: ${existingFile.name}`);
        }
        
        if (existingFile) {
          existingFileId = existingFile.id;
          logger.debug(`✅ FINAL RESULT: Found existing Fiches Produits file: ${existingFile.name} (ID: ${existingFileId})`);
        } else {
          logger.error(`❌ FINAL RESULT: No existing Fiches Produits file found matching any pattern`);
        }
      } catch (error) {
        logger.error('❌ Error searching for existing Fiches Produits file:', error);
        logger.error('This will cause the append operation to fail');
      }
    }

    if (existingFileId) {
      // APPROACH: Delete existing file and recreate with ALL products (existing + new)
      try {
        logger.debug('Found existing Fiches Produits file - will delete and recreate with all products...');
        
        // Step 1: Download existing file to extract ALL current products
        logger.debug('Downloading existing file content from SharePoint...');
        const fileStream = await graphClient.api(`/drives/${drive.id}/items/${existingFileId}/content`).get();
        
        // Convert ReadableStream to Buffer
        const chunks = [];
        for await (const chunk of fileStream) {
          chunks.push(chunk);
        }
        const fileContent = Buffer.concat(chunks);
        
        const tempDownloadPath = path.join(__dirname, 'temp', `existing_${Date.now()}.xlsx`);
        fs.writeFileSync(tempDownloadPath, fileContent);
        logger.debug(`Successfully downloaded and saved existing file to: ${tempDownloadPath}`);
        
        // Step 2: Get ALL products that should be in the final file from MongoDB (with complete data)
        logger.debug('Getting all documented products from MongoDB database...');
        
        const customersCollection = await getCustomersCollection();
        const fullCustomer = await customersCollection.findOne({
          'shops.shopId': shop.shopId
        });
        
        const fullShop = fullCustomer?.shops?.find(s => s.shopId === shop.shopId);
        
        // Get all currently documented products (these should remain in the file)
        const allDocumentedProducts = fullShop?.products?.filter(p => p.documented === true) || [];
        logger.debug(`Found ${allDocumentedProducts.length} already documented products in database`);
        
        // Get the new products being added now (from the append request)
        const newProducts = shop.products || []; // These are the ones being added now
        logger.debug(`Adding ${newProducts.length} new products to documentation`);
        
        // Step 3: Combine ALL products (existing documented + new ones)
        const newProductIds = new Set(newProducts.map(p => p.productId));
        
        // Filter out any products that are being re-documented (avoid duplicates)
        const existingProductsToKeep = allDocumentedProducts.filter(p => 
          !newProductIds.has(p.productId)
        );
        
        // Combine all products for the final file (complete data from MongoDB)
        const allProductsForFile = [...existingProductsToKeep, ...newProducts];
        
        logger.debug(`Creating new file with ${existingProductsToKeep.length} existing documented + ${newProducts.length} newly documented = ${allProductsForFile.length} total products`);
        
        // Step 5: Delete the existing file
        logger.debug('Deleting existing Fiches Produits file...');
        await graphClient.api(`/drives/${drive.id}/items/${existingFileId}`).delete();
        logger.debug('Successfully deleted existing file');
        
        // Step 6: Create new file with ALL products
        const tempShopWithAllProducts = {
          ...shop,
          products: allProductsForFile
        };
        
        await createNewFichesProduitsFile(drive.id, webMerchFolderId, customer, tempShopWithAllProducts, fichesProduitsFileName);
        
        // Clean up
        if (fs.existsSync(tempDownloadPath)) {
          fs.unlinkSync(tempDownloadPath);
        }
        
        logger.debug('Successfully replaced existing file with updated version containing all products with complete data from MongoDB');

      } catch (error) {
        logger.error('Error replacing existing Fiches Produits:', error);
        throw new Error(`Failed to replace existing file: ${error.message}`);
      }
      
    } else {
      // No existing file found - NEVER create new folders/files in append mode
      logger.error('❌ CRITICAL ERROR: No existing Fiches Produits file found!');
      logger.error('Expected file name:', fichesProduitsFileName);
      logger.error('Expected in folder ID:', webMerchFolderId);
      logger.error('This suggests either:');
      logger.error('1. Initial documentation was never generated for this shop');
      logger.error('2. File detection logic is failing');
      logger.error('3. Files are in a different location than expected');
      logger.error('4. File naming convention has changed');
      
      // In append mode, we should NEVER create new folder structures
      // This should only work with existing documentation
      throw new Error(`Cannot append products: Existing Fiches Produits file not found. Please ensure initial documentation has been generated for this shop. Expected file: ${fichesProduitsFileName} in Web-Merchandising folder.`);
    }

    logger.debug('Fiches Produits append/create process completed successfully');

  } catch (error) {
    logger.error('Error in appendToFichesProduitsOrCreate:', error);
    throw error;
  }
}

// Helper function to create new Fiches Produits file
async function createNewFichesProduitsFile(driveId, webMerchFolderId, customer, shop, fileName) {
  logger.debug(`Creating new Fiches Produits file with ${shop.products?.length || 0} products...`);
  
  if (!webMerchFolderId) {
    throw new Error('CRITICAL ERROR: webMerchFolderId is null/undefined. Cannot create file without proper folder structure.');
  }
  
  logger.debug(`Target folder ID for new file: ${webMerchFolderId}`);
  
  const webMerchTemplatePath = path.join(__dirname, 'FileWebMerch', 'FICHES.PRODUITS_SHOPIFY_CLIENT_PROJET.xlsx');
  const processedWebMerchPath = path.join(__dirname, 'temp', `NEW_${fileName}`);

  // Prepare data for merch processor
  // NOTE: shop.products should only contain the products to be documented (passed from caller)
  const shopDataForWebMerch = JSON.stringify({
    nomProjet: shop.nomProjet,
    shopifyDomain: shop.shopifyDomain || '',
    raisonSociale: customer.raisonSociale,
    dateSortieOfficielle: shop.dateSortieOfficielle,
    dateCommercialisation: shop.dateCommercialisation,
    dateMiseEnLigne: shop.dateMiseEnLigne,
    products: shop.products || [],
    appendMode: false // Creating new file, not appending
  });

  const encodedWebMerchData = Buffer.from(shopDataForWebMerch).toString('base64');

  // Process the template with new products
  await new Promise((resolve, reject) => {
    const command = `python3 "${path.join(__dirname, 'merch_xlsx_processor.py')}" "${webMerchTemplatePath}" "${encodedWebMerchData}" "${processedWebMerchPath}"`;
    logger.debug(`Creating new Fiches Produits: ${command}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        logger.error(`New Fiches Produits creation error: ${error}`);
        logger.error(`Python stderr: ${stderr}`);
        return reject(`Failed to create new Fiches Produits: ${error.message}`);
      }
      if (stderr) {
        logger.warn(`Python stderr: ${stderr}`);
      }
      logger.debug(`Python stdout: ${stdout}`);
      resolve();
    });
  });

  // Upload the new file
  if (fs.existsSync(processedWebMerchPath)) {
    const newContent = fs.readFileSync(processedWebMerchPath);
    
    await uploadFile(
      driveId,
      webMerchFolderId,
      fileName,
      newContent,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    
    logger.debug(`Successfully created new Fiches Produits file: ${fileName}`);
    
    // Clean up temporary file
    fs.unlinkSync(processedWebMerchPath);
  }
}

// Helper function to find folder by name
async function findFolderByName(driveId, parentFolderId, folderName) {
  try {
    const response = await graphClient.api(`/drives/${driveId}/items/${parentFolderId}/children`).get();
    const folder = response.value.find(item => item.name === folderName && item.folder);
    return folder ? folder.id : null;
  } catch (error) {
    logger.error(`Error finding folder ${folderName}:`, error);
    return null;
  }
}

module.exports = { 
  generateDocumentation, 
  checkDocumentationExists, 
  appendToFichesProduitsOrCreate 
};
