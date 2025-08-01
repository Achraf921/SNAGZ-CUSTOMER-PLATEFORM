const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Authentication middleware for internal API
const requireInternalAPIAuth = (req, res, next) => {
  if (!req.session.internalUserInfo) {
    console.log(`[API AUTH] Internal API access denied for: ${req.originalUrl}`);
    return res.status(401).json({
      success: false,
      message: 'Authentication required - Internal personnel access only',
      securityAlert: 'UNAUTHORIZED_API_ACCESS'
    });
  }
  console.log(`[API AUTH] Internal API access granted for: ${req.originalUrl}`);
  next();
};

// S3 Client Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer configuration for internal portal image uploads
const internalImageUpload = multer({
  dest: path.join(__dirname, '..', 'uploads', 'temp'),
  fileFilter: (req, file, cb) => {
    console.log('🔍 [INTERNAL MULTER] Processing file:', file.originalname, file.mimetype, 'Size:', file.size || 'unknown');
    console.log('🔍 [INTERNAL MULTER] Full file object:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      encoding: file.encoding,
      mimetype: file.mimetype,
      size: file.size
    });
    
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      console.log('🔍 [INTERNAL MULTER] File accepted:', file.originalname);
      cb(null, true);
    } else {
      console.log('🔍 [INTERNAL MULTER] File rejected (not an image):', file.originalname);
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // Increased to 50MB limit for high-resolution images
    files: 1
  },
  onError: function(err, next) {
    console.log('🚨 [MULTER ERROR CALLBACK]', err);
    next(err);
  }
}).single('image');

// Add debugging wrapper for multer
const debugMulter = (req, res, next) => {
  console.log('🔍 [MULTER DEBUG] Request received:', {
    method: req.method,
    url: req.url,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      'user-agent': req.headers['user-agent']
    }
  });
  
  // Call the original multer
  internalImageUpload(req, res, (err) => {
    if (err) {
      console.log('🚨 [MULTER DEBUG] Error in multer:', err);
    } else {
      console.log('🔍 [MULTER DEBUG] Multer completed successfully:', {
        file: req.file ? {
          fieldname: req.file.fieldname,
          originalname: req.file.originalname,
          filename: req.file.filename,
          path: req.file.path,
          size: req.file.size
        } : 'No file received',
        body: req.body
      });
    }
    next(err);
  });
};

// Error handling middleware for multer file upload errors
const handleMulterError = (err, req, res, next) => {
  console.error('🚨 [MULTER ERROR]', err.code, err.message);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'File size too large. Maximum allowed size is 50MB.',
      error: 'FILE_SIZE_LIMIT_EXCEEDED'
    });
  }
  
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      message: 'Too many files. Only one file allowed.',
      error: 'FILE_COUNT_LIMIT_EXCEEDED'
    });
  }
  
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      message: 'Unexpected file field. Use "image" field name.',
      error: 'UNEXPECTED_FILE_FIELD'
    });
  }
  
  // Handle custom file filter errors
  if (err.message === 'Only image files are allowed!') {
    return res.status(400).json({
      success: false,
      message: 'Invalid file type. Only image files are allowed.',
      error: 'INVALID_FILE_TYPE'
    });
  }
  
  // Generic multer error
  return res.status(400).json({
    success: false,
    message: 'File upload error: ' + err.message,
    error: 'FILE_UPLOAD_ERROR'
  });
};

// Helper function to extract S3 key from signed URL
const extractS3KeyFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    // Remove leading slash and decode
    return decodeURIComponent(urlObj.pathname.substring(1));
  } catch (error) {
    console.error('Error extracting S3 key from URL:', error);
    return null;
  }
};

// Route to handle product image upload for internal portal
router.post('/products/:clientId/:shopId/:productId/images/:imageIndex/upload', requireInternalAPIAuth, debugMulter, handleMulterError, async (req, res) => {
  try {
    const { clientId, shopId, productId, imageIndex } = req.params;
    
    console.log(`[INTERNAL IMAGE UPLOAD] Uploading image ${imageIndex} for product ${productId}`);
    console.log(`[INTERNAL IMAGE UPLOAD] File received:`, req.file ? req.file.originalname : 'No file');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
        error: 'NO_FILE_RECEIVED'
      });
    }

    // Generate unique filename for S3
    const timestamp = Date.now();
    const fileExtension = path.extname(req.file.originalname);
    const uniqueFilename = `${timestamp}-${Math.random().toString(36).substring(2, 15)}${fileExtension}`;
    const s3Key = `products/shop-${shopId}/product-${productId}/${uniqueFilename}`;

    console.log(`[INTERNAL IMAGE UPLOAD] Uploading to S3 with key: ${s3Key}`);

    // Read file from temp location
    const fileBuffer = await fs.promises.readFile(req.file.path);
    
    // Upload to S3 with private ACL
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: req.file.mimetype,
      ACL: 'private', // Make sure the file is private
    });

    await s3Client.send(uploadCommand);
    console.log(`[INTERNAL IMAGE UPLOAD] Successfully uploaded to S3: ${s3Key}`);

    // Generate signed URL for accessing the image (valid for 1 hour)
    const getObjectParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
    };
    
    const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand(getObjectParams), { expiresIn: 3600 });
    console.log(`[INTERNAL IMAGE UPLOAD] Generated signed URL for ${s3Key}`);

    // Clean up temp file
    try {
      await fs.promises.unlink(req.file.path);
      console.log(`[INTERNAL IMAGE UPLOAD] Cleaned up temp file: ${req.file.path}`);
    } catch (cleanupError) {
      console.error(`[INTERNAL IMAGE UPLOAD] Failed to clean up temp file:`, cleanupError);
    }

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      imageUrl: signedUrl,
      s3Key: s3Key
    });

  } catch (error) {
    console.error('[INTERNAL IMAGE UPLOAD] Error:', error);
    
    // Clean up temp file in case of error
    if (req.file?.path) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Failed to clean up temp file after error:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

// Route to handle shop image upload for internal portal
router.post('/shops/:clientId/:shopId/images/upload', requireInternalAPIAuth, debugMulter, handleMulterError, async (req, res) => {
  try {
    const { clientId, shopId } = req.params;
    const { imageType } = req.body; // Should be 'logo', 'desktopBanner', or 'mobileBanner'
    
    console.log(`[INTERNAL SHOP IMAGE UPLOAD] Uploading ${imageType} for shop ${shopId}`);
    console.log(`[INTERNAL SHOP IMAGE UPLOAD] File received:`, req.file ? req.file.originalname : 'No file');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
        error: 'NO_FILE_RECEIVED'
      });
    }

    if (!imageType || !['logo', 'desktopBanner', 'mobileBanner', 'favicon'].includes(imageType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing imageType. Must be: logo, desktopBanner, mobileBanner, or favicon',
        error: 'INVALID_IMAGE_TYPE'
      });
    }

    // Generate unique filename for S3
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

    console.log(`[INTERNAL SHOP IMAGE UPLOAD] Uploading to S3 with key: ${s3Key}`);

    // Read file from temp location
    const fileBuffer = await fs.promises.readFile(req.file.path);
    
    // Upload to S3 with private ACL
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: req.file.mimetype,
      ACL: 'private',
    });

    await s3Client.send(uploadCommand);
    console.log(`[INTERNAL SHOP IMAGE UPLOAD] Successfully uploaded to S3: ${s3Key}`);

    // Generate signed URL for accessing the image (valid for 1 hour)
    const getObjectParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
    };
    
    const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand(getObjectParams), { expiresIn: 3600 });
    console.log(`[INTERNAL SHOP IMAGE UPLOAD] Generated signed URL for ${s3Key}`);

    // Clean up temp file
    try {
      await fs.promises.unlink(req.file.path);
      console.log(`[INTERNAL SHOP IMAGE UPLOAD] Cleaned up temp file: ${req.file.path}`);
    } catch (cleanupError) {
      console.error(`[INTERNAL SHOP IMAGE UPLOAD] Failed to clean up temp file:`, cleanupError);
    }

    const response = {
      success: true,
      message: `${imageType} uploaded successfully`,
      imageUrl: signedUrl,
      s3Key: s3Key,
      imageType: imageType
    };
    
    console.log(`[INTERNAL SHOP IMAGE UPLOAD] Sending response:`, response);
    
    res.json(response);

  } catch (error) {
    console.error('[INTERNAL SHOP IMAGE UPLOAD] Error:', error);
    
    // Clean up temp file in case of error
    if (req.file?.path) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Failed to clean up temp file after error:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

module.exports = router; 