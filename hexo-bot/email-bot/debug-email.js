const Imap = require('imap');
const i = new Imap({
  user: 'snowhoo@vip.qq.com',
  password: 'kyurfxweeogocaci',
  host: 'imap.qq.com',
  port: 993,
  tls: true
});

i.on('ready', () => {
  console.log('READY');
  i.openBox('INBOX', false, (e, box) => {
    if (e) { console.log('OpenBox error:', e.message); i.end(); return; }
    console.log('Total emails:', box.messages.total);
    // Fetch latest 5
    const latest = box.messages.total;
    if (latest === 0) { i.end(); return; }
    const start = Math.max(1, latest - 4);
    const fetch = i.seq.fetch(start + ':' + latest, {
      bodies: 'HEADER.FIELDS (SUBJECT FROM DATE)',
      struct: true
    });
    let count = 0;
    fetch.on('message', (msg) => {
      const seqNo = msg.seqno;
      msg.on('body', (stream) => {
        let buffer = '';
        stream.on('data', chunk => { buffer += chunk.toString('utf8'); });
        stream.on('end', () => {
          console.log('--- [' + seqNo + '] ---');
          console.log(buffer.trim());
        });
      });
    });
    fetch.once('error', err => console.log('Fetch error:', err.message));
    fetch.once('end', () => { console.log('Done fetching'); i.end(); });
  });
});

i.on('error', e => console.log('IMAP error:', e.message));
i.on('end', () => console.log('Disconnected'));

i.connect();

setTimeout(() => {
  console.log('Timeout - exiting');
  i.end();
  process.exit(0);
}, 15000);