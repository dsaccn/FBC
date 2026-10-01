const fs = require('fs');
const path = './prisma/diva-addis.db';

try {
  const data = fs.readFileSync(path);
  console.log(`File size: ${data.length} bytes`);
  console.log('First 20 bytes:', data.slice(0, 20).toString('hex'));
  
  // Check if it starts with SQLite header
  const header = data.slice(0, 16);
  const expectedHeader = Buffer.from('53514c69746520666f726d6174203300', 'hex');
  if (header.equals(expectedHeader)) {
    console.log('Valid SQLite header found');
  } else {
    console.log('Invalid or missing SQLite header');
    console.log('Expected:', expectedHeader.toString('hex'));
    console.log('Got:', header.toString('hex'));
  }
} catch (error) {
  console.error('Error reading file:', error.message);
}
