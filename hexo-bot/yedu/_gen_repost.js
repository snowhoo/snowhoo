const https = require('https');
const fs = require('fs');
const path = require('path');

const TEMP_DIR = 'D:/hexo/hexo-bot/yedu/_temp_repost';
const IMG_DIR = 'D:/hexo/source/images/repost';
const POSTS_DIR = 'D:/hexo/source/_posts';
const slug = 'sweat-blister-summer';
const dateStr = '2026-05-27';

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

const contentImages = [
  'https://pics6.baidu.com/feed/472309f790529822fd8b4ef66727c6da0b46d44e.jpeg@f_auto?token=7d6e4ff729bc7f8261ff5ba321e76701',
  'https://pics5.baidu.com/feed/32fa828ba61ea8d311ee18b627e78d5f271f58b7.jpeg@f_auto?token=a3b6c1409a24b4ee7b1fbaac0d923f0c',
  'https://pics7.baidu.com/feed/b21bb051f819861889073ba8e50093628ad4e65e.jpeg@f_auto?token=05b0c2a396e669ed8b5e739dbc0ac9f1',
  'https://pics1.baidu.com/feed/9f510fb30f2442a7dc5cbe5c61ae105ad31302f3.jpeg@f_auto?token=30a7063d45a408c03c84667647b50790',
];

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    const opts = new URL(url);
    const reqOpts = { hostname: opts.hostname, path: opts.pathname + opts.search, headers: { 'User-Agent': 'Mozilla/5.0' } };
    https.get(reqOpts, (res) => {
      if ([301,302].includes(res.statusCode)) {
        const loc = res.headers.location;
        https.get(loc, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r2) => r2.pipe(file));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(filepath); });
    }).on('error', (e) => { fs.unlink(filepath, ()=>{}); reject(e); });
  });
}

function buildMarkdown(downloaded) {
  const cover = downloaded.length > 0 ? '/images/repost/' + downloaded[0] : '';
  const body = `> 原文来源：[央视新闻](https://baijiahao.baidu.com/s?id=1866250999490952436) | 转载仅供分享

每到夏天，就有不少人手上长水疱，瘙痒难耐，一旦挠破，里面还会流出一些不明液体……这种困扰好多人的透明「小水泡」大多数情况下其实是**汗疱疹**，是一种慢性复发性皮肤疾病，具有鲜明的季节性特点。该如何应对？

## 正确识别汗疱疹

汗疱疹多发于手指侧面、手掌、指端皮肤，多为米粒大小，有的稍高于皮肤，有的隐藏在皮肤之下。汗疱疹也叫出汗不良性湿疹、掌跖急性湿疹，主要有以下几个特点——

- 粟粒大小（通常指直径在 1—5 毫米范围内的颗粒状物体）的水疱、成群发生，左右对称发病；
- 水疱内含有清澈的疱液，可能会伴有瘙痒或烧灼感；
- 水疱位置较深，不容易破；
- 水疱一般 2 到 3 周后会干涸脱皮，露出皮肤，此时可能会有疼痛感；
- 常见于青年群体，儿童或者老年人很少见；
- 反复发作，可以在数月或数年间频繁发作。

> ⚠️ 需要提醒的是，**汗疱疹不会传染**，但是掐破水疱会导致皮肤破损，手经常接触各种东西，会增加感染的风险。

疱疹性瘭疽、手癣或足癣、接触性皮炎、虫咬皮炎也会长在手上或脚上，容易被误诊为汗疱疹，需要加以辨别。

## 汗疱疹是如何长出来的？

汗疱疹的病因尚不明确，目前被认为是一种皮肤湿疹样反应。在水疱形成过程中，汗腺导管并不受影响，而是**一种发生在皮肤上的湿疹样超敏反应**。有汗疱疹的人要关注以下几个因素：

**遗传因素** — 临床中，发现少数患者有家族聚集发病现象。

**手部感染** — 真菌感染是引起汗疱疹发病的原因之一，包括金黄色葡萄球菌、马拉色菌、气源性真菌等。

**接触性刺激** — 接触一些药物化学制剂如呋喃西林、香料、重铬酸钾等，可能会引起汗疱疹。佩戴含有镍或铬等金属的项链、耳环、手镯等物件也可能引起汗疱疹。

**日光照射** — 汗疱疹可被 UVA 诱发出来。

**出汗太多** — 夏季人体出汗多，皮脂分泌更旺盛，尤其是油性皮肤的人，总感觉自己黏糊糊的，极易导致汗液潴留于皮内而引起汗疱疹。手部多汗的人，可能比普通人更易患汗疱疹。

**心理因素** — 长期精神紧张、焦虑抑郁，以及过度疲劳、睡眠不足、应激等也会诱发汗疱疹。

**个人体质** — 皮肤敏感者对外界环境的变化更加敏感，尤其对风吹、日晒、温度湿度变化等不能耐受，轻微刺激即可诱发。

**过度清洁** — 有人认为汗疱疹是清洁度不够导致的，因此会频繁洗手，其实，**过度洗手反而会加重症状**，洗手液、肥皂等都会带来刺激。

## 长了汗疱疹如何处理？

**涂抹外用糖皮质激素药膏是治疗汗疱疹的最常见方法**，参照说明书或遵医嘱使用即可。

- 可选择强效糖皮质激素，比如糠酸莫米松乳膏、卤米松乳膏，因为汗疱疹的炎症较深，手脚的角质层厚，地奈德等弱效糖皮质激素效果不太理想；
- 瘙痒厉害时，可以增加止痒药物，外用的有薄荷脑软膏；
- 必要时可以试着口服抗组胺药物，例如西替利嗪，需遵医嘱使用；
- 反复治疗不好的，建议及时找医生复评病情、调整方案。

## 如何避免汗疱疹？

- **保持手部清爽干燥**：平时要避免搔抓、烫洗，生活中要尽量避免过度清洁，少接触消毒液、洗手液、酒精等刺激性化学物质。
- **避免接触某些金属**：留意戒指、手表和手链等首饰，长期接触水分时，合金成分可能会释放，引起皮肤问题，如果有可疑情况，建议少戴或不戴首饰或者接触水前先取下来。
- **保护好皮肤屏障**：夏季要避免强烈的日光照射，外出要做好防晒；手部皮肤保湿可增强屏障功能，降低汗疱疹的发病概率；洗手选择温水，洗后擦护手霜，少用香精等添加剂较多的产品；工作或者做家务时，如果不得已要接触特殊的化学物质，可以戴上手套操作。

> ⚠️ **提醒大家**：汗疱疹是一种自限性疾病，一般半个月左右即可自愈。但如果出现长期反复不愈，或者感染化脓等情况，**要及时就医治疗**。

> 来源：[央视新闻](https://baijiahao.baidu.com/s?id=1866250999490952436) | 整理转载
`;

  const fm = `---
title: 这种夏天手上爱长的小水疱 到底是什么？
date: ${dateStr} 08:00:00
updated: ${dateStr} 08:00:00
categories:
  - 转载
tags:
  - 健康
  - 夏季
  - 皮肤
  - 养生
cover: ${cover}
toc: true
---

${body}`;

  const filePath = path.join(POSTS_DIR, '20260527-' + slug + '.md');
  fs.writeFileSync(filePath, fm, 'utf-8');
  console.log('\n✅ 文章已生成:', filePath);
}

(async () => {
  const downloaded = [];
  for (let i = 0; i < contentImages.length; i++) {
    const imgName = slug + '_' + String(i+1).padStart(2,'0') + '.jpg';
    const tempPath = path.join(TEMP_DIR, imgName);
    try {
      await downloadImage(contentImages[i], tempPath);
      fs.copyFileSync(tempPath, path.join(IMG_DIR, imgName));
      downloaded.push(imgName);
      console.log('已下载:', imgName, '| size:', fs.statSync(tempPath).size);
    } catch(e) { console.log('失败:', e.message); }
  }

  buildMarkdown(downloaded);
  console.log('下载图片:', downloaded.length, '张');
})().catch(e => { console.error(e.message); process.exit(1); });
