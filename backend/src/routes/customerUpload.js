const express = require('express');
const router = express.Router();
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { productImagesUpload, uploadFile } = require('../services/s3Service');
const { addRequestSecurity, validateUserAccess } = require('../middleware/authSecurity');
const { getCustomersCollection } = require('../config/db');

// Rate limiting for file uploads to prevent abuse
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each user to 10 upload requests per 15 minutes
  message: {
    success: false,
    message: 'Too many upload requests. Please try again later.',
    securityAlert: 'UPLOAD_RATE_LIMIT_EXCEEDED'
  },
  keyGenerator: (req) => {
    // Use userId for rate limiting to prevent abuse per user
    return req.params.userId || req.ip;
  },
  handler: (req, res) => {
    console.log(`🔒 [SECURITY] Upload rate limit exceeded for user: ${req.params.userId || req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many upload requests. Please try again later.',
      securityAlert: 'UPLOAD_RATE_LIMIT_EXCEEDED'
    });
  }
});

// Route to upload product images (MUST be mounted before body parsers)
// SECURITY: This route is protected by authentication and user access validation
router.post(
  '/shops/:userId/:shopId/products/:productId/upload-images',
  uploadLimiter, // Rate limiting to prevent abuse
  addRequestSecurity,
  validateUserAccess,
  (req, res, next) => {
    console.log('🔍 [ROUTE DEBUG] Starting upload route');
    console.log('🔍 [ROUTE DEBUG] Request headers:', req.headers);
    console.log('🔍 [ROUTE DEBUG] Content-Type:', req.headers['content-type']);
    console.log('🔍 [ROUTE DEBUG] Content-Length:', req.headers['content-length']);
    next();
  },
  (req, res, next) => {
    console.log('🔍 [ROUTE DEBUG] About to apply multer middleware');
    next();
  },
  productImagesUpload,
  (err, req, res, next) => {
    if (err) {
      console.error('🔍 [PRODUCT UPLOAD MULTER ERROR] Multer error:', err);
      return res.status(400).json({
        success: false,
        message: 'File upload error: ' + err.message,
      });
    }
    next();
  },
  async (req, res) => {
    try {
      const { userId, shopId, productId } = req.params;
      console.log('🔍 [PRODUCT UPLOAD DEBUG] User ID:', userId);
      console.log('🔍 [PRODUCT UPLOAD DEBUG] Shop ID:', shopId);
      console.log('🔍 [PRODUCT UPLOAD DEBUG] Product ID:', productId);
      console.log('🔍 [PRODUCT UPLOAD DEBUG] Files received:', req.files ? req.files.length : 0);
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'No product images uploaded' });
      }
      
      const customersCollection = await getCustomersCollection();
      
      // SECURITY: Verify that the product belongs to the authenticated user
      const customer = await customersCollection.findOne({ 
        userId: userId,
        'shops.shopId': shopId,
        'shops.products.productId': productId
      });
      
      if (!customer) {
        console.error('🔒 [SECURITY] Unauthorized upload attempt - product not found or user mismatch');
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied: Product not found or unauthorized access',
          securityAlert: 'UNAUTHORIZED_PRODUCT_ACCESS'
        });
      }
      
      console.log('🔒 [SECURITY] Product ownership verified for user:', userId);
      
      // SECURITY: Validate file types and sizes
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
      const maxFileSize = 10 * 1024 * 1024; // 10MB (increased for convenience)
      
      for (const file of req.files) {
        // Validate file type
        if (!allowedMimeTypes.includes(file.mimetype)) {
          console.error('🔒 [SECURITY] Invalid file type attempted:', file.mimetype, file.originalname);
          return res.status(400).json({ 
            success: false, 
            message: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP, AVIF) are allowed.',
            securityAlert: 'INVALID_FILE_TYPE'
          });
        }
        
        // Validate file size
        if (file.size > maxFileSize) {
          console.error('🔒 [SECURITY] File too large:', file.size, 'bytes for', file.originalname);
          return res.status(400).json({ 
            success: false, 
            message: 'File too large. Maximum size is 10MB.',
            securityAlert: 'FILE_TOO_LARGE'
          });
        }
        
        console.log('🔒 [SECURITY] File validation passed:', file.originalname, file.mimetype, file.size, 'bytes');
      }
      
      const imageUrls = [];
      for (const file of req.files) {
        try {
          console.log('🔍 [PRODUCT UPLOAD DEBUG] Uploading file to S3:', file.originalname);
          const fileBuffer = fs.readFileSync(file.path);
          const timestamp = Date.now();
          const randomString = Math.random().toString(36).substring(2, 15);
          const extension = file.originalname.split('.').pop();
          const s3Key = `products/shop-${shopId}/product-${productId}/${timestamp}-${randomString}.${extension}`;
          const uploadResult = await uploadFile(fileBuffer, s3Key, file.mimetype);
          if (uploadResult.success) {
            const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
            imageUrls.push(s3Url);
            console.log('🔍 [PRODUCT UPLOAD DEBUG] File uploaded successfully:', s3Url);
          } else {
            console.error('🔍 [PRODUCT UPLOAD DEBUG] Failed to upload file to S3:', file.originalname, uploadResult.error);
          }
          fs.unlinkSync(file.path);
        } catch (fileError) {
          console.error('🔍 [PRODUCT UPLOAD DEBUG] Error processing file:', file.originalname, fileError);
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }
      if (imageUrls.length === 0) {
        return res.status(500).json({ success: false, message: 'Failed to upload any images to S3' });
      }
      
      // Check if this is a replacement operation
      const replaceIndex = req.body.replaceIndex ? parseInt(req.body.replaceIndex) : null;
      
      let updateOperation;
      if (replaceIndex !== null && !isNaN(replaceIndex)) {
        // Replace specific image at index
        console.log('🔍 [PRODUCT UPLOAD DEBUG] Replacing image at index:', replaceIndex);
        
        // Get current product to validate index
        const shop = customer.shops.find(s => s.shopId === shopId);
        const product = shop?.products?.find(p => p.productId === productId);
        
        if (!product || !product.imageUrls || replaceIndex < 0 || replaceIndex >= product.imageUrls.length) {
          return res.status(400).json({ 
            success: false, 
            message: 'Invalid image index for replacement',
            securityAlert: 'INVALID_REPLACE_INDEX'
          });
        }
        
        // Delete the old image from S3
        const oldImageUrl = product.imageUrls[replaceIndex];
        try {
          const s3Service = require('../services/s3Service');
          let s3Key;
          if (oldImageUrl.startsWith('https://')) {
            s3Key = decodeURIComponent(new URL(oldImageUrl).pathname.substring(1));
          } else {
            s3Key = oldImageUrl;
          }
          await s3Service.deleteImage(s3Key);
          console.log('🔍 [PRODUCT UPLOAD DEBUG] Deleted old image:', s3Key);
        } catch (deleteError) {
          console.error('🔍 [PRODUCT UPLOAD DEBUG] Failed to delete old image:', deleteError);
          // Continue with replacement even if deletion fails
        }
        
        // Create new imageUrls array with replacement
        const newImageUrls = [...product.imageUrls];
        newImageUrls[replaceIndex] = imageUrls[0]; // Replace with new image
        
        updateOperation = {
          $set: {
            'shops.$[shop].products.$[product].imageUrls': newImageUrls,
            'shops.$[shop].products.$[product].updatedAt': new Date(),
          },
        };
      } else {
        // Regular upload - append new images
        console.log('🔍 [PRODUCT UPLOAD DEBUG] Appending new images');
        
        // Get current product to append images
        const shop = customer.shops.find(s => s.shopId === shopId);
        const product = shop?.products?.find(p => p.productId === productId);
        const currentImageUrls = product?.imageUrls || [];
        
        // Check if adding new images would exceed limit
        if (currentImageUrls.length + imageUrls.length > 5) {
          return res.status(400).json({ 
            success: false, 
            message: 'Cannot add more images. Maximum 5 images allowed per product.',
            securityAlert: 'TOO_MANY_IMAGES'
          });
        }
        
        const newImageUrls = [...currentImageUrls, ...imageUrls];
        
        updateOperation = {
          $set: {
            'shops.$[shop].products.$[product].imageUrls': newImageUrls,
            'shops.$[shop].products.$[product].updatedAt': new Date(),
          },
        };
      }
      
      // Update product with image URLs
      const result = await customersCollection.updateOne(
        {
          'shops.shopId': shopId,
          'shops.products.productId': productId,
        },
        updateOperation,
        {
          arrayFilters: [
            { 'shop.shopId': shopId },
            { 'product.productId': productId },
          ],
        }
      );
      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }
      console.log('🔒 [SECURITY] Upload completed successfully for user:', userId, 'Product:', productId, 'Files:', imageUrls.length);
      res.json({
        success: true,
        imageUrls,
        message: `${imageUrls.length} product images uploaded successfully`,
      });
    } catch (error) {
      console.error('🔍 [PRODUCT UPLOAD ERROR] Error uploading product images:', error);
      console.error('🔒 [SECURITY] Upload failed for user:', req.params.userId, 'Product:', req.params.productId);
      
      // Clean up any uploaded files if there was an error
      if (req.files) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            try {
              fs.unlinkSync(file.path);
              console.log('🔒 [SECURITY] Cleaned up temporary file:', file.path);
            } catch (cleanupError) {
              console.error('🔒 [SECURITY] Failed to cleanup file:', file.path, cleanupError);
            }
          }
        });
      }
      
      res.status(500).json({ success: false, message: 'Error uploading product images' });
    }
  }
);

module.exports = router; 