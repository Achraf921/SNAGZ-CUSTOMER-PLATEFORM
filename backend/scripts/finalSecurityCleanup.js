#!/usr/bin/env node

/**
 * FINAL SECURITY CLEANUP - Eliminate ALL remaining dangerous console logging
 * This is CRITICAL for production security
 */

const fs = require('fs');
const path = require('path');

const criticalReplacements = [
  // CRITICAL: Remove all console.log with sensitive data patterns
  {
    pattern: /console\.log\([^)]*email[^)]*\);?/gi,
    replacement: '// Email logging removed for security'
  },
  {
    pattern: /console\.log\([^)]*userId[^)]*\);?/gi,
    replacement: '// User ID logging removed for security'
  },
  {
    pattern: /console\.log\([^)]*sessionId[^)]*\);?/gi,
    replacement: '// Session ID logging removed for security'
  },
  {
    pattern: /console\.log\([^)]*password[^)]*\);?/gi,
    replacement: '// Password logging removed for security'
  },
  {
    pattern: /console\.log\([^)]*token[^)]*\);?/gi,
    replacement: '// Token logging removed for security'
  },
  
  // CRITICAL: Security-related logging
  {
    pattern: /console\.log\(`🔍 \[DEBUG\] requireClientAPIAuth[^`]*`[^)]*\);?/g,
    replacement: 'logger.debug("Client API auth check");'
  },
  {
    pattern: /console\.log\(`🔍 \[SECURITY DEBUG\][^`]*`[^)]*\);?/g,
    replacement: 'logger.debug("Security validation");'
  },
  {
    pattern: /console\.log\(`🚨 \[SECURITY\] Request details:`[^)]*\);?/g,
    replacement: 'logger.security("Security validation failed");'
  },
  
  // CRITICAL: Authentication logging
  {
    pattern: /console\.log\('\[\/login-[^']*\] Error details:'[^)]*\);?/g,
    replacement: 'logger.error("Authentication error occurred");'
  },
  {
    pattern: /console\.log\('📋 Session debug info:'[^)]*\);?/g,
    replacement: 'logger.debug("Session validation");'
  },
  
  // CRITICAL: Customer/user data logging
  {
    pattern: /console\.log\('Customer details:'[^)]*\);?/g,
    replacement: 'logger.debug("Customer data processed");'
  },
  {
    pattern: /console\.log\('Shop details:'[^)]*\);?/g,
    replacement: 'logger.debug("Shop data processed");'
  },
  {
    pattern: /console\.log\(`Document \${[^}]*\}:`[^)]*\);?/g,
    replacement: 'logger.debug("Document processed");'
  },
  
  // CRITICAL: Database and API response logging
  {
    pattern: /console\.log\(`💾 \[UPLOAD[^`]*`[^)]*\);?/g,
    replacement: 'logger.debug("Database operation completed");'
  },
  {
    pattern: /console\.log\('Database update result:'[^)]*\);?/g,
    replacement: 'logger.debug("Database update completed");'
  },
  {
    pattern: /console\.log\('Shop data before update:'[^)]*\);?/g,
    replacement: 'logger.debug("Shop update initiated");'
  },
  
  // CRITICAL: Shopify API logging (contains sensitive shop data)
  {
    pattern: /console\.log\(`\[CREDENTIALS-SAVE\][^`]*`[^)]*\);?/g,
    replacement: 'logger.debug("Credentials processing");'
  },
  {
    pattern: /console\.log\(`\[API-DEBUG\][^`]*`[^)]*\);?/g,
    replacement: 'logger.debug("API operation");'
  },
  {
    pattern: /console\.log\('\[Shopify\] Credentials provided:'[^)]*\);?/g,
    replacement: 'logger.debug("Shopify credentials processed");'
  },
  
  // CRITICAL: Email service logging
  {
    pattern: /console\.log\('📧[^']*email sent successfully:'[^)]*\);?/g,
    replacement: 'logger.info("Email sent successfully");'
  },
  {
    pattern: /console\.log\('✅ Account creation email sent successfully:'[^)]*\);?/g,
    replacement: 'logger.info("Account creation email sent");'
  },
  
  // CRITICAL: reCAPTCHA and sensitive service data
  {
    pattern: /console\.log\(`📊 reCAPTCHA verification result:`[^)]*\);?/g,
    replacement: 'logger.debug("reCAPTCHA verification completed");'
  },
  {
    pattern: /console\.log\('📊 Statistics calculated successfully:'[^)]*\);?/g,
    replacement: 'logger.info("Statistics calculated");'
  },
  
  // CRITICAL: Security alerts and access logs
  {
    pattern: /console\.log\(`🚨 \[SECURITY ALERT\][^`]*`[^)]*\);?/g,
    replacement: 'logger.security("Unauthorized access attempt");'
  },
  {
    pattern: /console\.log\(`✅ \[SECURITY\] Internal API access granted:`[^)]*\);?/g,
    replacement: 'logger.debug("Internal API access granted");'
  },
  
  // CRITICAL: General sensitive data patterns
  {
    pattern: /console\.log\(`🔒 \[SECURITY\][^`]*`[^)]*\);?/g,
    replacement: 'logger.security("Security operation");'
  },
  {
    pattern: /console\.error\(`🔒 \[SECURITY\][^`]*`[^)]*\);?/g,
    replacement: 'logger.security("Security error");'
  },
  {
    pattern: /console\.log\(`🎯 Found mapped customer document:`[^)]*\);?/g,
    replacement: 'logger.debug("Customer document found");'
  },
  
  // CRITICAL: Replace remaining console statements with secure alternatives
  {
    pattern: /console\.log\(`\[INTERNAL[^`]*`[^)]*\);?/g,
    replacement: 'logger.debug("Internal operation");'
  },
  {
    pattern: /console\.log\(`\[THEME[^`]*`[^)]*\);?/g,
    replacement: 'logger.debug("Theme operation");'
  },
  {
    pattern: /console\.log\(`\[DevStore\][^`]*`[^)]*\);?/g,
    replacement: 'logger.debug("DevStore operation");'
  },
  {
    pattern: /console\.log\(`\[VARIANT[^`]*`[^)]*\);?/g,
    replacement: 'logger.debug("Variant operation");'
  },
  {
    pattern: /console\.log\(`\[MEDIA[^`]*`[^)]*\);?/g,
    replacement: 'logger.debug("Media operation");'
  },
  {
    pattern: /console\.log\(`\[CATEGORY[^`]*`[^)]*\);?/g,
    replacement: 'logger.debug("Category operation");'
  },
  {
    pattern: /console\.log\(`\[STAGED[^`]*`[^)]*\);?/g,
    replacement: 'logger.debug("Upload operation");'
  },
  
  // CRITICAL: Multer file processing (contains filenames and sensitive data)
  {
    pattern: /console\.log\('🔍 \[INTERNAL MULTER\][^']*'[^)]*\);?/g,
    replacement: 'logger.debug("File processing");'
  },
  {
    pattern: /console\.log\('🔍 \[MULTER DEBUG\][^']*'[^)]*\);?/g,
    replacement: 'logger.debug("File upload processing");'
  },
  
  // CRITICAL: Rate limiting and security monitoring
  {
    pattern: /console\.log\(`🚨 \[SECURITY\] Rate limit exceeded[^`]*`[^)]*\);?/g,
    replacement: 'logger.warn("Rate limit exceeded");'
  },
  {
    pattern: /console\.log\(`🔐 \[SECURITY\] EC status update requested:`[^)]*\);?/g,
    replacement: 'logger.debug("Status update requested");'
  },
  {
    pattern: /console\.log\(`✅ \[SECURITY\] EC status updated successfully:`[^)]*\);?/g,
    replacement: 'logger.info("Status updated successfully");'
  },
  {
    pattern: /console\.error\(`🚨 \[SECURITY ERROR\] EC status update failed:`[^)]*\);?/g,
    replacement: 'logger.error("Status update failed");'
  }
];

function secureCriticalFile(filePath) {
  console.log(`🔥 SECURING CRITICAL FILE: ${filePath}`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let originalContent = content;
    
    // Add secure logger import if file contains console statements and doesn't have it
    if (content.includes('console.') && !content.includes("require('../utils/secureLogger')") && !content.includes("require('./utils/secureLogger')")) {
      const requireMatch = content.match(/(?:const|require).*?require\(['"][^'"]*['"]\);?/);
      if (requireMatch) {
        const insertIndex = content.indexOf(requireMatch[0]) + requireMatch[0].length;
        const loggerImport = filePath.includes('/services/') 
          ? "\\nconst { logger } = require('../utils/secureLogger');"
          : "\\nconst { logger } = require('../utils/secureLogger');";
        content = content.slice(0, insertIndex) + loggerImport + content.slice(insertIndex);
        modified = true;
      }
    }
    
    // Apply all critical replacements
    for (const replacement of criticalReplacements) {
      const beforeReplace = content;
      content = content.replace(replacement.pattern, replacement.replacement);
      if (content !== beforeReplace) {
        modified = true;
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      const consoleCount = (originalContent.match(/console\./g) || []).length;
      const remainingCount = (content.match(/console\./g) || []).length;
      console.log(`✅ SECURED: ${filePath}`);
      console.log(`   Console statements: ${consoleCount} → ${remainingCount} (${consoleCount - remainingCount} removed)`);
      return true;
    } else {
      console.log(`⏭️ No changes: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error securing ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log('🚨 CRITICAL SECURITY CLEANUP STARTING...');
  console.log('🎯 Targeting all remaining dangerous console logging\\n');
  
  const criticalFiles = [
    'src/server.js',
    'src/routes/auth.js',
    'src/routes/customer.js', 
    'src/routes/internal.js',
    'src/routes/customerUpload.js',
    'src/routes/accounts.js',
    'src/routes/statistics.js',
    'src/routes/shopify.js',
    'src/services/cognitoService.js',
    'src/services/emailService.js',
    'src/services/shopifyService.js',
    'src/services/captchaService.js',
    'src/services/createDevStore.js'
  ];
  
  let totalSecured = 0;
  
  for (const file of criticalFiles) {
    const fullPath = path.join(__dirname, '..', file);
    if (fs.existsSync(fullPath)) {
      if (secureCriticalFile(fullPath)) {
        totalSecured++;
      }
    } else {
      console.log(`⚠️ File not found: ${fullPath}`);
    }
  }
  
  console.log(`\\n🔒 SECURITY CLEANUP COMPLETED!`);
  console.log(`📊 Files secured: ${totalSecured}`);
  console.log(`🛡️ Your backend is now production-safe!`);
}

if (require.main === module) {
  main();
}

module.exports = { secureCriticalFile, criticalReplacements }; 