const express = require('express');
const { logger } = require('../utils/secureLogger');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const fileUpload = require('express-fileupload');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { connectToDatabase } = require('../config/db');
const { ObjectId } = require('mongodb');

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Authentication middleware for customer API
const requireClientAPIAuth = (req, res, next) => {
  if (!req.session.userInfo) {
    logger.debug(`[API AUTH] Customer API access denied for: ${req.originalUrl}`);
    return res.status(401).json({
      success: false,
      message: 'Authentication required - Customer access only',
      securityAlert: 'UNAUTHORIZED_API_ACCESS'
    });
  }
  logger.debug(`[API AUTH] Customer API access granted for: ${req.originalUrl}`);
  next();
};

// Route to handle shop image upload for customer portal
router.post('/shops/:userId/:shopId/upload-image',
  // Apply express-fileupload directly to this route
  fileUpload({
    useTempFiles: true,
    tempFileDir: '/tmp/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    abortOnLimit: false,
    responseOnLimit: "File size limit has been reached",
    limitHandler: (req, res, next) => {
      logger.debug('❌ [UPLOAD] File size limit exceeded');
      res.status(413).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.',
        error: 'FILE_SIZE_LIMIT_EXCEEDED'
      });
    }
  }),
  requireClientAPIAuth,
  async (req, res) => {
    const uploadStart = Date.now();
    const requestId = Math.random().toString(36).substring(2, 15);
    
    try {
      logger.debug(`🚀 [UPLOAD ${requestId}] Customer shop image upload started`);
      logger.debug(`🎯 [UPLOAD ${requestId}] Using express-fileupload`);
      logger.debug(`📏 [UPLOAD ${requestId}] Files received:`, Object.keys(req.files || {}));
      
      const { userId, shopId } = req.params;
      const { imageType } = req.body;
      
      // Validate file
      if (!req.files || !req.files.image) {
        logger.debug(`❌ [UPLOAD ${requestId}] No file provided`);
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
          error: 'NO_FILE_PROVIDED'
        });
      }
      
      const imageFile = req.files.image;
      
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
      logger.debug(`📁 [UPLOAD ${requestId}] File: ${imageFile.name}, Size: ${imageFile.size} bytes`);
      
      // Validate file type
      if (!imageFile.mimetype || !imageFile.mimetype.startsWith('image/')) {
        logger.debug(`❌ [UPLOAD ${requestId}] Invalid file type: ${imageFile.mimetype}`);
        return res.status(400).json({
          success: false,
          message: 'Only image files are allowed',
          error: 'INVALID_FILE_TYPE'
        });
      }
      
      // Connect to database to find and validate shop
      const db = await connectToDatabase();
      const customersCollection = db.collection('customers');
      
      // Find customer and shop
      const customer = await customersCollection.findOne({ userId });
      if (!customer) {
        logger.debug(`❌ [UPLOAD ${requestId}] Customer not found: ${userId}`);
        return res.status(404).json({
          success: false,
          message: 'Customer not found',
          error: 'CUSTOMER_NOT_FOUND'
        });
      }
      
      // Check if customer has shops array
      if (!customer.shops || !Array.isArray(customer.shops)) {
        logger.debug(`❌ [UPLOAD ${requestId}] No shops found for customer`);
        return res.status(404).json({
          success: false,
          message: 'No shops found for this customer',
          error: 'NO_SHOPS_FOUND'
        });
      }
      
      // Find the shop in the array
      const shopIndex = customer.shops.findIndex(shop => shop.shopId === shopId);
      if (shopIndex === -1) {
        logger.debug(`❌ [UPLOAD ${requestId}] Shop not found: ${shopId}`);
        return res.status(404).json({
          success: false,
          message: 'Shop not found',
          error: 'SHOP_NOT_FOUND'
        });
      }
      
      logger.debug(`✅ [UPLOAD ${requestId}] Shop validation passed - Customer: ${customer.raisonSociale}, Shop Index: ${shopIndex}`);
      
      // Generate S3 key
      const timestamp = Date.now();
      const fileExtension = path.extname(imageFile.name);
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
      
      // Read file data
      const fileData = await fs.promises.readFile(imageFile.tempFilePath);
      
      // Upload to S3
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: s3Key,
        Body: fileData,
        ContentType: imageFile.mimetype,
        ACL: 'private',
      });
      
      await s3Client.send(uploadCommand);
      logger.debug(`✅ [UPLOAD ${requestId}] Successfully uploaded to S3`);
      
      // Clean up temp file
      try {
        await fs.promises.unlink(imageFile.tempFilePath);
        logger.debug(`🧹 [UPLOAD ${requestId}] Temp file cleaned up`);
      } catch (cleanupErr) {
        logger.debug(`⚠️ [UPLOAD ${requestId}] Temp file cleanup failed:`, cleanupErr.message);
      }
      
      // **CRITICAL: Update the shop with the S3 key in the database**
      logger.debug(`💾 [UPLOAD ${requestId}] Updating database with S3 key...`);
      const updateOperation = {
        $set: { 
          [`shops.${shopIndex}.${imageType}S3Key`]: s3Key,
          [`shops.${shopIndex}.updatedAt`]: new Date(),
          updatedAt: new Date()
        }
      };
      
      const dbUpdateResult = await customersCollection.updateOne(
        { userId },
        updateOperation
      );
      
      logger.debug("Database operation completed");
      
      if (dbUpdateResult.modifiedCount === 0) {
        logger.debug(`❌ [UPLOAD ${requestId}] Failed to update database`);
        return res.status(500).json({
          success: false,
          message: 'Image uploaded to S3 but failed to update database',
          error: 'DATABASE_UPDATE_FAILED'
        });
      }
      
      logger.debug(`✅ [UPLOAD ${requestId}] Database updated successfully!`);
      
      // Generate signed URL for immediate display
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

// Compatibility route for old upload-images endpoint (handles multiple files - APPEND ONLY)
router.post('/shops/:userId/:shopId/products/:productId/upload-images',
  // Apply express-fileupload directly to this route
  fileUpload({
    useTempFiles: true,
    tempFileDir: '/tmp/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    abortOnLimit: false,
    responseOnLimit: "File size limit has been reached"
  }),
  requireClientAPIAuth,
  async (req, res) => {
    const uploadStart = Date.now();
    const requestId = Math.random().toString(36).substring(2, 15);
    
    try {
      logger.debug(`🚀 [UPLOAD ${requestId}] Customer product images (bulk) upload started - APPEND MODE`);
      logger.debug(`🎯 [UPLOAD ${requestId}] Using express-fileupload`);
      logger.debug(`📏 [UPLOAD ${requestId}] Files received:`, Object.keys(req.files || {}));
      
      const { userId, shopId, productId } = req.params;
      
      // Validate files
      if (!req.files || !req.files.productImages) {
        logger.debug(`❌ [UPLOAD ${requestId}] No files provided`);
        return res.status(400).json({
          success: false,
          message: 'No files uploaded',
          error: 'NO_FILES_PROVIDED'
        });
      }
      
      // Handle both single and multiple files
      const files = Array.isArray(req.files.productImages) ? req.files.productImages : [req.files.productImages];
      logger.debug(`📏 [UPLOAD ${requestId}] Processing ${files.length} file(s) for APPEND`);
      
      const uploadedImages = [];
      
      // Upload each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        logger.debug(`📁 [UPLOAD ${requestId}] Processing image ${i}: ${file.name}, Size: ${file.size} bytes`);
        
        // Validate file type
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
          logger.debug(`❌ [UPLOAD ${requestId}] Invalid file type for image ${i}: ${file.mimetype}`);
          continue; // Skip invalid files
        }
        
        // Generate S3 key
        const timestamp = Date.now();
        const fileExtension = path.extname(file.name);
        const uniqueFilename = `${timestamp}-${Math.random().toString(36).substring(2, 15)}${fileExtension}`;
        const s3Key = `products/${shopId}/${productId}/image-${i}/${uniqueFilename}`;
        
        logger.debug(`☁️ [UPLOAD ${requestId}] Uploading to S3 with key: ${s3Key}`);
        
        // Read file data
        const fileData = await fs.promises.readFile(file.tempFilePath);
        
        // Upload to S3
        const uploadCommand = new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: s3Key,
          Body: fileData,
          ContentType: file.mimetype,
          ACL: 'private',
        });
        
        await s3Client.send(uploadCommand);
        logger.debug(`✅ [UPLOAD ${requestId}] Successfully uploaded image ${i} to S3`);
        
        // Clean up temp file
        try {
          await fs.promises.unlink(file.tempFilePath);
        } catch (cleanupErr) {
          logger.debug(`⚠️ [UPLOAD ${requestId}] Temp file cleanup failed for image ${i}:`, cleanupErr.message);
        }
        
        // Generate signed URL
        const getCommand = new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: s3Key,
        });
        
        const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
        
        uploadedImages.push({
          imageUrl: signedUrl,
          s3Key: s3Key,
          imageIndex: i
        });
      }
      
      logger.debug(`✅ [UPLOAD ${requestId}] All images uploaded successfully`);
      
      // 🔍 UPDATE PRODUCT IN DATABASE WITH IMAGE URLs (APPEND MODE)
      try {
        logger.debug(`💾 [UPLOAD ${requestId}] Updating product in database with image URLs - APPEND MODE`);
        
        const { getCustomersCollection } = require('../config/db');
      const customersCollection = await getCustomersCollection();
      
        // Extract S3 keys for database storage (not signed URLs which expire)
        const newImageUrls = uploadedImages.map(img => img.s3Key);
        
        logger.debug(`💾 [UPLOAD ${requestId}] Adding ${newImageUrls.length} new image URLs to product ${productId}`);
        logger.debug(`💾 [UPLOAD ${requestId}] New image URLs:`, newImageUrls);
        
        // First, fetch the current product to get existing images
      const customer = await customersCollection.findOne({ 
        userId: userId,
        'shops.shopId': shopId,
        'shops.products.productId': productId
      });
      
      if (!customer) {
          logger.debug(`⚠️ [UPLOAD ${requestId}] Warning: Customer or product not found for image update`);
          throw new Error('Product not found');
        }
        
        // Find the specific product and get existing images
        const shop = customer.shops.find(s => s.shopId === shopId);
        const product = shop?.products?.find(p => p.productId === productId);
        const existingImages = product?.imageUrls || [];
        
        logger.debug(`💾 [UPLOAD ${requestId}] Found ${existingImages.length} existing images`);
        logger.debug(`💾 [UPLOAD ${requestId}] Existing images:`, existingImages);
        
        // APPEND OPERATION: Add new images to existing ones
        logger.debug(`➕ [UPLOAD ${requestId}] Appending new images to existing ones`);
        
        // Combine existing and new images, limit to max 5
        const combinedImages = [...existingImages, ...newImageUrls];
        const finalImages = combinedImages.slice(0, 5); // Limit to max 5 images
        
        logger.debug(`➕ [UPLOAD ${requestId}] Final image count: ${finalImages.length} (max 5)`);
        logger.debug(`➕ [UPLOAD ${requestId}] Final image URLs:`, finalImages);
        
        if (combinedImages.length > 5) {
          logger.debug(`⚠️ [UPLOAD ${requestId}] Warning: ${combinedImages.length} total images, truncated to 5`);
        }
        
        // Update the product document with final image URLs
        const updateResult = await customersCollection.updateOne(
          { 
            userId: userId,
            'shops.shopId': shopId,
            'shops.products.productId': productId
          },
          {
            $set: {
              'shops.$[shop].products.$[product].imageUrls': finalImages,
              'shops.$[shop].products.$[product].updatedAt': new Date()
            }
          },
          {
            arrayFilters: [
              { 'shop.shopId': shopId },
              { 'product.productId': productId }
            ]
          }
        );
        
        logger.debug("Database operation completed");
        
        if (updateResult.modifiedCount === 0) {
          logger.debug(`⚠️ [UPLOAD ${requestId}] Warning: Product not updated in database (product may not exist)`);
        } else {
          logger.debug(`✅ [UPLOAD ${requestId}] Product successfully updated with ${finalImages.length} total image URLs`);
        }
        
      } catch (dbError) {
        logger.error(`❌ [UPLOAD ${requestId}] Database update error:`, dbError);
        // Don't fail the entire upload if DB update fails, but log it
      }
      
      const response = {
        success: true,
        message: `${uploadedImages.length} product images uploaded successfully`,
        imageUrls: uploadedImages.map(img => img.imageUrl),
        images: uploadedImages
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

// NEW ENDPOINT: Replace specific product image
router.post('/shops/:userId/:shopId/products/:productId/replace-image/:imageIndex',
  // Apply express-fileupload directly to this route
  fileUpload({
    useTempFiles: true,
    tempFileDir: '/tmp/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    abortOnLimit: false,
    responseOnLimit: "File size limit has been reached"
  }),
  requireClientAPIAuth,
  async (req, res) => {
    const uploadStart = Date.now();
    const requestId = Math.random().toString(36).substring(2, 15);
    
    try {
      logger.debug(`🚀 [REPLACE ${requestId}] Customer product image replacement started`);
      logger.debug(`🎯 [REPLACE ${requestId}] Using express-fileupload`);
      logger.debug(`📏 [REPLACE ${requestId}] Files received:`, Object.keys(req.files || {}));
      
      const { userId, shopId, productId, imageIndex } = req.params;
      const replaceIndex = parseInt(imageIndex);
      
      logger.debug(`🔍 [REPLACE ${requestId}] Replacing image at index: ${replaceIndex}`);
      
      // Validate files
      if (!req.files || !req.files.productImages) {
        logger.debug(`❌ [REPLACE ${requestId}] No files provided`);
          return res.status(400).json({ 
            success: false, 
          message: 'No files uploaded',
          error: 'NO_FILES_PROVIDED'
        });
      }
      
      // Handle both single and multiple files (but we only need the first one for replacement)
      const files = Array.isArray(req.files.productImages) ? req.files.productImages : [req.files.productImages];
      logger.debug(`📏 [REPLACE ${requestId}] Processing ${files.length} file(s) for REPLACE`);
      
      if (files.length === 0) {
        logger.debug(`❌ [REPLACE ${requestId}] No valid files provided`);
        return res.status(400).json({
            success: false, 
          message: 'No valid files provided',
          error: 'NO_VALID_FILES'
        });
      }
      
      // Take only the first file for replacement
      const file = files[0];
      logger.debug(`📁 [REPLACE ${requestId}] Processing replacement image: ${file.name}, Size: ${file.size} bytes`);
      
      // Validate file type
      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        logger.debug(`❌ [REPLACE ${requestId}] Invalid file type: ${file.mimetype}`);
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only images are allowed.',
          error: 'INVALID_FILE_TYPE'
        });
      }
      
      // Generate S3 key
      const timestamp = Date.now();
      const fileExtension = path.extname(file.name);
      const uniqueFilename = `${timestamp}-${Math.random().toString(36).substring(2, 15)}${fileExtension}`;
      const s3Key = `products/${shopId}/${productId}/image-${replaceIndex}/${uniqueFilename}`;
      
      logger.debug(`☁️ [REPLACE ${requestId}] Uploading to S3 with key: ${s3Key}`);
      
      // Read file data
      const fileData = await fs.promises.readFile(file.tempFilePath);
      
      // Upload to S3
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: s3Key,
        Body: fileData,
        ContentType: file.mimetype,
        ACL: 'private',
      });
      
      await s3Client.send(uploadCommand);
      logger.debug(`✅ [REPLACE ${requestId}] Successfully uploaded replacement image to S3`);
      
      // Clean up temp file
      try {
        await fs.promises.unlink(file.tempFilePath);
      } catch (cleanupErr) {
        logger.debug(`⚠️ [REPLACE ${requestId}] Temp file cleanup failed:`, cleanupErr.message);
      }
      
      // Generate signed URL
      const getCommand = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: s3Key,
      });
      
      const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
      
      // 🔍 UPDATE PRODUCT IN DATABASE WITH REPLACED IMAGE URL
      try {
        logger.debug(`💾 [REPLACE ${requestId}] Updating product in database with replaced image URL`);
        
        const { getCustomersCollection } = require('../config/db');
        const customersCollection = await getCustomersCollection();
        
        // First, fetch the current product to get existing images
        const customer = await customersCollection.findOne({
          userId: userId,
          'shops.shopId': shopId,
          'shops.products.productId': productId
        });
        
        if (!customer) {
          logger.debug(`❌ [REPLACE ${requestId}] Customer or product not found`);
          return res.status(404).json({
            success: false, 
            message: 'Product not found',
            error: 'PRODUCT_NOT_FOUND'
          });
        }
        
        // Find the specific product and get existing images
        const shop = customer.shops.find(s => s.shopId === shopId);
        const product = shop?.products?.find(p => p.productId === productId);
        const existingImages = product?.imageUrls || [];
        
        logger.debug(`💾 [REPLACE ${requestId}] Found ${existingImages.length} existing images`);
        logger.debug(`💾 [REPLACE ${requestId}] Existing images:`, existingImages);
        
        // Validate replace index
        if (replaceIndex < 0 || replaceIndex >= existingImages.length) {
          logger.debug(`❌ [REPLACE ${requestId}] Invalid replace index: ${replaceIndex}, max allowed: ${existingImages.length - 1}`);
          return res.status(400).json({ 
            success: false, 
            message: `Invalid replace index: ${replaceIndex}. Valid range: 0-${existingImages.length - 1}`,
            error: 'INVALID_REPLACE_INDEX'
          });
        }
        
        // REPLACE OPERATION: Replace image at specific index
        logger.debug(`🔄 [REPLACE ${requestId}] Replacing image at index ${replaceIndex}`);
        
        // Create a copy of existing images and replace at the specified index
        const finalImages = [...existingImages];
        finalImages[replaceIndex] = s3Key; // Replace with the new S3 key
        
        logger.debug(`🔄 [REPLACE ${requestId}] Replaced image at index ${replaceIndex}`);
        logger.debug(`🔄 [REPLACE ${requestId}] Final images after replacement:`, finalImages);
        
        // Update the product document with final image URLs
        const updateResult = await customersCollection.updateOne(
          { 
            userId: userId,
            'shops.shopId': shopId,
            'shops.products.productId': productId
          },
          {
            $set: {
              'shops.$[shop].products.$[product].imageUrls': finalImages,
              'shops.$[shop].products.$[product].updatedAt': new Date()
            }
          },
        {
          arrayFilters: [
            { 'shop.shopId': shopId },
              { 'product.productId': productId }
            ]
          }
        );
        
        console.log(`💾 [REPLACE ${requestId}] Database update result:`, {
          acknowledged: updateResult.acknowledged,
          modifiedCount: updateResult.modifiedCount,
          matchedCount: updateResult.matchedCount
        });
        
        if (updateResult.modifiedCount === 0) {
          logger.debug(`⚠️ [REPLACE ${requestId}] Warning: Product not updated in database`);
          return res.status(500).json({
            success: false,
            message: 'Failed to update product in database',
            error: 'DATABASE_UPDATE_FAILED'
          });
        } else {
          logger.debug(`✅ [REPLACE ${requestId}] Product successfully updated with replaced image`);
        }
        
      } catch (dbError) {
        logger.error(`❌ [REPLACE ${requestId}] Database update error:`, dbError);
        return res.status(500).json({
          success: false,
          message: 'Database update failed',
          error: dbError.message
        });
      }
      
      const response = {
        success: true,
        message: `Image replaced successfully at index ${replaceIndex}`,
        imageUrl: signedUrl,
        s3Key: s3Key,
        replacedIndex: replaceIndex
      };
      
      logger.debug(`✅ [REPLACE ${requestId}] Replacement completed in ${Date.now() - uploadStart}ms`);
      res.json(response);
      
    } catch (error) {
      logger.error(`❌ [REPLACE ${requestId}] Error:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during image replacement',
        error: error.message
      });
    }
});

module.exports = router; 