const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.goto('https://weixin.sogou.com/weixin?type=1&query=%E4%BA%BA%E6%B0%91%E6%97%A5%E6%8A%A5&ie=utf8', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // 获取页面可见文本
  const texts = await page.evaluate(() => {
    const el = document.querySelector('.news-list2, .news-list, .results, .main-left');
    return el ? el.innerText.substring(0, 3000) : document.body.innerText.substring(0, 3000);
  });
  console.log('=== PAGE TEXT ===');
  console.log(texts);
  
  // 找所有链接
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .filter(a => a.href && a.textContent.trim())
      .slice(0, 30)
      .map(a => ({ text: a.textContent.trim().substring(0,50), href: a.href.substring(0,120) }));
  });
  console.log('\n=== LINKS ===');
  links.forEach(l => console.log(l.text, '->', l.href));

  await browser.close();
})();
