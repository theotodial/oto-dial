/**
 * Generate Favicon Assets from Logo
 * 
 * This script generates favicon-16x16.png, favicon-32x32.png,
 * and apple-touch-icon.png from the source logo image.
 * 
 * Requirements:
 * - sharp: npm install --save-dev sharp
 * 
 * Note: favicon.ico can be created manually from the PNG files
 * using online tools like https://favicon.io/favicon-converter/
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceLogo = join(__dirname, '../src/assets/otodial-logo.png');
const publicDir = join(__dirname, '../public');

// Sizes for different favicon types
const sizes = {
  favicon16: 16,
  favicon32: 32,
  appleTouch: 180,
  pwa192: 192,
  pwa512: 512
};

async function generateFavicons() {
  try {
    console.log('🔄 Generating favicon assets from logo...');
    console.log(`📁 Source: ${sourceLogo}`);
    console.log(`📁 Output: ${publicDir}`);

    // Read source image
    const sourceBuffer = readFileSync(sourceLogo);
    
    // Generate PNG favicons
    console.log('📸 Generating favicon-16x16.png...');
    const favicon16 = await sharp(sourceBuffer)
      .resize(sizes.favicon16, sizes.favicon16, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
      })
      .png()
      .toBuffer();
    writeFileSync(join(publicDir, 'favicon-16x16.png'), favicon16);

    console.log('📸 Generating favicon-32x32.png...');
    const favicon32 = await sharp(sourceBuffer)
      .resize(sizes.favicon32, sizes.favicon32, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
      })
      .png()
      .toBuffer();
    writeFileSync(join(publicDir, 'favicon-32x32.png'), favicon32);

    console.log('📸 Generating apple-touch-icon.png...');
    const appleTouch = await sharp(sourceBuffer)
      .resize(sizes.appleTouch, sizes.appleTouch, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
      })
      .png()
      .toBuffer();
    writeFileSync(join(publicDir, 'apple-touch-icon.png'), appleTouch);

    // Generate favicon.ico - copy 32x32 PNG (browsers will handle PNG as ICO)
    // For proper ICO format, use online converter: https://favicon.io/favicon-converter/
    console.log('📸 Creating favicon.ico (using 32x32 PNG)...');
    console.log('   ℹ️  Using PNG format (browsers support PNG as favicon)');
    writeFileSync(join(publicDir, 'favicon.ico'), favicon32);

    // Generate PWA icons
    console.log('📸 Generating icon-192x192.png (PWA)...');
    const pwa192 = await sharp(sourceBuffer)
      .resize(sizes.pwa192, sizes.pwa192, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
      })
      .png()
      .toBuffer();
    writeFileSync(join(publicDir, 'icon-192x192.png'), pwa192);

    console.log('📸 Generating icon-512x512.png (PWA)...');
    const pwa512 = await sharp(sourceBuffer)
      .resize(sizes.pwa512, sizes.pwa512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
      })
      .png()
      .toBuffer();
    writeFileSync(join(publicDir, 'icon-512x512.png'), pwa512);

    console.log('✅ Favicon and PWA icon generation complete!');
    console.log('\n📋 Generated files:');
    console.log('  - favicon.ico (generated from 32x32 PNG)');
    console.log('  - favicon-16x16.png');
    console.log('  - favicon-32x32.png');
    console.log('  - apple-touch-icon.png');
    console.log('  - icon-192x192.png (PWA)');
    console.log('  - icon-512x512.png (PWA)');
    console.log('\n✨ All favicons and PWA icons are ready in frontend/public/');
    console.log('\n💡 Note: For best favicon.ico support, you can convert the PNG files');
    console.log('   using online tools like https://favicon.io/favicon-converter/');

  } catch (error) {
    console.error('❌ Error generating favicons:', error.message);
    if (error.code === 'MODULE_NOT_FOUND') {
      console.error('\n💡 Missing dependencies. Install them with:');
      console.error('   npm install --save-dev sharp');
    }
    process.exit(1);
  }
}

generateFavicons();

