# Sensitive Documents S3 Setup Guide

This guide explains how to securely migrate sensitive documents from the filesystem to AWS S3 for the internal portal's parametrization wizard.

## Overview

The internal portal's parametrization wizard requires access to 3 critical documents:
- **Extrait KBIS - SNA GZ.pdf** (Company registration document)
- **Justificatif de domicile 23 juil. 2024.pdf** (Proof of address)
- **Passport_Boris.jpg** (Identity document)

These documents have been moved from the filesystem to encrypted S3 storage for enhanced security.

## Environment Variables

Add these variables to your `.env` file:

### Required (Use your existing S3 configuration)
```env
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_S3_BUCKET_NAME=your-main-s3-bucket-name
```

### Optional (Recommended for production)
```env
# Use a separate bucket specifically for sensitive documents
AWS_S3_SENSITIVE_DOCS_BUCKET=your-sensitive-documents-bucket-name

# KMS Key for enhanced encryption (highly recommended for production)
# Use Key ID, ARN, or alias
AWS_KMS_KEY_ID=12345678-1234-1234-1234-123456789012
# OR: AWS_KMS_KEY_ID=arn:aws:kms:eu-north-1:123456789012:key/12345678-1234-1234-1234-123456789012
# OR: AWS_KMS_KEY_ID=alias/sna-gz-sensitive-documents-key
```

**Notes:**
- If `AWS_S3_SENSITIVE_DOCS_BUCKET` is not set, the system will use your main bucket with a `sensitive-documents/` folder prefix
- If `AWS_KMS_KEY_ID` is not set, the system will use AES256 encryption (still secure)
- KMS provides additional benefits: key rotation, audit trails, and centralized key management

## Setup Instructions

### 1. Upload Existing Documents

Run the upload script to migrate local files to S3:

```bash
cd backend
node scripts/uploadSensitiveDocuments.js
```

This script will:
- ✅ Verify environment variables
- ✅ Check that all required files exist locally
- ✅ Upload files to S3 with encryption (AES256)
- ✅ Verify successful uploads
- ✅ Provide cleanup instructions

### 2. Verify Functionality

1. Start your server:
   ```bash
   npm start
   ```

2. Login to the internal portal
3. Navigate to the parametrization wizard
4. Test the document download buttons:
   - "Télécharger Extrait KBIS"
   - "Télécharger Justificatif"
   - "Télécharger Passport"

### 3. Clean Up Local Files (After Verification)

⚠️ **IMPORTANT**: Only do this after confirming downloads work in the portal!

```bash
# Remove the sensitive documents from your local filesystem
rm -rf backend/src/services/FilesPayementShopify/
```

## Security Features

### 🔒 S3 Security
- **Private Access**: Documents are stored with `ACL: 'private'`
- **Server-Side Encryption**: KMS or AES256 encryption at rest
- **Key Management**: Centralized key management with AWS KMS (if configured)
- **Access Control**: Only authenticated internal users can access
- **Secure Headers**: Downloads include security headers (no-cache, nosniff, etc.)
- **Audit Trail**: KMS provides detailed access logs for encryption/decryption

### 🛡️ Application Security
- **Authentication Required**: Only internal users can download documents
- **Filename Validation**: Prevents path traversal attacks
- **Audit Logging**: All download attempts are logged with user info and IP
- **Error Handling**: Secure error messages without exposing system details

### 📊 Monitoring
- All document access is logged
- Failed access attempts are tracked
- Download statistics available in logs

## Troubleshooting

### Upload Script Issues

**Error: Missing environment variables**
```bash
❌ [UPLOAD SCRIPT] Missing required environment variables: [AWS_ACCESS_KEY_ID]
```
**Solution**: Ensure all AWS variables are set in your `.env` file

**Error: Files not found**
```bash
❌ [UPLOAD SCRIPT] Some required files are missing
```
**Solution**: Verify files exist in `backend/src/services/FilesPayementShopify/`

**Error: AWS credentials issue**
```bash
❌ [UPLOAD SCRIPT] Error during upload process: The security token included in the request is invalid
```
**Solution**: 
1. Verify AWS credentials are correct
2. Check IAM permissions include S3 access
3. Ensure bucket exists and is accessible

### Runtime Issues

**Error: Document not found in S3**
```bash
[SENSITIVE DOCS] Failed to fetch filename.pdf: NoSuchKey
```
**Solution**: Run the upload script again or check S3 bucket contents

**Error: Access denied**
```bash
[SENSITIVE DOCS] Error fetching filename.pdf: AccessDenied
```
**Solution**: Verify IAM user has GetObject permissions on the S3 bucket

## IAM Permissions Required

### Basic S3 Permissions
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket",
                "s3:GetBucketLocation"
            ],
            "Resource": [
                "arn:aws:s3:::your-bucket-name",
                "arn:aws:s3:::your-bucket-name/*"
            ]
        }
    ]
}
```

### Additional KMS Permissions (if using KMS encryption)
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "kms:Encrypt",
                "kms:Decrypt",
                "kms:ReEncrypt*",
                "kms:GenerateDataKey*",
                "kms:DescribeKey"
            ],
            "Resource": [
                "arn:aws:kms:region:account:key/your-kms-key-id"
            ]
        }
    ]
}
```

**Complete IAM policy template available in:** `backend/KMS_IAM_POLICY.json`

## Development vs Production

### Development
- Can use the same bucket as regular uploads
- Files stored in `sensitive-documents/` folder
- Local upload script for setup

### Production (Recommended)
- Use separate bucket for sensitive documents (`AWS_S3_SENSITIVE_DOCS_BUCKET`)
- Enable S3 bucket versioning
- Enable S3 access logging
- Consider S3 KMS encryption instead of AES256
- Implement bucket policies for additional access control

## File Access Patterns

### Internal Portal Access
- Route: `GET /api/internal/files/download/:filename`
- Authentication: `requireInternalAPIAuth` middleware
- Files served directly from S3 with security headers
- Download logged with user context

### Allowed Files
- `Extrait KBIS - SNA GZ.pdf`
- `Justificatif de domicile 23 juil. 2024.pdf`
- `Passport_Boris.jpg`

### Security Validations
1. User authentication (internal users only)
2. Filename whitelist validation
3. Path traversal prevention
4. Secure response headers
5. Error handling without information disclosure

## Deployment Notes

The sensitive documents system will:
- ✅ Initialize automatically on server startup
- ✅ Work seamlessly with existing internal portal
- ✅ Maintain all current functionality
- ✅ Add enhanced security and audit logging
- ✅ Support horizontal scaling (no local file dependencies)

No frontend changes required - downloads continue to work through the same buttons in the parametrization wizard. 