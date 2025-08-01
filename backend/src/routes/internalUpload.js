const express = require('express');
const { logger } = require('../utils/secureLogger');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Authentication middleware for internal API
const requireInternalAPIAuth = (req, res, next) => {
  if (!req.session.internalUserInfo) {
    logger.debug(`[API AUTH] Internal API access denied for: ${req.originalUrl}`);
    return res.status(401).json({
      success: false,
      message: 'Authentication required - Internal personnel access only',
      securityAlert: 'UNAUTHORIZED_API_ACCESS'
    });
  }
  logger.debug(`[API AUTH] Internal API access granted for: ${req.originalUrl}`);
  next();
};

// Configure multer with memory storage for reliability
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Accept all image types
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Error handling for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
        message: 'File too large. Maximum size is 10MB.',
      error: 'FILE_SIZE_LIMIT_EXCEEDED'
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
        message: 'Too many files. Only one file allowed at a time.',
      error: 'FILE_COUNT_LIMIT_EXCEEDED'
    });
  }
  }
  
  if (err) {
    logger.error('Upload error:', err);
    return res.status(400).json({
      success: false,
      message: err.message || 'Upload failed',
      error: 'UPLOAD_ERROR'
  });
  }
  
  next();
};

// Route to handle shop image upload for internal portal
router.post('/shops/:clientId/:shopId/images/upload', 
  requireInternalAPIAuth, 
  upload.single('image'),
  handleMulterError,
  async (req, res) => {
    const uploadStart = Date.now();
    const requestId = Math.random().toString(36).substring(2, 15);
    
    try {
      logger.debug(`🚀 [UPLOAD ${requestId}] Shop image upload started`);
      logger.debug(`📏 [UPLOAD ${requestId}] File size: ${req.file?.size || 0} bytes`);
      
    const { clientId, shopId } = req.params;
      const { imageType } = req.body;
    
      // Validate file
    if (!req.file) {
        logger.debug(`❌ [UPLOAD ${requestId}] No file provided`);
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
          error: 'NO_FILE_PROVIDED'
      });
    }

      // Validate image type
      const validImageTypes = ['logo', 'desktopBanner', 'mobileBanner', 'favicon'];
      if (!imageType || !validImageTypes.includes(imageType)) {
        logger.debug(`❌ [UPLOAD ${requestId}] Invalid image type: ${imageType}`);
      return res.status(400).json({
        success: false,
          message: 'Invalid image type. Must be: logo, desktopBanner, mobileBanner, or favicon',
        error: 'INVALID_IMAGE_TYPE'
      });
    }

      logger.debug(`📁 [UPLOAD ${requestId}] Processing ${imageType} upload`);
      logger.debug(`📁 [UPLOAD ${requestId}] File: ${req.file.originalname}, Size: ${req.file.size} bytes`);
      
      // Generate S3 key
    const timestamp = Date.now();
    const fileExtension = path.extname(req.file.originalname);
    const uniqueFilename = `${timestamp}-${Math.random().toString(36).substring(2, 15)}${fileExtension}`;
    
    let s3Key;
    if (imageType === 'logo') {
      s3Key = `logos/shop-${shopId}/${uniqueFilename}`;
    } else if (imageType === 'favicon') {
      s3Key = `favicons/shop-${shopId}/${uniqueFilename}`;
    } else {
      s3Key = `banners/shop-${shopId}/${uniqueFilename}`;
    }

      logger.debug(`☁️ [UPLOAD ${requestId}] Uploading to S3 with key: ${s3Key}`);

      // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
        Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: 'private',
    });

    await s3Client.send(uploadCommand);
      logger.debug(`✅ [UPLOAD ${requestId}] Successfully uploaded to S3`);

      // Generate signed URL
      const getCommand = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
      });
    
      const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
      logger.debug(`🔗 [UPLOAD ${requestId}] Generated signed URL`);

      const response = {
      success: true,
      message: `${imageType} uploaded successfully`,
      imageUrl: signedUrl,
      s3Key: s3Key,
      imageType: imageType
      };
      
      logger.debug(`✅ [UPLOAD ${requestId}] Upload completed in ${Date.now() - uploadStart}ms`);
      res.json(response);

  } catch (error) {
      logger.error(`❌ [UPLOAD ${requestId}] Error:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during upload',
        error: error.message
      });
    }
});

// Route to handle product image upload for internal portal
router.post('/products/:clientId/:shopId/:productId/images/:imageIndex/upload',
  requireInternalAPIAuth,
  upload.single('image'),
  handleMulterError,
  async (req, res) => {
    const uploadStart = Date.now();
    const requestId = Math.random().toString(36).substring(2, 15);
    
    try {
      logger.debug(`🚀 [UPLOAD ${requestId}] Product image upload started`);
      logger.debug(`📏 [UPLOAD ${requestId}] File size: ${req.file?.size || 0} bytes`);
      
      const { clientId, shopId, productId, imageIndex } = req.params;
      
      // Validate file
      if (!req.file) {
        logger.debug(`❌ [UPLOAD ${requestId}] No file provided`);
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
          error: 'NO_FILE_PROVIDED'
        });
      }
      
      // Validate image index
      const index = parseInt(imageIndex);
      if (isNaN(index) || index < 0 || index > 4) {
        return res.status(400).json({
          success: false,
          message: 'Invalid image index. Must be between 0 and 4.',
          error: 'INVALID_IMAGE_INDEX'
        });
      }
      
      logger.debug(`📁 [UPLOAD ${requestId}] Processing product image ${index}`);
      logger.debug(`📁 [UPLOAD ${requestId}] File: ${req.file.originalname}, Size: ${req.file.size} bytes`);
      
      // Generate S3 key
      const timestamp = Date.now();
      const fileExtension = path.extname(req.file.originalname);
      const uniqueFilename = `${timestamp}-${Math.random().toString(36).substring(2, 15)}${fileExtension}`;
      const s3Key = `products/${shopId}/${productId}/image-${index}/${uniqueFilename}`;
      
      logger.debug(`☁️ [UPLOAD ${requestId}] Uploading to S3 with key: ${s3Key}`);
      
      // Upload to S3
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: s3Key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: 'private',
      });
      
      await s3Client.send(uploadCommand);
      logger.debug(`✅ [UPLOAD ${requestId}] Successfully uploaded to S3`);
      
      // Generate signed URL
      const getCommand = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: s3Key,
      });
      
      const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
      logger.debug(`🔗 [UPLOAD ${requestId}] Generated signed URL`);
      
      const response = {
        success: true,
        message: 'Product image uploaded successfully',
        imageUrl: signedUrl,
        s3Key: s3Key,
        imageIndex: index
      };
      
      logger.debug(`✅ [UPLOAD ${requestId}] Upload completed in ${Date.now() - uploadStart}ms`);
      res.json(response);
      
    } catch (error) {
      logger.error(`❌ [UPLOAD ${requestId}] Error:`, error);
    res.status(500).json({
      success: false,
        message: 'Internal server error during upload',
      error: error.message
    });
  }
});

module.exports = router; 