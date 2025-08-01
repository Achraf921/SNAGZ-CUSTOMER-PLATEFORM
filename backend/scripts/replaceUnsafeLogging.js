#!/usr/bin/env node

/**
 * Script to Replace Unsafe Console Logging
 * Systematically replaces console.log/error/warn with secure logging
 */

const fs = require('fs');
const path = require('path');

const SECURE_LOGGER_IMPORT = "const { logger } = require('../utils/secureLogger');";

const logReplacements = [
  // Remove dangerous debug info completely
  {
    pattern: /console\.log\('=+ VALIDATE PRODUCT DEBUG INFO =+'\);[\s\S]*?console\.log\('=+ END VALIDATE PRODUCT DEBUG INFO =+'\);/g,
    replacement: 'logger.debug("Product validation check");'
  },
  {
    pattern: /console\.log\('=+ .*? DEBUG.*? =+'\);/g,
    replacement: '// Debug info removed for security'
  },
  
  // Replace security-related logging
  {
    pattern: /console\.error\(`🚨 \[SECURITY\] (.*?): \${(.*?)} from IP: \${req\.ip}`\);/g,
    replacement: 'logger.security("$1", { ip: req.ip });'
  },
  
  // Replace authentication logging
  {
    pattern: /console\.log\(`\[INTERNAL\] Internal user accessing (.*?)`\);/g,
    replacement: 'logger.debug("Internal user accessing $1");'
  },
  
  // Replace general info logging
  {
    pattern: /console\.log\(`\[INTERNAL\] (.*?)`\);/g,
    replacement: 'logger.info("$1");'
  },
  {
    pattern: /console\.error\(`\[INTERNAL\] (.*?)`\, error\);/g,
    replacement: 'logger.error("$1", { error: error.message });'
  },
  {
    pattern: /console\.error\('\[INTERNAL\] (.*?):', error\);/g,
    replacement: 'logger.error("$1", { error: error.message });'
  },
  
  // Replace multer debugging (contains file names)
  {
    pattern: /console\.log\('🔍 \[INTERNAL MULTER\].*?\);/g,
    replacement: 'logger.debug("File processing");'
  },
  {
    pattern: /console\.log\('🚨 \[MULTER.*?\);/g,
    replacement: 'logger.error("Multer error");'
  },
  
  // Replace API credential logging
  {
    pattern: /console\.log\(`\[API CREDENTIALS\] (.*?)`\);/g,
    replacement: 'logger.debug("API credentials: $1");'
  },
  {
    pattern: /console\.error\(`\[API CREDENTIALS\] (.*?)`\, error\);/g,
    replacement: 'logger.error("API credentials error: $1", { error: error.message });'
  },
  
  // Replace shop/domain logging
  {
    pattern: /console\.log\(`\[SAVE DOMAIN\] (.*?)`\);/g,
    replacement: 'logger.debug("Save domain: $1");'
  },
  {
    pattern: /console\.log\(`\[MARK CREATED\] (.*?)`\);/g,
    replacement: 'logger.debug("Mark created: $1");'
  },
  {
    pattern: /console\.log\(`\[MARK PARAMETRIZED\] (.*?)`\);/g,
    replacement: 'logger.debug("Mark parametrized: $1");'
  },
  
  // Replace error logging with secure versions
  {
    pattern: /console\.error\(`Error generating signed URL for (.*?): \${(.*?)}`\, e\);/g,
    replacement: 'logger.error("Error generating signed URL for $1", { error: e.message });'
  },
  {
    pattern: /console\.error\('Error fetching (.*?):', error\);/g,
    replacement: 'logger.error("Error fetching $1", { error: error.message });'
  },
  
  // Replace config/credential logging
  {
    pattern: /console\.error\('\[(.*?) Config\] (.*?)\.'\);/g,
    replacement: 'logger.error("$1 configuration error: $2");'
  },
  {
    pattern: /console\.log\('\[(.*?)\] (.*?)\.\.\.'\);/g,
    replacement: 'logger.debug("$1: $2");'
  },
  {
    pattern: /console\.log\('\[(.*?)\] (.*?)'\);/g,
    replacement: 'logger.info("$1: $2");'
  },
  
  // Remove debugging sections completely
  {
    pattern: /console\.log\("--- DEBUGGING.*?"\);[\s\S]*?console\.log\("--- END DEBUGGING ---"\);/g,
    replacement: 'logger.debug("Processing shops data");'
  },
  
  // Remove startup debug logging
  {
    pattern: /console\.log\('--- \[DEBUG\] SERVER IS LOADING.*?'\);/g,
    replacement: '// Module loading (debug info removed)'
  },
  
  // Replace remaining console.log with appropriate logger calls
  {
    pattern: /console\.log\((.*?)\);/g,
    replacement: 'logger.debug($1);'
  },
  {
    pattern: /console\.error\((.*?)\);/g,
    replacement: 'logger.error($1);'
  },
  {
    pattern: /console\.warn\((.*?)\);/g,
    replacement: 'logger.warn($1);'
  },
  {
    pattern: /console\.info\((.*?)\);/g,
    replacement: 'logger.info($1);'
  }
];

function replaceLoggingInFile(filePath) {
  console.log(`Processing: ${filePath}`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Add secure logger import if not present
    if (content.includes('console.') && !content.includes("require('../utils/secureLogger')")) {
      // Find the first require statement and add after it
      const requireMatch = content.match(/const.*?require\(['"].*?['"]\);/);
      if (requireMatch) {
        const insertIndex = content.indexOf(requireMatch[0]) + requireMatch[0].length;
        content = content.slice(0, insertIndex) + '\n' + SECURE_LOGGER_IMPORT + content.slice(insertIndex);
        modified = true;
      }
    }
    
    // Apply all replacements
    for (const replacement of logReplacements) {
      const originalContent = content;
      content = content.replace(replacement.pattern, replacement.replacement);
      if (content !== originalContent) {
        modified = true;
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Updated: ${filePath}`);
      return true;
    } else {
      console.log(`⏭️ No changes needed: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function findFilesToProcess(dir, extensions = ['.js']) {
  const files = [];
  
  function scanDirectory(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and other irrelevant directories
        if (!['node_modules', '.git', 'ssl', 'uploads', 'logs'].includes(item)) {
          scanDirectory(fullPath);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }
  
  scanDirectory(dir);
  return files;
}

function main() {
  console.log('🔒 Starting unsafe logging replacement...\n');
  
  const srcDir = path.join(__dirname, '../src');
  const files = findFilesToProcess(srcDir);
  
  let totalProcessed = 0;
  let totalModified = 0;
  
  for (const file of files) {
    // Skip certain files that are safe or already handled
    if (file.includes('secureLogger.js') || file.includes('test') || file.includes('.min.')) {
      continue;
    }
    
    totalProcessed++;
    if (replaceLoggingInFile(file)) {
      totalModified++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Files processed: ${totalProcessed}`);
  console.log(`   Files modified: ${totalModified}`);
  console.log(`   Files unchanged: ${totalProcessed - totalModified}`);
  
  if (totalModified > 0) {
    console.log(`\n✅ Unsafe logging has been replaced with secure logging!`);
    console.log(`🔐 Production logs will now mask sensitive data automatically.`);
  } else {
    console.log(`\n✨ All files already use secure logging!`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { replaceLoggingInFile, logReplacements }; 