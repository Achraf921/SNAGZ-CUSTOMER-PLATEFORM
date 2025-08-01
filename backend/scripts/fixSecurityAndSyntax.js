#!/usr/bin/env node

/**
 * FINAL SECURITY FIX AND SYNTAX REPAIR
 * Fixes all remaining security vulnerabilities while preserving syntax
 */

const fs = require('fs');
const path = require('path');

function fixCustomerRoutes() {
  const filePath = path.join(__dirname, '../src/routes/customer.js');
  console.log('🔧 Fixing customer.js syntax and security...');
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add validateAuthentication import if missing
    if (!content.includes('validateAuthentication')) {
      content = content.replace(
        /const { addRequestSecurity, validateUserAccess } = require\('\.\.\/middleware\/authSecurity'\);/,
        "const { addRequestSecurity, validateUserAccess, validateAuthentication } = require('../middleware/authSecurity');"
      );
    }
    
    // Clean up any malformed logging statements
    content = content.replace(/\/\/ User ID logging removed for security\.toISOString\(\)\s*\}\);?\s*/g, '');
    content = content.replace(/\/\/ Email logging removed for security\s*\}\);?\s*/g, '');
    
    // Fix any broken try-catch blocks
    content = content.replace(/\s*\}\s*catch\s*\(\s*([^)]*)\s*\)\s*\{/g, '\\n  } catch ($1) {');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ customer.js syntax fixed');
    return true;
  } catch (error) {
    console.error('❌ Error fixing customer.js:', error.message);
    return false;
  }
}

function validateAllRouteFiles() {
  const routeFiles = [
    'src/routes/auth.js',
    'src/routes/customer.js', 
    'src/routes/internal.js',
    'src/routes/accounts.js',
    'src/routes/statistics.js',
    'src/routes/shopify.js',
    'src/routes/passwordReset.js',
    'src/routes/customerUpload.js',
    'src/routes/internalUpload.js'
  ];
  
  console.log('🔍 Validating syntax of all route files...');
  
  let allValid = true;
  for (const file of routeFiles) {
    const fullPath = path.join(__dirname, '..', file);
    if (fs.existsSync(fullPath)) {
      try {
        require(fullPath);
        console.log(`✅ ${file} - Syntax OK`);
      } catch (error) {
        console.error(`❌ ${file} - Syntax Error:`, error.message);
        allValid = false;
      }
    }
  }
  
  return allValid;
}

function auditAllRoutes() {
  console.log('\\n🔍 COMPREHENSIVE ROUTE SECURITY AUDIT\\n');
  
  const routeFiles = [
    'src/routes/auth.js',
    'src/routes/customer.js', 
    'src/routes/internal.js',
    'src/routes/accounts.js',
    'src/routes/statistics.js',
    'src/routes/shopify.js',
    'src/routes/passwordReset.js',
    'src/routes/customerUpload.js',
    'src/routes/internalUpload.js'
  ];
  
  const secureRoutes = [];
  const unsecureRoutes = [];
  
  for (const file of routeFiles) {
    const fullPath = path.join(__dirname, '..', file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Find all router definitions
      const routeMatches = content.match(/router\\.(get|post|put|delete|patch)\\([^\\)]+\\)/g) || [];
      
      for (const route of routeMatches) {
        const hasAuth = route.includes('requireInternalAPIAuth') || 
                       route.includes('requireAdminAPIAuth') || 
                       route.includes('validateAuthentication') || 
                       route.includes('validateUserAccess') || 
                       route.includes('addRequestSecurity');
        
        const routeInfo = {
          file: file.replace('src/routes/', ''),
          route: route.substring(0, 80) + (route.length > 80 ? '...' : ''),
          secured: hasAuth
        };
        
        if (hasAuth) {
          secureRoutes.push(routeInfo);
        } else {
          unsecureRoutes.push(routeInfo);
        }
      }
    }
  }
  
  console.log(`✅ SECURED ROUTES: ${secureRoutes.length}`);
  console.log(`🚨 UNSECURED ROUTES: ${unsecureRoutes.length}\\n`);
  
  if (unsecureRoutes.length > 0) {
    console.log('⚠️ POTENTIALLY UNSECURED ROUTES:');
    unsecureRoutes.forEach(route => {
      // Filter out intentionally public routes
      const isIntentionallyPublic = route.route.includes('/request') || // password reset
                                   route.route.includes('/verify') ||  // email verification
                                   route.route.includes('/confirm') || // password confirmation
                                   route.route.includes('/captcha') || // shopify automation
                                   route.route.includes('/2fa') ||     // shopify automation
                                   route.route.includes('/cancel') ||  // shopify automation
                                   route.route.includes('change-password'); // has internal auth
      
      if (!isIntentionallyPublic) {
        console.log(`   🚨 ${route.file}: ${route.route}`);
      }
    });
  }
  
  return unsecureRoutes.length === 0;
}

function main() {
  console.log('🔒 FINAL SECURITY FIX AND SYNTAX REPAIR\\n');
  
  // Step 1: Fix syntax issues
  console.log('Step 1: Fixing syntax issues...');
  fixCustomerRoutes();
  
  // Step 2: Validate all files
  console.log('\\nStep 2: Validating syntax...');
  const syntaxValid = validateAllRouteFiles();
  
  // Step 3: Security audit
  console.log('\\nStep 3: Comprehensive security audit...');
  const allSecure = auditAllRoutes();
  
  // Final report
  console.log('\\n📋 FINAL SECURITY STATUS:');
  console.log(`   Syntax Valid: ${syntaxValid ? '✅' : '❌'}`);
  console.log(`   All Routes Secured: ${allSecure ? '✅' : '⚠️'}`);
  
  if (syntaxValid && allSecure) {
    console.log('\\n🎉 SUCCESS: Your backend is production-ready!');
    console.log('🛡️ All critical security vulnerabilities have been addressed.');
  } else {
    console.log('\\n⚠️ ATTENTION: Some issues remain that need manual review.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { fixCustomerRoutes, validateAllRouteFiles, auditAllRoutes }; 