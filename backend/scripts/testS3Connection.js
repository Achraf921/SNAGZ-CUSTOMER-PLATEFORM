#!/usr/bin/env node

/**
 * Test script to verify S3 connection and permissions
 * Run this before uploading sensitive documents
 * 
 * Usage: node scripts/testS3Connection.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const main = async () => {
  console.log('🧪 [S3 TEST] Testing S3 connection and permissions...\n');

  // Environment check
  console.log('📋 [S3 TEST] Environment variables:');
  console.log(`   AWS_REGION: ${process.env.AWS_REGION || 'NOT SET'}`);
  console.log(`   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'NOT SET'}`);
  console.log(`   AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`   AWS_S3_BUCKET_NAME: ${process.env.AWS_S3_BUCKET_NAME || 'NOT SET'}`);
  console.log(`   AWS_S3_SENSITIVE_DOCS_BUCKET: ${process.env.AWS_S3_SENSITIVE_DOCS_BUCKET || 'Using main bucket'}\n`);

  const requiredEnvVars = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ [S3 TEST] Missing required environment variables:', missingVars);
    process.exit(1);
  }

  // Configure S3 client
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const testBucket = process.env.AWS_S3_SENSITIVE_DOCS_BUCKET || process.env.AWS_S3_BUCKET_NAME;
  const testKey = 'sensitive-documents/test-file.txt';
  const testContent = 'This is a test file to verify S3 permissions.';

  try {
    // Test 1: List bucket contents
    console.log('🔍 [S3 TEST] Test 1: Listing bucket contents...');
    const listCommand = new ListObjectsV2Command({
      Bucket: testBucket,
      Prefix: 'sensitive-documents/',
      MaxKeys: 5
    });
    
    const listResult = await s3Client.send(listCommand);
    console.log(`   ✅ Success! Found ${listResult.Contents?.length || 0} objects in sensitive-documents/ folder`);

    // Test 2: Upload test file
    console.log('\n📤 [S3 TEST] Test 2: Uploading test file...');
    
    // Configure encryption based on available KMS key
    const encryptionConfig = process.env.AWS_KMS_KEY_ID ? {
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.AWS_KMS_KEY_ID
    } : {
      ServerSideEncryption: 'AES256'
    };
    
    console.log(`   Using ${process.env.AWS_KMS_KEY_ID ? 'KMS' : 'AES256'} encryption...`);
    
    const putCommand = new PutObjectCommand({
      Bucket: testBucket,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain',
      Metadata: {
        testFile: 'true',
        createdAt: new Date().toISOString(),
        encryptionType: process.env.AWS_KMS_KEY_ID ? 'KMS' : 'AES256'
      },
      ...encryptionConfig
    });
    
    await s3Client.send(putCommand);
    console.log('   ✅ Success! Test file uploaded with encryption');

    // Test 3: Download test file
    console.log('\n📥 [S3 TEST] Test 3: Downloading test file...');
    const getCommand = new GetObjectCommand({
      Bucket: testBucket,
      Key: testKey
    });
    
    const getResult = await s3Client.send(getCommand);
    const downloadedContent = await streamToString(getResult.Body);
    
    if (downloadedContent === testContent) {
      console.log('   ✅ Success! File downloaded and content matches');
    } else {
      console.log('   ⚠️ Warning: Downloaded content does not match uploaded content');
    }

    // Test 4: Clean up test file
    console.log('\n🧹 [S3 TEST] Test 4: Cleaning up test file...');
    const deleteCommand = new DeleteObjectCommand({
      Bucket: testBucket,
      Key: testKey
    });
    
    await s3Client.send(deleteCommand);
    console.log('   ✅ Success! Test file deleted');

    // Final success message
    console.log('\n🎉 [S3 TEST] All tests passed! Your S3 configuration is working correctly.');
    console.log(`\n📋 [S3 TEST] Bucket details:`);
    console.log(`   Bucket: ${testBucket}`);
    console.log(`   Region: ${process.env.AWS_REGION}`);
    console.log(`   Encryption: AES256`);
    console.log(`   Folder: sensitive-documents/`);
    
    console.log('\n✅ [S3 TEST] You can now run the sensitive documents upload script:');
    console.log('   node scripts/uploadSensitiveDocuments.js');

  } catch (error) {
    console.error('\n❌ [S3 TEST] Error during S3 testing:', error.message);
    
    if (error.name === 'NoSuchBucket') {
      console.error('\n🔧 [S3 TEST] Bucket does not exist. Please:');
      console.error('   1. Verify the bucket name in your environment variables');
      console.error('   2. Create the bucket if it doesn\'t exist');
      console.error('   3. Ensure the bucket is in the correct region');
    } else if (error.name === 'AccessDenied') {
      console.error('\n🔧 [S3 TEST] Access denied. Please verify:');
      console.error('   1. AWS credentials are correct');
      console.error('   2. IAM user has S3 permissions');
      console.error('   3. Bucket policy allows your user access');
    } else if (error.name === 'SignatureDoesNotMatch') {
      console.error('\n🔧 [S3 TEST] Invalid AWS credentials:');
      console.error('   1. Check AWS_ACCESS_KEY_ID');
      console.error('   2. Check AWS_SECRET_ACCESS_KEY');
      console.error('   3. Ensure credentials are not expired');
    }
    
    process.exit(1);
  }
};

// Helper function to convert stream to string
const streamToString = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⏹️ [S3 TEST] Test interrupted by user');
  process.exit(0);
});

// Run the test
if (require.main === module) {
  main().catch(error => {
    console.error('\n💥 [S3 TEST] Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main }; 