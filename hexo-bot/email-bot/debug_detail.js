const ImapFlowModule = require('imapflow');
const ImapFlow = ImapFlowModule.ImapFlow;
const path = require('path');
const fs = require('fs');

const processed = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'processed-uids.json'), 'utf8')));

(async () => {
  const client = new ImapFlow({
    host: 'imap.qq.com',
    port: 993,
    secure: true,
    auth: { user: '9187541@qq.com', pass: 'kyurfxweeogocaci' }
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  try {
    const now = new Date();
    const window10h = new Date(Date.now() - 10 * 60 * 60 * 1000);
    const window24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const window48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const uids10h = await client.search({ since: window10h });
    const uids24h = await client.search({ since: window24h });
    const uids48h = await client.search({ since: window48h });

    fs.writeFileSync('debug_detail.txt',
      `Now (local): ${now.toISOString()}\n` +
      `10h window start: ${window10h.toISOString()}\n` +
      `24h window start: ${window24h.toISOString()}\n` +
      `48h window start: ${window48h.toISOString()}\n` +
      `\nUIDs in 10h window: ${uids10h.length}\n` +
      `UIDs in 24h window: ${uids24h.length}\n` +
      `UIDs in 48h window: ${uids48h.length}\n` +
      `\nAll UIDs (last 48h): ${uids48h.join(',')}\n\n`
    );

    const allUids = uids48h;
    for (const uid of allUids) {
      const isProc = processed.has(String(uid));
      if (isProc) continue; // skip already done
      try {
        const msg = await client.fetchOne(uid, { envelope: true });
        const sub = msg.envelope?.subject || '(no subject)';
        const dt = msg.envelope?.date?.toISOString() || 'no date';
        const line = `UID ${uid} [NEW] ${dt} | ${sub}`;
        console.log(line);
        fs.appendFileSync('debug_detail.txt', line + '\n');
      } catch (e) {
        const line = `UID ${uid} [ERROR] ${e.message}`;
        console.log(line);
        fs.appendFileSync('debug_detail.txt', line + '\n');
      }
    }
  } finally {
    lock.release();
  }

  await client.logout();
  process.exit(0);
})().catch(e => {
  fs.writeFileSync('debug_error.txt', e.message + '\n' + e.stack);
  console.error(e.message);
  process.exit(1);
});
