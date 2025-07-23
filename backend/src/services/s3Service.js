const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');

// Configure AWS S3 Client (v3)
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const bucketName = process.env.AWS_S3_BUCKET_NAME;

// Helper function to generate unique filename
const generateFileName = (originalname, folder, shopId, productId = null) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = originalname.split('.').pop();
  
  if (folder === 'products' && productId) {
    return `${folder}/shop-${shopId}/product-${productId}/${timestamp}-${randomString}.${extension}`;
  } else {
    return `${folder}/shop-${shopId}/${timestamp}-${randomString}.${extension}`;
  }
};

// Multer configuration for shop images (logos and banners)
const createShopUpload = (folder) => {
  return multer({
    storage: multerS3({
      s3: s3,
      bucket: bucketName,
      metadata: function (req, file, cb) {
        cb(null, {
          fieldName: file.fieldname,
          shopId: req.params.shopId || req.body.shopId,
          uploadedAt: new Date().toISOString()
        });
      },
      key: function (req, file, cb) {
        const shopId = req.params.shopId || req.body.shopId;
        let specificFolder = folder;
        
        // Use specific folders for different banner types and favicon
        if (file.fieldname === 'desktopBanner') {
          specificFolder = 'banners/desktop';
        } else if (file.fieldname === 'mobileBanner') {
          specificFolder = 'banners/mobile';
        } else if (file.fieldname === 'favicon') {
          specificFolder = 'favicons';
        }
        
        const fileName = generateFileName(file.originalname, specificFolder, shopId);
        cb(null, fileName);
      }
    }),
    fileFilter: (req, file, cb) => {
      // Only allow image files
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed!'), false);
      }
    },
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB limit
    }
  });
};

// Multer configuration for product images
const createProductUpload = () => {
  return multer({
    storage: multerS3({
      s3: s3,
      bucket: bucketName,
      metadata: function (req, file, cb) {
        cb(null, {
          fieldName: file.fieldname,
          shopId: req.params.shopId || req.body.shopId,
          productId: req.params.productId || req.body.productId,
          uploadedAt: new Date().toISOString()
        });
      },
      key: function (req, file, cb) {
        const shopId = req.params.shopId || req.body.shopId;
        const productId = req.params.productId || req.body.productId;
        const fileName = generateFileName(file.originalname, 'products', shopId, productId);
        cb(null, fileName);
      }
    }),
    fileFilter: (req, file, cb) => {
      // Only allow image files
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed!'), false);
      }
    },
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB limit
    }
  });
};

// Function to delete image from S3 (using SDK v3)
const deleteImage = async (imageUrl) => {
  try {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    // Extract key from full URL
    const key = imageUrl.split(`${bucketName}/`)[1];
    
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    
    await s3.send(command);
    return { success: true };
  } catch (error) {
    console.error('Error deleting image from S3:', error);
    return { success: false, error: error.message };
  }
};

// Function to get signed URL for private images (using SDK v3)
const getSignedUrl = async (key) => {
  try {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl: awsGetSignedUrl } = require('@aws-sdk/s3-request-presigner');
    
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    
    return await awsGetSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour
  } catch (error) {
    console.error('Error generating signed URL:', error);
    throw error;
  }
};

module.exports = {
  logoUpload: createShopUpload('logos'),
  bannerUpload: createShopUpload('banners'),
  faviconUpload: createShopUpload('favicons'),
  productUpload: createProductUpload(),
  deleteImage,
  getSignedUrl,
  s3,
  bucketName
}; 