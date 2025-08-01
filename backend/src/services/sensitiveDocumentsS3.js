const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { logger } = require('../utils/secureLogger');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');

// Configure AWS S3 Client for sensitive documents
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Use separate bucket for sensitive documents (or folder in existing bucket)
const sensitiveDocumentsBucket = process.env.AWS_S3_SENSITIVE_DOCS_BUCKET || process.env.AWS_S3_BUCKET_NAME;
const sensitiveDocsFolder = 'sensitive-documents/';

/**
 * Upload a sensitive document to S3
 * @param {string} filePath - Local file path
 * @param {string} fileName - Desired filename in S3
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} Upload result
 */
const uploadSensitiveDocument = async (filePath, fileName, metadata = {}) => {
  try {
    logger.debug(`[SENSITIVE DOCS] Uploading ${fileName} to S3...`);
    
    // Read file from filesystem
    const fileContent = fs.readFileSync(filePath);
    
    // Determine content type
    const ext = path.extname(fileName).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' : 
                       ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                       'application/octet-stream';
    
    // Configure encryption based on available KMS key
    const encryptionConfig = process.env.AWS_KMS_KEY_ID ? {
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.AWS_KMS_KEY_ID
    } : {
      ServerSideEncryption: 'AES256'
    };

    const uploadParams = {
      Bucket: sensitiveDocumentsBucket,
      Key: `${sensitiveDocsFolder}${fileName}`,
      Body: fileContent,
      ContentType: contentType,
      Metadata: {
        uploadedAt: new Date().toISOString(),
        documentType: 'sensitive',
        originalName: fileName,
        encryptionType: process.env.AWS_KMS_KEY_ID ? 'KMS' : 'AES256',
        ...metadata
      },
      // Ensure private access only
      ACL: 'private',
      ...encryptionConfig
    };

    logger.debug(`[SENSITIVE DOCS] Using ${process.env.AWS_KMS_KEY_ID ? 'KMS' : 'AES256'} encryption for ${fileName}`);
    
    const command = new PutObjectCommand(uploadParams);
    const result = await s3Client.send(command);
    
    logger.debug(`[SENSITIVE DOCS] Successfully uploaded ${fileName}`);
    return {
      success: true,
      key: `${sensitiveDocsFolder}${fileName}`,
      etag: result.ETag,
      location: `s3://${sensitiveDocumentsBucket}/${sensitiveDocsFolder}${fileName}`
    };
    
  } catch (error) {
    logger.error(`[SENSITIVE DOCS] Error uploading ${fileName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get a sensitive document from S3
 * @param {string} fileName - Document filename
 * @returns {Promise<Object>} Document stream and metadata
 */
const getSensitiveDocument = async (fileName) => {
  try {
    logger.debug(`[SENSITIVE DOCS] Fetching ${fileName} from S3...`);
    
    const getParams = {
      Bucket: sensitiveDocumentsBucket,
      Key: `${sensitiveDocsFolder}${fileName}`
    };
    
    const command = new GetObjectCommand(getParams);
    const result = await s3Client.send(command);
    
    logger.debug(`[SENSITIVE DOCS] Successfully fetched ${fileName}`);
    return {
      success: true,
      body: result.Body,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      lastModified: result.LastModified,
      metadata: result.Metadata
    };
    
  } catch (error) {
    logger.error(`[SENSITIVE DOCS] Error fetching ${fileName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check if a sensitive document exists in S3
 * @param {string} fileName - Document filename
 * @returns {Promise<boolean>} Whether document exists
 */
const documentExists = async (fileName) => {
  try {
    const headParams = {
      Bucket: sensitiveDocumentsBucket,
      Key: `${sensitiveDocsFolder}${fileName}`
    };
    
    const command = new HeadObjectCommand(headParams);
    await s3Client.send(command);
    
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    logger.error(`[SENSITIVE DOCS] Error checking document existence:`, error);
    return false;
  }
};

/**
 * Get a temporary signed URL for secure document access
 * @param {string} fileName - Document filename
 * @param {number} expiresIn - URL expiration time in seconds (default: 300 = 5 minutes)
 * @returns {Promise<string>} Signed URL
 */
const getSignedDownloadUrl = async (fileName, expiresIn = 300) => {
  try {
    const getParams = {
      Bucket: sensitiveDocumentsBucket,
      Key: `${sensitiveDocsFolder}${fileName}`
    };
    
    const command = new GetObjectCommand(getParams);
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    
    logger.debug(`[SENSITIVE DOCS] Generated signed URL for ${fileName} (expires in ${expiresIn}s)`);
    return signedUrl;
    
  } catch (error) {
    logger.error(`[SENSITIVE DOCS] Error generating signed URL for ${fileName}:`, error);
    throw error;
  }
};

/**
 * List all sensitive documents
 * @returns {Promise<Array>} List of document keys
 */
const listSensitiveDocuments = async () => {
  try {
    const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
    
    const listParams = {
      Bucket: sensitiveDocumentsBucket,
      Prefix: sensitiveDocsFolder
    };
    
    const command = new ListObjectsV2Command(listParams);
    const result = await s3Client.send(command);
    
    const documents = (result.Contents || []).map(obj => ({
      key: obj.Key,
      fileName: obj.Key.replace(sensitiveDocsFolder, ''),
      size: obj.Size,
      lastModified: obj.LastModified
    }));
    
    return documents;
    
  } catch (error) {
    logger.error('[SENSITIVE DOCS] Error listing documents:', error);
    return [];
  }
};

// Initialize sensitive documents by uploading existing files
const initializeSensitiveDocuments = async () => {
  const documentsToUpload = [
    {
      localPath: path.join(__dirname, 'FilesPayementShopify', 'Extrait KBIS - SNA GZ.pdf'),
      fileName: 'Extrait KBIS - SNA GZ.pdf',
      metadata: { documentType: 'kbis', required: 'true' }
    },
    {
      localPath: path.join(__dirname, 'FilesPayementShopify', 'Justificatif de domicile 23 juil. 2024.pdf'),
      fileName: 'Justificatif de domicile 23 juil. 2024.pdf',
      metadata: { documentType: 'justificatif', required: 'true' }
    },
    {
      localPath: path.join(__dirname, 'FilesPayementShopify', 'Passport_Boris.jpg'),
      fileName: 'Passport_Boris.jpg',
      metadata: { documentType: 'passport', required: 'true' }
    }
  ];
  
  logger.debug("SENSITIVE DOCS: Initializing sensitive documents upload");
  
  for (const doc of documentsToUpload) {
    try {
      // Check if file exists locally
      if (fs.existsSync(doc.localPath)) {
        // Check if already uploaded
        const exists = await documentExists(doc.fileName);
        if (!exists) {
          const result = await uploadSensitiveDocument(doc.localPath, doc.fileName, doc.metadata);
          if (result.success) {
            logger.debug(`✅ [SENSITIVE DOCS] Uploaded: ${doc.fileName}`);
          } else {
            logger.error(`❌ [SENSITIVE DOCS] Failed to upload: ${doc.fileName}`, result.error);
          }
        } else {
          logger.debug(`ℹ️ [SENSITIVE DOCS] Already exists: ${doc.fileName}`);
        }
      } else {
        logger.warn(`⚠️ [SENSITIVE DOCS] File not found: ${doc.localPath}`);
      }
    } catch (error) {
      logger.error(`❌ [SENSITIVE DOCS] Error processing ${doc.fileName}:`, error);
    }
  }
  
  logger.info("SENSITIVE DOCS: Initialization complete");
};

module.exports = {
  uploadSensitiveDocument,
  getSensitiveDocument,
  documentExists,
  getSignedDownloadUrl,
  listSensitiveDocuments,
  initializeSensitiveDocuments,
  s3Client,
  sensitiveDocumentsBucket,
  sensitiveDocsFolder
}; 