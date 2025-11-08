#!/usr/bin/env node

/**
 * CSS Bundle Size Analysis Script
 * 
 * Analyzes the CSS bundle size after build and provides recommendations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '../dist');

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function analyzeCSS() {
  console.log('🔍 Analyzing CSS Bundle Size...\n');

  // Check if dist directory exists
  if (!fs.existsSync(distDir)) {
    console.error('❌ dist directory not found. Please run "npm run build" first.');
    process.exit(1);
  }

  // Find all CSS files in dist
  const cssFiles = [];
  function findCSSFiles(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        findCSSFiles(filePath);
      } else if (file.endsWith('.css')) {
        cssFiles.push(filePath);
      }
    });
  }

  findCSSFiles(distDir);

  if (cssFiles.length === 0) {
    console.error('❌ No CSS files found in dist directory.');
    process.exit(1);
  }

  console.log(`Found ${cssFiles.length} CSS file(s):\n`);

  let totalSize = 0;
  let totalGzipped = 0;

  cssFiles.forEach(file => {
    const stats = fs.statSync(file);
    const size = stats.size;
    const relativePath = path.relative(distDir, file);
    
    // Estimate gzipped size (rough approximation: ~30% of original)
    const estimatedGzip = Math.round(size * 0.3);
    
    totalSize += size;
    totalGzipped += estimatedGzip;

    console.log(`📄 ${relativePath}`);
    console.log(`   Size: ${formatBytes(size)}`);
    console.log(`   Estimated Gzip: ~${formatBytes(estimatedGzip)}`);
    console.log('');
  });

  console.log('📊 Summary:');
  console.log(`   Total CSS Size: ${formatBytes(totalSize)}`);
  console.log(`   Estimated Total Gzip: ~${formatBytes(totalGzipped)}`);
  console.log('');

  // Recommendations
  console.log('💡 Recommendations:');
  
  const sizeKB = totalSize / 1024;
  const gzipKB = totalGzipped / 1024;

  if (gzipKB > 50) {
    console.log('   ⚠️  CSS bundle is larger than 50KB (gzipped). Consider:');
    console.log('      - Reviewing unused Tailwind classes');
    console.log('      - Splitting CSS by route/page');
    console.log('      - Removing unused custom CSS');
  } else if (gzipKB > 30) {
    console.log('   ⚠️  CSS bundle is moderate size. Consider optimization.');
  } else {
    console.log('   ✅ CSS bundle size is good!');
  }

  if (sizeKB > 200) {
    console.log('   ⚠️  Uncompressed CSS is large. Ensure gzip is enabled on server.');
  }

  console.log('\n📝 Tips:');
  console.log('   - Tailwind CSS v3+ automatically purges unused classes');
  console.log('   - Check tailwind.config.js content paths are comprehensive');
  console.log('   - Use "npm run build:analyze" for detailed bundle analysis');
  console.log('   - Review dist/stats.html for visual bundle breakdown');
}

analyzeCSS();

