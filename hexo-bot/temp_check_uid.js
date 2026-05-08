const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const fs = require('fs');

const content = fs.readFileSync('D:/hexo/hexo-bot/email-bot/email-to-hexo.js', 'utf8');
const passMatch = content.match(/password:\s*['"]([^'"]+)['"]/);
const password = passMatch ? passMatch[1] : '';
const userMatch = content.match(/user:\s*['"]([^'"]+)['"]/);
const user = userMatch ? userMatch[1] : '';

console.log('User:', user);

async function checkUids() {
  const client = new ImapFlow({
    host: 'imap.qq.com',
    port: 993,
    secure: true,
    auth: { user, pass: password }
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  
  const uids = ['528', '581', '583'];
  for (const uid of uids) {
    try {
      const msg = await client.fetchOne(parseInt(uid), { source: true, envelope: true });
      if (msg) {
        const mail = await simpleParser(msg.source);
        console.log(`\n=== UID ${uid} ===`);
        console.log('Subject:', mail.subject);
        console.log('Date:', mail.date);
        console.log('From:', mail.from.value[0]?.address);
      } else {
        console.log(`\nUID ${uid}: NOT FOUND`);
      }
    } catch(e) {
      console.log(`UID ${uid} error:`, e.message);
    }
  }
  
  lock.release();
  await client.logout();
}

checkUids().catch(e => { console.log('Error:', e.message); process.exit(1); });
