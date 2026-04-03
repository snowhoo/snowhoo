const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Write the PowerShell script with UTF-16 LE BOM (PowerShell default encoding)
const text = process.argv[2] || '床前明月光，疑是地上霜。举头望明月，低头思故乡。';
const output = process.argv[3] || 'D:/temp_cn.wav';

const psContent = [
  'Add-Type -AssemblyName System.Speech',
  '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  '$s.SetOutputToWaveFile("' + output.replace(/\\/g, '\\\\') + '")',
  '$s.SelectVoice("Microsoft Huihui Desktop")',
  '$s.Speak("' + text.replace(/"/g, '`"') + '")',
  '$s.Dispose()',
  'Write-Output "done"'
].join('; ');

// Write as UTF-16 LE (with BOM) which PowerShell expects
const bom = Buffer.from([0xFF, 0xFE]);
const content = Buffer.concat([bom, Buffer.from(psContent, 'utf16le')]);
fs.writeFileSync('D:/hexo/tts-proxy/tts_run.ps1', content);

try {
  const result = execSync('powershell -ExecutionPolicy Bypass -File "D:/hexo/tts-proxy/tts_run.ps1"', {
    encoding: 'utf8',
    timeout: 15000
  });
  console.log('OK:', result.trim());
} catch(e) {
  console.error('Error:', e.message);
}
