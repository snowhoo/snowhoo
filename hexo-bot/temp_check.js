const { ImapFlow } = require('imapflow');

async function test() {
  const client = new ImapFlow({host:'imap.qq.com', port:993, auth:{user:'9187541@qq.com', pass:'kyurfxweeogocaci'}, timeout: 60000});
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  
  const uids = await client.search({ since: new Date(Date.now() - 10 * 60 * 60 * 1000) });
  console.log('Found UIDs:', [...uids]);
  
  for (const uid of uids) {
    const msg = await client.fetchOne(uid, {envelope:true, uid:true});
    console.log('UID:', uid, '| Subject:', msg.envelope?.subject, '| Date:', msg.envelope?.date);
  }
  
  // Also fetch the latest few UIDs to see the @hexo email
  for (const uid of [519, 520, 521]) {
    try {
      const msg = await client.fetchOne(uid, {envelope:true, uid:true});
      console.log('UID:', uid, '| Subject:', msg.envelope?.subject, '| Date:', msg.envelope?.date);
    } catch(e) {
      console.log('UID:', uid, '| Error:', e.message);
    }
  }
  
  lock.release();
  await client.logout();
}
test().catch(e => { console.error(e.message); process.exit(1); });