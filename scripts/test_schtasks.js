const fs = require('fs');
const { execSync } = require('child_process');

const taskIndex = 1;
const taskName = 'Snowhoo_AutoComment_' + taskIndex;
const nodeExe = 'C:\\Program Files\\nodejs\\node.exe';
const script = 'd:\\hexo\\scripts\\comment-executor.js';
const date = '2026/05/06';
const time = '08:43';

// Try with just the script path quoted, node.exe might work without quotes
const trValue = '"' + nodeExe + '" "' + script + '" --taskIndex=' + taskIndex;

const cmdContent = [
  '@echo off',
  'schtasks /delete /tn "' + taskName + '" /f 2>nul',
  'schtasks /create /tn "' + taskName + '" /tr ' + trValue + ' /sc once /sd ' + date + ' /st ' + time + ' /f',
  'echo Done'
].join('\r\n');

console.log('CMD content:');
console.log(cmdContent);
console.log('---');

// Write cmd file
const cmdPath = 'D:\\hexo\\scripts\\temp_task_' + taskIndex + '.cmd';
fs.writeFileSync(cmdPath, cmdContent);

// Execute via PowerShell with cmd /c
const psContent = 'cmd /c "' + cmdPath + '"';

console.log('Executing via PowerShell...');
try {
  const result = execSync('powershell -ExecutionPolicy Bypass -Command "' + psContent + '"', {
    encoding: 'utf8',
    windowsHide: true
  });
  console.log('Result:', result);
} catch(e) {
  console.log('Error:', e.stderr || e.stdout || e.message);
}

// Clean up
try { fs.unlinkSync(cmdPath); } catch(e) {}
