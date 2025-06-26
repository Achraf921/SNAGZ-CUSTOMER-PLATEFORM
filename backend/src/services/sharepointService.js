const { ClientSecretCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");
const { Document, Packer, Paragraph, TextRun } = require("docx");
const ExcelJS = require("exceljs");
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
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

async function uploadFile(driveId, parentId, fileName, content, contentType) {
  try {
    console.log('Uploading file:', fileName);
    const url = `/drives/${driveId}/items/${parentId}:/${fileName}:/content`;
    await graphClient.api(url).headers({ "Content-Type": contentType }).put(content);
    console.log('Successfully uploaded file');
  } catch (error) {
    console.error('Error uploading file:', error);
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
    
    // Helper function to format dates as DD/MM/YYYY
    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
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
      
      // Prepare shop data for processing (same as main DOCX)
      const shopDataForWebDesign = JSON.stringify({
        nomProjet: shop.nomProjet,
        typeProjet: shop.typeProjet,
        commercial: shop.commercial,
        raisonSociale: customer.raisonSociale,
        compteClientRef: customer.CompteClientNumber, // Use CompteClientNumber from customer document
        contactsClient: shop.contactsClient,
        dateMiseEnLigne: formatDate(shop.dateMiseEnLigne),
        dateCommercialisation: formatDate(shop.dateCommercialisation),
        dateSortieOfficielle: formatDate(shop.dateSortieOfficielle),
        precommande: shop.precommande,
        dedicaceEnvisagee: shop.dedicaceEnvisagee,
        shopifyPlanMonthlySelected: shop.typeAbonnementShopify === 'mensuel',
        shopifyPlanYearlySelected: shop.typeAbonnementShopify === 'annuel',
        boutiqueEnLigne: shop.estBoutiqueEnLigne ? 'OUI' : 'NON',
        chefProjet: `${shop.prenomChefProjet || ''} ${shop.nomChefProjet || ''}`.trim(),
        dateDemarageProjet: formatDate(shop.demarrageProjet),
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
    
    // Process and upload Web-Merchandising template file
    const webMerchTemplateDir = path.join(__dirname, 'FileWebMerch');
    const webMerchTemplateFile = 'FICHES.PRODUITS_SHOPIFY_CLIENT_PROJET.xlsx';
    const webMerchTemplatePath = path.join(webMerchTemplateDir, webMerchTemplateFile);
    
    if (fs.existsSync(webMerchTemplatePath)) {
      const webMerchOutputName = `FICHES.PRODUITS_SHOPIFY_${raisonSocialeForFolder}_${nomProjetForFolder}.xlsx`;
      const processedWebMerchPath = path.join(webMerchTemplateDir, `PROCESSED_${webMerchOutputName}`);
      
      // Use the same shop data as Web-Design (already prepared above)
      const shopDataForWebMerch = JSON.stringify({
        nomProjet: shop.nomProjet,
        typeProjet: shop.typeProjet,
        commercial: shop.commercial,
        raisonSociale: customer.raisonSociale,
        compteClientRef: customer.CompteClientNumber, // Use CompteClientNumber from customer document
        contactsClient: shop.contactsClient,
        dateMiseEnLigne: formatDate(shop.dateMiseEnLigne),
        dateCommercialisation: formatDate(shop.dateCommercialisation),
        dateSortieOfficielle: formatDate(shop.dateSortieOfficielle),
        precommande: shop.precommande,
        dedicaceEnvisagee: shop.dedicaceEnvisagee,
        shopifyPlanMonthlySelected: shop.typeAbonnementShopify === 'mensuel',
        shopifyPlanYearlySelected: shop.typeAbonnementShopify === 'annuel',
        boutiqueEnLigne: shop.estBoutiqueEnLigne ? 'OUI' : 'NON',
        chefProjet: `${shop.prenomChefProjet || ''} ${shop.nomChefProjet || ''}`.trim(),
        dateDemarageProjet: formatDate(shop.demarrageProjet),
      });

      const encodedWebMerchData = Buffer.from(shopDataForWebMerch).toString('base64');

      // Process the Web-Merchandising XLSX file using Python script
      await new Promise((resolve, reject) => {
        const command = `python3 "${path.join(__dirname, 'xlsx_processor.py')}" "${webMerchTemplatePath}" "${encodedWebMerchData}" "${processedWebMerchPath}"`;
        console.log(`Processing Web-Merchandising XLSX: ${command}`);

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

async function generateDocumentation(customer, shop) {
  try {
    console.log('Starting documentation generation...');
    
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

    // Helper function to format dates as DD/MM/YYYY
    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // Prepare shop data as a JSON string for the Python script
    const shopDataJson = JSON.stringify({
      nomProjet: shop.nomProjet,
      typeProjet: shop.typeProjet,
      commercial: shop.commercial,
      clientName: clientFolderName,
      raisonSociale: customer.raisonSociale, // Add raisonSociale from customer document
      compteClientRef: customer.CompteClientNumber, // Use CompteClientNumber from customer document
      contactsClient: shop.contactsClient,
      dateMiseEnLigne: formatDate(shop.dateMiseEnLigne),
      dateCommercialisation: formatDate(shop.dateCommercialisation),
      dateSortieOfficielle: formatDate(shop.dateSortieOfficielle),
      precommande: shop.precommande,
      dedicaceEnvisagee: shop.dedicaceEnvisagee,
      shopifyPlanMonthlySelected: shop.typeAbonnementShopify === 'Mensuel',
      shopifyPlanYearlySelected: shop.typeAbonnementShopify === 'Annuel',
      // New fields
      boutiqueEnLigne: shop.estBoutiqueEnLigne ? 'OUI' : 'NON', // XXX12: boutique en ligne (OUI/NON)
      chefProjet: `${shop.prenomChefProjet || ''} ${shop.nomChefProjet || ''}`.trim(), // XXX13: merged prenomChefProjet and nomChefProjet
      dateDemarageProjet: formatDate(shop.demarrageProjet), // XXX14: date démarage projet
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

module.exports = { generateDocumentation };
