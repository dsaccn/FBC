const fs = require('fs');
const path = './prisma/diva-addis.db';

try {
  // Try to open for reading and writing
  const fd = fs.openSync(path, 'r+');
  console.log('File opened successfully for reading and writing');
  fs.closeSync(fd);
  
  // Try to get file stats
  const stats = fs.statSync(path);
  console.log(`File size: ${stats.size} bytes`);
  
} catch (error) {
  console.error('Error:', error.message);
}
