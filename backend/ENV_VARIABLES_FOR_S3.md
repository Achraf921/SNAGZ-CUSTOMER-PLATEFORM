# Environment Variables Required for S3 Sensitive Documents

Add these environment variables to your `.env` file for secure document storage:

## Required AWS S3 Configuration

```env
# AWS Configuration (Use your existing values)
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_S3_BUCKET_NAME=your-main-s3-bucket-name
```

## Optional (Recommended for Production)

```env
# Use separate bucket for sensitive documents
# If not set, will use main bucket with 'sensitive-documents/' folder
AWS_S3_SENSITIVE_DOCS_BUCKET=your-sensitive-documents-bucket-name

# KMS Key for enhanced encryption (recommended for production)
# Use either the Key ID or ARN of your KMS key
AWS_KMS_KEY_ID=12345678-1234-1234-1234-123456789012
# OR use the full ARN:
# AWS_KMS_KEY_ID=arn:aws:kms:eu-north-1:123456789012:key/12345678-1234-1234-1234-123456789012
# OR use the alias:
# AWS_KMS_KEY_ID=alias/sna-gz-sensitive-documents-key
```

## Next Steps

1. **Add these variables to your `.env` file**
2. **Run the upload script**:
   ```bash
   cd backend
   node scripts/uploadSensitiveDocuments.js
   ```
3. **Verify functionality** by testing downloads in the internal portal
4. **Remove local files** after verification:
   ```bash
   rm -rf backend/src/services/FilesPayementShopify/
   ```

The system uses your existing S3 configuration - no additional setup required! 