const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

// Currency patterns to search for
const CURRENCY_PATTERNS = [
  /(['"])KES\1/g,           // 'KES' or "KES"
  /(['"])USD\1/g,           // 'USD' or "USD"
  /(['"])KSh\1/g,          // 'KSh' or "KSh"
  /(['"])\$\1/g,           // '$' or "$"
  /(['"])NGN\1/g,          // 'NGN' or "NGN"
  /(['"])ZAR\1/g,          // 'ZAR' or "ZAR"
  /(['"])₦\1/g,            // '₦' or "₦"
  /(['"])R\1/g,            // 'R' or "R"
  /KSh\s*\d+/g,            // KSh followed by numbers
  /\$\s*\d+/g,             // $ followed by numbers
  /\d+\s*KSh/g,            // numbers followed by KSh
  /\d+\s*\$/g,             // numbers followed by $
];

// Files to exclude
const EXCLUDE_PATHS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  'currency.js',
  'CurrencyProvider.js',
  'currencyUtils.js'
];

// Directories to search
const SEARCH_DIRS = [
  'src/components',
  'src/pages',
  'src/features',
  'src/utils'
];

async function findHardcodedCurrencies(dir) {
  const results = [];

  async function searchFile(filePath) {
    // Skip excluded paths
    if (EXCLUDE_PATHS.some(exclude => filePath.includes(exclude))) {
      return;
    }

    try {
      const content = await readFileAsync(filePath, 'utf8');
      let hasMatch = false;
      let matches = [];

      CURRENCY_PATTERNS.forEach(pattern => {
        const fileMatches = content.match(pattern);
        if (fileMatches) {
          hasMatch = true;
          matches = matches.concat(fileMatches);
        }
      });

      if (hasMatch) {
        results.push({
          file: filePath,
          matches: [...new Set(matches)], // Remove duplicates
          lines: content.split('\n')
            .map((line, i) => ({ line, number: i + 1 }))
            .filter(({ line }) => 
              CURRENCY_PATTERNS.some(pattern => pattern.test(line)))
        });
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
    }
  }

  async function searchDirectory(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        await searchDirectory(fullPath);
      } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
        await searchFile(fullPath);
      }
    }
  }

  for (const searchDir of SEARCH_DIRS) {
    const fullDir = path.join(dir, searchDir);
    if (fs.existsSync(fullDir)) {
      await searchDirectory(fullDir);
    }
  }

  return results;
}

// Generate report
async function generateReport(results) {
  let report = '# Hardcoded Currency Audit Report\n\n';
  
  results.forEach(({ file, matches, lines }) => {
    report += `## ${file}\n\n`;
    report += 'Found currency instances:\n';
    report += matches.map(m => `- ${m}`).join('\n');
    report += '\n\nAffected lines:\n';
    report += lines.map(({ line, number }) => 
      `${number}: ${line.trim()}`
    ).join('\n');
    report += '\n\n';
  });

  report += '\n## Recommended Actions\n\n';
  report += '1. Replace hardcoded currencies with CurrencyDisplay component\n';
  report += '2. Use CurrencyInput for amount inputs\n';
  report += '3. Use useCurrency hook for dynamic currency formatting\n';

  await writeFileAsync('currency-audit-report.md', report, 'utf8');
  console.log('Report generated: currency-audit-report.md');
}

// Main execution
async function main() {
  const projectRoot = process.cwd();
  console.log('Scanning for hardcoded currencies...');
  
  const results = await findHardcodedCurrencies(projectRoot);
  
  if (results.length > 0) {
    console.log(`Found ${results.length} files with hardcoded currencies`);
    await generateReport(results);
  } else {
    console.log('No hardcoded currencies found!');
  }
}

main().catch(console.error);