/**
 * generate-solar-term-illustrations.js
 * 二十四节气正文主题插图 · 精致重制版
 * 图片存放于 D:/hexo/source/images/solar-terms/illustrations/
 */

const fs = require('fs');
const path = require('path');
const { SOLAR_TERMS } = require('./solar-terms-data');

const OUT_DIR = 'D:/hexo/source/images/solar-terms/illustrations';

const SEASON_COLORS = {
  spring: {
    sky: ['#e8f5e9','#c8e6c9','#a5d6a7'],
    grass: '#81c784', stem: '#5d8a4a',
    sun: '#fdd835', water: '#b2dfdb',
    text: '#2e7d32', accent: '#e91e63'
  },
  summer: {
    sky: ['#fff9e6','#ffecb3','#ffe082'],
    grass: '#66bb6a', stem: '#388e3c',
    sun: '#ff8f00', water: '#4fc3f7',
    text: '#bf360c', accent: '#f44336'
  },
  autumn: {
    sky: ['#fff3e0','#ffe0b2','#ffcc80'],
    grass: '#8d6e63', stem: '#5d4037',
    sun: '#ffa000', water: '#b0bec5',
    text: '#bf360c', accent: '#e65100'
  },
  winter: {
    sky: ['#e3f2fd','#bbdefb','#90a4ae'],
    grass: '#78909c', stem: '#546e7a',
    sun: '#cfd8dc', water: '#cfd8dc',
    text: '#37474f', accent: '#42a5f5'
  }
};

function particles(type, c) {
  if (type === 'snow') {
    return Array.from({length: 30}, (_, i) => {
      const x = 20 + Math.random() * 360;
      const y = 20 + Math.random() * 180;
      const r = 1 + Math.random() * 2.5;
      const op = 0.3 + Math.random() * 0.6;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${op}"/>`;
    }).join('');
  }
  if (type === 'rain') {
    return Array.from({length: 25}, (_, i) => {
      const x = 20 + Math.random() * 360;
      const y = 20 + Math.random() * 160;
      const op = 0.2 + Math.random() * 0.4;
      return `<line x1="${x}" y1="${y}" x2="${x-3}" y2="${y+16}" stroke="#64b5f6" stroke-width="1.2" opacity="${op}"/>`;
    }).join('');
  }
  if (type === 'petals') {
    return Array.from({length: 15}, (_, i) => {
      const x = 20 + Math.random() * 360;
      const y = 30 + Math.random() * 150;
      const r = 2 + Math.random() * 3;
      const op = 0.5 + Math.random() * 0.4;
      const rot = Math.random() * 360;
      return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r*0.6}" fill="${c.accent}" opacity="${op}" transform="rotate(${rot},${x},${y})"/>`;
    }).join('');
  }
  if (type === 'leaves') {
    return Array.from({length: 12}, (_, i) => {
      const x = 20 + Math.random() * 360;
      const y = 30 + Math.random() * 150;
      const op = 0.5 + Math.random() * 0.4;
      const rot = Math.random() * 360;
      return `<path d="M${x} ${y} Q${x+4} ${y-8} ${x+8} ${y}" stroke="${c.text}" stroke-width="1.5" fill="none" opacity="${op}" transform="rotate(${rot},${x+4},${y-4})"/>`;
    }).join('');
  }
  return '';
}

const ILLUSTRATIONS = {
  '小寒': [
    { label: '踏雪寻梅', scene: (c) => `
      <defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${c.sky[1]}"/><stop offset="100%" stop-color="${c.sky[0]}"/>
      </linearGradient></defs>
      <rect width="400" height="220" fill="url(#wg)" rx="10"/>
      <!-- 雪地 -->
      <path d="M0 170 Q100 158 200 165 Q300 152 400 160 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <ellipse cx="100" cy="178" rx="60" ry="12" fill="#fff" opacity="0.7"/>
      <ellipse cx="280" cy="172" rx="50" ry="10" fill="#fff" opacity="0.65"/>
      <!-- 梅花枝 -->
      <path d="M280 220 Q260 175 295 140 Q330 105 310 75" stroke="#6d4c41" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M295 140 Q320 122 345 128" stroke="#6d4c41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M295 115 Q318 100 340 108" stroke="#6d4c41" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="292" cy="83" r="6" fill="#f48fb1"/><circle cx="310" cy="68" r="5.5" fill="#f8bbd0"/>
      <circle cx="328" cy="55" r="5" fill="#f48fb1"/><circle cx="340" cy="70" r="4.5" fill="#f8bbd0"/>
      <circle cx="302" cy="103" r="5" fill="#f48fb1"/><circle cx="318" cy="88" r="4.5" fill="#f8bbd0"/>
      <circle cx="338" cy="100" r="4" fill="#f48fb1"/><circle cx="350" cy="115" r="3.5" fill="#f8bbd0"/>
      <!-- 雪中足迹 -->
      <ellipse cx="120" cy="190" rx="12" ry="6" fill="${c.grass}" opacity="0.45"/>
      <ellipse cx="148" cy="195" rx="12" ry="6" fill="${c.grass}" opacity="0.4"/>
      <ellipse cx="178" cy="192" rx="11" ry="5.5" fill="${c.grass}" opacity="0.38"/>
      <!-- 飘雪 -->
      ${particles('snow', c)}
      <!-- 标题 -->
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">踏雪寻梅</text>
    `},
    { label: '红炉温酒', scene: (c) => `
      <defs><linearGradient id="wg2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${c.sky[2]}"/><stop offset="100%" stop-color="${c.sky[0]}"/>
      </linearGradient></defs>
      <rect width="400" height="220" fill="url(#wg2)" rx="10"/>
      <!-- 窗外雪景 -->
      <rect x="200" y="20" width="180" height="130" fill="${c.sky[1]}" rx="5" opacity="0.4"/>
      <rect x="200" y="20" width="180" height="130" fill="none" stroke="${c.text}" stroke-width="3" rx="5" opacity="0.5"/>
      <line x1="290" y1="20" x2="290" y2="150" stroke="${c.text}" stroke-width="2" opacity="0.4"/>
      <line x1="200" y1="85" x2="380" y2="85" stroke="${c.text}" stroke-width="2" opacity="0.4"/>
      <!-- 窗内红炉 -->
      <ellipse cx="120" cy="170" rx="55" ry="30" fill="#5d4037" opacity="0.9" rx="5"/>
      <ellipse cx="120" cy="162" rx="45" ry="20" fill="#ff5722" opacity="0.8"/>
      <ellipse cx="120" cy="158" rx="30" ry="12" fill="#ff9800" opacity="0.9"/>
      <ellipse cx="120" cy="156" rx="18" ry="7" fill="#ffc107" opacity="0.95"/>
      <!-- 酒壶 -->
      <ellipse cx="120" cy="140" rx="18" ry="25" fill="#8d6e63" opacity="0.9"/>
      <ellipse cx="120" cy="122" rx="12" ry="8" fill="#a1887f" opacity="0.8"/>
      <path d="M135 130 Q145 125 150 132" stroke="#6d4c41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- 温酒热气 -->
      <path d="M112 115 Q115 105 112 95" stroke="#bdbdbd" stroke-width="1.5" fill="none" opacity="0.5"/>
      <path d="M120 112 Q123 100 120 88" stroke="#bdbdbd" stroke-width="1.5" fill="none" opacity="0.45"/>
      <path d="M128 115 Q131 105 128 95" stroke="#bdbdbd" stroke-width="1.5" fill="none" opacity="0.4"/>
      <!-- 雪中窗台 -->
      <rect x="195" y="150" width="190" height="12" fill="#fff" opacity="0.8" rx="2"/>
      <ellipse cx="220" cy="156" rx="18" ry="4" fill="#fff" opacity="0.9"/>
      <!-- 标题 -->
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">红炉温酒</text>
    `}
  ],
  '大寒': [
    { label: '冰河寒雁', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[2]}" rx="10"/>
      <!-- 雪山 -->
      <path d="M0 160 L80 100 L160 130 L220 70 L300 120 L360 80 L400 110 L400 220 L0 220Z" fill="${c.grass}" opacity="0.6"/>
      <path d="M200 70 L220 50 L240 70Z" fill="#fff" opacity="0.95"/>
      <path d="M340 80 L360 62 L380 80Z" fill="#fff" opacity="0.9"/>
      <!-- 冰河 -->
      <path d="M0 175 Q100 165 200 172 Q300 162 400 168 L400 220 L0 220Z" fill="${c.water}" opacity="0.6"/>
      <path d="M0 180 Q100 172 200 178 Q300 168 400 174" stroke="#fff" stroke-width="1.5" fill="none" opacity="0.5"/>
      <!-- 大雁 -->
      <path d="M60 120 Q72 115 84 120 Q72 118 60 120Z" fill="${c.grass}"/><circle cx="58" cy="118" r="3" fill="${c.grass}"/>
      <path d="M55 125 Q67 120 79 125 Q67 123 55 125Z" fill="${c.grass}" opacity="0.8"/><circle cx="53" cy="123" r="3" fill="${c.grass}" opacity="0.8"/>
      <path d="M120 100 Q132 95 144 100 Q132 98 120 100Z" fill="${c.grass}"/><circle cx="118" cy="98" r="3" fill="${c.grass}"/>
      <!-- 飘雪 -->
      ${particles('snow', c)}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">冰河寒雁</text>
    `},
    { label: '雪夜围炉', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 室内 -->
      <rect x="0" y="130" width="400" height="90" fill="${c.sky[2]}" opacity="0.5"/>
      <!-- 红炉 -->
      <ellipse cx="200" cy="185" rx="60" ry="30" fill="#5d4037" opacity="0.95"/>
      <ellipse cx="200" cy="178" rx="48" ry="22" fill="#ff5722" opacity="0.85"/>
      <ellipse cx="200" cy="174" rx="32" ry="14" fill="#ff9800" opacity="0.9"/>
      <ellipse cx="200" cy="172" rx="20" ry="8" fill="#ffc107" opacity="0.95"/>
      <!-- 人物剪影 -->
      <path d="M120 220 L120 165" stroke="#5d4037" stroke-width="4" stroke-linecap="round"/>
      <circle cx="120" cy="155" r="12" fill="#5d4037"/>
      <path d="M120 175 L100 195" stroke="#5d4037" stroke-width="3" stroke-linecap="round"/>
      <path d="M120 175 L135 192" stroke="#5d4037" stroke-width="3" stroke-linecap="round"/>
      <path d="M280 220 L280 165" stroke="#6d4c41" stroke-width="4" stroke-linecap="round"/>
      <circle cx="280" cy="155" r="12" fill="#6d4c41"/>
      <path d="M280 175 L300 195" stroke="#6d4c41" stroke-width="3" stroke-linecap="round"/>
      <path d="M280 175 L265 192" stroke="#6d4c41" stroke-width="3" stroke-linecap="round"/>
      <!-- 雪花窗 -->
      ${particles('snow', c)}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">雪夜围炉</text>
    `}
  ],
  '立春': [
    { label: '春回大地', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 远山 -->
      <path d="M0 160 Q100 138 200 150 Q300 130 400 142 L400 220 L0 220Z" fill="${c.grass}" opacity="0.35"/>
      <!-- 草地 -->
      <path d="M0 180 Q100 168 200 175 Q300 162 400 170 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <!-- 柳树 -->
      <path d="M300 220 Q288 175 315 140 Q342 105 325 75" stroke="#66bb6a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      ${Array.from({length:8},(_,i)=>{ const y0=140-i*9, y1=134-i*9, x=311+i*4, x2=314+i*4, cx=311+i*4, cy=137-i*9; return `<path d="M${308+i*4} ${y0} Q${x} ${y1} ${x2} ${y0}" stroke="#81c784" stroke-width="1.8" fill="none" opacity="${0.6+i%3*0.13}" transform="rotate(-15,${cx},${cy})"/>`; }).join('')}
      <!-- 桃花 -->
      <path d="M100 220 Q90 175 115 145 Q140 115 125 90" stroke="#795548" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <circle cx="108" cy="98" r="6" fill="#f48fb1"/><circle cx="123" cy="84" r="5.5" fill="#f8bbd0"/>
      <circle cx="138" cy="72" r="5" fill="#f48fb1"/><circle cx="122" cy="118" r="5" fill="#f8bbd0"/>
      <circle cx="136" cy="104" r="4.5" fill="#f48fb1"/>
      <!-- 燕子 -->
      <path d="M220 80 Q235 74 250 78 Q235 76 220 80Z" fill="${c.grass}"/><circle cx="218" cy="78" r="3" fill="${c.grass}"/>
      <!-- 春芽 -->
      ${Array.from({length:6},(_,i)=>`<circle cx="${30+i*60}" cy="${172+i%2*8}" r="${4-i*0.3}" fill="${c.sun}" opacity="${0.8+i%2*0.1}"/>`).join('')}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">春回大地</text>
    `},
    { label: '枝头春色', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 主干 -->
      <path d="M200 220 L200 110" stroke="#6d4c41" stroke-width="5" stroke-linecap="round"/>
      <path d="M200 150 Q160 118 130 128" stroke="#6d4c41" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M200 135 Q242 103 275 112" stroke="#6d4c41" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M200 160 Q235 138 265 145" stroke="#6d4c41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M200 145 Q165 122 140 130" stroke="#6d4c41" stroke-width="2" fill="none" stroke-linecap="round"/>
      <!-- 桃花 -->
      <circle cx="125" cy="120" r="9" fill="#f48fb1" opacity="0.95"/><circle cx="142" cy="108" r="8" fill="#f8bbd0" opacity="0.9"/>
      <circle cx="158" cy="98" r="7.5" fill="#f48fb1" opacity="0.95"/><circle cx="200" cy="105" r="10" fill="#f48fb1" opacity="0.95"/>
      <circle cx="220" cy="115" r="8" fill="#f8bbd0" opacity="0.9"/><circle cx="238" cy="106" r="7" fill="#f48fb1" opacity="0.9"/>
      <circle cx="255" cy="118" r="7.5" fill="#f8bbd0" opacity="0.9"/><circle cx="268" cy="132" r="7" fill="#f48fb1" opacity="0.9"/>
      <circle cx="148" cy="138" r="6.5" fill="#f48fb1" opacity="0.85"/><circle cx="165" cy="128" r="6" fill="#f8bbd0" opacity="0.85"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">枝头春色</text>
    `}
  ],
  '雨水': [
    { label: '细雨如酥', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 雨雾层 -->
      <ellipse cx="200" cy="120" rx="200" ry="60" fill="${c.sky[2]}" opacity="0.35"/>
      <!-- 雨中池塘 -->
      <ellipse cx="200" cy="185" rx="180" ry="30" fill="${c.water}" opacity="0.5"/>
      <ellipse cx="200" cy="182" rx="140" ry="22" fill="#4fc3f7" opacity="0.25"/>
      <!-- 涟漪 -->
      <ellipse cx="150" cy="182" rx="25" ry="7" fill="none" stroke="#90caf9" stroke-width="1" opacity="0.7"/>
      <ellipse cx="250" cy="188" rx="20" ry="5" fill="none" stroke="#90caf9" stroke-width="1" opacity="0.6"/>
      <!-- 雨中柳 -->
      <path d="M320 220 Q305 175 330 140 Q355 105 338 75" stroke="#66bb6a" stroke-width="3" fill="none" stroke-linecap="round"/>
      ${Array.from({length:6},(_,i)=>{ const y0=145-i*12, y1=139-i*12, x=328+i*4, x2=331+i*4, cx=328+i*4, cy=142-i*12; return `<path d="M${325+i*4} ${y0} Q${x} ${y1} ${x2} ${y0}" stroke="#81c784" stroke-width="1.8" fill="none" opacity="${0.55+i%3*0.14}" transform="rotate(-12,${cx},${cy})"/>`; }).join('')}
      <!-- 雨 -->
      ${particles('rain', c)}
      <!-- 雨伞 -->
      <path d="M100 220 L100 160" stroke="#c62828" stroke-width="2.5"/>
      <path d="M60 160 Q100 130 140 160Z" fill="#c62828" opacity="0.85"/>
      <path d="M75 160 Q100 142 125 160" fill="#e53935" opacity="0.6"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">细雨如酥</text>
    `},
    { label: '池塘春涨', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 涨水池塘 -->
      <ellipse cx="200" cy="180" rx="190" ry="38" fill="${c.water}" opacity="0.55"/>
      <ellipse cx="200" cy="178" rx="160" ry="28" fill="#4fc3f7" opacity="0.2"/>
      <!-- 水草 -->
      ${Array.from({length:8},(_,i)=>`
        <path d="M${40+i*45} 200 Q${43+i*45} ${180-i%2*10} ${40+i*45} ${185-i%2*10}" stroke="${c.grass}" stroke-width="2" fill="none" stroke-linecap="round" opacity="${0.6+i%3*0.12}"/>
      `).join('')}
      <!-- 浮萍 -->
      <ellipse cx="120" cy="185" rx="14" ry="7" fill="${c.grass}" opacity="0.65"/>
      <ellipse cx="280" cy="190" rx="12" ry="6" fill="${c.grass}" opacity="0.6"/>
      <circle cx="118" cy="182" r="3.5" fill="#f06292" opacity="0.8"/>
      <circle cx="282" cy="187" r="3" fill="#f06292" opacity="0.75"/>
      <!-- 鸭子 -->
      <ellipse cx="200" cy="185" rx="22" ry="10" fill="#ff8f00" opacity="0.9"/>
      <circle cx="218" cy="180" r="12" fill="#ff8f00"/>
      <path d="M228 180 L238 178 L228 182Z" fill="#f44336"/>
      <circle cx="222" cy="177" r="2.5" fill="#333"/>
      <path d="M186 183 Q190 178 194 183" stroke="#ff6f00" stroke-width="1.5" fill="none"/>
      <!-- 春雨 -->
      ${particles('rain', c)}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">池塘春涨</text>
    `}
  ],
  '惊蛰': [
    { label: '春雷惊梦', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 乌云 -->
      <ellipse cx="200" cy="80" rx="150" ry="60" fill="#607d8b" opacity="0.75"/>
      <ellipse cx="150" cy="95" rx="100" ry="45" fill="#546e7a" opacity="0.7"/>
      <ellipse cx="260" cy="100" rx="80" ry="38" fill="#607d8b" opacity="0.65"/>
      <!-- 闪电 -->
      <path d="M220 145 L205 175 L218 172 L200 210 L230 168 L215 172 L232 145Z" stroke="#ffd600" stroke-width="2.5" fill="#ffd600" opacity="0.95"/>
      <path d="M280 155 L268 180 L278 178 L264 205 L290 175 L280 178 L295 155Z" stroke="#ffd600" stroke-width="2" fill="#ffd600" opacity="0.8"/>
      <!-- 草地新芽 -->
      <path d="M0 185 Q100 172 200 180 Q300 168 400 176 L400 220 L0 220Z" fill="${c.grass}" opacity="0.55"/>
      ${Array.from({length:10},(_,i)=>`
        <path d="M${30+i*38} 220 Q${33+i*38} ${205-i%2*8} ${30+i*38} ${212-i%2*8}" stroke="${c.grass}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="${0.6+i%3*0.12}"/>
      `).join('')}
      <!-- 醒来的青蛙 -->
      <ellipse cx="300" cy="200" rx="22" ry="14" fill="#4caf50" opacity="0.9"/>
      <circle cx="290" cy="190" r="7" fill="#4caf50"/>
      <circle cx="310" cy="190" r="7" fill="#4caf50"/>
      <circle cx="290" cy="188" r="3" fill="#1b5e20"/><circle cx="310" cy="188" r="3" fill="#1b5e20"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">春雷惊梦</text>
    `},
    { label: '虫鸣草长', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 草地 -->
      <path d="M0 180 Q100 168 200 175 Q300 162 400 170 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <!-- 草虫 -->
      ${Array.from({length:8},(_,i)=>`
        <path d="M${30+i*48} 220 Q${33+i*48} ${200-i%2*8} ${30+i*48} ${210-i%2*8}" stroke="${c.grass}" stroke-width="2" fill="none" stroke-linecap="round" opacity="${0.5+i%3*0.15}"/>
      `).join('')}
      <!-- 瓢虫 -->
      <ellipse cx="180" cy="185" rx="10" ry="8" fill="#f44336" opacity="0.9"/>
      <line x1="180" y1="177" x2="180" y2="193" stroke="#333" stroke-width="1" opacity="0.7"/>
      <circle cx="175" cy="180" r="2" fill="#333" opacity="0.8"/><circle cx="185" cy="180" r="2" fill="#333" opacity="0.8"/>
      <circle cx="177" cy="188" r="1.5" fill="#333" opacity="0.8"/><circle cx="183" cy="188" r="1.5" fill="#333" opacity="0.8"/>
      <!-- 蝴蝶 -->
      <ellipse cx="280" cy="160" rx="14" ry="9" fill="${c.accent}" opacity="0.8" transform="rotate(-25,280,160)"/>
      <ellipse cx="296" cy="155" rx="12" ry="7" fill="${c.accent}" opacity="0.65" transform="rotate(20,296,155)"/>
      <line x1="288" y1="160" x2="288" y2="172" stroke="#5d4037" stroke-width="1.2"/>
      <!-- 蜜蜂 -->
      <ellipse cx="350" cy="175" rx="8" ry="6" fill="#ffc107" opacity="0.9"/>
      <line x1="342" y1="175" x2="358" y2="175" stroke="#333" stroke-width="0.8" opacity="0.5"/>
      <line x1="344" y1="178" x2="356" y2="178" stroke="#333" stroke-width="0.8" opacity="0.5"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">虫鸣草长</text>
    `}
  ],
  '春分': [
    { label: '昼夜平分', scene: (c) => `
      <defs><linearGradient id="dayg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${c.sky[0]}"/><stop offset="50%" stop-color="${c.sun}"/><stop offset="100%" stop-color="${c.sky[0]}"/>
      </linearGradient></defs>
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 地平线 -->
      <path d="M0 160 Q200 148 400 158 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <!-- 太阳 -->
      <circle cx="200" cy="100" r="55" fill="${c.sun}" opacity="0.85"/>
      <circle cx="200" cy="100" r="42" fill="#ffeb3b" opacity="0.9"/>
      <circle cx="200" cy="100" r="28" fill="#fff9c4" opacity="0.85"/>
      <!-- 昼夜分割线 -->
      <line x1="200" y1="45" x2="200" y2="155" stroke="#fff" stroke-width="2.5" opacity="0.5" stroke-dasharray="6,4"/>
      <line x1="145" y1="100" x2="255" y2="100" stroke="#fff" stroke-width="2.5" opacity="0.5" stroke-dasharray="6,4"/>
      <!-- 燕子 -->
      <path d="M60 130 Q75 124 90 128 Q75 126 60 130Z" fill="${c.grass}"/><circle cx="58" cy="128" r="2.5" fill="${c.grass}"/>
      <path d="M100 115 Q115 109 130 113 Q115 111 100 115Z" fill="${c.grass}"/><circle cx="98" cy="113" r="2.5" fill="${c.grass}"/>
      <!-- 野花 -->
      ${Array.from({length:8},(_,i)=>`<circle cx="${30+i*48}" cy="${145+i%3*12}" r="${5-i*0.3}" fill="${c.accent}" opacity="${0.7+i%3*0.1}"/>`).join('')}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">昼夜平分</text>
    `},
    { label: '草长莺飞', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 草地 -->
      <path d="M0 175 Q100 162 200 170 Q300 158 400 165 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <!-- 草尖 -->
      ${Array.from({length:12},(_,i)=>`
        <path d="M${20+i*32} 220 Q${23+i*32} ${200-i%2*8} ${20+i*32} ${208-i%2*8}" stroke="${c.grass}" stroke-width="2" fill="none" stroke-linecap="round" opacity="${0.55+i%4*0.1}"/>
      `).join('')}
      <!-- 风筝 -->
      <path d="M300 60 L330 30 L360 60Z" fill="#e53935" opacity="0.85"/>
      <line x1="300" y1="60" x2="300" y2="30" stroke="#f44336" stroke-width="1.5" opacity="0.6"/>
      <line x1="330" y1="30" x2="330" y2="20" stroke="#f44336" stroke-width="1.5" opacity="0.6"/>
      <line x1="330" y1="30" x2="310" y2="38" stroke="#f44336" stroke-width="1" opacity="0.4"/>
      <path d="M330 30 Q340 25 345 32" stroke="#ffc107" stroke-width="2" fill="none"/>
      <line x1="330" y1="30" x2="330" y2="80" stroke="#5d4037" stroke-width="1.2"/>
      <!-- 飞鸟 -->
      <path d="M100 80 Q115 74 130 78 Q115 76 100 80Z" fill="${c.grass}"/><circle cx="98" cy="78" r="2.5" fill="${c.grass}"/>
      <path d="M140 65 Q155 59 170 63 Q155 61 140 65Z" fill="${c.grass}"/><circle cx="138" cy="63" r="2.5" fill="${c.grass}"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">草长莺飞</text>
    `}
  ],
  '清明': [
    { label: '清明时节', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 远山 -->
      <path d="M0 150 Q100 130 200 142 Q300 125 400 135 L400 220 L0 220Z" fill="${c.grass}" opacity="0.35"/>
      <!-- 薄雾 -->
      <ellipse cx="200" cy="165" rx="200" ry="40" fill="${c.sky[0]}" opacity="0.45"/>
      <!-- 草地 -->
      <path d="M0 185 Q100 172 200 180 Q300 168 400 175 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <!-- 雨纷纷 -->
      ${particles('rain', c)}
      <!-- 扫墓人 -->
      <path d="M280 220 L280 185" stroke="#6d4c41" stroke-width="2.5"/>
      <circle cx="280" cy="178" r="9" fill="#795548"/>
      <path d="M280 192 L262 205" stroke="#6d4c41" stroke-width="2"/><path d="M280 192 L295 203" stroke="#6d4c41" stroke-width="2"/>
      <!-- 纸钱 -->
      <rect x="258" cy="165" width="7" height="5" fill="#fff" opacity="0.8" transform="rotate(15,261,167)"/>
      <rect x="285" cy="160" width="6" height="4" fill="#fff" opacity="0.7" transform="rotate(-20,288,162)"/>
      <!-- 远亭 -->
      <rect x="80" y="165" width="45" height="35" fill="${c.grass}" opacity="0.55" rx="2"/>
      <path d="M72 165 L102 150 L132 165Z" fill="${c.grass}" opacity="0.65"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">清明时节</text>
    `},
    { label: '春草萋萋', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 草地 -->
      <path d="M0 170 Q100 158 200 165 Q300 152 400 160 L400 220 L0 220Z" fill="${c.grass}" opacity="0.6"/>
      <!-- 野草野花 -->
      ${Array.from({length:14},(_,i)=>`
        <path d="M${20+i*27} 220 Q${23+i*27} ${198-i%2*10} ${20+i*27} ${208-i%2*10}" stroke="${c.grass}" stroke-width="2" fill="none" stroke-linecap="round" opacity="${0.5+i%3*0.12}"/>
      `).join('')}
      ${Array.from({length:8},(_,i)=>`
        <circle cx="${30+i*50}" cy="${162+i%3*12}" r="${4-i%2*1.5}" fill="${c.accent}" opacity="${0.65+i%4*0.08}"/>
      `).join('')}
      <!-- 蝴蝶 -->
      <ellipse cx="320" cy="150" rx="12" ry="7" fill="${c.accent}" opacity="0.7" transform="rotate(-20,320,150)"/>
      <ellipse cx="334" cy="145" rx="10" ry="6" fill="${c.accent}" opacity="0.55" transform="rotate(15,334,145)"/>
      <line x1="327" y1="150" x2="327" y2="160" stroke="#5d4037" stroke-width="1.2"/>
      <!-- 细雨 -->
      ${particles('rain', c)}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">春草萋萋</text>
    `}
  ],
  '谷雨': [
    { label: '谷雨采茶', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 茶山 -->
      <path d="M0 150 Q100 130 200 142 Q300 125 400 135 L400 220 L0 220Z" fill="${c.grass}" opacity="0.45"/>
      <path d="M0 175 Q100 158 200 168 Q300 150 400 162 L400 220 L0 220Z" fill="${c.grass}" opacity="0.55"/>
      <!-- 茶芽 -->
      ${Array.from({length:10},(_,i)=>`
        <path d="M${30+i*38} ${175-i%3*8} Q${33+i*38} ${163-i%3*8} ${30+i*38} ${170-i%3*8}" stroke="#388e3c" stroke-width="1.8" fill="none" opacity="${0.65+i%3*0.1}"/>
        <ellipse cx="${32+i*38}" cy="${166-i%3*8}" rx="3.5" ry="5.5" fill="#66bb6a" opacity="${0.8+i%3*0.07}"/>
      `).join('')}
      <!-- 雨 -->
      ${particles('rain', c)}
      <!-- 茶篓 -->
      <path d="M280 220 Q270 200 280 185 Q290 200 280 220Z" fill="#8d6e63" opacity="0.85"/>
      <ellipse cx="280" cy="185" rx="18" ry="10" fill="#a1887f" opacity="0.8"/>
      <path d="M265 178 Q280 168 295 178" stroke="#6d4c41" stroke-width="2" fill="none"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">谷雨采茶</text>
    `},
    { label: '萍始生', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 水面 -->
      <path d="M0 150 Q200 138 400 145 L400 220 L0 220Z" fill="${c.water}" opacity="0.6"/>
      <!-- 浮萍 -->
      ${Array.from({length:12},(_,i)=>`
        <ellipse cx="${25+i*32}" cy="${150+i%3*10}" rx="${12-i%2*3}" ry="${6-i%2*1.5}" fill="${c.grass}" opacity="${0.55+i%3*0.1}"/>
      `).join('')}
      <!-- 水面波纹 -->
      <path d="M50 170 Q200 160 350 168" stroke="#90caf9" stroke-width="1" fill="none" opacity="0.5"/>
      <path d="M30 180 Q200 170 370 178" stroke="#90caf9" stroke-width="0.8" fill="none" opacity="0.4"/>
      <!-- 蜻蜓 -->
      <ellipse cx="200" cy="120" rx="16" ry="4" fill="#81d4fa" opacity="0.9"/>
      <path d="M188" y1="120" x2="186" y2="110" stroke="#81d4fa" stroke-width="1.2"/>
      <path d="M188 120 L186 108" stroke="#81d4fa" stroke-width="1.2"/>
      <path d="M212 120 L214 108" stroke="#81d4fa" stroke-width="1.2"/>
      <path d="M212 120 L214 132" stroke="#81d4fa" stroke-width="1.2"/>
      <path d="M188 120 L186 132" stroke="#81d4fa" stroke-width="1.2"/>
      <circle cx="220" cy="117" r="4" fill="#81d4fa"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">萍始生</text>
    `}
  ],
  '立夏': [
    { label: '夏日荷塘', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 荷塘 -->
      <ellipse cx="200" cy="175" rx="190" ry="42" fill="${c.water}" opacity="0.55"/>
      <!-- 荷花 -->
      <ellipse cx="120" cy="175" rx="22" ry="11" fill="${c.grass}" opacity="0.8"/>
      <ellipse cx="120" cy="172" rx="14" ry="7" fill="${c.accent}" opacity="0.9"/>
      <path d="M110 172 Q120 162 130 172" stroke="#f48fb1" stroke-width="1.5" fill="none"/>
      <ellipse cx="280" cy="180" rx="20" ry="10" fill="${c.grass}" opacity="0.75"/>
      <ellipse cx="280" cy="177" rx="13" ry="6" fill="#fff59d" opacity="0.9"/>
      <!-- 荷叶 -->
      <ellipse cx="200" cy="180" rx="30" ry="15" fill="${c.grass}" opacity="0.8"/>
      <path d="M200 165 Q200 180 200 195" stroke="${c.grass}" stroke-width="2" fill="none"/>
      <ellipse cx="350" cy="183" rx="25" ry="12" fill="${c.grass}" opacity="0.7"/>
      <!-- 蜻蜓 -->
      <ellipse cx="200" cy="120" rx="14" ry="3.5" fill="#81d4fa" opacity="0.9"/>
      <path d="M190 120 L188 110 M190 120 L188 108" stroke="#81d4fa" stroke-width="1.2"/>
      <path d="M210 120 L212 110 M210 120 L212 108" stroke="#81d4fa" stroke-width="1.2"/>
      <circle cx="220" cy="117" r="4" fill="#81d4fa"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">夏日荷塘</text>
    `},
    { label: '蝉鸣高树', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 树叶 -->
      <ellipse cx="200" cy="80" rx="160" ry="60" fill="${c.grass}" opacity="0.6"/>
      <ellipse cx="140" cy="100" rx="90" ry="50" fill="${c.grass}" opacity="0.5"/>
      <ellipse cx="270" cy="95" rx="100" ry="55" fill="${c.grass}" opacity="0.5"/>
      <!-- 树干 -->
      <path d="M200 220 L200 120" stroke="#6d4c41" stroke-width="8" stroke-linecap="round"/>
      <path d="M200 160 Q160 130 130 138" stroke="#6d4c41" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M200 145 Q242 115 275 122" stroke="#6d4c41" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <!-- 蝉 -->
      <ellipse cx="130" cy="135" rx="16" ry="20" fill="${c.grass}" opacity="0.9"/>
      <ellipse cx="130" cy="120" rx="13" ry="8" fill="${c.grass}" opacity="0.9"/>
      <path d="M118 128 Q130 122 142 128" stroke="${c.grass}" stroke-width="3" fill="none"/>
      <ellipse cx="270" cy="120" rx="14" ry="17" fill="${c.grass}" opacity="0.85"/>
      <ellipse cx="270" cy="107" rx="11" ry="7" fill="${c.grass}" opacity="0.85"/>
      <path d="M260 113 Q270 107 280 113" stroke="${c.grass}" stroke-width="2.5" fill="none"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">蝉鸣高树</text>
    `}
  ],
  '小满': [
    { label: '小麦青青', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 麦田 -->
      <path d="M0 165 Q100 150 200 158 Q300 145 400 152 L400 220 L0 220Z" fill="#d4a017" opacity="0.5"/>
      <path d="M0 180 Q100 165 200 173 Q300 160 400 167 L400 220 L0 220Z" fill="#f9a825" opacity="0.6/>">
      <!-- 麦穗 -->
      ${Array.from({length:14},(_,i)=>`
        <path d="M${20+i*28} 220 Q${22+i*28} ${198-i%2*8} ${20+i*28} ${208-i%2*8}" stroke="#8d6e63" stroke-width="1.5" fill="none" opacity="0.7"/>
        <ellipse cx="${22+i*28}" cy="${200-i%2*8}" rx="3" ry="7" fill="#fdd835" opacity="${0.75+i%4*0.06}" transform="rotate(-5,${22+i*28},${200-i%2*8})"/>
      `).join('')}
      <!-- 蝴蝶 -->
      <ellipse cx="80" cy="110" rx="11" ry="7" fill="${c.accent}" opacity="0.75" transform="rotate(-15,80,110)"/>
      <ellipse cx="94" cy="105" rx="9" ry="5.5" fill="${c.accent}" opacity="0.6" transform="rotate(12,94,105)"/>
      <line x1="87" y1="110" x2="87" y2="120" stroke="#5d4037" stroke-width="1.2"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">小麦青青</text>
    `},
    { label: '枇杷金黄', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 枇杷树 -->
      <path d="M200 220 L200 140" stroke="#6d4c41" stroke-width="6" stroke-linecap="round"/>
      <path d="M200 160 Q160 130 130 138" stroke="#6d4c41" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M200 150 Q240 120 275 128" stroke="#6d4c41" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M200 170 Q235 148 265 155" stroke="#6d4c41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- 枇杷叶 -->
      <ellipse cx="150" cy="100" rx="28" ry="14" fill="${c.grass}" opacity="0.75" transform="rotate(-20,150,100)"/>
      <line x1="122" y1="100" x2="178" y2="100" stroke="${c.grass}" stroke-width="1.5" opacity="0.6" transform="rotate(-20,150,100)"/>
      <ellipse cx="240" cy="90" rx="24" ry="12" fill="${c.grass}" opacity="0.7" transform="rotate(15,240,90)"/>
      <!-- 枇杷果 -->
      <circle cx="130" cy="130" r="9" fill="#ffa000" opacity="0.95"/><circle cx="145" cy="122" r="9" fill="#ffa000" opacity="0.95"/>
      <circle cx="160" cy="115" r="8" fill="#ffa000" opacity="0.95"/><circle cx="138" cy="145" r="7.5" fill="#ffa000" opacity="0.9"/>
      <circle cx="230" cy="115" r="8" fill="#ffa000" opacity="0.9"/><circle cx="245" cy="125" r="7.5" fill="#ffa000" opacity="0.9"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">枇杷金黄</text>
    `}
  ],
  '芒种': [
    { label: '芒种开镰', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 稻田 -->
      <path d="M0 160 Q100 145 200 153 Q300 140 400 148 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <path d="M0 180 Q100 165 200 173 Q300 160 400 168 L400 220 L0 220Z" fill="${c.grass}" opacity="0.6"/>
      <!-- 镰刀 -->
      <path d="M160 220 Q150 180 180 150 Q200 135 210 160 Q215 180 200 200" stroke="#78909c" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M200 200 L200 220" stroke="#8d6e63" stroke-width="4" stroke-linecap="round"/>
      <!-- 稻农 -->
      <path d="M260 220 L260 182" stroke="#8d6e63" stroke-width="2.5"/>
      <circle cx="260" cy="175" r="8" fill="#8d6e63"/>
      <path d="M260 188 L245 202" stroke="#8d6e63" stroke-width="2"/><path d="M260 188 L272 198" stroke="#8d6e63" stroke-width="2"/>
      <!-- 弯腰割稻 -->
      <path d="M300 220 Q295 200 308 185" stroke="#6d4c41" stroke-width="2.5"/>
      <circle cx="308" cy="180" r="7" fill="#6d4c41"/>
      <path d="M308 188 L325 200" stroke="#6d4c41" stroke-width="2"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">芒种开镰</text>
    `},
    { label: '青梅煮酒', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 远山 -->
      <path d="M0 160 Q200 138 400 152 L400 220 L0 220Z" fill="${c.grass}" opacity="0.35"/>
      <!-- 青梅树 -->
      <path d="M100 220 L100 130" stroke="#6d4c41" stroke-width="5" stroke-linecap="round"/>
      <path d="M100 155 Q70 128 50 135" stroke="#6d4c41" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M100 145 Q130 118 155 125" stroke="#6d4c41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- 青梅 -->
      <circle cx="62" cy="118" r="7" fill="#8bc34a" opacity="0.95"/><circle cx="78" cy="108" r="7" fill="#8bc34a" opacity="0.95"/>
      <circle cx="55" cy="130" r="6" fill="#8bc34a" opacity="0.9"/><circle cx="140" cy="108" r="7" fill="#8bc34a" opacity="0.95"/>
      <circle cx="155" cy="118" r="6.5" fill="#8bc34a" opacity="0.9"/><circle cx="130" cy="120" r="6" fill="#8bc34a" opacity="0.9"/>
      <!-- 酒壶 -->
      <ellipse cx="300" cy="190" rx="22" ry="28" fill="#8d6e63" opacity="0.9"/>
      <ellipse cx="300" cy="168" rx="14" ry="9" fill="#a1887f" opacity="0.8"/>
      <path d="M318 175 Q330 170 335 178" stroke="#6d4c41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">青梅煮酒</text>
    `}
  ],
  '夏至': [
    { label: '夏至荷香', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 荷塘 -->
      <ellipse cx="200" cy="175" rx="190" ry="42" fill="${c.water}" opacity="0.6"/>
      <!-- 荷花 -->
      <ellipse cx="100" cy="175" rx="24" ry="12" fill="${c.grass}" opacity="0.8"/>
      <ellipse cx="100" cy="172" rx="16" ry="8" fill="#f8bbd0" opacity="0.95"/>
      <path d="M90 172 Q100 162 110 172" stroke="#f48fb1" stroke-width="1.5" fill="none"/>
      <ellipse cx="200" cy="178" rx="22" ry="11" fill="${c.grass}" opacity="0.75"/>
      <ellipse cx="200" cy="175" rx="14" ry="7" fill="#fff59d" opacity="0.95"/>
      <ellipse cx="310" cy="180" rx="20" ry="10" fill="${c.grass}" opacity="0.75"/>
      <ellipse cx="310" cy="177" rx="13" ry="6" fill="#f8bbd0" opacity="0.9"/>
      <!-- 荷叶 -->
      <ellipse cx="155" cy="180" rx="32" ry="16" fill="${c.grass}" opacity="0.8"/>
      <path d="M155 164 Q155 180 155 196" stroke="${c.grass}" stroke-width="2" fill="none"/>
      <ellipse cx="255" cy="183" rx="28" ry="14" fill="${c.grass}" opacity="0.75"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">夏至荷香</text>
    `},
    { label: '蝉噪林静', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 浓荫 -->
      <ellipse cx="200" cy="80" rx="170" ry="65" fill="${c.grass}" opacity="0.65"/>
      <ellipse cx="140" cy="100" rx="100" ry="55" fill="${c.grass}" opacity="0.55"/>
      <ellipse cx="270" cy="95" rx="110" ry="60" fill="${c.grass}" opacity="0.55"/>
      <!-- 树干 -->
      <path d="M200 220 L200 130" stroke="#6d4c41" stroke-width="8" stroke-linecap="round"/>
      <path d="M200 165 Q155 135 120 143" stroke="#6d4c41" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M200 150 Q248 120 285 128" stroke="#6d4c41" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <!-- 多只蝉 -->
      <ellipse cx="125" cy="140" rx="15" ry="18" fill="${c.grass}" opacity="0.9"/>
      <ellipse cx="125" cy="126" rx="12" ry="7" fill="${c.grass}" opacity="0.9"/>
      <path d="M113 133 Q125 127 137 133" stroke="${c.grass}" stroke-width="2.5" fill="none"/>
      <ellipse cx="280" cy="125" rx="13" ry="16" fill="${c.grass}" opacity="0.85"/>
      <ellipse cx="280" cy="112" rx="10" ry="6" fill="${c.grass}" opacity="0.85"/>
      <path d="M270 119 Q280 113 290 119" stroke="${c.grass}" stroke-width="2" fill="none"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">蝉噪林静</text>
    `}
  ],
  '小暑': [
    { label: '小暑温风', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 热浪山景 -->
      <path d="M0 155 Q200 135 400 148 L400 220 L0 220Z" fill="${c.grass}" opacity="0.35"/>
      <!-- 热浪 -->
      <path d="M0 170 Q100 160 200 168 Q300 158 400 165" stroke="#fff59d" stroke-width="2.5" fill="none" opacity="0.4"/>
      <path d="M0 178 Q100 168 200 176 Q300 166 400 173" stroke="#fff59d" stroke-width="2" fill="none" opacity="0.3"/>
      <path d="M0 186 Q100 176 200 184 Q300 174 400 181" stroke="#fff59d" stroke-width="1.5" fill="none" opacity="0.25"/>
      <!-- 荷塘 -->
      <ellipse cx="200" cy="188" rx="180" ry="28" fill="${c.water}" opacity="0.5"/>
      <ellipse cx="150" cy="186" rx="20" ry="10" fill="${c.grass}" opacity="0.75"/>
      <ellipse cx="150" cy="183" rx="13" ry="6" fill="#fff59d" opacity="0.9"/>
      <ellipse cx="260" cy="190" rx="18" ry="9" fill="${c.grass}" opacity="0.7"/>
      <!-- 扇子 -->
      <path d="M320 220 Q315 195 330 175 Q345 195 340 220Z" fill="#e91e63" opacity="0.75"/>
      <line x1="330" y1="175" x2="330" y2="220" stroke="#c2185b" stroke-width="1.5" opacity="0.5"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">小暑温风</text>
    `},
    { label: '蟋蟀居壁', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[2]}" rx="10"/>
      <!-- 老屋 -->
      <rect x="50" y="140" width="300" height="80" fill="#bcaaa4" opacity="0.85" rx="3"/>
      <path d="M40 140 L200 100 L360 140Z" fill="#8d6e63" opacity="0.9"/>
      <!-- 瓦片 -->
      ${Array.from({length:8},(_,i)=>`
        <rect x="${55+i*38}" y="140" width="35" height="8" fill="#6d4c41" opacity="${0.4+i%3*0.15}" rx="1"/>
      `).join('')}
      <!-- 墙壁缝隙 -->
      <path d="M150 155 Q152 175 150 195" stroke="#8d6e63" stroke-width="1.5" fill="none" opacity="0.5"/>
      <path d="M250 160 Q252 180 250 200" stroke="#8d6e63" stroke-width="1.5" fill="none" opacity="0.5"/>
      <!-- 蟋蟀 -->
      <ellipse cx="200" cy="168" rx="12" ry="8" fill="#5d4037" opacity="0.95"/>
      <path d="M190 168 Q185 158 188 148" stroke="#5d4037" stroke-width="1.5" fill="none"/>
      <path d="M210 168 Q215 158 212 148" stroke="#5d4037" stroke-width="1.5" fill="none"/>
      <path d="M188 160 Q185 155 180 158" stroke="#5d4037" stroke-width="1" fill="none"/>
      <path d="M212 160 Q215 155 220 158" stroke="#5d4037" stroke-width="1" fill="none"/>
      <circle cx="212" cy="165" r="2.5" fill="#333"/>
      <!-- 墙角萤火 -->
      ${Array.from({length:5},(_,i)=>`
        <circle cx="${280+i*25}" cy="${165+i%3*10}" r="${2+i%2*1}" fill="#ffeb3b" opacity="${0.5+i%3*0.15}"/>
      `).join('')}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">蟋蟀居壁</text>
    `}
  ],
  '大暑': [
    { label: '赤日炎炎', scene: (c) => `
      <defs><linearGradient id="heatg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ff8a65"/><stop offset="50%" stop-color="#ffca28"/><stop offset="100%" stop-color="#f9a825"/>
      </linearGradient></defs>
      <rect width="400" height="220" fill="url(#heatg)" rx="10"/>
      <!-- 烈日 -->
      <circle cx="200" cy="80" r="60" fill="${c.sun}" opacity="0.9"/>
      <circle cx="200" cy="80" r="45" fill="#ff5722" opacity="0.85"/>
      <circle cx="200" cy="80" r="30" fill="#ffca28" opacity="0.8"/>
      <!-- 热浪扭曲 -->
      <path d="M0 150 Q100 140 200 148 Q300 138 400 145" stroke="#ff8a65" stroke-width="3" fill="none" opacity="0.5"/>
      <path d="M0 160 Q100 150 200 158 Q300 148 400 155" stroke="#ff8a65" stroke-width="2.5" fill="none" opacity="0.4"/>
      <path d="M0 170 Q100 160 200 168 Q300 158 400 165" stroke="#ff8a65" stroke-width="2" fill="none" opacity="0.3"/>
      <!-- 干裂地面 -->
      <path d="M0 195 Q100 182 200 190 Q300 178 400 186 L400 220 L0 220Z" fill="#bf360c" opacity="0.5"/>
      <path d="M80 200 L120 200 M150 208 L190 208 M250 202 L290 202" stroke="#8d6e63" stroke-width="1.5" opacity="0.4"/>
      <!-- 西瓜 -->
      <ellipse cx="300" cy="205" rx="35" ry="20" fill="#388e3c" opacity="0.95"/>
      <ellipse cx="300" cy="202" rx="30" ry="16" fill="#f44336" opacity="0.95"/>
      <ellipse cx="300" cy="200" rx="18" ry="10" fill="#f8bbd0" opacity="0.65"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">赤日炎炎</text>
    `},
    { label: '消暑凉方', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 冰镇西瓜 -->
      <ellipse cx="200" cy="170" rx="70" ry="38" fill="#1565c0" opacity="0.4"/>
      <ellipse cx="200" cy="162" rx="60" ry="30" fill="#42a5f5" opacity="0.3"/>
      <ellipse cx="200" cy="155" rx="50" ry="25" fill="#90caf9" opacity="0.25"/>
      <ellipse cx="200" cy="148" rx="40" ry="20" fill="#bbdefb" opacity="0.2"/>
      <!-- 冰块 -->
      ${Array.from({length:6},(_,i)=>`
        <rect x="${60+i*50}" y="${140+i%2*15}" width="${18-i%2*4}" height="${14-i%2*3}" fill="#e3f2fd" opacity="${0.5+i%3*0.12}" rx="3" transform="rotate(${i*23},${60+i*50+9},${140+i%2*15+7})"/>
      `).join('')}
      <!-- 西瓜块 -->
      <path d="M130 148 Q150 130 170 148Z" fill="#f44336" opacity="0.9"/>
      <path d="M170 148 Q190 130 210 148Z" fill="#e53935" opacity="0.9"/>
      <path d="M210 148 Q230 130 250 148Z" fill="#f44336" opacity="0.9"/>
      <!-- 冷气 -->
      <path d="M150 120 Q153 108 150 96" stroke="#bbdefb" stroke-width="1.5" fill="none" opacity="0.5"/>
      <path d="M200 115 Q203 102 200 89" stroke="#bbdefb" stroke-width="1.5" fill="none" opacity="0.45"/>
      <path d="M250 120 Q253 108 250 96" stroke="#bbdefb" stroke-width="1.5" fill="none" opacity="0.5"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">消暑凉方</text>
    `}
  ],
  '立秋': [
    { label: '一叶知秋', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 秋山 -->
      <path d="M0 150 Q100 130 200 142 Q300 122 400 133 L400 220 L0 220Z" fill="${c.grass}" opacity="0.55"/>
      <path d="M0 180 Q100 165 200 173 Q300 158 400 167 L400 220 L0 220Z" fill="${c.grass}" opacity="0.6"/>
      <!-- 落叶 -->
      ${Array.from({length:18},(_,i)=>`
        <ellipse cx="${25+i*21}" cy="${100+i%5*22}" rx="6" ry="3.5" fill="${c.accent}" opacity="${0.5+i%5*0.08}" transform="rotate(${i*37},${25+i*21},${100+i%5*22})"/>
      `).join('')}
      <!-- 主题叶子 -->
      <path d="M180 180 Q190 160 200 150 Q210 160 220 180 Q210 175 200 170 Q190 175 180 180Z" fill="#e65100" opacity="0.95"/>
      <line x1="200" y1="170" x2="200" y2="195" stroke="#bf360c" stroke-width="2"/>
      <path d="M200 185 Q208 178 215 183" stroke="#bf360c" stroke-width="1.5" fill="none"/>
      <path d="M200 180 Q192 173 185 178" stroke="#bf360c" stroke-width="1.5" fill="none"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">一叶知秋</text>
    `},
    { label: '秋山红叶', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 秋山层林 -->
      <path d="M0 145 Q100 125 200 135 Q300 115 400 125 L400 220 L0 220Z" fill="${c.grass}" opacity="0.6"/>
      <path d="M0 175 Q100 158 200 167 Q300 152 400 160 L400 220 L0 220Z" fill="${c.grass}" opacity="0.65"/>
      <!-- 红叶 -->
      ${Array.from({length:20},(_,i)=>`
        <path d="M${18+i*19} ${120+i%5*15} L${23+i*19} ${115+i%5*15} L${28+i*19} ${120+i%5*15} L${23+i*19} ${125+i%5*15}Z" fill="${c.accent}" opacity="${0.6+i%5*0.08}" transform="rotate(${i*43},${23+i*19},${120+i%5*15})"/>
      `).join('')}
      <!-- 远雁 -->
      <path d="M80 90 Q95 84 110 88 Q95 86 80 90Z" fill="${c.grass}"/><circle cx="78" cy="88" r="2.5" fill="${c.grass}"/>
      <path d="M120 80 Q135 74 150 78 Q135 76 120 80Z" fill="${c.grass}"/><circle cx="118" cy="78" r="2.5" fill="${c.grass}"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">秋山红叶</text>
    `}
  ],
  '处暑': [
    { label: '残荷听雨', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 水面 -->
      <path d="M0 155 Q200 143 400 150 L400 220 L0 220Z" fill="${c.water}" opacity="0.5"/>
      <!-- 残荷 -->
      <ellipse cx="130" cy="175" rx="22" ry="11" fill="${c.grass}" opacity="0.7"/>
      <path d="M130 164 L128 150" stroke="${c.grass}" stroke-width="2" opacity="0.7"/>
      <ellipse cx="280" cy="180" rx="20" ry="10" fill="${c.grass}" opacity="0.65"/>
      <path d="M280 170 L278 158" stroke="${c.grass}" stroke-width="2" opacity="0.6"/>
      <!-- 雨 -->
      ${particles('rain', c)}
      <!-- 涟漪 -->
      <ellipse cx="200" cy="165" rx="30" ry="8" fill="none" stroke="#90caf9" stroke-width="1" opacity="0.6"/>
      <ellipse cx="200" cy="165" rx="20" ry="5" fill="none" stroke="#90caf9" stroke-width="1" opacity="0.4"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">残荷听雨</text>
    `},
    { label: '秋云淡淡', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 秋云 -->
      <ellipse cx="150" cy="80" rx="120" ry="50" fill="${c.sky[1]}" opacity="0.55"/>
      <ellipse cx="100" cy="100" rx="80" ry="35" fill="${c.sky[1]}" opacity="0.45"/>
      <ellipse cx="280" cy="90" rx="100" ry="42" fill="${c.sky[1]}" opacity="0.5"/>
      <!-- 远山 -->
      <path d="M0 160 Q200 140 400 152 L400 220 L0 220Z" fill="${c.grass}" opacity="0.4"/>
      <!-- 秋草 -->
      <path d="M0 185 Q100 172 200 180 Q300 168 400 176 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      ${Array.from({length:10},(_,i)=>`
        <path d="M${20+i*38} 220 Q${23+i*38} ${202-i%2*8} ${20+i*38} ${210-i%2*8}" stroke="${c.grass}" stroke-width="2" fill="none" stroke-linecap="round" opacity="${0.5+i%3*0.12}"/>
      `).join('')}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">秋云淡淡</text>
    `}
  ],
  '白露': [
    { label: '蒹葭苍苍', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 晨雾 -->
      <ellipse cx="200" cy="130" rx="200" ry="60" fill="${c.sky[1]}" opacity="0.4"/>
      <!-- 蒹葭 -->
      ${Array.from({length:12},(_,i)=>`
        <path d="M${20+i*32} 220 Q${23+i*32} ${195-i%2*12} ${20+i*32} ${205-i%2*12}" stroke="${c.grass}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="${0.55+i%3*0.12}"/>
        <path d="M${20+i*32} ${205-i%2*12} Q${25+i*32} ${193-i%2*12} ${20+i*32} ${200-i%2*12}" stroke="${c.grass}" stroke-width="1.5" fill="none" opacity="${0.4+i%3*0.1}"/>
      `).join('')}
      <!-- 露珠草叶 -->
      ${Array.from({length:15},(_,i)=>`
        <circle cx="${15+i*26}" cy="${185+i%4*10}" r="${2.5+i%3*1}" fill="#e3f2fd" opacity="${0.5+i%4*0.1}"/>
        <circle cx="${15+i*26}" cy="${185+i%4*10}" r="${1.2+i%2*0.7}" fill="#fff" opacity="${0.7+i%3*0.08}"/>
      `).join('')}
      <!-- 露珠 -->
      ${Array.from({length:8},(_,i)=>`
        <circle cx="${30+i*48}" cy="${160+i%3*12}" r="${3+i%2*1.5}" fill="#e3f2fd" opacity="${0.5+i%3*0.12}"/>
        <circle cx="${30+i*48}" cy="${160+i%3*12}" r="${1.5+i%2*0.8}" fill="#fff" opacity="${0.7+i%3*0.08}"/>
      `).join('')}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">蒹葭苍苍</text>
    `},
    { label: '白露为霜', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 草地 -->
      <path d="M0 175 Q100 162 200 170 Q300 158 400 165 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <!-- 霜花 -->
      ${Array.from({length:25},(_,i)=>`
        <circle cx="${15+i*16}" cy="${165+i%4*10}" r="${1.5+i%3*0.8}" fill="#e3f2fd" opacity="${0.35+i%5*0.1}"/>
      `).join('')}
      <!-- 芦苇 -->
      ${Array.from({length:8},(_,i)=>`
        <path d="M${30+i*48} 220 Q${33+i*48} ${195-i%2*10} ${30+i*48} ${205-i%2*10}" stroke="${c.grass}" stroke-width="2" fill="none" stroke-linecap="round" opacity="${0.6+i%2*0.15}"/>
        <ellipse cx="${31+i*48}" cy="${205-i%2*10}" rx="4" ry="10" fill="${c.grass}" opacity="${0.55+i%2*0.12}" transform="rotate(-5,${31+i*48},${205-i%2*10})"/>
      `).join('')}
      <!-- 晨曦 -->
      <ellipse cx="200" cy="100" rx="180" ry="50" fill="${c.sun}" opacity="0.12"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">白露为霜</text>
    `}
  ],
  '秋分': [
    { label: '秋分昼夜', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 秋山 -->
      <path d="M0 145 Q100 125 200 135 Q300 118 400 128 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <!-- 秋分太阳 -->
      <circle cx="200" cy="100" r="55" fill="${c.sun}" opacity="0.85"/>
      <circle cx="200" cy="100" r="42" fill="#ffe082" opacity="0.8"/>
      <circle cx="200" cy="100" r="28" fill="#fff9c4" opacity="0.75"/>
      <!-- 昼夜分割 -->
      <line x1="200" y1="45" x2="200" y2="155" stroke="#fff" stroke-width="2" opacity="0.5" stroke-dasharray="5,4"/>
      <line x1="145" y1="100" x2="255" y2="100" stroke="#fff" stroke-width="2" opacity="0.5" stroke-dasharray="5,4"/>
      <!-- 红叶 -->
      ${Array.from({length:10},(_,i)=>`
        <ellipse cx="${30+i*38}" cy="${160+i%3*12}" rx="5" ry="3" fill="${c.accent}" opacity="${0.6+i%4*0.08}" transform="rotate(${i*41},${30+i*38},${160+i%3*12})"/>
      `).join('')}
      <!-- 大雁 -->
      <path d="M80 140 Q95 134 110 138 Q95 136 80 140Z" fill="${c.grass}"/><circle cx="78" cy="138" r="2.5" fill="${c.grass}"/>
      <path d="M120 130 Q135 124 150 128 Q135 126 120 130Z" fill="${c.grass}"/><circle cx="118" cy="128" r="2.5" fill="${c.grass}"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">秋分昼夜</text>
    `},
    { label: '秋收万颗', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 丰收田野 -->
      <path d="M0 160 Q100 145 200 153 Q300 140 400 148 L400 220 L0 220Z" fill="#f9a825" opacity="0.55"/>
      <path d="M0 180 Q100 165 200 173 Q300 160 400 168 L400 220 L0 220Z" fill="#fdd835" opacity="0.6"/>
      <!-- 稻捆 -->
      ${Array.from({length:6},(_,i)=>`
        <ellipse cx="${50+i*60}" cy="${183+i%2*6}" rx="18" ry="25" fill="#f9a825" opacity="${0.8-i%3*0.1}" transform="rotate(-8,${50+i*60},${183+i%2*6})"/>
      `).join('')}
      <!-- 农民 -->
      <path d="M280 220 L280 178" stroke="#8d6e63" stroke-width="2.5"/>
      <circle cx="280" cy="170" r="9" fill="#8d6e63"/>
      <path d="M280 185 L262 200" stroke="#8d6e63" stroke-width="2"/><path d="M280 185 L295 197" stroke="#8d6e63" stroke-width="2"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">秋收万颗</text>
    `}
  ],
  '寒露': [
    { label: '寒露登高', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 寒山 -->
      <path d="M0 145 Q100 125 200 135 Q300 115 400 125 L400 220 L0 220Z" fill="${c.grass}" opacity="0.6"/>
      <!-- 枫林 -->
      ${Array.from({length:16},(_,i)=>`
        <path d="M${15+i*24} ${175+i%4*8} L${20+i*24} ${165+i%4*8} L${25+i*24} ${175+i%4*8} L${20+i*24} ${185+i%4*8}Z" fill="${c.accent}" opacity="${0.6+i%4*0.1}" transform="rotate(${i*43},${20+i*24},${175+i%4*8})"/>
      `).join('')}
      <!-- 登山人 -->
      <path d="M320 220 Q315 200 325 185" stroke="#6d4c41" stroke-width="2.5"/>
      <circle cx="325" cy="180" r="8" fill="#6d4c41"/>
      <path d="M325 188 L340 200" stroke="#6d4c41" stroke-width="2"/>
      <!-- 秋雁 -->
      <path d="M80 90 Q95 84 110 88 Q95 86 80 90Z" fill="${c.grass}"/><circle cx="78" cy="88" r="2.5" fill="${c.grass}"/>
      <path d="M120 75 Q135 69 150 73 Q135 71 120 75Z" fill="${c.grass}"/><circle cx="118" cy="73" r="2.5" fill="${c.grass}"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">寒露登高</text>
    `},
    { label: '秋菊黄华', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 草地 -->
      <path d="M0 180 Q100 168 200 175 Q300 163 400 170 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <!-- 菊花 -->
      ${Array.from({length:6},(_,i)=>`
        <circle cx="${50+i*55}" cy="${162+i%2*18}" r="${10+i%2*4}" fill="${c.sun}" opacity="${0.8+i%3*0.07}"/>
        <circle cx="${50+i*55}" cy="${162+i%2*18}" r="${5+i%2*2}" fill="${c.accent}" opacity="${0.9}"/>
        ${Array.from({length:8},(_,j)=>`
          <circle cx="${50+i*55+9*Math.cos(j*45*Math.PI/180)}" cy="${162+i%2*18+9*Math.sin(j*45*Math.PI/180)}" r="3" fill="${c.sun}" opacity="${0.6+j%2*0.15}" transform="rotate(${j*45},${50+i*55},${162+i%2*18})"/>
        `).join('')}
      `).join('')}
      <!-- 花瓣飘落 -->
      ${particles('leaves', c)}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">秋菊黄华</text>
    `}
  ],
  '霜降': [
    { label: '霜降水返壑', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 秋山 -->
      <path d="M0 145 Q100 125 200 135 Q300 118 400 128 L400 220 L0 220Z" fill="${c.grass}" opacity="0.55"/>
      <!-- 霜白地面 -->
      <path d="M0 180 Q100 168 200 175 Q300 163 400 170 L400 220 L0 220Z" fill="${c.sky[2]}" opacity="0.4/>">
      <!-- 霜花 -->
      ${Array.from({length:20},(_,i)=>`
        <circle cx="${15+i*19}" cy="${170+i%4*10}" r="${1.5+i%3*0.8}" fill="#e3f2fd" opacity="${0.3+i%4*0.12}"/>
      `).join('')}
      <!-- 枫叶上的霜 -->
      ${Array.from({length:8},(_,i)=>`
        <ellipse cx="${40+i*48}" cy="${178+i%2*12}" rx="6" ry="3.5" fill="${c.accent}" opacity="${0.6+i%4*0.08}" transform="rotate(${i*37},${40+i*48},${178+i%2*12})"/>
        <ellipse cx="${40+i*48}" cy="${178+i%2*12}" rx="${4+i%2*1.5}" ry="2" fill="#fff" opacity="${0.35+i%3*0.1}"/>
      `).join('')}
      <!-- 柿子 -->
      <path d="M280 220 Q275 188 295 162 Q315 136 300 115" stroke="#5d4037" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="286" cy="123" r="10" fill="#ff8f00" opacity="0.95"/>
      <circle cx="300" cy="112" r="9" fill="#ffa000" opacity="0.95"/>
      <circle cx="312" cy="103" r="8" fill="#ff8f00" opacity="0.9"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">霜降水返壑</text>
    `},
    { label: '风霜叶红', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 秋山红叶 -->
      <path d="M0 140 Q100 120 200 130 Q300 110 400 120 L400 220 L0 220Z" fill="${c.grass}" opacity="0.6"/>
      <!-- 红叶 -->
      ${Array.from({length:22},(_,i)=>`
        <path d="M${12+i*18} ${115+i%5*15} L${17+i*18} ${110+i%5*15} L${22+i*18} ${115+i%5*15} L${17+i*18} ${120+i%5*15}Z" fill="${c.accent}" opacity="${0.55+i%5*0.08}" transform="rotate(${i*47},${17+i*18},${115+i%5*15})"/>
      `).join('')}
      <!-- 落叶 -->
      ${particles('leaves', c)}
      <!-- 秋雁 -->
      <path d="M100 80 Q115 74 130 78 Q115 76 100 80Z" fill="${c.grass}"/><circle cx="98" cy="78" r="2.5" fill="${c.grass}"/>
      <path d="M160 65 Q175 59 190 63 Q175 61 160 65Z" fill="${c.grass}"/><circle cx="158" cy="63" r="2.5" fill="${c.grass}"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">风霜叶红</text>
    `}
  ],
  '立冬': [
    { label: '初冬初雪', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 冬山 -->
      <path d="M0 145 Q100 125 200 135 Q300 118 400 128 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <!-- 初雪 -->
      <path d="M0 175 Q100 162 200 170 Q300 158 400 165 L400 220 L0 220Z" fill="${c.sky[2]}" opacity="0.4/>">
      <!-- 飘雪 -->
      ${particles('snow', c)}
      <!-- 冬树 -->
      <path d="M300 220 L300 155" stroke="#6d4c41" stroke-width="5" stroke-linecap="round"/>
      <path d="M300 180 Q280 155 255 162" stroke="#6d4c41" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M300 165 Q325 142 350 150" stroke="#6d4c41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- 积雪 -->
      <ellipse cx="300" cy="162" rx="30" ry="6" fill="#fff" opacity="0.7"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">初冬初雪</text>
    `},
    { label: '萝卜冬藏', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 冬菜园 -->
      <path d="M0 180 Q100 168 200 175 Q300 163 400 170 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <!-- 白萝卜 -->
      <ellipse cx="120" cy="195" rx="20" ry="12" fill="#f48fb1" opacity="0.95"/>
      <ellipse cx="120" cy="188" rx="16" ry="8" fill="#f8bbd0" opacity="0.8"/>
      <path d="M120 182 L120 168" stroke="#66bb6a" stroke-width="3"/>
      <path d="M116 172 Q120 168 124 172" stroke="#4caf50" stroke-width="2" fill="none"/>
      <ellipse cx="200" cy="198" rx="18" ry="11" fill="#f48fb1" opacity="0.9"/>
      <ellipse cx="200" cy="192" rx="14" ry="7" fill="#f8bbd0" opacity="0.75"/>
      <path d="M200 186 L200 174" stroke="#66bb6a" stroke-width="2.5"/>
      <!-- 冬雪 -->
      ${particles('snow', c)}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">萝卜冬藏</text>
    `}
  ],
  '小雪': [
    { label: '小雪封地', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 雪山 -->
      <path d="M0 140 Q100 120 200 130 Q300 112 400 122 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <!-- 积雪 -->
      <path d="M0 175 Q100 162 200 170 Q300 158 400 165 L400 220 L0 220Z" fill="${c.sky[2]}" opacity="0.5/>">
      <!-- 飘雪 -->
      ${particles('snow', c)}
      ${particles('snow', c)}
      <!-- 窗户灯光 -->
      <rect x="130" y="160" width="70" height="55" fill="#ffe082" opacity="0.9" rx="3"/>
      <rect x="138" y="168" width="22" height="18" fill="#fff9c4" opacity="0.6" rx="1"/>
      <rect x="168" y="168" width="22" height="18" fill="#fff9c4" opacity="0.6" rx="1"/>
      <rect x="138" y="194" width="22" height="16" fill="#fff9c4" opacity="0.5" rx="1"/>
      <rect x="168" y="194" width="22" height="16" fill="#fff9c4" opacity="0.5" rx="1"/>
      <!-- 积雪屋檐 -->
      <path d="M125 160 L205 160" stroke="#fff" stroke-width="5" opacity="0.7"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">小雪封地</text>
    `},
    { label: '雪夜煮茶', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 室内暖光 -->
      <rect x="80" y="80" width="240" height="140" fill="#ffe082" opacity="0.15" rx="5"/>
      <!-- 红炉 -->
      <ellipse cx="200" cy="170" rx="55" ry="28" fill="#5d4037" opacity="0.95"/>
      <ellipse cx="200" cy="163" rx="44" ry="20" fill="#ff5722" opacity="0.85"/>
      <ellipse cx="200" cy="159" rx="28" ry="12" fill="#ff9800" opacity="0.9"/>
      <ellipse cx="200" cy="157" rx="18" ry="7" fill="#ffc107" opacity="0.95"/>
      <!-- 茶壶 -->
      <ellipse cx="200" cy="138" rx="20" ry="28" fill="#8d6e63" opacity="0.9"/>
      <ellipse cx="200" cy="116" rx="13" ry="8" fill="#a1887f" opacity="0.8"/>
      <path d="M217 125 Q228 120 233 128" stroke="#6d4c41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- 热气 -->
      <path d="M192 108 Q195 96 192 84" stroke="#bdbdbd" stroke-width="1.5" fill="none" opacity="0.5"/>
      <path d="M200 105 Q203 92 200 79" stroke="#bdbdbd" stroke-width="1.5" fill="none" opacity="0.45"/>
      <path d="M208 108 Q211 96 208 84" stroke="#bdbdbd" stroke-width="1.5" fill="none" opacity="0.4"/>
      <!-- 窗外飘雪 -->
      ${particles('snow', c)}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">雪夜煮茶</text>
    `}
  ],
  '大雪': [
    { label: '大雪漫天', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 雪山 -->
      <path d="M0 135 Q100 112 200 122 Q300 102 400 112 L400 220 L0 220Z" fill="${c.grass}" opacity="0.6"/>
      <!-- 雪峰 -->
      <path d="M180 102 L200 65 L220 102Z" fill="#fff" opacity="0.95"/>
      <path d="M300 112 L320 78 L340 112Z" fill="#fff" opacity="0.9"/>
      <!-- 大雪 -->
      ${particles('snow', c)}
      ${particles('snow', c)}
      ${particles('snow', c)}
      <!-- 积雪 -->
      <path d="M0 185 Q100 172 200 180 Q300 168 400 175 L400 220 L0 220Z" fill="${c.sky[2]}" opacity="0.5/>">
      <!-- 踏雪 -->
      <ellipse cx="100" cy="198" rx="10" ry="5" fill="${c.grass}" opacity="0.45"/>
      <ellipse cx="128" cy="202" rx="10" ry="5" fill="${c.grass}" opacity="0.4"/>
      <ellipse cx="158" cy="200" rx="9" ry="4.5" fill="${c.grass}" opacity="0.38"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">大雪漫天</text>
    `},
    { label: '瑞雪丰年', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 雪中村落 -->
      <!-- 雪人 -->
      <ellipse cx="300" cy="195" rx="28" ry="22" fill="#fff" opacity="0.95"/>
      <circle cx="300" cy="165" r="20" fill="#fff" opacity="0.95"/>
      <circle cx="300" cy="150" r="14" fill="#fff" opacity="0.95"/>
      <circle cx="293" cy="146" r="2.5" fill="#37474f"/><circle cx="307" cy="146" r="2.5" fill="#37474f"/>
      <ellipse cx="300" cy="153" rx="3" ry="2" fill="#ff8f00"/>
      <path d="M290 158 Q300 165 310 158" stroke="#f44336" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M310 158 L320 168" stroke="#f44336" stroke-width="3" fill="none" stroke-linecap="round"/>
      <!-- 冬树 -->
      <path d="M80 220 L80 145" stroke="#6d4c41" stroke-width="5" stroke-linecap="round"/>
      <path d="M80 170 Q60 148 38 155" stroke="#6d4c41" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M80 158 Q100 138 122 145" stroke="#6d4c41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- 梅花 -->
      <circle cx="55" cy="138" r="5" fill="#f48fb1"/><circle cx="70" cy="128" r="4.5" fill="#f8bbd0"/>
      <circle cx="38" cy="148" r="4" fill="#f48fb1"/>
      <!-- 大雪 -->
      ${particles('snow', c)}
      ${particles('snow', c)}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">瑞雪丰年</text>
    `}
  ],
  '冬至': [
    { label: '冬至阳生', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[1]}" rx="10"/>
      <!-- 冬山 -->
      <path d="M0 140 Q100 120 200 130 Q300 112 400 122 L400 220 L0 220Z" fill="${c.grass}" opacity="0.5"/>
      <!-- 冬至暖阳 -->
      <circle cx="200" cy="90" r="50" fill="${c.sun}" opacity="0.7"/>
      <circle cx="200" cy="90" r="38" fill="#ffe082" opacity="0.65"/>
      <circle cx="200" cy="90" r="25" fill="#fff9c4" opacity="0.6"/>
      ${Array.from({length:12},(_,i)=>`
        <line x1="${200+55*Math.cos(i*30*Math.PI/180)}" y1="${90+55*Math.sin(i*30*Math.PI/180)}" x2="${200+75*Math.cos(i*30*Math.PI/180)}" y2="${90+75*Math.sin(i*30*Math.PI/180)}" stroke="#ffe082" stroke-width="1.5" opacity="0.3"/>
      `).join('')}
      <!-- 积雪 -->
      <path d="M0 180 Q100 168 200 175 Q300 163 400 170 L400 220 L0 220Z" fill="${c.sky[2]}" opacity="0.4/>">
      <!-- 雪中梅花 -->
      <path d="M80 220 Q72 175 98 145 Q124 115 105 85" stroke="#6d4c41" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <circle cx="95" cy="93" r="5.5" fill="#f48fb1"/><circle cx="112" cy="78" r="5" fill="#f8bbd0"/>
      <circle cx="130" cy="65" r="4.5" fill="#f48fb1"/><circle cx="102" cy="108" r="5" fill="#f8bbd0"/>
      <!-- 飘雪 -->
      ${particles('snow', c)}
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">冬至阳生</text>
    `},
    { label: '汤圆暖心', scene: (c) => `
      <rect width="400" height="220" fill="${c.sky[0]}" rx="10"/>
      <!-- 碗 -->
      <ellipse cx="200" cy="165" rx="80" ry="30" fill="#8d6e63" opacity="0.95"/>
      <ellipse cx="200" cy="158" rx="72" ry="25" fill="#a1887f" opacity="0.9"/>
      <!-- 汤圆 -->
      <ellipse cx="170" cy="155" rx="16" ry="13" fill="#fff" opacity="0.95"/>
      <ellipse cx="200" cy="152" rx="15" ry="12" fill="#fff" opacity="0.95"/>
      <ellipse cx="230" cy="155" rx="14" ry="11" fill="#fff" opacity="0.95"/>
      <ellipse cx="185" cy="158" rx="12" ry="9" fill="#f48fb1" opacity="0.85"/>
      <ellipse cx="215" cy="157" rx="11" ry="8" fill="#81c784" opacity="0.85"/>
      <ellipse cx="200" cy="153" rx="10" ry="7" fill="#fdd835" opacity="0.85"/>
      <!-- 汤圆热气 -->
      <path d="M168 135 Q172 122 168 109" stroke="#bdbdbd" stroke-width="1.8" fill="none" opacity="0.5"/>
      <path d="M185 132 Q189 118 185 105" stroke="#bdbdbd" stroke-width="1.8" fill="none" opacity="0.45"/>
      <path d="M200 130 Q204 116 200 103" stroke="#bdbdbd" stroke-width="1.8" fill="none" opacity="0.4"/>
      <path d="M215 132 Q219 118 215 105" stroke="#bdbdbd" stroke-width="1.8" fill="none" opacity="0.45"/>
      <!-- 勺子 -->
      <ellipse cx="290" cy="148" rx="12" ry="8" fill="#a1887f" opacity="0.9"/>
      <path d="M300 148 Q315 145 320 155" stroke="#8d6e63" stroke-width="3" fill="none" stroke-linecap="round"/>
      <rect x="10" y="10" width="100" height="26" fill="#fff" opacity="0.7" rx="5"/>
      <text x="60" y="27" text-anchor="middle" font-size="13" fill="${c.text}" font-family="'Noto Serif SC', serif" font-weight="bold">汤圆暖心</text>
    `}
  ]
};

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const illCount = {};
  for (const term of SOLAR_TERMS) {
    const idx = SOLAR_TERMS.indexOf(term) + 1;
    const termIlls = ILLUSTRATIONS[term.name] || [];
    const c = SEASON_COLORS[term.season];

    for (let j = 0; j < termIlls.length; j++) {
      const ill = termIlls[j];
      const illFile = `solar-term-${String(idx).padStart(2,'0')}-${String(j+1).padStart(2,'0')}.svg`;
      const sceneSVG = ill.scene(c);

      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="220" viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
${sceneSVG}
</svg>`;

      fs.writeFileSync(path.join(OUT_DIR, illFile), svg, 'utf8');
      const n = (illCount[term.name] || 0) + 1;
      illCount[term.name] = n;
    }
    console.log(`[ok] ${term.name} — ${termIlls.length}张插图`);
  }

  let total = Object.values(illCount).reduce((a, b) => a + b, 0);
  console.log(`\n共 ${total} 张插图 -> ${OUT_DIR}`);
}

main().catch(e => console.error(e));
