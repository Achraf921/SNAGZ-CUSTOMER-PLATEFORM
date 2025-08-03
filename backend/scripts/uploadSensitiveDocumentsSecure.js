#!/usr/bin/env node

/**
 * SECURE SENSITIVE DOCUMENTS UPLOAD SCRIPT
 * 
 * This script securely uploads sensitive documents to S3.
 * It should be run manually by authorized personnel only.
 * 
 * SECURITY NOTES:
 * - Documents are encrypted with KMS or AES256
 * - Access is restricted to authorized personnel
 * - All operations are logged for audit purposes
 * - Documents are stored in a separate S3 bucket/folder
 */

const { uploadSensitiveDocument, documentExists, listSensitiveDocuments } = require('../src/services/sensitiveDocumentsS3');
const { logger } = require('../src/utils/secureLogger');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Create readline interface for secure input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Security validation
function validateEnvironment() {
  const requiredEnvVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY', 
    'AWS_REGION'
  ];
  
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('Please set these variables before running the script.');
    process.exit(1);
  }
  
  if (!process.env.AWS_S3_SENSITIVE_DOCS_BUCKET && !process.env.AWS_S3_BUCKET_NAME) {
    console.error('❌ Missing S3 bucket configuration');
    console.error('Please set AWS_S3_SENSITIVE_DOCS_BUCKET or AWS_S3_BUCKET_NAME');
    process.exit(1);
  }
  
  console.log('✅ Environment validation passed');
}

// Secure file validation
function validateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'File does not exist' };
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return { valid: false, error: 'File is empty' };
  }
  
  if (stats.size > 50 * 1024 * 1024) { // 50MB limit
    return { valid: false, error: 'File is too large (max 50MB)' };
  }
  
  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
  const ext = path.extname(filePath).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return { valid: false, error: `File type not allowed: ${ext}` };
  }
  
  return { valid: true, size: stats.size };
}

// Interactive file upload
async function uploadFileInteractively() {
  return new Promise((resolve) => {
    rl.question('📁 Enter the full path to the document file: ', async (filePath) => {
      const trimmedPath = filePath.trim();
      
      // Validate file
      const validation = validateFile(trimmedPath);
      if (!validation.valid) {
        console.error(`❌ File validation failed: ${validation.error}`);
        resolve(false);
        return;
      }
      
      console.log(`✅ File validated: ${path.basename(trimmedPath)} (${validation.size} bytes)`);
      
      // Get filename for S3
      rl.question('📝 Enter the filename for S3 storage (or press Enter to use original name): ', async (s3FileName) => {
        const fileName = s3FileName.trim() || path.basename(trimmedPath);
        
        // Confirm upload
        rl.question(`⚠️  Are you sure you want to upload "${path.basename(trimmedPath)}" as "${fileName}" to S3? (yes/no): `, async (confirm) => {
          if (confirm.toLowerCase() !== 'yes') {
            console.log('❌ Upload cancelled');
            resolve(false);
            return;
          }
          
          try {
            console.log(`🔄 Uploading ${fileName} to S3...`);
            
            // Check if file already exists
            const exists = await documentExists(fileName);
            if (exists) {
              rl.question(`⚠️  File "${fileName}" already exists in S3. Overwrite? (yes/no): `, async (overwrite) => {
                if (overwrite.toLowerCase() !== 'yes') {
                  console.log('❌ Upload cancelled');
                  resolve(false);
                  return;
                }
                
                await performUpload(trimmedPath, fileName);
                resolve(true);
              });
            } else {
              await performUpload(trimmedPath, fileName);
              resolve(true);
            }
          } catch (error) {
            console.error('❌ Upload failed:', error.message);
            resolve(false);
          }
        });
      });
    });
  });
}

// Perform the actual upload
async function performUpload(filePath, fileName) {
  try {
    const metadata = {
      uploadedBy: process.env.USER || 'unknown',
      uploadedAt: new Date().toISOString(),
      sourcePath: filePath,
      documentType: 'sensitive'
    };
    
    const result = await uploadSensitiveDocument(filePath, fileName, metadata);
    
    if (result.success) {
      console.log(`✅ Successfully uploaded: ${fileName}`);
      console.log(`   S3 Key: ${result.key}`);
      console.log(`   ETag: ${result.etag}`);
      console.log(`   Location: ${result.location}`);
    } else {
      console.error(`❌ Upload failed: ${result.error}`);
    }
  } catch (error) {
    console.error('❌ Upload error:', error.message);
  }
}

// List existing documents
async function listDocuments() {
  console.log('\n📋 Listing existing sensitive documents in S3:');
  const documents = await listSensitiveDocuments();
  
  if (documents.length === 0) {
    console.log('   No documents found in S3');
  } else {
    documents.forEach(doc => {
      console.log(`   📄 ${doc.fileName} (${doc.size} bytes) - Modified: ${doc.lastModified}`);
    });
  }
}

// Main function
async function main() {
  console.log('🔐 SECURE SENSITIVE DOCUMENTS UPLOAD');
  console.log('=====================================\n');
  
  // Validate environment
  validateEnvironment();
  
  // List existing documents
  await listDocuments();
  
  console.log('\n📤 Upload Options:');
  console.log('1. Upload a single document');
  console.log('2. List documents only');
  console.log('3. Exit');
  
  rl.question('\nSelect an option (1-3): ', async (option) => {
    switch (option.trim()) {
      case '1':
        const success = await uploadFileInteractively();
        if (success) {
          console.log('\n✅ Upload completed successfully');
          await listDocuments();
        }
        break;
      case '2':
        await listDocuments();
        break;
      case '3':
        console.log('👋 Exiting...');
        break;
      default:
        console.log('❌ Invalid option');
    }
    
    rl.close();
  });
}

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Script interrupted by user');
  rl.close();
  process.exit(0);
});

// Run the script
main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
}); 