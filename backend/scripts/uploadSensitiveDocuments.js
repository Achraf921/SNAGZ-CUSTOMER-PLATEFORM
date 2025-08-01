#!/usr/bin/env node

/**
 * One-time script to upload sensitive documents to S3
 * Run this script after setting up your S3 environment variables
 * 
 * Usage: node scripts/uploadSensitiveDocuments.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { initializeSensitiveDocuments, listSensitiveDocuments } = require('../src/services/sensitiveDocumentsS3');
const fs = require('fs');
const path = require('path');

const main = async () => {
  console.log('🚀 [UPLOAD SCRIPT] Starting sensitive documents upload...');
  console.log('📋 [UPLOAD SCRIPT] Environment check:');
  console.log(`   - AWS_REGION: ${process.env.AWS_REGION || 'NOT SET'}`);
  console.log(`   - AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'NOT SET'}`);
  console.log(`   - AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`   - AWS_S3_BUCKET_NAME: ${process.env.AWS_S3_BUCKET_NAME || 'NOT SET'}`);
  console.log(`   - AWS_S3_SENSITIVE_DOCS_BUCKET: ${process.env.AWS_S3_SENSITIVE_DOCS_BUCKET || 'Using main bucket'}`);
  
  // Verify environment variables
  const requiredEnvVars = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ [UPLOAD SCRIPT] Missing required environment variables:', missingVars);
    console.error('   Please ensure your .env file contains all required AWS credentials');
    process.exit(1);
  }
  
  // Check if source files exist
  const sourceDir = path.join(__dirname, '../src/services/FilesPayementShopify');
  const requiredFiles = [
    'Extrait KBIS - SNA GZ.pdf',
    'Justificatif de domicile 23 juil. 2024.pdf',
    'Passport_Boris.jpg'
  ];
  
  console.log(`\n📁 [UPLOAD SCRIPT] Checking source files in: ${sourceDir}`);
  let missingFiles = [];
  
  for (const file of requiredFiles) {
    const filePath = path.join(sourceDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`   ✅ ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } else {
      console.log(`   ❌ ${file} - NOT FOUND`);
      missingFiles.push(file);
    }
  }
  
  if (missingFiles.length > 0) {
    console.error('\n❌ [UPLOAD SCRIPT] Some required files are missing.');
    console.error('   This script expects the sensitive documents to be in:');
    console.error(`   ${sourceDir}`);
    console.error('\n   Missing files:', missingFiles);
    process.exit(1);
  }
  
  try {
    console.log('\n🔄 [UPLOAD SCRIPT] Starting upload process...');
    
    // Initialize and upload documents
    await initializeSensitiveDocuments();
    
    console.log('\n📋 [UPLOAD SCRIPT] Verifying uploads...');
    const uploadedDocs = await listSensitiveDocuments();
    
    console.log(`   Found ${uploadedDocs.length} documents in S3:`);
    uploadedDocs.forEach(doc => {
      console.log(`   ✅ ${doc.fileName} (${(doc.size / 1024 / 1024).toFixed(2)} MB) - ${doc.lastModified}`);
    });
    
    if (uploadedDocs.length === requiredFiles.length) {
      console.log('\n🎉 [UPLOAD SCRIPT] All documents successfully uploaded to S3!');
      console.log('\n🧹 [UPLOAD SCRIPT] Next steps:');
      console.log('   1. Verify the documents are accessible via the internal portal');
      console.log('   2. Once confirmed, remove the local files for security:');
      console.log(`      rm -rf "${sourceDir}"`);
      console.log('   3. Update your .gitignore to exclude any future sensitive documents');
    } else {
      console.warn('\n⚠️ [UPLOAD SCRIPT] Warning: Not all documents were uploaded successfully');
      console.warn(`   Expected: ${requiredFiles.length}, Found: ${uploadedDocs.length}`);
    }
    
  } catch (error) {
    console.error('\n❌ [UPLOAD SCRIPT] Error during upload process:', error);
    console.error('\n🔧 [UPLOAD SCRIPT] Troubleshooting tips:');
    console.error('   1. Verify your AWS credentials have S3 permissions');
    console.error('   2. Ensure your S3 bucket exists and is accessible');
    console.error('   3. Check your network connection');
    console.error('   4. Verify the bucket region matches AWS_REGION');
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⏹️ [UPLOAD SCRIPT] Upload interrupted by user');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ [UPLOAD SCRIPT] Unhandled rejection:', reason);
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('\n💥 [UPLOAD SCRIPT] Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main }; 