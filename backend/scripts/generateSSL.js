#!/usr/bin/env node

/**
 * Generate Self-Signed SSL Certificates for Development
 * This script creates SSL certificates for localhost development
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const sslDir = path.join(__dirname, '../ssl');

const generateSSLCertificates = () => {
  console.log('🔒 [SSL] Generating self-signed SSL certificates for development...');
  
  try {
    // Create SSL directory if it doesn't exist
    if (!fs.existsSync(sslDir)) {
      fs.mkdirSync(sslDir, { recursive: true });
      console.log(`📁 [SSL] Created directory: ${sslDir}`);
    }
    
    // Check if OpenSSL is available
    try {
      execSync('openssl version', { stdio: 'pipe' });
    } catch (error) {
      console.error('❌ [SSL] OpenSSL is not installed or not in PATH');
      console.error('💡 [SSL] Please install OpenSSL:');
      console.error('   - macOS: brew install openssl');
      console.error('   - Ubuntu/Debian: sudo apt-get install openssl');
      console.error('   - Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
      process.exit(1);
    }
    
    const keyPath = path.join(sslDir, 'localhost.key');
    const certPath = path.join(sslDir, 'localhost.crt');
    
    // Generate private key
    console.log('🔑 [SSL] Generating private key...');
    execSync(`openssl genrsa -out "${keyPath}" 2048`, { stdio: 'pipe' });
    
    // Generate certificate
    console.log('📜 [SSL] Generating certificate...');
    const opensslCommand = `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 365 -subj "/C=US/ST=Development/L=Development/O=Development/OU=Development/CN=localhost"`;
    execSync(opensslCommand, { stdio: 'pipe' });
    
    // Set appropriate permissions
    if (process.platform !== 'win32') {
      execSync(`chmod 600 "${keyPath}"`, { stdio: 'pipe' });
      execSync(`chmod 644 "${certPath}"`, { stdio: 'pipe' });
    }
    
    console.log('✅ [SSL] SSL certificates generated successfully!');
    console.log(`   Key: ${keyPath}`);
    console.log(`   Certificate: ${certPath}`);
    console.log('');
    console.log('🚀 [SSL] You can now start your server with HTTPS:');
    console.log('   npm run start:https');
    console.log('');
    console.log('⚠️ [SSL] Browser Security Warning:');
    console.log('   Your browser will show a security warning for self-signed certificates.');
    console.log('   Click "Advanced" → "Proceed to localhost (unsafe)" to continue.');
    console.log('   This is normal for development certificates.');
    
  } catch (error) {
    console.error('❌ [SSL] Error generating SSL certificates:', error.message);
    process.exit(1);
  }
};

// Add to .gitignore
const addToGitignore = () => {
  const gitignorePath = path.join(__dirname, '../.gitignore');
  const sslIgnoreEntry = 'ssl/\n';
  
  try {
    let gitignoreContent = '';
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    }
    
    if (!gitignoreContent.includes('ssl/')) {
      fs.appendFileSync(gitignorePath, sslIgnoreEntry);
      console.log('📝 [SSL] Added ssl/ to .gitignore');
    }
  } catch (error) {
    console.warn('⚠️ [SSL] Could not update .gitignore:', error.message);
  }
};

if (require.main === module) {
  generateSSLCertificates();
  addToGitignore();
} 