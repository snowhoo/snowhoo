const ImapFlow = require('imapflow').ImapFlow;
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

const LOG = path.join(__dirname, 'check-mail-debug.log');

function log(msg) {
  const line = new Date().toISOString() + ' ' + msg + '\n';
  fs.appendFileSync(LOG, line);
  process.stdout.write(line);
}

async function check() {
  log('Starting...');
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
    const since = new Date(Date.now() - 3 * 3600000);
    const uids = await c.search({ since });
    log('All recent UIDs: ' + JSON.stringify(uids));

    const processedPath = path.join(__dirname, 'processed-uids.json');
    const processed = new Set(JSON.parse(fs.readFileSync(processedPath, 'utf8')));

    // 只检查未处理的
    const unprocessed = uids.filter(u => !processed.has(String(u)));
    log('Unprocessed: ' + JSON.stringify(unprocessed));

    for (const uid of unprocessed) {
      const raw = await c.fetchOne(uid, { source: true });
      const em = await simpleParser(raw.source);
      const from = em.from?.value?.[0]?.address || 'unknown';
      const subject = em.subject || '(no subject)';
      const hasHexo = /^@hexo/i.test(subject.replace(/^(转发|Re|RE|FW|Fwd|Re:)\s*:\s*/i, '').trim());
      log(`UID:${uid} From:${from} Subject:"${subject}" IsHexo:${hasHexo} HasHtml:${!!em.html} HasText:${!!em.text}`);
    }
  } finally {
    lock.release();
    await c.logout();
    log('Done');
  }
}

check().catch(e => log('ERROR: ' + e.message));
