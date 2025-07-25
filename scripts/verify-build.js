const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'dist/index.js',
  'dist/index.js.map',
  'dist/index.mjs',
  'dist/index.mjs.map',
  'dist/index.min.js',
  'dist/index.min.js.map',
  'dist/index.min.mjs',
  'dist/index.min.mjs.map',
  'dist/index.d.ts',
];

console.log('🔍 Verifying build outputs...\n');

let hasErrors = false;

// Check if each required file exists
requiredFiles.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`✅ ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
  } else {
    console.log(`❌ ${file} - NOT FOUND`);
    hasErrors = true;
  }
});

console.log('\n📦 Checking package exports...');

// Test CommonJS import
try {
  const cjs = require('../dist/index.js');
  console.log('✅ CommonJS import works');
  console.log('   Exports:', Object.keys(cjs).join(', '));
} catch (err) {
  console.log('❌ CommonJS import failed:', err.message);
  hasErrors = true;
}

// Check for side effects in the built files
console.log('\n🌳 Checking for side effects...');
const distFiles = ['dist/index.js', 'dist/index.mjs'];

distFiles.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Basic checks for common side effects
    const sideEffectPatterns = [
      /console\.(log|warn|error)\(/,
      /document\./,
      /window\./,
      /global\./,
      /process\.env(?!\.NODE_ENV)/,
    ];

    const foundSideEffects = sideEffectPatterns.filter(pattern => pattern.test(content));

    if (foundSideEffects.length > 0) {
      console.log(`⚠️  ${file} may contain side effects`);
    } else {
      console.log(`✅ ${file} appears to be side-effect free`);
    }
  }
});

if (hasErrors) {
  console.log('\n❌ Build verification failed!');
  process.exit(1);
} else {
  console.log('\n✅ Build verification passed!');
}
