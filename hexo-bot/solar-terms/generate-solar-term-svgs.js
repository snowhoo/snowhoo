/**
 * generate-solar-term-svgs.js
 * 二十四节气 SVG 封面图 · 水墨画风格重制版
 * 图片存放于 D:/hexo/source/images/solar-terms/
 */

const fs = require('fs');
const path = require('path');
const { SOLAR_TERMS } = require('./solar-terms-data');

const OUT_DIR = 'D:/hexo/source/images/solar-terms';

// ============================================================
// 水墨画配色主题（远景 / 中景 / 近景三层氛围）
// ============================================================
const THEME = {
  spring: {
    sky:    ['#c8e6c9','#a5d6a7','#e8f5e9','#f1f8e9'],
    mist:   'rgba(200,230,201,0.5)',
    far:    '#a5d6a7', mid: '#66bb6a', near: '#2e7d32',
    water:  '#b2dfdb', accent: '#e91e63',
    sun:    '#fdd835', text: '#1b5e20',
    petals: '#f8bbd0', leaf: '#81c784'
  },
  summer: {
    sky:    ['#fff9c4','#ffecb3','#fff8e1','#fffde7'],
    mist:   'rgba(255,249,196,0.4)',
    far:    '#90caf9', mid: '#42a5f5', near: '#1e88e5',
    water:  '#4fc3f7', accent: '#ff6f00',
    sun:    '#ff8f00', text: '#bf360c',
    petals: '#fff59d', leaf: '#a5d6a7'
  },
  autumn: {
    sky:    ['#ffe0b2','#ffcc80','#fff3e0','#fff8e1'],
    mist:   'rgba(255,224,178,0.4)',
    far:    '#ff8a65', mid: '#f4511e', near: '#bf360c',
    water:  '#b0bec5', accent: '#ffa000',
    sun:    '#ffa000', text: '#bf360c',
    petals: '#ffcc80', leaf: '#e65100'
  },
  winter: {
    sky:    ['#e3f2fd','#bbdefb','#f5f5f5','#eceff1'],
    mist:   'rgba(227,242,253,0.6)',
    far:    '#90a4ae', mid: '#78909c', near: '#546e7a',
    water:  '#b0bec5', accent: '#42a5f5',
    sun:    '#cfd8dc', text: '#37474f',
    petals: '#ffffff', leaf: '#b0bec5'
  }
};

// ============================================================
// 每个节气的专属场景 SVG
// ============================================================
function snowflakes(x, y, r, opacity) {
  return Array.from({length: 20}, (_, i) =>
    `<circle cx="${x + Math.sin(i*47)*r}" cy="${y + Math.cos(i*31)*r*0.6}" r="${1+i%3*0.8}" fill="#fff" opacity="${opacity*(0.4+i%5*0.12)}"/>`
  ).join('');
}

function rain(x0, y0, count, color, opacity) {
  return Array.from({length: count}, (_, i) =>
    `<line x1="${x0+i*28}" y1="${y0+i%3*12}" x2="${x0+i*28-4}" y2="${y0+i%3*12+18}" stroke="${color}" stroke-width="1.2" opacity="${opacity*(0.3+i%4*0.15)}"/>`
  ).join('');
}

function petals(x0, y0, count, color, opacity) {
  return Array.from({length: count}, (_, i) =>
    `<ellipse cx="${x0+i*45+i%3*15}" cy="${y0+i%4*22}" rx="${3+i%2*2}" ry="2" fill="${color}" opacity="${opacity*(0.5+i%3*0.15)}" transform="rotate(${i*37},${x0+i*45},${y0+i%4*22})"/>`
  ).join('');
}

function leaves(x0, y0, count, color, opacity) {
  return Array.from({length: count}, (_, i) =>
    `<path d="M${x0+i*38+i%2*12} ${y0+i%3*18} Q${x0+i*38+i%2*12+6} ${y0+i%3*18-10} ${x0+i*38+i%2*12+12} ${y0+i%3*18}" stroke="${color}" stroke-width="1.5" fill="none" opacity="${opacity*(0.5+i%3*0.15)}" transform="rotate(${i*53},${x0+i*38+i%2*12+6},${y0+i%3*18-5})"/>`
  ).join('');
}

const SCENES = {

  '小寒': (t) => `
    <!-- 远景雪松 -->
    <path d="M80 400 L80 240 L60 240 L80 180 L55 180 L80 120 L40 120 L80 50 L120 120 L95 120 L120 180 L95 180 L120 240 L100 240 L100 400Z" fill="${t.far}" opacity="0.6"/>
    <path d="M300 400 L300 260 L285 260 L300 210 L278 210 L300 155 L268 155 L300 90 L332 155 L300 155 L322 210 L300 210 L315 260 L300 260 L300 400Z" fill="${t.mid}" opacity="0.5"/>
    <!-- 积雪地面 -->
    <path d="M0 360 Q100 340 200 355 Q350 330 500 350 Q650 325 800 340 L800 400 L0 400Z" fill="${t.far}" opacity="0.8"/>
    <ellipse cx="200" cy="365" rx="40" ry="8" fill="#fff" opacity="0.6"/>
    <ellipse cx="580" cy="358" rx="35" ry="7" fill="#fff" opacity="0.5"/>
    <!-- 飘雪 -->
    ${snowflakes(0, 0, 120, 0.8)}
    <!-- 梅花枝 -->
    <path d="M600 400 Q580 340 620 300 Q660 260 630 220 Q600 180 640 150" stroke="#5d4037" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M620 300 Q660 280 700 290" stroke="#5d4037" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M620 260 Q660 240 695 250" stroke="#5d4037" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="608" cy="215" r="5" fill="#f48fb1"/><circle cx="628" cy="200" r="4.5" fill="#f48fb1"/><circle cx="648" cy="182" r="5" fill="#f48fb1"/>
    <circle cx="620" cy="240" r="4" fill="#f8bbd0"/><circle cx="638" cy="225" r="3.5" fill="#f48fb1"/><circle cx="655" cy="210" r="4.5" fill="#f8bbd0"/>
    <circle cx="678" cy="230" r="4" fill="#f48fb1"/><circle cx="692" cy="245" r="3.5" fill="#f8bbd0"/>
    <!-- 雪中亭 -->
    <rect x="340" y="330" width="60" height="50" fill="${t.far}" opacity="0.7" rx="2"/>
    <path d="M330 330 L370 305 L410 330Z" fill="${t.near}" opacity="0.8"/>
    <ellipse cx="370" cy="305" rx="30" ry="6" fill="#fff" opacity="0.7"/>
    <ellipse cx="370" cy="380" rx="50" ry="8" fill="#fff" opacity="0.4"/>
  `,

  '大寒': (t) => `
    <!-- 远景雪山 -->
    <path d="M0 280 L80 180 L160 220 L240 140 L330 200 L400 110 L480 170 L560 120 L640 180 L720 130 L800 190 L800 400 L0 400Z" fill="${t.far}" opacity="0.5"/>
    <!-- 雪盖山顶 -->
    <path d="M380 110 L400 90 L420 110Z" fill="#fff" opacity="0.9"/>
    <path d="M540 120 L560 100 L580 120Z" fill="#fff" opacity="0.8"/>
    <path d="M220 140 L240 120 L260 140Z" fill="#fff" opacity="0.85"/>
    <!-- 大雪 -->
    ${snowflakes(0, 0, 150, 0.7)}
    ${snowflakes(200, 30, 120, 0.6)}
    <!-- 结冰河面 -->
    <path d="M0 370 Q200 355 400 368 Q600 350 800 365 L800 400 L0 400Z" fill="${t.water}" opacity="0.6"/>
    <ellipse cx="400" cy="375" rx="150" ry="6" fill="#fff" opacity="0.5"/>
    <!-- 枯树 -->
    <path d="M150 400 L150 270" stroke="#5d4037" stroke-width="5" stroke-linecap="round"/>
    <path d="M150 320 Q120 290 90 300" stroke="#5d4037" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M150 300 Q180 270 210 280" stroke="#5d4037" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <!-- 雪中鸟巢 -->
    <ellipse cx="150" cy="272" rx="20" ry="12" fill="${t.far}" opacity="0.8"/>
    <ellipse cx="150" cy="275" rx="25" ry="8" fill="#fff" opacity="0.9"/>
  `,

  '立春': (t) => `
    <!-- 远山淡影 -->
    <path d="M0 300 Q100 260 200 280 Q350 240 450 265 Q600 230 700 255 Q780 235 800 250 L800 400 L0 400Z" fill="${t.far}" opacity="0.4"/>
    <path d="M0 330 Q150 295 300 315 Q500 280 650 300 Q750 285 800 295 L800 400 L0 400Z" fill="${t.mid}" opacity="0.5"/>
    <!-- 早春嫩绿草地 -->
    <path d="M0 380 Q200 360 400 375 Q600 355 800 370 L800 400 L0 400Z" fill="${t.near}" opacity="0.7"/>
    <!-- 柳枝 -->
    <path d="M520 400 Q500 340 540 290 Q580 240 560 190" stroke="#66bb6a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M540 290 Q560 270 580 280" stroke="#66bb6a" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M540 260 Q565 240 585 250" stroke="#66bb6a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <!-- 柳叶 -->
    ${Array.from({length:12},(_,i)=>{ const y0=300-i*9, y1=295-i*9, y2=300-i*9, x=522+i*4, x2=525+i*4, cx=522+i*4, cy=298-i*9; return `<path d="M${520+i*4} ${y0} Q${x} ${y1} ${x2} ${y2}" stroke="${t.leaf}" stroke-width="1.5" fill="none" opacity="${0.6+i%3*0.12}" transform="rotate(-20,${cx},${cy})"/>`; }).join('')}
    <!-- 桃花 -->
    <path d="M680 400 Q660 350 690 310 Q720 270 700 230" stroke="#795548" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M690 310 Q720 290 750 295" stroke="#795548" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="678" cy="240" r="6" fill="${t.accent}"/><circle cx="698" cy="225" r="5.5" fill="${t.accent}"/><circle cx="718" cy="210" r="5" fill="${t.accent}"/>
    <circle cx="740" cy="218" r="4.5" fill="${t.petals}"/><circle cx="755" cy="228" r="4" fill="${t.accent}"/>
    <!-- 早春燕子 -->
    <path d="M200 200 Q215 192 230 198 Q215 196 200 200Z" fill="${t.near}"/><circle cx="198" cy="197" r="3" fill="${t.near}"/>
    <path d="M280 180 Q295 172 310 178 Q295 176 280 180Z" fill="${t.near}"/><circle cx="278" cy="177" r="3" fill="${t.near}"/>
  `,

  '雨水': (t) => `
    <!-- 远山云雾 -->
    <path d="M0 280 Q200 250 400 270 Q600 240 800 260 L800 400 L0 400Z" fill="${t.far}" opacity="0.35"/>
    <!-- 雨雾层 -->
    <ellipse cx="200" cy="250" rx="300" ry="60" fill="${t.mist}" opacity="0.6"/>
    <ellipse cx="600" cy="260" rx="250" ry="50" fill="${t.mist}" opacity="0.5"/>
    <!-- 雨中池塘 -->
    <ellipse cx="400" cy="370" rx="280" ry="35" fill="${t.water}" opacity="0.5"/>
    <ellipse cx="400" cy="368" rx="240" ry="25" fill="#4fc3f7" opacity="0.3"/>
    <!-- 涟漪 -->
    <ellipse cx="300" cy="365" rx="30" ry="8" fill="none" stroke="#90caf9" stroke-width="1" opacity="0.6"/>
    <ellipse cx="500" cy="372" rx="25" ry="6" fill="none" stroke="#90caf9" stroke-width="1" opacity="0.5"/>
    <!-- 雨 -->
    ${rain(0, 0, 20, '#64b5f6', 0.7)}
    <!-- 柳树倒影 -->
    <path d="M120 400 Q105 360 130 325" stroke="${t.near}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.5"/>
    <!-- 戴笠渔夫 -->
    <ellipse cx="420" cy="350" rx="20" ry="8" fill="#795548" opacity="0.8"/>
    <path d="M420 342 L420 310" stroke="#5d4037" stroke-width="2.5"/>
    <ellipse cx="420" cy="310" rx="14" ry="8" fill="#8d6e63"/>
    <line x1="420" y1="342" x2="420" y2="360" stroke="#4e342e" stroke-width="1.5" opacity="0.6"/>
    <!-- 鸭子 -->
    <ellipse cx="600" cy="368" rx="18" ry="8" fill="${t.near}" opacity="0.8"/>
    <circle cx="615" cy="364" r="7" fill="${t.near}"/>
    <path d="M622 364 L628 362 L622 366Z" fill="#ff8f00"/>
  `,

  '惊蛰': (t) => `
    <!-- 远山 -->
    <path d="M0 280 Q150 250 300 270 Q450 235 600 260 Q720 240 800 255 L800 400 L0 400Z" fill="${t.far}" opacity="0.4"/>
    <!-- 渐变草地 -->
    <path d="M0 350 Q200 325 400 340 Q600 318 800 335 L800 400 L0 400Z" fill="${t.mid}" opacity="0.6"/>
    <!-- 春雷云 -->
    <ellipse cx="200" cy="130" rx="120" ry="50" fill="${t.far}" opacity="0.7"/>
    <ellipse cx="170" cy="145" rx="80" ry="35" fill="${t.mid}" opacity="0.6"/>
    <ellipse cx="250" cy="150" rx="60" ry="30" fill="${t.far}" opacity="0.5"/>
    <!-- 闪电 -->
    <path d="M200 200 L185 240 L200 235 L180 280 L210 230 L195 235 L215 200Z" stroke="#ffd600" stroke-width="2" fill="#ffd600" opacity="0.9"/>
    <path d="M250 210 L238 245 L252 240 L235 275 L260 232 L245 237 L262 210Z" stroke="#ffd600" stroke-width="1.5" fill="#ffd600" opacity="0.7"/>
    <!-- 草地新芽 -->
    ${Array.from({length:10},(_,i)=>`<path d="M${50+i*75} 400 Q${53+i*75} ${360-i%2*15} ${50+i*75} ${370-i%2*15}" stroke="${t.near}" stroke-width="2" fill="none" stroke-linecap="round" opacity="${0.5+i%3*0.15}"/>`).join('')}
    <!-- 醒来的青蛙 -->
    <ellipse cx="350" cy="378" rx="18" ry="12" fill="#4caf50" opacity="0.85"/>
    <circle cx="342" cy="370" r="5" fill="#4caf50"/>
    <circle cx="358" cy="370" r="5" fill="#4caf50"/>
    <circle cx="342" cy="369" r="2.5" fill="#1b5e20"/>
    <circle cx="358" cy="369" r="2.5" fill="#1b5e20"/>
    <!-- 蝴蝶 -->
    <ellipse cx="650" cy="280" rx="12" ry="8" fill="${t.accent}" opacity="0.8" transform="rotate(-30,650,280)"/>
    <ellipse cx="665" cy="275" rx="10" ry="6" fill="${t.accent}" opacity="0.6" transform="rotate(20,665,275)"/>
    <line x1="658" y1="280" x2="658" y2="290" stroke="#5d4037" stroke-width="1"/>
  `,

  '春分': (t) => `
    <!-- 太阳在地平线 -->
    <circle cx="400" cy="260" r="70" fill="${t.sun}" opacity="0.8"/>
    <circle cx="400" cy="260" r="55" fill="#ffeb3b" opacity="0.9"/>
    <circle cx="400" cy="260" r="38" fill="#fff9c4" opacity="0.8"/>
    <!-- 太阳光线 -->
    ${Array.from({length:16},(_,i)=>`
      <line x1="${400+80*Math.cos(i*22.5*Math.PI/180)}" y1="${260+80*Math.sin(i*22.5*Math.PI/180)}" x2="${400+130*Math.cos(i*22.5*Math.PI/180)}" y2="${260+130*Math.sin(i*22.5*Math.PI/180)}" stroke="${t.sun}" stroke-width="2" opacity="0.3"/>
    `).join('')}
    <!-- 地平线 -->
    <path d="M0 310 Q200 295 400 308 Q600 292 800 305 L800 400 L0 400Z" fill="${t.mid}" opacity="0.7"/>
    <!-- 草地和野花 -->
    <path d="M0 370 Q200 355 400 365 Q600 350 800 362 L800 400 L0 400Z" fill="${t.near}" opacity="0.8"/>
    ${Array.from({length:12},(_,i)=>`<circle cx="${40+i*65}" cy="${340+i%3*18}" r="${4-i%2*1.5}" fill="${t.accent}" opacity="${0.7+i%3*0.1}"/>`).join('')}
    <!-- 地平线光带 -->
    <path d="M0 310 Q200 295 400 308 Q600 292 800 305" stroke="${t.sun}" stroke-width="3" fill="none" opacity="0.3"/>
    <!-- 燕子 -->
    <path d="M550 180 Q560 174 570 178 Q560 177 550 180Z" fill="${t.near}"/><circle cx="548" cy="178" r="2.5" fill="${t.near}"/>
    <path d="M620 160 Q630 154 640 158 Q630 157 620 160Z" fill="${t.near}"/><circle cx="618" cy="158" r="2.5" fill="${t.near}"/>
    <path d="M690 175 Q700 169 710 173 Q700 172 690 175Z" fill="${t.near}"/><circle cx="688" cy="173" r="2.5" fill="${t.near}"/>
  `,

  '清明': (t) => `
    <!-- 远山 -->
    <path d="M0 290 Q150 255 300 275 Q480 240 650 265 Q750 248 800 258 L800 400 L0 400Z" fill="${t.far}" opacity="0.45"/>
    <!-- 雾气 -->
    <ellipse cx="400" cy="320" rx="400" ry="60" fill="${t.mist}" opacity="0.4"/>
    <!-- 清明河 -->
    <path d="M0 350 Q200 335 400 345 Q600 328 800 340 L800 400 L0 400Z" fill="${t.water}" opacity="0.6"/>
    <!-- 草地 -->
    <path d="M0 380 Q200 362 400 372 Q600 358 800 368 L800 400 L0 400Z" fill="${t.near}" opacity="0.7"/>
    <!-- 雨纷纷 -->
    ${rain(0, 50, 25, '#78909c', 0.4)}
    <!-- 扫墓的人 -->
    <path d="M280 400 L280 365" stroke="#5d4037" stroke-width="3"/>
    <circle cx="280" cy="358" r="9" fill="#795548"/>
    <path d="M280 370 L260 385" stroke="#5d4037" stroke-width="2"/><path d="M280 370 L295 382" stroke="#5d4037" stroke-width="2"/>
    <!-- 纸钱飘 -->
    <rect x="260" y="340" width="8" height="5" fill="#fff" opacity="0.7" transform="rotate(15,264,342)"/>
    <rect x="288" y="335" width="7" height="4" fill="#fff" opacity="0.6" transform="rotate(-20,291,337)"/>
    <!-- 远山亭 -->
    <rect x="560" y="295" width="40" height="35" fill="${t.far}" opacity="0.7" rx="2"/>
    <path d="M550 295 L580 275 L610 295Z" fill="${t.near}" opacity="0.8"/>
    <ellipse cx="580" cy="330" rx="40" ry="6" fill="#fff" opacity="0.5"/>
    <!-- 嫩草 -->
    ${Array.from({length:8},(_,i)=>`<path d="M${60+i*90} 400 Q${63+i*90} ${375-i%2*10} ${60+i*90} ${383-i%2*10}" stroke="${t.leaf}" stroke-width="2" fill="none" stroke-linecap="round" opacity="${0.6+i%2*0.2}"/>`).join('')}
  `,

  '谷雨': (t) => `
    <!-- 远山茶园 -->
    <path d="M0 300 Q200 265 400 285 Q600 250 800 270 L800 400 L0 400Z" fill="${t.far}" opacity="0.5"/>
    <path d="M100 285 Q250 255 400 272 Q550 245 700 262" stroke="${t.mid}" stroke-width="2" fill="none" opacity="0.5"/>
    <!-- 茶园层 -->
    <path d="M0 360 Q200 340 400 352 Q600 335 800 348 L800 400 L0 400Z" fill="${t.near}" opacity="0.7"/>
    <!-- 采茶 -->
    ${Array.from({length:6},(_,i)=>`<path d="M${80+i*120} 400 Q${82+i*120} ${370-i%2*8} ${80+i*120} ${378-i%2*8}" stroke="${t.mid}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.8"/>`).join('')}
    <!-- 谷雨茶芽 -->
    ${Array.from({length:8},(_,i)=>`
      <path d="M${90+i*90} ${360-i%3*8} Q${94+i*90} ${350-i%3*8} ${90+i*90} ${358-i%3*8}" stroke="#66bb6a" stroke-width="2" fill="none" opacity="${0.7+i%3*0.1}"/>
      <ellipse cx="${92+i*90}" cy="${352-i%3*8}" rx="4" ry="6" fill="#81c784" opacity="${0.8+i%3*0.07}"/>
    `).join('')}
    <!-- 雨水 -->
    ${rain(0, 0, 15, '#4fc3f7', 0.5)}
    <!-- 布谷鸟 -->
    <ellipse cx="650" cy="200" rx="18" ry="12" fill="${t.mid}" opacity="0.8"/>
    <circle cx="665" cy="195" r="8" fill="${t.mid}"/>
    <path d="M673 195 L685 193 L673 197Z" fill="#ff8f00"/>
    <!-- 池塘浮萍 -->
    <ellipse cx="480" cy="378" rx="22" ry="10" fill="${t.near}" opacity="0.6"/>
    <ellipse cx="520" cy="383" rx="18" ry="8" fill="${t.near}" opacity="0.5"/>
    <circle cx="478" cy="376" r="3" fill="#f06292" opacity="0.8"/>
    <circle cx="522" cy="381" r="2.5" fill="#f06292" opacity="0.7"
  `,

  '立夏': (t) => `
    <!-- 夏日荷塘 -->
    <path d="M0 350 Q200 330 400 342 Q600 325 800 338 L800 400 L0 400Z" fill="${t.water}" opacity="0.7"/>
    <path d="M0 365 Q200 345 400 357 Q600 340 800 353 L800 400 L0 400Z" fill="#4fc3f7" opacity="0.4"/>
    <!-- 荷花 -->
    <ellipse cx="150" cy="370" rx="20" ry="10" fill="${t.near}" opacity="0.7"/>
    <ellipse cx="150" cy="368" rx="14" ry="7" fill="${t.accent}" opacity="0.8"/>
    <path d="M140 368 Q150 358 160 368" stroke="#f48fb1" stroke-width="1.5" fill="none"/>
    <path d="M143 366 Q150 357 157 366" stroke="#f8bbd0" stroke-width="1" fill="none"/>
    <ellipse cx="350" cy="375" rx="18" ry="9" fill="${t.near}" opacity="0.7"/>
    <ellipse cx="350" cy="373" rx="12" ry="6" fill="${t.accent}" opacity="0.7"/>
    <!-- 荷叶 -->
    <ellipse cx="220" cy="378" rx="25" ry="12" fill="${t.near}" opacity="0.8"/>
    <path d="M220 366 Q220 378 220 390" stroke="${t.far}" stroke-width="1.5" fill="none"/>
    <ellipse cx="480" cy="382" rx="22" ry="10" fill="${t.near}" opacity="0.75"/>
    <!-- 烈日 -->
    <circle cx="650" cy="100" r="60" fill="${t.sun}" opacity="0.9"/>
    <circle cx="650" cy="100" r="48" fill="#ffca28" opacity="0.8"/>
    <circle cx="650" cy="100" r="35" fill="#fff9c4" opacity="0.7"/>
    ${Array.from({length:12},(_,i)=>`
      <line x1="${650+70*Math.cos(i*30*Math.PI/180)}" y1="${100+70*Math.sin(i*30*Math.PI/180)}" x2="${650+90*Math.cos(i*30*Math.PI/180)}" y2="${100+90*Math.sin(i*30*Math.PI/180)}" stroke="#fff176" stroke-width="2" opacity="0.5"/>
    `).join('')}
    <!-- 夏日蝉鸣 -->
    <ellipse cx="80" cy="220" rx="15" ry="20" fill="${t.mid}" opacity="0.9"/>
    <path d="M70 200 Q80 195 90 200" stroke="${t.mid}" stroke-width="3" fill="none"/>
    <ellipse cx="80" cy="200" rx="12" ry="8" fill="${t.far}" opacity="0.9"/>
    <!-- 夏日草地 -->
    <path d="M0 390 Q200 375 400 382 Q600 370 800 378 L800 400 L0 400Z" fill="${t.near}" opacity="0.8"/>
    <!-- 蜻蜓 -->
    <ellipse cx="560" cy="280" rx="12" ry="3" fill="#90caf9" opacity="0.9"/>
    <path d="M552 280 L548 272 M552 280 L550 270" stroke="#90caf9" stroke-width="1"/>
    <path d="M568 280 L572 272 M568 280 L570 270" stroke="#90caf9" stroke-width="1"/>
    <path d="M552 280 L548 288 M552 280 L550 290" stroke="#90caf9" stroke-width="1"/>
    <path d="M568 280 L572 288 M568 280 L570 290" stroke="#90caf9" stroke-width="1"/>
  `,

  '小满': (t) => `
    <!-- 麦田 -->
    <path d="M0 340 Q200 315 400 328 Q600 308 800 320 L800 400 L0 400Z" fill="#d4a017" opacity="0.6"/>
    <path d="M0 360 Q200 335 400 348 Q600 328 800 340 L800 400 L0 400Z" fill="#f9a825" opacity="0.7"/>
    <!-- 麦穗 -->
    ${Array.from({length:16},(_,i)=>`
      <path d="M${30+i*48} 400 Q${33+i*48} ${355-i%2*10} ${30+i*48} ${368-i%2*10}" stroke="#8d6e63" stroke-width="1.5" fill="none" opacity="0.7"/>
      <ellipse cx="${32+i*48}" cy="${358-i%2*10}" rx="3" ry="7" fill="#fdd835" opacity="${0.7+i%3*0.08}" transform="rotate(-5,${32+i*48},${358-i%2*10})"/>
    `).join('')}
    <!-- 小满池塘 -->
    <ellipse cx="620" cy="380" rx="140" ry="25" fill="${t.water}" opacity="0.5"/>
    <!-- 枇杷 -->
    <path d="M620 400 Q615 360 640 330 Q665 300 650 270" stroke="#6d4c41" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="628" cy="285" r="7" fill="#ffa000" opacity="0.9"/><circle cx="642" cy="278" r="7" fill="#ffa000" opacity="0.9"/>
    <circle cx="656" cy="272" r="6.5" fill="#ffa000" opacity="0.9"/><circle cx="635" cy="295" r="6" fill="#ffa000" opacity="0.85"/>
    <circle cx="650" cy="290" r="6" fill="#ffa000" opacity="0.85"/>
  `,

  '芒种': (t) => `
    <!-- 梯田 -->
    <path d="M0 320 Q100 300 200 312 Q300 292 400 305 Q500 285 600 298 Q700 278 800 290 L800 400 L0 400Z" fill="${t.mid}" opacity="0.6"/>
    <path d="M0 345 Q100 325 200 337 Q300 317 400 330 Q500 310 600 323 Q700 303 800 315 L800 400 L0 400Z" fill="${t.near}" opacity="0.7"/>
    <path d="M0 368 Q200 345 400 358 Q600 338 800 350 L800 400 L0 400Z" fill="${t.far}" opacity="0.8"/>
    <!-- 稻农插秧 -->
    <path d="M300 400 L300 368" stroke="#8d6e63" stroke-width="2.5"/>
    <circle cx="300" cy="360" r="8" fill="#8d6e63"/>
    <path d="M300 372 L280 385" stroke="#8d6e63" stroke-width="2"/><path d="M300 372 L315 383" stroke="#8d6e63" stroke-width="2"/>
    <!-- 秧苗 -->
    ${Array.from({length:8},(_,i)=>`
      <path d="M${280+i*8} 400 Q${282+i*8} ${390-i%2*5} ${280+i*8} ${395-i%2*5}" stroke="#66bb6a" stroke-width="1.5" fill="none" opacity="${0.6+i%3*0.12}"/>
    `).join('')}
    <!-- 芒种麦穗 -->
    ${Array.from({length:6},(_,i)=>`
      <ellipse cx="${80+i*120}" cy="${310+i%2*12}" rx="4" ry="10" fill="#f9a825" opacity="${0.7+i%2*0.15}" transform="rotate(-8,${80+i*120},${310+i%2*12})"/>
    `).join('')}
    <!-- 布谷催耕 -->
    <ellipse cx="680" cy="180" rx="16" ry="11" fill="${t.mid}" opacity="0.8"/>
    <circle cx="694" cy="175" r="7" fill="${t.mid}"/>
    <path d="M701 175 L713 173 L701 177Z" fill="#ff8f00"/>
  `,

  '夏至': (t) => `
    <!-- 太阳直射 -->
    <circle cx="400" cy="180" r="100" fill="${t.sun}" opacity="0.85"/>
    <circle cx="400" cy="180" r="80" fill="#ffca28" opacity="0.8"/>
    <circle cx="400" cy="180" r="60" fill="#fff176" opacity="0.7"/>
    <circle cx="400" cy="180" r="40" fill="#fff9c4" opacity="0.6"/>
    ${Array.from({length:24},(_,i)=>`
      <line x1="${400+110*Math.cos(i*15*Math.PI/180)}" y1="${180+110*Math.sin(i*15*Math.PI/180)}" x2="${400+150*Math.cos(i*15*Math.PI/180)}" y2="${180+150*Math.sin(i*15*Math.PI/180)}" stroke="#fff176" stroke-width="2" opacity="0.4"/>
    `).join('')}
    <!-- 荷塘 -->
    <path d="M0 340 Q200 320 400 332 Q600 312 800 325 L800 400 L0 400Z" fill="${t.water}" opacity="0.65"/>
    <!-- 荷花 -->
    <ellipse cx="180" cy="368" rx="22" ry="11" fill="${t.near}" opacity="0.75"/>
    <ellipse cx="180" cy="366" rx="15" ry="8" fill="#f8bbd0" opacity="0.9"/>
    <path d="M170 366 Q180 356 190 366" stroke="#f48fb1" stroke-width="1.5" fill="none"/>
    <ellipse cx="600" cy="372" rx="20" ry="10" fill="${t.near}" opacity="0.75"/>
    <ellipse cx="600" cy="370" rx="13" ry="7" fill="#fff59d" opacity="0.9"/>
    <!-- 荷叶 -->
    <ellipse cx="380" cy="378" rx="30" ry="14" fill="${t.near}" opacity="0.8"/>
    <path d="M380 364 Q380 378 380 392" stroke="${t.far}" stroke-width="2" fill="none"/>
    <!-- 蜻蜓 -->
    <ellipse cx="480" cy="260" rx="14" ry="3.5" fill="#81d4fa" opacity="0.9"/>
    <path d="M470 260 L466 250 M470 260 L468 248" stroke="#81d4fa" stroke-width="1.2"/>
    <path d="M490 260 L494 250 M490 260 L492 248" stroke="#81d4fa" stroke-width="1.2"/>
  `,

  '小暑': (t) => `
    <!-- 炎夏远山 -->
    <path d="M0 300 Q150 275 300 290 Q500 260 700 278 Q780 265 800 272 L800 400 L0 400Z" fill="${t.far}" opacity="0.35"/>
    <!-- 热浪效果 -->
    <path d="M0 340 Q200 325 400 335 Q600 320 800 330 L800 400 L0 400Z" fill="${t.water}" opacity="0.5"/>
    <path d="M0 360 Q200 345 400 355 Q600 340 800 350 L800 400 L0 400Z" fill="${t.mid}" opacity="0.6"/>
    <!-- 烈日 -->
    <circle cx="650" cy="100" r="55" fill="${t.sun}" opacity="0.9"/>
    <circle cx="650" cy="100" r="42" fill="#ffca28" opacity="0.8"/>
    <circle cx="650" cy="100" r="28" fill="#fff9c4" opacity="0.7"/>
    <!-- 热浪曲线 -->
    <path d="M0 310 Q100 300 200 308 Q300 298 400 306 Q500 296 600 304 Q700 294 800 302" stroke="#fff59d" stroke-width="2" fill="none" opacity="0.4"/>
    <path d="M0 318 Q100 308 200 316 Q300 306 400 314 Q500 304 600 312 Q700 302 800 310" stroke="#fff59d" stroke-width="1.5" fill="none" opacity="0.3"/>
    <!-- 荷塘蜻蜓 -->
    <ellipse cx="300" cy="375" rx="25" ry="12" fill="${t.near}" opacity="0.7"/>
    <ellipse cx="300" cy="373" rx="16" ry="8" fill="#fff59d" opacity="0.85"/>
    <ellipse cx="500" cy="380" rx="22" ry="10" fill="${t.near}" opacity="0.7"/>
    <!-- 知了 -->
    <ellipse cx="120" cy="260" rx="14" ry="18" fill="${t.mid}" opacity="0.9"/>
    <ellipse cx="120" cy="248" rx="11" ry="7" fill="${t.far}" opacity="0.9"/>
    <path d="M108 255 Q120 250 132 255" stroke="${t.mid}" stroke-width="2.5" fill="none"/>
  `,

  '大暑': (t) => `
    <!-- 炎热山景 -->
    <path d="M0 290 Q200 265 400 280 Q600 250 800 265 L800 400 L0 400Z" fill="${t.far}" opacity="0.3"/>
    <!-- 炙烤地面 -->
    <path d="M0 340 Q200 320 400 332 Q600 312 800 325 L800 400 L0 400Z" fill="#d84315" opacity="0.5"/>
    <path d="M0 360 Q200 340 400 352 Q600 332 800 345 L800 400 L0 400Z" fill="#bf360c" opacity="0.6"/>
    <!-- 烈日灼烧 -->
    <circle cx="400" cy="150" r="80" fill="${t.sun}" opacity="0.9"/>
    <circle cx="400" cy="150" r="62" fill="#ff5722" opacity="0.8"/>
    <circle cx="400" cy="150" r="44" fill="#ffca28" opacity="0.7"/>
    <!-- 热浪扭曲 -->
    <path d="M0 310 Q100 300 200 308 Q300 298 400 306 Q500 296 600 304 Q700 294 800 302" stroke="#ff8a65" stroke-width="2.5" fill="none" opacity="0.5"/>
    <path d="M0 320 Q100 310 200 318 Q300 308 400 316 Q500 306 600 314 Q700 304 800 312" stroke="#ff8a65" stroke-width="2" fill="none" opacity="0.4"/>
    <path d="M0 330 Q100 320 200 328 Q300 318 400 326 Q500 316 600 324 Q700 314 800 322" stroke="#ff8a65" stroke-width="1.5" fill="none" opacity="0.3"/>
    <!-- 枯草 -->
    ${Array.from({length:8},(_,i)=>`
      <path d="M${60+i*90} 400 Q${62+i*90} ${375-i%2*10} ${60+i*90} ${385-i%2*10}" stroke="#8d6e63" stroke-width="2" fill="none" stroke-linecap="round" opacity="${0.4+i%2*0.2}"/>
    `).join('')}
    <!-- 蝉 -->
    <ellipse cx="680" cy="250" rx="16" ry="20" fill="${t.mid}" opacity="0.9"/>
    <ellipse cx="680" cy="238" rx="13" ry="8" fill="${t.far}" opacity="0.9"/>
    <path d="M670 242 Q680 237 690 242" stroke="${t.mid}" stroke-width="2.5" fill="none"/>
    <!-- 西瓜 -->
    <ellipse cx="180" cy="380" rx="35" ry="22" fill="#388e3c" opacity="0.9"/>
    <ellipse cx="180" cy="378" rx="30" ry="18" fill="#f44336" opacity="0.9"/>
    <ellipse cx="180" cy="376" rx="20" ry="12" fill="#f8bbd0" opacity="0.6"/>
  `,

  '立秋': (t) => `
    <!-- 秋山层林 -->
    <path d="M0 290 Q150 265 300 278 Q500 250 700 270 Q780 255 800 262 L800 400 L0 400Z" fill="${t.far}" opacity="0.6"/>
    <path d="M0 320 Q200 295 400 308 Q600 285 800 298 L800 400 L0 400Z" fill="${t.mid}" opacity="0.65"/>
    <path d="M0 350 Q200 325 400 338 Q600 318 800 330 L800 400 L0 400Z" fill="${t.near}" opacity="0.7"/>
    <!-- 秋叶枫红 -->
    ${leaves(0, 0, 20, '#bf360c', 0.7)}
    ${leaves(300, 50, 15, '#e65100', 0.6)}
    <!-- 落叶片片 -->
    ${Array.from({length:12},(_,i)=>`
      <ellipse cx="${50+i*62+i%3*15}" cy="${200+i%4*35}" rx="5" ry="3" fill="${t.accent}" opacity="${0.5+i%4*0.1}" transform="rotate(${i*29},${50+i*62+i%3*15},${200+i%4*35})"/>
    `).join('')}
    <!-- 明月 -->
    <circle cx="650" cy="100" r="45" fill="#fff9c4" opacity="0.85"/>
    <circle cx="650" cy="100" r="38" fill="#fffde7" opacity="0.9"/>
    <circle cx="640" cy="92" r="10" fill="#f5f5f5" opacity="0.3"/>
    <!-- 秋收稻田 -->
    <path d="M0 380 Q200 362 400 372 Q600 358 800 368 L800 400 L0 400Z" fill="#f9a825" opacity="0.7"/>
  `,

  '处暑': (t) => `
    <!-- 晚霞远山 -->
    <path d="M0 280 Q200 255 400 270 Q600 245 800 260 L800 400 L0 400Z" fill="${t.far}" opacity="0.5"/>
    <!-- 晚霞 -->
    <path d="M0 240 Q200 210 400 225 Q600 200 800 215 L800 280 L0 280Z" fill="#ff8a65" opacity="0.3"/>
    <path d="M0 260 Q200 235 400 248 Q600 225 800 238 L800 280 L0 280Z" fill="#ffa726" opacity="0.25"/>
    <!-- 荷塘残荷 -->
    <path d="M0 360 Q200 342 400 352 Q600 338 800 350 L800 400 L0 400Z" fill="${t.water}" opacity="0.6"/>
    <!-- 残荷 -->
    <ellipse cx="250" cy="378" rx="20" ry="9" fill="${t.near}" opacity="0.7"/>
    <path d="M250 369 L250 355" stroke="${t.mid}" stroke-width="2" opacity="0.6"/>
    <ellipse cx="550" cy="382" rx="18" ry="8" fill="${t.near}" opacity="0.65"/>
    <path d="M550 374 L548 362" stroke="${t.mid}" stroke-width="2" opacity="0.5"/>
    <!-- 露珠 -->
    ${Array.from({length:8},(_,i)=>`
      <circle cx="${80+i*95}" cy="${340+i%3*15}" r="${2+i%2*1.5}" fill="#e3f2fd" opacity="${0.4+i%3*0.15}"/>
    `).join('')}
    <!-- 秋蝉 -->
    <ellipse cx="680" cy="240" rx="14" ry="17" fill="${t.mid}" opacity="0.85"/>
    <ellipse cx="680" cy="228" rx="11" ry="7" fill="${t.far}" opacity="0.85"/>
    <path d="M670 232 Q680 227 690 232" stroke="${t.mid}" stroke-width="2" fill="none"/>
    <!-- 初秋叶落 -->
    ${leaves(100, 50, 12, '#e65100', 0.6)}
  `,

  '白露': (t) => `
    <!-- 露水远山 -->
    <path d="M0 290 Q200 265 400 280 Q600 250 800 265 L800 400 L0 400Z" fill="${t.far}" opacity="0.45"/>
    <!-- 晨雾 -->
    <ellipse cx="300" cy="300" rx="350" ry="70" fill="${t.mist}" opacity="0.5"/>
    <ellipse cx="600" cy="310" rx="280" ry="55" fill="${t.mist}" opacity="0.4"/>
    <!-- 草叶露珠 -->
    <path d="M0 360 Q200 340 400 352 Q600 335 800 348 L800 400 L0 400Z" fill="${t.near}" opacity="0.7"/>
    ${Array.from({length:20},(_,i)=>`
      <circle cx="${30+i*38}" cy="${330+i%4*15}" r="${2+i%3*1.5}" fill="#e3f2fd" opacity="${0.5+i%4*0.1}"/>
      <circle cx="${30+i*38}" cy="${330+i%4*15}" r="${1+i%2*0.8}" fill="#fff" opacity="${0.6+i%3*0.12}"/>
    `).join('')}
    <!-- 蒹葭 -->
    ${Array.from({length:8},(_,i)=>`
      <path d="M${50+i*95} 400 Q${53+i*95} ${360-i%2*12} ${50+i*95} ${370-i%2*12}" stroke="${t.mid}" stroke-width="2" fill="none" stroke-linecap="round" opacity="${0.5+i%2*0.2}"/>
      <path d="M${50+i*95} ${370-i%2*12} Q${55+i*95} ${358-i%2*12} ${50+i*95} ${365-i%2*12}" stroke="${t.mid}" stroke-width="1.5" fill="none" opacity="${0.4+i%2*0.15}"/>
    `).join('')}
    <!-- 晨鸟 -->
    <path d="M620 200 Q635 193 650 198 Q635 196 620 200Z" fill="${t.near}"/>
    <circle cx="618" cy="197" r="3" fill="${t.near}"/>
    <!-- 朝霞 -->
    <ellipse cx="400" cy="220" rx="200" ry="40" fill="${t.accent}" opacity="0.15"/>
  `,

  '秋分': (t) => `
    <!-- 秋分太阳 -->
    <circle cx="400" cy="200" r="70" fill="${t.sun}" opacity="0.8"/>
    <circle cx="400" cy="200" r="55" fill="#ffe082" opacity="0.7"/>
    <circle cx="400" cy="200" r="38" fill="#fff9c4" opacity="0.6"/>
    <!-- 昼夜平分线 -->
    <line x1="400" y1="130" x2="400" y2="270" stroke="${t.sun}" stroke-width="2" opacity="0.4"/>
    <line x1="330" y1="200" x2="470" y2="200" stroke="${t.sun}" stroke-width="2" opacity="0.4"/>
    <!-- 秋山红叶 -->
    <path d="M0 290 Q150 260 300 278 Q500 248 700 268 Q780 252 800 262 L800 400 L0 400Z" fill="${t.far}" opacity="0.6"/>
    <path d="M0 350 Q200 325 400 338 Q600 315 800 328 L800 400 L0 400Z" fill="${t.near}" opacity="0.7"/>
    <!-- 红叶 -->
    ${Array.from({length:18},(_,i)=>`
      <ellipse cx="${40+i*42}" cy="${310+i%4*18}" rx="6" ry="3.5" fill="${t.accent}" opacity="${0.6+i%4*0.1}" transform="rotate(${i*37},${40+i*42},${310+i%4*18})"/>
    `).join('')}
    <!-- 大雁南飞 -->
    <path d="M200 180 Q215 174 230 178 Q215 177 200 180Z" fill="${t.mid}"/><circle cx="198" cy="178" r="2.5" fill="${t.mid}"/>
    <path d="M225 175 Q240 169 255 173 Q240 172 225 175Z" fill="${t.mid}"/><circle cx="223" cy="173" r="2.5" fill="${t.mid}"/>
    <path d="M215 182 Q230 176 245 180 Q230 179 215 182Z" fill="${t.far}"/><circle cx="213" cy="180" r="2.5" fill="${t.far}"/>
    <!-- 秋收 -->
    <path d="M0 380 Q200 362 400 372 Q600 358 800 368 L800 400 L0 400Z" fill="#f9a825" opacity="0.6"/>
  `,

  '寒露': (t) => `
    <!-- 深秋远山 -->
    <path d="M0 285 Q200 258 400 272 Q600 245 800 260 L800 400 L0 400Z" fill="${t.far}" opacity="0.55"/>
    <!-- 枫林 -->
    <path d="M0 320 Q200 295 400 308 Q600 288 800 300 L800 400 L0 400Z" fill="${t.mid}" opacity="0.65"/>
    <!-- 枫叶 -->
    ${Array.from({length:24},(_,i)=>`
      <path d="M${25+i*32+i%3*10} ${295+i%5*15} L${30+i*32+i%3*10} ${290+i%5*15} L${35+i*32+i%3*10} ${295+i%5*15} L${30+i*32+i%3*10} ${300+i%5*15}Z" fill="${t.accent}" opacity="${0.6+i%5*0.08}" transform="rotate(${i*43},${30+i*32+i%3*10},${295+i%5*15})"/>
    `).join('')}
    <!-- 寒露珠 -->
    ${Array.from({length:16},(_,i)=>`
      <circle cx="${30+i*48}" cy="${350+i%4*12}" r="${2.5+i%3*1.2}" fill="#e3f2fd" opacity="${0.5+i%4*0.1}"/>
      <circle cx="${30+i*48}" cy="${350+i%4*12}" r="${1.2+i%2*0.8}" fill="#fff" opacity="${0.7+i%3*0.08}"/>
    `).join('')}
    <!-- 菊花 -->
    ${Array.from({length:5},(_,i)=>`
      <circle cx="${100+i*130}" cy="${340+i%2*20}" r="${8+i%2*3}" fill="#fdd835" opacity="${0.7+i%2*0.15}"/>
      <circle cx="${100+i*130}" cy="${340+i%2*20}" r="${4+i%2*2}" fill="${t.accent}" opacity="0.9"/>
    `).join('')}
    <!-- 秋雁 -->
    <path d="M650 200 Q665 193 680 198 Q665 196 650 200Z" fill="${t.mid}"/>
    <circle cx="648" cy="197" r="2.5" fill="${t.mid}"/>
  `,

  '霜降': (t) => `
    <!-- 霜降山景 -->
    <path d="M0 290 Q200 265 400 278 Q600 250 800 265 L800 400 L0 400Z" fill="${t.far}" opacity="0.5"/>
    <!-- 霜冻地面 -->
    <path d="M0 360 Q200 340 400 350 Q600 335 800 345 L800 400 L0 400Z" fill="${t.near}" opacity="0.7"/>
    <!-- 霜花 -->
    ${Array.from({length:30},(_,i)=>`
      <circle cx="${20+i*26}" cy="${340+i%5*12}" r="${1.5+i%3*0.8}" fill="#e3f2fd" opacity="${0.3+i%5*0.12}"/>
    `).join('')}
    <!-- 红叶 -->
    ${Array.from({length:14},(_,i)=>`
      <ellipse cx="${40+i*54}" cy="${355+i%3*18}" rx="6" ry="3.5" fill="${t.accent}" opacity="${0.65+i%4*0.08}" transform="rotate(${i*47},${40+i*54},${355+i%3*18})"/>
    `).join('')}
    <!-- 霜叶上的霜 -->
    ${Array.from({length:8},(_,i)=>`
      <ellipse cx="${60+i*90}" cy="${350+i%3*12}" rx="${4+i%2*2}" ry="${2+i%2}" fill="#fff" opacity="${0.4+i%3*0.15}"/>
    `).join('')}
    <!-- 柿子 -->
    <path d="M500 400 Q495 365 515 340 Q535 315 520 290" stroke="#5d4037" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <circle cx="505" cy="300" r="10" fill="#ff8f00" opacity="0.95"/>
    <circle cx="520" cy="292" r="9" fill="#ffa000" opacity="0.95"/>
    <circle cx="535" cy="285" r="8" fill="#ff8f00" opacity="0.9"/>
    <circle cx="515" cy="308" r="8.5" fill="#ffa000" opacity="0.9"/>
    <!-- 晚秋雁 -->
    <path d="M200 200 Q215 193 230 198 Q215 196 200 200Z" fill="${t.mid}"/>
    <circle cx="198" cy="197" r="2.5" fill="${t.mid}"/>
    <path d="M250 190 Q265 183 280 188 Q265 186 250 190Z" fill="${t.far}"/>
    <circle cx="248" cy="187" r="2.5" fill="${t.far}"/>
  `,

  '立冬': (t) => `
    <!-- 初冬山景 -->
    <path d="M0 290 Q200 265 400 278 Q600 250 800 265 L800 400 L0 400Z" fill="${t.far}" opacity="0.5"/>
    <!-- 初雪 -->
    <path d="M0 340 Q200 318 400 330 Q600 312 800 325 L800 400 L0 400Z" fill="${t.mid}" opacity="0.6"/>
    <!-- 飘雪 -->
    ${snowflakes(0, 0, 130, 0.6)}
    ${snowflakes(250, 30, 100, 0.5)}
    <!-- 冬树 -->
    <path d="M150 400 L150 260" stroke="#6d4c41" stroke-width="5" stroke-linecap="round"/>
    <path d="M150 310 Q120 280 85 290" stroke="#6d4c41" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M150 290 Q185 260 220 270" stroke="#6d4c41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M150 270 Q130 245 110 252" stroke="#6d4c41" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M150 270 Q175 248 198 255" stroke="#6d4c41" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- 冬收萝卜 -->
    <ellipse cx="480" cy="388" rx="22" ry="12" fill="#f48fb1" opacity="0.9"/>
    <ellipse cx="480" cy="382" rx="18" ry="8" fill="#f8bbd0" opacity="0.8"/>
    <path d="M480 376 L480 360" stroke="#66bb6a" stroke-width="2.5"/>
    <path d="M476 365 Q480 360 484 365" stroke="#4caf50" stroke-width="1.5" fill="none"/>
    <!-- 薄冰水面 -->
    <path d="M0 370 Q200 355 400 362 Q600 350 800 358 L800 400 L0 400Z" fill="${t.water}" opacity="0.55"/>
    <path d="M0 375 Q200 360 400 367 Q600 355 800 363 L800 380 L0 380Z" fill="#fff" opacity="0.3"/>
  `,

  '小雪': (t) => `
    <!-- 小雪山景 -->
    <path d="M0 285 Q200 258 400 272 Q600 245 800 260 L800 400 L0 400Z" fill="${t.far}" opacity="0.55"/>
    <!-- 薄雪覆盖 -->
    <path d="M0 350 Q200 328 400 340 Q600 322 800 335 L800 400 L0 400Z" fill="${t.mid}" opacity="0.6"/>
    <!-- 中雪 -->
    ${snowflakes(0, 0, 140, 0.7)}
    ${snowflakes(180, 40, 110, 0.6)}
    ${snowflakes(360, 20, 90, 0.5)}
    <!-- 窗户灯光 -->
    <rect x="350" y="310" width="60" height="50" fill="#ffe082" opacity="0.85" rx="3"/>
    <rect x="358" y="318" width="18" height="16" fill="#fff9c4" opacity="0.6" rx="1"/>
    <rect x="384" y="318" width="18" height="16" fill="#fff9c4" opacity="0.6" rx="1"/>
    <rect x="358" y="342" width="18" height="14" fill="#fff9c4" opacity="0.5" rx="1"/>
    <rect x="384" y="342" width="18" height="14" fill="#fff9c4" opacity="0.5" rx="1"/>
    <!-- 积雪屋檐 -->
    <path d="M345 310 L410 310" stroke="#fff" stroke-width="4" opacity="0.7"/>
    <path d="M355 310 Q360 315 365 310" stroke="#fff" stroke-width="2" fill="none" opacity="0.6"/>
    <path d="M395 310 Q400 315 405 310" stroke="#fff" stroke-width="2" fill="none" opacity="0.6"/>
    <!-- 冬日梅花 -->
    <path d="M620 400 Q610 350 640 310 Q670 270 650 230" stroke="#5d4037" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M640 310 Q670 290 700 300" stroke="#5d4037" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M640 270 Q665 252 690 262" stroke="#5d4037" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="638" cy="238" r="5.5" fill="#f48fb1"/><circle cx="656" cy="222" r="5" fill="#f48fb1"/><circle cx="675" cy="208" r="5" fill="#f8bbd0"/>
    <circle cx="648" cy="250" r="4.5" fill="#f8bbd0"/><circle cx="668" cy="236" r="4" fill="#f48fb1"/><circle cx="688" cy="222" r="4" fill="#f8bbd0"/>
    <!-- 积雪 -->
    <ellipse cx="400" cy="370" rx="80" ry="10" fill="#fff" opacity="0.5"/>
  `,

  '大雪': (t) => `
    <!-- 大雪山 -->
    <path d="M0 275 Q150 245 300 260 Q480 228 650 250 Q750 235 800 248 L800 400 L0 400Z" fill="${t.far}" opacity="0.6"/>
    <!-- 雪盖山尖 -->
    <path d="M450 228 L400 155 L350 228Z" fill="#fff" opacity="0.9"/>
    <path d="M650 250 L700 175 L750 250Z" fill="#fff" opacity="0.85"/>
    <path d="M280 260 L240 190 L200 260Z" fill="#fff" opacity="0.8"/>
    <!-- 大雪纷飞 -->
    ${snowflakes(0, 0, 160, 0.8)}
    ${snowflakes(200, 30, 130, 0.7)}
    ${snowflakes(400, 50, 110, 0.65)}
    ${snowflakes(600, 20, 90, 0.55)}
    <!-- 积雪河面 -->
    <path d="M0 370 Q200 352 400 362 Q600 348 800 358 L800 400 L0 400Z" fill="${t.water}" opacity="0.6"/>
    <path d="M0 375 Q200 358 400 368 Q600 354 800 364 L800 385 L0 385Z" fill="#fff" opacity="0.4"/>
    <!-- 踏雪寻梅 -->
    <path d="M120 400 L120 368" stroke="#5d4037" stroke-width="2.5"/>
    <circle cx="120" cy="360" r="8" fill="#8d6e63"/>
    <!-- 足迹 -->
    <ellipse cx="170" cy="385" rx="10" ry="5" fill="${t.far}" opacity="0.5"/>
    <ellipse cx="200" cy="388" rx="10" ry="5" fill="${t.far}" opacity="0.45"/>
    <!-- 梅花 -->
    <path d="M680 400 Q670 355 695 318 Q720 282 700 245" stroke="#5d4037" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M695 318 Q725 300 750 310" stroke="#5d4037" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="690" cy="253" r="6" fill="#f48fb1"/><circle cx="708" cy="238" r="5.5" fill="#f8bbd0"/><circle cx="725" cy="225" r="5" fill="#f48fb1"/>
    <circle cx="698" cy="265" r="5" fill="#f8bbd0"/><circle cx="715" cy="250" r="4.5" fill="#f48fb1"/><circle cx="738" cy="238" r="4.5" fill="#f8bbd0"/>
  `,

  '冬至': (t) => `
    <!-- 冬至红日 -->
    <circle cx="400" cy="220" r="80" fill="${t.sun}" opacity="0.7"/>
    <circle cx="400" cy="220" r="62" fill="#ffe082" opacity="0.65"/>
    <circle cx="400" cy="220" r="44" fill="#fff9c4" opacity="0.6"/>
    <!-- 暖阳光线 -->
    ${Array.from({length:12},(_,i)=>`
      <line x1="${400+90*Math.cos(i*30*Math.PI/180)}" y1="${220+90*Math.sin(i*30*Math.PI/180)}" x2="${400+130*Math.cos(i*30*Math.PI/180)}" y2="${220+130*Math.sin(i*30*Math.PI/180)}" stroke="#ffe082" stroke-width="2" opacity="0.3"/>
    `).join('')}
    <!-- 远山 -->
    <path d="M0 290 Q200 262 400 275 Q600 248 800 262 L800 400 L0 400Z" fill="${t.far}" opacity="0.45"/>
    <!-- 冬至雪景 -->
    <path d="M0 360 Q200 338 400 350 Q600 332 800 344 L800 400 L0 400Z" fill="${t.mid}" opacity="0.6"/>
    <!-- 飘雪 -->
    ${snowflakes(0, 0, 80, 0.5)}
    <!-- 雪人 -->
    <ellipse cx="560" cy="375" rx="28" ry="22" fill="#fff" opacity="0.95"/>
    <circle cx="560" cy="345" r="20" fill="#fff" opacity="0.95"/>
    <circle cx="560" cy="330" r="14" fill="#fff" opacity="0.95"/>
    <!-- 雪人五官 -->
    <circle cx="553" cy="326" r="2.5" fill="#37474f"/><circle cx="567" cy="326" r="2.5" fill="#37474f"/>
    <ellipse cx="560" cy="333" rx="3" ry="2" fill="#ff8f00"/>
    <ellipse cx="560" cy="338" rx="2" ry="1.5" fill="#ff8f00"/>
    <!-- 围巾 -->
    <path d="M548 338 Q560 345 572 338" stroke="#f44336" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M572 338 L582 350" stroke="#f44336" stroke-width="3" fill="none" stroke-linecap="round"/>
    <!-- 梅花枝 -->
    <path d="M80 400 Q72 355 98 315 Q124 275 105 240" stroke="#6d4c41" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M98 315 Q125 298 148 305" stroke="#6d4c41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="95" cy="248" r="5.5" fill="#f48fb1"/><circle cx="112" cy="233" r="5" fill="#f8bbd0"/><circle cx="130" cy="220" r="4.5" fill="#f48fb1"/>
    <circle cx="105" cy="260" r="4.5" fill="#f8bbd0"/><circle cx="122" cy="246" r="4" fill="#f48fb1"/><circle cx="142" cy="232" r="4" fill="#f8bbd0"/>
    <!-- 汤圆热气 -->
    <path d="M420 340 Q425 328 420 316" stroke="#e0e0e0" stroke-width="1.5" fill="none" opacity="0.5"/>
    <path d="M440 338 Q445 326 440 314" stroke="#e0e0e0" stroke-width="1.5" fill="none" opacity="0.45"/>
    <ellipse cx="430" cy="345" rx="28" ry="12" fill="#fff" opacity="0.9"/>
    <ellipse cx="422" cy="342" rx="5" ry="4" fill="#f48fb1" opacity="0.8"/>
    <ellipse cx="436" cy="343" rx="5" ry="4" fill="#fdd835" opacity="0.8"/>
    <ellipse cx="430" cy="340" rx="5" ry="4" fill="#81c784" opacity="0.8"/>
  `
};

// ============================================================
// 生成 SVG 主函数
// ============================================================
function generateSVG(term) {
  const t = THEME[term.season];
  const scene = SCENES[term.name] || (() => '');
  const s = scene(t);
  const g = t.sky;
  const month = String(term.month).padStart(2,'0');
  const day = String(term.day).padStart(2,'0');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="400" viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${g[0]}"/>
      <stop offset="35%" stop-color="${g[1]}"/>
      <stop offset="70%" stop-color="${g[2]}"/>
      <stop offset="100%" stop-color="${g[3]}"/>
    </linearGradient>
    <filter id="softShadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="${t.text}" flood-opacity="0.15"/>
    </filter>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff9c4" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#fff9c4" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- 天空背景 -->
  <rect width="800" height="400" fill="url(#sky)" rx="16"/>

  <!-- 远景大圆装饰 -->
  <circle cx="780" cy="20" r="100" fill="#fff" opacity="0.08"/>
  <circle cx="20" cy="390" r="70" fill="#fff" opacity="0.06"/>

  <!-- 节气专属场景 -->
  ${s}

  <!-- 底部渐变遮罩 -->
  <rect x="0" y="320" width="800" height="80" fill="url(#sky)" opacity="0.3" rx="0"/>

  <!-- 标题区背景 -->
  <rect x="250" y="130" width="300" height="160" fill="#fff" opacity="0.18" rx="12"/>

  <!-- 主标题 -->
  <text x="400" y="208" text-anchor="middle" font-size="80" font-weight="bold"
    fill="${t.text}" font-family="'Noto Serif SC', 'SimHei', 'STKaiti', serif"
    filter="url(#softShadow)" letter-spacing="8">${term.name}</text>

  <!-- 拼音 -->
  <text x="400" y="246" text-anchor="middle" font-size="20"
    fill="${t.text}" opacity="0.7"
    font-family="Arial, sans-serif" letter-spacing="6">${term.pinyin}</text>

  <!-- 分隔线 -->
  <line x1="350" y1="265" x2="450" y2="265" stroke="${t.text}" stroke-width="1.5" opacity="0.4"/>

  <!-- 日期 -->
  <text x="400" y="287" text-anchor="middle" font-size="15"
    fill="${t.text}" opacity="0.65"
    font-family="'Noto Sans SC', Arial, sans-serif">${month}月${day}日 · 二十四节气</text>

  <!-- 底部关键词 -->
  <text x="400" y="378" text-anchor="middle" font-size="13"
    fill="${t.text}" opacity="0.5"
    font-family="'Noto Sans SC', Arial, sans-serif">${term.keywords.join('  ·  ')}</text>
</svg>`;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  let count = 0;
  for (const term of SOLAR_TERMS) {
    const idx = SOLAR_TERMS.indexOf(term) + 1;
    const filename = `solar-term-${String(idx).padStart(2,'0')}.svg`;
    const svg = generateSVG(term);
    fs.writeFileSync(path.join(OUT_DIR, filename), svg, 'utf8');
    console.log(`[ok] ${filename} — ${term.name}`);
    count++;
  }
  console.log(`\n共 ${count} 张封面图 -> ${OUT_DIR}`);
}

main().catch(e => console.error(e));
