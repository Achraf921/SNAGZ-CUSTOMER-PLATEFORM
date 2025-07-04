const { ClientSecretCredential } = require("@azure/identity");
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
    console.log('Attempting to get SharePoint site...');
    const site = await graphClient.api(`/sites/${hostname}:${sitePath}`).get();
    console.log('Successfully retrieved SharePoint site');
    return site;
  } catch (error) {
    console.error('Error getting SharePoint site:', error);
    throw error;
  }
}

async function getDrive(siteId) {
  try {
    console.log('Attempting to get SharePoint drive for site:', siteId);
    const drive = await graphClient.api(`/sites/${siteId}/drive`).get();
    console.log('Successfully retrieved SharePoint drive');
    return drive;
  } catch (error) {
    console.error('Error getting SharePoint drive:', error);
    throw error;
  }
}

async function getOrCreateFolder(driveId, parentFolderId, folderName) {
  try {
    console.log('Creating/Getting folder:', folderName);
    const childrenApi = parentFolderId
      ? `/drives/${driveId}/items/${parentFolderId}/children`
      : `/drives/${driveId}/root/children`;
    
    const list = await graphClient.api(childrenApi).get();
    const found = list.value.find(
      (f) => f.folder && f.name.toUpperCase() === folderName.toUpperCase()
    );
    
    if (found) {
      console.log('Found existing folder');
      return found;
    }
    
    console.log('Creating new folder');
    const folder = await graphClient
      .api(childrenApi)
      .post({ name: folderName, folder: {}, "@microsoft.graph.conflictBehavior": "rename" });
    
    console.log('Successfully created folder');
    return folder;
  } catch (error) {
    console.error('Error with folder operation:', error);
    throw error;
  }
}

async function uploadFile(driveId, parentId, fileName, content, contentType, retryCount = 0) {
  try {
    console.log('Uploading file:', fileName);
    const url = `/drives/${driveId}/items/${parentId}:/${fileName}:/content`;
    await graphClient.api(url).headers({ "Content-Type": contentType }).put(content);
    console.log('Successfully uploaded file');
  } catch (error) {
    console.error('Error uploading file:', error);
    
    // If it's a resource locked error and we haven't retried too many times
    if (error.statusCode === 423 && retryCount < 3) {
      console.log(`File locked, retrying in ${(retryCount + 1) * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
      return uploadFile(driveId, parentId, fileName, content, contentType, retryCount + 1);
    }
    
    throw error;
  }
}

async function findExistingCustomerFolder(driveId, compteClientNumber) {
  try {
    console.log(`Searching for existing customer folder containing: ${compteClientNumber}`);
    
    if (!compteClientNumber || compteClientNumber === 'NOCLIENTNUM') {
      console.log('No valid CompteClientNumber provided, skipping search');
      return null;
    }
    
    // Get all folders in the root of the drive
    const response = await graphClient.api(`/drives/${driveId}/root/children`).get();
    const folders = response.value.filter(item => item.folder);
    
    console.log(`Found ${folders.length} folders in SharePoint root`);
    
    // Search for a folder that contains the CompteClientNumber in its name
    const matchingFolder = folders.find(folder => 
      folder.name.includes(compteClientNumber)
    );
    
    if (matchingFolder) {
      console.log(`Found existing customer folder: ${matchingFolder.name}`);
      return matchingFolder;
    } else {
      console.log(`No existing folder found containing CompteClientNumber: ${compteClientNumber}`);
      return null;
    }
  } catch (error) {
    console.error('Error searching for existing customer folder:', error);
    // Don't throw error, just return null to fall back to creating new folder
    return null;
  }
}

async function createBoxMediaStructure(driveId, parentFolderId, customer, shop) {
  try {
    console.log('Creating Box Media folder structure...');
    
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
        console.log(`Processing Web-Design DOCX: ${command}`);

        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`Web-Design DOCX processing error: ${error}`);
            console.error(`Python stderr: ${stderr}`);
            return reject(`Failed to process Web-Design DOCX: ${error.message}`);
          }
          if (stderr) {
            console.warn(`Python stderr: ${stderr}`);
          }
          console.log(`Python stdout: ${stdout}`);
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
        console.log('Processed Web-Design template file uploaded successfully');
        // Clean up temporary file
        fs.unlinkSync(processedWebDesignPath);
      } else {
        console.warn(`Processed Web-Design file not found at ${processedWebDesignPath}`);
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
        products: shop.products || []
      });

      const encodedWebMerchData = Buffer.from(shopDataForWebMerch).toString('base64');

      // Process the Web-Merchandising XLSX file using specialized merchandising Python script
      await new Promise((resolve, reject) => {
        const command = `python3 "${path.join(__dirname, 'merch_xlsx_processor.py')}" "${webMerchTemplatePath}" "${encodedWebMerchData}" "${processedWebMerchPath}"`;
        console.log(`Processing Web-Merchandising XLSX with products: ${command}`);

        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`Web-Merchandising XLSX processing error: ${error}`);
            console.error(`Python stderr: ${stderr}`);
            return reject(`Failed to process Web-Merchandising XLSX: ${error.message}`);
          }
          if (stderr) {
            console.warn(`Python stderr: ${stderr}`);
          }
          console.log(`Python stdout: ${stdout}`);
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
        console.log('Processed Web-Merchandising template file uploaded successfully');
        
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
              console.log(`Successfully marked ${shop.products.length} products as documented for shop ${shop.shopId}`);
            } else {
              console.warn(`Failed to update product documentation status for shop ${shop.shopId}`);
            }
          } catch (updateError) {
            console.error('Error updating product documentation status:', updateError);
            // Don't throw error - continue with documentation generation
          }
        }
        
        // Clean up temporary file
        fs.unlinkSync(processedWebMerchPath);
      } else {
        console.warn(`Processed Web-Merchandising file not found at ${processedWebMerchPath}`);
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
    
    console.log('Box Media folder structure created successfully');
    return boxMediaFolder;
  } catch (error) {
    console.error('Error creating Box Media structure:', error);
    throw error;
  }
}

async function createCGVFolder(driveId, parentFolderId) {
  try {
    console.log('Creating CGV & Politiques folder...');
    
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
        console.log('CGV document uploaded successfully');
      } else {
        console.log('CGV document not found in local directory, skipping upload');
      }
    } catch (uploadError) {
      console.error('Error uploading CGV document:', uploadError);
      // Continue execution even if document upload fails
    }
    
    console.log('CGV & Politiques folder created successfully');
    return cgvFolder;
  } catch (error) {
    console.error('Error creating CGV folder:', error);
    throw error;
  }
}

async function createContratFolder(driveId, parentFolderId) {
  try {
    console.log('Creating CONTRAT SIGNÉ folder...');
    
    // Create CONTRAT SIGNÉ folder
    const contratFolder = await getOrCreateFolder(driveId, parentFolderId, 'CONTRAT SIGNÉ');
    
    console.log('CONTRAT SIGNÉ folder created successfully');
    return contratFolder;
  } catch (error) {
    console.error('Error creating CONTRAT SIGNÉ folder:', error);
    throw error;
  }
}

async function checkDocumentationExists(customer, shop) {
  try {
    console.log('Checking if documentation already exists...');
    
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
      console.log('No customer folder found, documentation does not exist');
      return false;
    }

    // Check if shop folder exists
    try {
      const shopFolderResponse = await graphClient.api(`/drives/${drive.id}/items/${clientFolder.id}/children`).get();
      const shopFolder = shopFolderResponse.value.find(item => 
        item.folder && item.name === shopFolderName
      );
      
      if (!shopFolder) {
        console.log('No shop folder found, documentation does not exist');
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
        console.log('FICHE PROJET file found, documentation exists');
        return true;
      } else {
        console.log('FICHE PROJET file not found, documentation does not exist');
        return false;
      }
      
    } catch (error) {
      console.log('Error checking shop folder contents, assuming documentation does not exist');
      return false;
    }
    
  } catch (error) {
    console.error('Error checking documentation existence:', error);
    // If we can't check, assume it doesn't exist to be safe
    return false;
  }
}

async function generateDocumentation(customer, shop, forceOverwrite = false) {
  try {
    console.log('Starting documentation generation...');
    
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
      console.log(`Creating new customer folder: ${clientFolderName}`);
      clientFolder = await getOrCreateFolder(drive.id, null, clientFolderName);
    } else {
      console.log(`Using existing customer folder: ${clientFolder.name}`);
    }
    
    const shopFolder = await getOrCreateFolder(drive.id, clientFolder.id, shopFolderName);

    // Create Box Media structure
    await createBoxMediaStructure(drive.id, shopFolder.id, customer, shop);

    // Create CGV & Politiques folder
    await createCGVFolder(drive.id, shopFolder.id);

    // Create CONTRAT SIGNÉ folder
    await createContratFolder(drive.id, shopFolder.id);

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
      console.log(`Executing Python command: ${command}`);

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          console.error(`Python stderr: ${stderr}`);
          return reject(`Failed to process DOCX: ${error.message}`);
        }
        if (stderr) {
          console.warn(`Python stderr: ${stderr}`);
        }
        console.log(`Python stdout: ${stdout}`);
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
      console.log(`Processed DOCX '${outputFilename}' uploaded successfully.`);
      // Clean up the temporary processed DOCX file
      fs.unlinkSync(processedDocxPath);
    } else {
      console.warn(`Processed DOCX file not found at ${processedDocxPath}. Skipping upload.`);
    }

    // Generate XLSX
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SNA GZ";
    workbook.lastModifiedBy = "SNA GZ";
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet('Synthese', {
      properties: {
        tabColor: { argb: 'FF0000FF' }
      }
    });

    // Style for headers
    const headerStyle = {
      font: {
        bold: true,
        size: 12,
        color: { argb: 'FFFFFFFF' }
      },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0000FF' }
      },
      alignment: {
        horizontal: 'center',
        vertical: 'middle'
      }
    };

    const headers = [
      "Nom de projet","Type de projet","Commercial","Boutique en ligne","Client",
      "Contacts Client","Compte Client","Date Mise en Ligne","Date Commercialisation","Date Sortie Officielle",
      "Précommande","Dédicace","Facturation",
      "Abonnement mensuel SHOPIFY sans engagement","Abonnement annuel SHOPIFY (12 mois)",
      "Les coûts pour ajouter le module Mondial Relay","Les coûts pour ajouter le module Delivengo (44 pays jusqu'à 2kg)",
      "Frais mensuels liés à la maintenance du site internet",
      "Frais d'ouverture de boutique en ligne (au démarrage du projet)",
      "Frais d'ouverture sans habillage de boutique (au démarrage du projet)",
      "Commission SNA GZ sur le chiffre d'affaires global HT réalisé (frais de port HT compris)"
    ];
    
    // Add headers with style
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.style = headerStyle;
    });

    // Add data row
    const dataRow = sheet.addRow([
      shop.nomProjet||'', shop.typeProjet||'', shop.commercial||'', shop.boutiqueUrl||'',
      shop.nomClient||'', shop.contactsClient||'', customer.CompteClientNumber||'',
      shop.dateMiseEnLigne||'', shop.dateCommercialisation||'', shop.dateSortieOfficielle||'',
      shop.precommande ? 'OUI' : 'NON', shop.dedicaceEnvisagee ? 'OUI' : 'NON', '',
      shop.typeAbonnementShopify === 'mensuel' ? '105 €' : '',
      shop.typeAbonnementShopify === 'annuel' ? '948 €' : '',
      shop.coutsEtDetailsModuleMondialRelay||'', shop.coutsEtDetailsModuleDelivengo||'',
      shop.coutsEtDetailsMaintenanceSite||'', '', '', ''
    ]);

    // Auto-fit columns
    sheet.columns.forEach(column => {
      column.width = 30;
    });
    
    const xlsxBuffer = await workbook.xlsx.writeBuffer();
    const xlsxName = `Synthese_${(shop.nomProjet||'').toUpperCase()}_${customer.CompteClientNumber}.xlsx`;
    
    await uploadFile(
      drive.id,
      shopFolder.id,
      xlsxName,
      xlsxBuffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    console.log('Documentation generated in SharePoint');
  } catch (error) {
    console.error('Error generating documentation:', error);
    throw error;
  }
}

module.exports = { generateDocumentation, checkDocumentationExists };
