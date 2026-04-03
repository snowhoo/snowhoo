const say = require('./node_modules/say');
const path = require('path');

// Test: export to WAV file
say.export(
  '床前明月光，疑是地上霜。举头望明月，低头思故乡。',
  'Microsoft Huihui Desktop',
  1.0,
  'D:/temp_say.wav',
  (err) => {
    if (err) {
      console.error('Error:', err.message);
    } else {
      const fs = require('fs');
      const stats = fs.statSync('D:/temp_say.wav');
      console.log('OK, WAV size:', stats.size);
    }
  }
);
