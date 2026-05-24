const axios = require('axios');
const iconv = require('iconv-lite');
const cheerio = require('cheerio');

const BQ_BASE = 'https://www.biquge500.com';
const bookId = '2867';

async function fetchPage(url) {
  const r = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    responseType: 'arraybuffer',
    timeout: 15000,
  });
  const buf = Buffer.from(r.data);
  return iconv.decode(buf, 'gbk');
}

async function test() {
  const possibleUrls = [
    `${BQ_BASE}/Book/1/${bookId}/`,
    `${BQ_BASE}/Book/2/${bookId}/`,
    `${BQ_BASE}/Book/3/${bookId}/`,
    `${BQ_BASE}/Book/21/${bookId}/`,
  ];

  for (const url of possibleUrls) {
    try {
      console.log('Trying:', url);
      const html = await fetchPage(url);
      const $ = cheerio.load(html);
      const ogTitle = $('meta[property="og:novel:book_name"]').attr('content');
      const ddCount = $('#list dl dd').length;
      console.log('  ogTitle:', ogTitle || '(none)');
      console.log('  dd count:', ddCount);
      if (ogTitle && ddCount > 0) {
        console.log('  SUCCESS!');
        break;
      }
    } catch (e) {
      console.log('  Error:', e.message);
    }
  }
}

test().catch(e => console.error(e.message));