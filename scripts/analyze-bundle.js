const fs = require('fs');

console.log('📊 Bundle Size Analysis\n');

const files = ['dist/index.js', 'dist/index.mjs', 'dist/index.min.js', 'dist/index.min.mjs'];

const maxSizes = {
  'dist/index.js': 60,
  'dist/index.mjs': 60,
  'dist/index.min.js': 60,
  'dist/index.min.mjs': 60,
};

let allFilesPass = true;

files.forEach(file => {
  try {
    const stats = fs.statSync(file);
    const sizeKB = stats.size / 1024;
    const maxSize = maxSizes[file];
    const status = sizeKB <= maxSize ? '✅' : '❌';

    if (sizeKB > maxSize) {
      allFilesPass = false;
    }

    console.log(`${status} ${file}: ${sizeKB.toFixed(2)} KB (max: ${maxSize} KB)`);
  } catch (error) {
    console.log(`❌ ${file}: File not found`);
    allFilesPass = false;
  }
});

console.log(
  '\n' +
    (allFilesPass ? '✅ All bundles within size limits!' : '❌ Some bundles exceed size limits!'),
);

if (!allFilesPass) {
  process.exit(1);
}
