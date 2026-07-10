const fs = require('fs');
const path = require('path');

const src = 'C:\\Users\\rakes\\.gemini\\antigravity-ide\\brain\\9f4a9e5c-2f0a-4ced-b4b1-05c8c8630992\\media__1783695897622.png';
const dest = 'd:\\Project\\Chat-bot\\frontend\\chat-app\\public\\qr-code.png';

try {
  fs.copyFileSync(src, dest);
  console.log('Successfully copied QR code image.');
} catch (err) {
  console.error('Failed to copy QR code image:', err);
}
