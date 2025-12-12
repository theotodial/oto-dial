const fs = require('fs');
const path = require('path');

// Base64 encoded PNG data (you may need to provide the complete string)
const base64Data = process.argv[2] || '';

if (!base64Data) {
  console.error('Please provide base64 data as argument');
  console.error('Usage: node save-logo.js <base64_string>');
  process.exit(1);
}

try {
  // Decode base64 to buffer
  const imageBuffer = Buffer.from(base64Data, 'base64');
  
  // Ensure public directory exists
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  // Save to logo.png
  const logoPath = path.join(publicDir, 'logo.png');
  fs.writeFileSync(logoPath, imageBuffer);
  
  console.log('Logo saved successfully to:', logoPath);
} catch (error) {
  console.error('Error saving logo:', error.message);
  process.exit(1);
}

