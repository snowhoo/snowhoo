// 手动处理指定 UID 的邮件
const ImapFlow = require('imapflow').ImapFlow;
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

const UID = process.argv[2];
if (!UID) { console.error('Usage: node process-one.js <uid>'); process.exit(1); }

const LOG = path.join(__dirname, 'process-one.log');
function log(msg) {
  const line = new Date().toISOString() + ' ' + msg + '\n';
  fs.appendFileSync(LOG, line);
  process.stdout.write(line);
}

async function run() {
  log('Processing UID: ' + UID);

  // 直接调用 email-to-hexo.js 的逻辑
  // 清除 require 缓存以使用最新代码
  delete require.cache[require.resolve('./email-to-hexo.js')];

  const noop = () => {};
  const sl = { fatal: noop, error: noop, warn: noop, info: noop, debug: noop, trace: noop, child: () => sl };

  const c = new ImapFlow({
    host: 'imap.qq.com', port: 993, secure: true,
    auth: { user: '9187541@qq.com', pass: 'kyurfxweeogocaci' },
    logger: sl,
  });

  await c.connect();
  const lock = await c.getMailboxLock('INBOX');

  try {
    const raw = await c.fetchOne(UID, { source: true });
    const em = await simpleParser(raw.source);

    log('Subject: ' + em.subject);
    log('From: ' + em.from?.value?.[0]?.address);

    // 标记已读
    await c.messageFlagsAdd(UID, ['\\Seen']);
    log('Marked as seen');

  } finally {
    lock.release();
    await c.logout();
  }

  log('Done - now restarting email-bot to pick this up...');
}

run().catch(e => log('ERROR: ' + e.message));
