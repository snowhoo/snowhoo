const ImapFlow = require('imapflow').ImapFlow;
const fs = require('fs');
const path = require('path');

async function cleanup() {
  // 1. 删除文章
  const postFile = 'D:/hexo/source/_posts/202604250814527akd.md';
  if (fs.existsSync(postFile)) {
    fs.unlinkSync(postFile);
    console.log('已删除文章:', postFile);
  }

  // 2. 删除附件图片
  const imgDir = 'D:/hexo/source/images/email-attachments';
  const deleted = [];
  for (let i = 0; i <= 6; i++) {
    const f = path.join(imgDir, '20260425081452-' + i + '.jpg');
    if (fs.existsSync(f)) { fs.unlinkSync(f); deleted.push(path.basename(f)); }
  }
  console.log('已删除图片:', deleted.length, '张');

  // 3. 从 UID 记录中移除最新 UID
  const uidFile = 'D:/hexo/hexo-bot/email-bot/processed-uids.json';
  if (fs.existsSync(uidFile)) {
    const uids = JSON.parse(fs.readFileSync(uidFile, 'utf8'));
    const knownUids = ['508','510','512','514','516','518','529','549'];
    const newUid = uids.find(u => !knownUids.includes(u));
    if (newUid !== undefined) {
      const filtered = uids.filter(u => u !== newUid);
      fs.writeFileSync(uidFile, JSON.stringify(filtered), 'utf8');
      console.log('已从 UID 记录移除:', newUid);
    }
  }

  // 4. 从邮箱中删除邮件
  const client = new ImapFlow({
    host: 'imap.qq.com', port: 993, secure: true,
    auth: { user: '9187541@qq.com', pass: 'kyurfxweeogocaci' }
  });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const uids = await client.search({ since: today });
    for (const uid of uids) {
      const { envelope } = await client.fetchOne(uid, { envelope: true });
      if (envelope.subject && envelope.subject.includes('AI圈')) {
        await client.messageDelete(uid);
        console.log('已从邮箱删除:', envelope.subject);
        break;
      }
    }
  } finally {
    lock.release();
    await client.close();
  }
  console.log('清理完成！');
}

cleanup().catch(console.error);
