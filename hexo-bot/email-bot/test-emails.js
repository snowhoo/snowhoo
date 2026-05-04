const { ImapFlow } = require('imapflow');

const client = new ImapFlow({
  host: 'imap.qq.com',
  port: 993,
  secure: true,
  auth: { user: '9187541@qq.com', pass: 'kyurfxweeogocaci' },
});

async function run() {
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const uids = await client.search({ since });

    console.log(`最近1小时内共有 ${uids.length} 封邮件:\n`);

    for (const uid of uids) {
      const raw = await client.fetchOne(uid, { source: true });
      const { simpleParser } = require('mailparser');
      const em = await simpleParser(raw.source);
      const subject = em.subject || '(无主题)';
      const from = em.from?.value?.[0]?.address || 'unknown';
      const date = em.date || new Date();

      const isHexo = /^@hexo\b/i.test(subject);
      console.log(`UID: ${uid}`);
      console.log(`  时间: ${date}`);
      console.log(`  发件人: ${from}`);
      console.log(`  主题: ${subject}`);
      console.log(`  @hexo匹配: ${isHexo ? '✅ 是' : '❌ 否'}`);
      console.log('');
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
