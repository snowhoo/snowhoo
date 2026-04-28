process.chdir('D:/hexo/hexo-bot/email-bot');
try {
  require('./test-convert.js');
} catch(e) {
  process.stderr.write('FATAL: ' + e.message + '\n' + e.stack + '\n');
  process.exit(1);
}
