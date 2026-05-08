const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');

const content = fs.readFileSync('D:/hexo/hexo-bot/email-bot/email-to-hexo.js', 'utf8');
const passMatch = content.match(/password:\s*['"]([^'"]+)['"]/);
const password = passMatch ? passMatch[1] : '';
const userMatch = content.match(/user:\s*['"]([^'"]+)['"]/);
const user = userMatch ? userMatch[1] : '';

console.log('User:', user);

const imap = new Imap({
  user: user,
  password: password,
  host: 'imap.qq.com',
  port: 993,
  tls: true
});

function fetchUid(uid) {
  return new Promise((resolve, reject) => {
    const search = [['UID', parseInt(uid)]];
    imap.search(search, function(err, results) {
      if (err) { reject(err); return; }
      if (!results || results.length === 0) { resolve(null); return; }
      const f = imap.fetch(results[0], { bodies: 'HEADER.FIELDS (FROM SUBJECT DATE UID)', struct: true });
      f.on('message', function(msg, seqno) {
        let mailData = {};
        msg.on('body', function(stream, info) {
          simpleParser(stream, (err, mail) => {
            if (err) { reject(err); return; }
            mailData = {
              from: mail.from.value[0].address,
              subject: mail.subject,
              date: mail.date,
              uid: uid
            };
          });
        });
        msg.on('end', function() {
          setTimeout(() => resolve(mailData), 500);
        });
      });
      f.on('error', reject);
    });
  });
}

imap.once('ready', async function() {
  imap.openBox('INBOX', true, async function(err, box) {
    if (err) { console.log('Open error:', err); imap.end(); return; }
    
    // Fetch 581, 583, 528
    const uids = ['581', '583', '528'];
    for (const uid of uids) {
      try {
        const mail = await fetchUid(uid);
        console.log(`\n=== UID ${uid} ===`);
        console.log('Subject:', mail ? mail.subject : 'NOT FOUND');
        console.log('Date:', mail ? mail.date : 'NOT FOUND');
        console.log('From:', mail ? mail.from : 'NOT FOUND');
      } catch(e) {
        console.log(`UID ${uid} error:`, e.message);
      }
      await new Promise(r => setTimeout(r, 300));
    }
    
    imap.end();
  });
});

imap.once('error', function(err) { console.log('imap error:', err.message); });
imap.connect();
