const { build } = require('esbuild');

async function buildClient() {
  try {
    console.log('Building client bundle...');
    
    await build({
      entryPoints: ['scripts/client-entry.js'],
      bundle: true,
      outfile: 'public/dist/bundle.js',
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      external: [],
      minify: true,
      sourcemap: true,
    });

    console.log('Client bundle built successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

buildClient(); 