# AWS KMS Setup Guide for Sensitive Documents

This guide walks you through setting up AWS KMS (Key Management Service) encryption for enhanced security of your sensitive documents.

## 🔐 Why Use KMS?

**Enhanced Security Benefits:**
- **Centralized Key Management**: All encryption keys managed in one place
- **Automatic Key Rotation**: AWS can automatically rotate keys annually
- **Audit Trail**: CloudTrail logs all key usage (who encrypted/decrypted what, when)
- **Access Control**: Fine-grained permissions on who can use the key
- **Compliance**: Meets various compliance requirements (GDPR, HIPAA, etc.)

## 📋 Step-by-Step KMS Setup

### Step 1: Create KMS Key via AWS Console

1. **Navigate to KMS**
   ```
   AWS Console → Services → KMS (Key Management Service)
   Region: eu-north-1 (or your S3 bucket region)
   ```

2. **Create Key**
   - Click **"Create a key"**
   - **Key type**: `Symmetric`
   - **Key usage**: `Encrypt and decrypt`
   - Click **"Next"**

3. **Configure Key Details**
   - **Alias**: `sna-gz-sensitive-documents-key`
   - **Description**: `KMS key for encrypting sensitive documents in S3 bucket`
   - **Tags** (recommended):
     ```
     Environment: production
     Purpose: sensitive-documents
     Application: sna-gz-platform
     CreatedBy: your-name
     ```
   - Click **"Next"**

4. **Define Key Administrative Permissions**
   - **Key administrators**: Select your AWS IAM user
   - ✅ **Allow key administrators to delete this key**
   - Click **"Next"**

5. **Define Key Usage Permissions**
   - **This account**: Select the IAM user that your application uses
   - **External accounts**: Leave empty (unless needed)
   - Click **"Next"**

6. **Review Key Policy**
   The generated policy should look like this:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "Enable IAM policies",
         "Effect": "Allow",
         "Principal": {
           "AWS": "arn:aws:iam::123456789012:root"
         },
         "Action": "kms:*",
         "Resource": "*"
       },
       {
         "Sid": "Allow use of the key",
         "Effect": "Allow",
         "Principal": {
           "AWS": "arn:aws:iam::123456789012:user/your-iam-user"
         },
         "Action": [
           "kms:Encrypt",
           "kms:Decrypt",
           "kms:ReEncrypt*",
           "kms:GenerateDataKey*",
           "kms:DescribeKey"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

7. **Create Key**
   - Review all settings
   - Click **"Finish"**

### Step 2: Copy Key Information

After creation, note down your key details:

```
Key ID: 12345678-1234-1234-1234-123456789012
ARN: arn:aws:kms:eu-north-1:123456789012:key/12345678-1234-1234-1234-123456789012
Alias: alias/sna-gz-sensitive-documents-key
```

You can use any of these three formats in your environment variable.

### Step 3: Update Environment Variables

Add to your `.env` file:

```env
# Option 1: Use Key ID (shortest)
AWS_KMS_KEY_ID=12345678-1234-1234-1234-123456789012

# Option 2: Use full ARN (most explicit)
# AWS_KMS_KEY_ID=arn:aws:kms:eu-north-1:123456789012:key/12345678-1234-1234-1234-123456789012

# Option 3: Use alias (most readable)
# AWS_KMS_KEY_ID=alias/sna-gz-sensitive-documents-key
```

### Step 4: Configure S3 Bucket Default Encryption (Optional)

**Via AWS Console:**
1. Go to your S3 bucket → **Properties** tab
2. **Default encryption** → **Edit**
3. **Encryption type**: `Server-side encryption with AWS Key Management Service keys (SSE-KMS)`
4. **AWS KMS key**: Select `sna-gz-sensitive-documents-key`
5. **Bucket Key**: ✅ **Enable** (reduces costs)
6. **Save changes**

**Via AWS CLI:**
```bash
aws s3api put-bucket-encryption \
  --bucket your-sensitive-documents-bucket \
  --server-side-encryption-configuration '{
    "Rules": [
      {
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "aws:kms",
          "KMSMasterKeyID": "alias/sna-gz-sensitive-documents-key"
        },
        "BucketKeyEnabled": true
      }
    ]
  }'
```

## 🧪 Testing KMS Configuration

Run the S3 connection test with KMS:

```bash
cd backend
node scripts/testS3Connection.js
```

Expected output with KMS:
```
🧪 [S3 TEST] Testing S3 connection and permissions...

📋 [S3 TEST] Environment variables:
   AWS_KMS_KEY_ID: alias/sna-gz-sensitive-documents-key

📤 [S3 TEST] Test 2: Uploading test file...
   Using KMS encryption...
   ✅ Success! Test file uploaded with encryption
```

## 🔧 IAM Policy Updates

Your IAM user needs these additional KMS permissions:

**Attach this policy to your IAM user/role:**

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "KMSKeyUsage",
            "Effect": "Allow",
            "Action": [
                "kms:Encrypt",
                "kms:Decrypt",
                "kms:ReEncrypt*",
                "kms:GenerateDataKey*",
                "kms:DescribeKey"
            ],
            "Resource": [
                "arn:aws:kms:eu-north-1:123456789012:key/12345678-1234-1234-1234-123456789012"
            ]
        }
    ]
}
```

## 📊 Monitoring and Auditing

### CloudTrail Logs
KMS automatically logs all key usage to CloudTrail:
- Who encrypted/decrypted files
- When the operations occurred
- Source IP addresses
- API calls made

### Key Usage Metrics
Monitor key usage in CloudWatch:
- Number of encrypt/decrypt operations
- Failed access attempts
- API call patterns

### Cost Monitoring
KMS pricing:
- $1/month per key
- $0.03 per 10,000 requests
- **Bucket Key reduces costs by 99%** (enabled by default in our setup)

## 🔄 Key Rotation

### Automatic Rotation (Recommended)
```bash
# Enable automatic key rotation (annual)
aws kms enable-key-rotation --key-id alias/sna-gz-sensitive-documents-key

# Check rotation status
aws kms get-key-rotation-status --key-id alias/sna-gz-sensitive-documents-key
```

### Manual Rotation
You can also rotate keys manually through the AWS Console or CLI when needed.

## 🚨 Security Best Practices

### Key Policy Restrictions
- **Principle of Least Privilege**: Only grant necessary permissions
- **Time-based Access**: Use conditions to limit access by time
- **IP Restrictions**: Restrict access to specific IP ranges
- **MFA Requirements**: Require MFA for sensitive operations

### Example Restrictive Policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RestrictedKeyUsage",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789012:user/your-app-user"
      },
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey*"
      ],
      "Resource": "*",
      "Condition": {
        "IpAddress": {
          "aws:SourceIp": ["203.0.113.0/24"]
        }
      }
    }
  ]
}
```

## 🔍 Troubleshooting

### Common Issues

**Error: Access Denied**
```
KMS Error: User is not authorized to perform: kms:Decrypt
```
**Solution**: Ensure your IAM user has the KMS permissions listed above.

**Error: Key Not Found**
```
KMS Error: Key 'alias/wrong-key-name' does not exist
```
**Solution**: Verify the key ID/alias in your environment variables.

**Error: Invalid Key ARN**
```
KMS Error: Invalid keyId
```
**Solution**: Use one of these formats:
- Key ID: `12345678-1234-1234-1234-123456789012`
- ARN: `arn:aws:kms:region:account:key/12345678-1234-1234-1234-123456789012`
- Alias: `alias/sna-gz-sensitive-documents-key`

**High Costs**
```
Unexpected KMS charges
```
**Solution**: Ensure Bucket Key is enabled to reduce request costs by 99%.

## 📈 Migration from AES256 to KMS

If you already have documents encrypted with AES256, they will continue to work. New uploads will use KMS encryption. To re-encrypt existing documents:

```bash
# Re-upload existing documents with KMS encryption
node scripts/uploadSensitiveDocuments.js
```

The script will detect KMS configuration and use it for new uploads.

## 🎯 Production Checklist

- ✅ KMS key created with appropriate permissions
- ✅ Key alias configured for easy management
- ✅ Automatic key rotation enabled
- ✅ IAM policies updated with KMS permissions
- ✅ S3 bucket default encryption set to KMS
- ✅ CloudTrail logging enabled for audit trail
- ✅ Cost monitoring setup for KMS usage
- ✅ Backup key administrators defined
- ✅ Key policy reviewed for least privilege
- ✅ Application tested with KMS encryption

Your sensitive documents are now protected with enterprise-grade encryption! 🔐 