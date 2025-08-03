# 🔐 Sensitive Documents Status & Resolution Guide

## Current Situation

The sensitive documents (`Extrait KBIS - SNA GZ.pdf`, `Justificatif de domicile 23 juil. 2024.pdf`, `Passport_Boris.jpg`) were **removed from the local filesystem** for security reasons but were **never uploaded to S3**. This is why document downloads are currently failing.

## Security Measures Implemented ✅

1. **Documents removed from codebase** - No sensitive files in version control
2. **S3 integration ready** - Secure storage infrastructure in place
3. **Encrypted storage** - KMS or AES256 encryption available
4. **Access controls** - Only authorized personnel can access
5. **Audit logging** - All access attempts are logged
6. **Secure download route** - Proper error handling and security validation

## Required Documents

The following documents need to be uploaded to S3:

- `Extrait KBIS - SNA GZ.pdf` - KBIS extract
- `Justificatif de domicile 23 juil. 2024.pdf` - Proof of residence
- `Passport_Boris.jpg` - Passport photo

## Resolution Steps

### Option 1: Secure Manual Upload (Recommended)

1. **Run the secure upload script:**
   ```bash
   cd backend
   node scripts/uploadSensitiveDocumentsSecure.js
   ```

2. **Follow the interactive prompts:**
   - Enter the full path to each document file
   - Confirm the upload for each document
   - Verify successful upload

3. **Test the downloads:**
   - Restart the backend server
   - Try downloading documents from the internal portal

### Option 2: Direct S3 Upload (Advanced)

If you prefer to upload directly to S3:

1. **Use AWS CLI:**
   ```bash
   aws s3 cp "path/to/Extrait KBIS - SNA GZ.pdf" s3://your-bucket/sensitive-documents/Extrait\ KBIS\ -\ SNA\ GZ.pdf
   aws s3 cp "path/to/Justificatif de domicile 23 juil. 2024.pdf" s3://your-bucket/sensitive-documents/Justificatif\ de\ domicile\ 23\ juil.\ 2024.pdf
   aws s3 cp "path/to/Passport_Boris.jpg" s3://your-bucket/sensitive-documents/Passport_Boris.jpg
   ```

2. **Set proper permissions:**
   ```bash
   aws s3api put-object-acl --bucket your-bucket --key sensitive-documents/Extrait\ KBIS\ -\ SNA\ GZ.pdf --acl private
   ```

### Option 3: Temporary Local Storage (Development Only)

For development/testing purposes only:

1. **Create the directory:**
   ```bash
   mkdir -p backend/src/services/FilesPayementShopify
   ```

2. **Place documents in the directory** (temporary measure)

3. **Update the download route** to serve from local filesystem temporarily

## Environment Variables Required

Ensure these are set in your `.env` file:

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=your-region

# S3 Bucket (use dedicated bucket for sensitive docs)
AWS_S3_SENSITIVE_DOCS_BUCKET=your-sensitive-documents-bucket

# Optional: KMS encryption
AWS_KMS_KEY_ID=your-kms-key-id
```

## Security Validation

After uploading, verify security:

1. **Check S3 permissions** - Documents should be private
2. **Verify encryption** - Documents should be encrypted
3. **Test access controls** - Only authorized users can download
4. **Review audit logs** - All access should be logged

## Testing

After uploading documents:

1. **Restart the backend server**
2. **Navigate to internal portal**
3. **Go to Step 5 (Configuration)**
4. **Try downloading each document**
5. **Check server logs for any errors**

## Troubleshooting

### Common Issues:

1. **"Document not found" error:**
   - Documents not uploaded to S3
   - Wrong bucket name
   - Incorrect file paths

2. **"Access denied" error:**
   - AWS credentials not configured
   - Insufficient S3 permissions
   - Bucket doesn't exist

3. **"Download failed" error:**
   - Network connectivity issues
   - S3 service unavailable
   - File corruption during upload

### Debug Commands:

```bash
# Test S3 connection
node scripts/testS3Documents.js

# List documents in S3
aws s3 ls s3://your-bucket/sensitive-documents/

# Check file permissions
aws s3api get-object-acl --bucket your-bucket --key sensitive-documents/filename.pdf
```

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit sensitive documents to version control**
2. **Use dedicated S3 bucket for sensitive documents**
3. **Enable encryption at rest and in transit**
4. **Implement proper access controls**
5. **Monitor and audit all access**
6. **Regular security reviews**

## Next Steps

1. **Upload the required documents** using the secure script
2. **Test the download functionality**
3. **Verify security measures**
4. **Document the process** for future reference
5. **Set up monitoring** for document access

---

**Status:** 🔴 **Action Required** - Documents need to be uploaded to S3  
**Priority:** High - Affects Step 5 functionality  
**Security Level:** Maximum - Sensitive personal documents 