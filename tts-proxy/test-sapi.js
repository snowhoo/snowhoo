// Test SAPI TTS via child process
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Use PowerShell to call SAPI
const text = '床前明月光，疑是地上霜。举头望明月，低头思故乡。';
const outputPath = 'D:/temp_sapi_test.wav';

// PowerShell script using BOM encoding
const ps1 = Buffer.from([
  0xFF, 0xFE, // UTF-16 LE BOM
  ...Buffer.from(
    'Add-Type -AssemblyName System.Speech; ' +
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
    '$s.SetOutputToWaveFile("D:/temp_sapi_test.wav"); ' +
    '$s.Speak([System.Management.Automation.Language.Parser]::ParseInput(@"\n' + text + '\n"@, [ref]$null, [ref]$null)); ' +
    '$s.SetOutputToNull(); ' +
    'Write-Output done'
    , 'utf16le')
]).toString('utf8');

// Write PS1 with BOM
fs.writeFileSync('D:/temp_sapi_call.ps1', Buffer.from([
  0xFF, 0xFE, // UTF-16 LE BOM
  ...Buffer.from(
    'Add-Type -AssemblyName System.Speech; ' +
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
    '$s.SetOutputToWaveFile("D:/temp_sapi_test.wav"); ' +
    '$s.Speak("' + text.replace(/"/g, '`"') + '"); ' +
    '$s.SetOutputToNull(); ' +
    'Write-Output done'
    , 'utf16le')
]));

console.log('PS1 written, executing...');
try {
  const result = execSync('powershell -ExecutionPolicy Bypass -File "D:/temp_sapi_call.ps1"', {
    encoding: 'utf8',
    timeout: 10000
  });
  console.log('Result:', result);
} catch(e) {
  console.error('Error:', e.message);
}

// Check if file exists
if (fs.existsSync(outputPath)) {
  const stats = fs.statSync(outputPath);
  console.log('WAV created, size:', stats.size);
} else {
  console.log('WAV not created');
}
