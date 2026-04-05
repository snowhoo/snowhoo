/**
 * 二十四节气数据
 * 每个节气包含：名称、拼音、日期（阳历）、描述、习俗、诗词
 */

const SOLAR_TERMS = [
  {
    name: '立春',
    pinyin: 'Lìchūn',
    month: 2, day: 3,
    season: 'spring',
    desc: '立春是二十四节气之首，意味着新的一个轮回已开启，万物起始、一切更生。',
    customs: ['咬春（吃春饼、春卷）', '迎春', '打春牛', '贴春帖'],
    poem: '春风如贵客，一到便繁华。',
    keywords: ['新生', '希望', '耕耘', '播种']
  },
  {
    name: '雨水',
    pinyin: 'Yǔshuǐ',
    month: 2, day: 18,
    season: 'spring',
    desc: '雨水节气标示着降雨开始，雨量渐增。俗话说"春雨贵如油"，适宜的降水对农作物生长至关重要。',
    customs: ['回娘屋', '拉保保（认干爹）', '接寿'],
    poem: '好雨知时节，当春乃发生。',
    keywords: ['滋润', '生长', '祈福', '回春']
  },
  {
    name: '惊蛰',
    pinyin: 'Jīngzhé',
    month: 3, day: 5,
    season: 'spring',
    desc: '惊蛰时节，春雷始鸣，惊醒了蛰伏于地下冬眠的昆虫，象征着仲春的开始。',
    customs: ['祭白虎', '打小人', '吃梨', '蒙鼓皮'],
    poem: '微雨众卉新，一雷惊蛰始。',
    keywords: ['惊醒', '萌动', '奋发', '春雷']
  },
  {
    name: '春分',
    pinyin: 'Chūnfēn',
    month: 3, day: 20,
    season: 'spring',
    desc: '春分这天，太阳直射赤道，昼夜几乎相等。春分后，气候温和，雨水充沛，阳光明媚。',
    customs: ['竖蛋', '放风筝', '吃春菜', '送春牛'],
    poem: '春分雨脚落声微，柳岸斜风带客归。',
    keywords: ['平衡', '昼夜平分', '踏青', '春暖']
  },
  {
    name: '清明',
    pinyin: 'Qīngmíng',
    month: 4, day: 5,
    season: 'spring',
    desc: '清明节是中国传统节日，也是二十四节气之一。清明时节，春暖花开，天朗气清，适合踏青游春。',
    customs: ['扫墓祭祖', '踏青', '插柳', '放风筝', '吃青团'],
    poem: '清明时节雨纷纷，路上行人欲断魂。',
    keywords: ['追思', '踏青', '新生', '春意盎然']
  },
  {
    name: '谷雨',
    pinyin: 'Gǔyǔ',
    month: 4, day: 19,
    season: 'spring',
    desc: '谷雨是春季最后一个节气，有"雨生百谷"之说，标志着寒潮天气基本结束，气温回升加快。',
    customs: ['喝谷雨茶', '吃香椿', '祭海', '禁五毒'],
    poem: '谷雨如丝复似尘，煮瓶浮蜡正尝新。',
    keywords: ['播种', '谷物', '雨润', '春末']
  },
  {
    name: '立夏',
    pinyin: 'Lìxià',
    month: 5, day: 5,
    season: 'summer',
    desc: '立夏是夏季的第一个节气，表示盛夏时节的正式开始。万物至此皆长大，故名立夏。',
    customs: ['斗蛋', '称人', '尝三新', '吃立夏饭'],
    poem: '四月清和雨乍晴，南山当户转分明。',
    keywords: ['炎暑', '繁茂', '生长', '夏始']
  },
  {
    name: '小满',
    pinyin: 'Xiǎomǎn',
    month: 5, day: 20,
    season: 'summer',
    desc: '小满节气的名称来自作物小麦的饱满程度。小满不满，芒种不管，反映了农耕文化对自然的观察。',
    customs: ['祭车神', '抢水', '吃苦菜', '动三车'],
    poem: '小满动三车，忙得不知他。',
    keywords: ['饱满', '蓄水', '灌溉', '麦熟']
  },
  {
    name: '芒种',
    pinyin: 'Mángzhòng',
    month: 6, day: 5,
    season: 'summer',
    desc: '芒种时节，气温显著升高，雨量充沛，是南方种稻与北方收麦之时，农家最忙的季节。',
    customs: ['送花神', '煮梅', '开犁节', '打泥巴仗'],
    poem: '时雨及芒种，四野皆插秧。',
    keywords: ['收获', '播种', '农忙', '仲夏']
  },
  {
    name: '夏至',
    pinyin: 'Xiàzhì',
    month: 6, day: 21,
    season: 'summer',
    desc: '夏至是一年中白天最长的一天，太阳直射北回归线。此后白天渐短，但暑气渐盛。',
    customs: ['吃面条', '吃馄饨', '消夏避伏', '祭土地'],
    poem: '昼晷已云极，宵漏自此长。',
    keywords: ['极阳', '最长日', '消暑', '夏浓']
  },
  {
    name: '小暑',
    pinyin: 'Xiǎoshǔ',
    month: 7, day: 6,
    season: 'summer',
    desc: '小暑虽不是一年中最热的时刻，但已能感受到暑气的逼近，江淮流域进入"梅雨"季节。',
    customs: ['食新米', '晒书画', '吃藕', '喝消暑汤'],
    poem: '倏忽温风至，因循小暑来。',
    keywords: ['暑热', '伏天', '温风', '蝉鸣']
  },
  {
    name: '大暑',
    pinyin: 'Dàshǔ',
    month: 7, day: 22,
    season: 'summer',
    desc: '大暑是一年中最热的节气，正值中伏前后。高温酷热，需注意防暑降温。',
    customs: ['喝伏茶', '烧伏香', '吃仙草', '送大暑船'],
    poem: '大暑三秋近，林钟九夏移。',
    keywords: ['酷热', '中伏', '消暑', '夏末']
  },
  {
    name: '立秋',
    pinyin: 'Lìqiū',
    month: 8, day: 7,
    season: 'autumn',
    desc: '立秋是秋季的开始，阳气渐收、阴气渐长，万物从繁茂成长趋向萧索成熟。',
    customs: ['啃秋（吃西瓜）', '贴秋膘', '晒秋', '摸秋'],
    poem: '乳鸦啼散玉屏空，一枕新凉一扇风。',
    keywords: ['收获', '秋凉', '落叶', '金秋']
  },
  {
    name: '处暑',
    pinyin: 'Chǔshǔ',
    month: 8, day: 23,
    season: 'autumn',
    desc: '处暑即"出暑"，表示炎热的天气到了尾声。处暑无三日，新凉直万金。',
    customs: ['出游迎秋', '开渔节', '煎药茶', '吃鸭子'],
    poem: '处暑无三日，新凉直万金。',
    keywords: ['出暑', '秋凉', '收获', '金风']
  },
  {
    name: '白露',
    pinyin: 'Báilù',
    month: 9, day: 7,
    season: 'autumn',
    desc: '白露时节，清晨时分会在草木上看到凝结的白色露水，故名"白露"，天气开始转凉。',
    customs: ['收清露', '酿米酒', '吃龙眼', '啜米汤'],
    poem: '蒹葭苍苍，白露为霜。',
    keywords: ['露水', '秋凉', '凝露', '仲秋']
  },
  {
    name: '秋分',
    pinyin: 'Qiūfēn',
    month: 9, day: 23,
    season: 'autumn',
    desc: '秋分与春分一样，昼夜平分。秋分之后，北半球昼短夜长，秋意渐浓。',
    customs: ['竖蛋', '送秋牛', '吃秋菜', '拜月'],
    poem: '金气秋分，风清露冷秋期半。',
    keywords: ['金秋', '昼夜平分', '丰收', '秋深']
  },
  {
    name: '寒露',
    pinyin: 'Hánlù',
    month: 10, day: 8,
    season: 'autumn',
    desc: '寒露是气候从凉爽向寒冷过渡的节气，露水更冷，快要凝结成霜，故称寒露。',
    customs: ['赏红叶', '饮菊花酒', '吃芝麻', '秋钓'],
    poem: '袅袅凉风动，凄凄寒露零。',
    keywords: ['露寒', '红叶', '深秋', '霜降']
  },
  {
    name: '霜降',
    pinyin: 'Shuāngjiàng',
    month: 10, day: 23,
    season: 'autumn',
    desc: '霜降是秋季最后一个节气，冷空气南下，初霜出现，预示着冬天即将来临。',
    customs: ['赏菊', '吃柿子', '送芋鬼', '登高'],
    poem: '霜降水返壑，风落木归山。',
    keywords: ['初霜', '秋末', '赏菊', '冬临']
  },
  {
    name: '立冬',
    pinyin: 'Lìdōng',
    month: 11, day: 7,
    season: 'winter',
    desc: '立冬是冬季的开始，万物收藏，规避寒冷。民间有"立冬补冬"的说法。',
    customs: ['补冬', '吃饺子', '吃赤豆糯米饭', '祭祖'],
    poem: '冻笔新诗懒写，寒炉美酒时温。',
    keywords: ['收藏', '冬始', '寒风', '养藏']
  },
  {
    name: '小雪',
    pinyin: 'Xiǎoxuě',
    month: 11, day: 22,
    season: 'winter',
    desc: '小雪节气，气温下降，但降雪量还不大，故称小雪。天气将冷但未到极寒。',
    customs: ['腌腊肉', '吃糍粑', '晒鱼干', '储存冬菜'],
    poem: '小雪已晴芦叶暗，长波乍急鹤声嘶。',
    keywords: ['初雪', '腌制', '寒风', '冬意']
  },
  {
    name: '大雪',
    pinyin: 'Dàxuě',
    month: 12, day: 7,
    season: 'winter',
    desc: '大雪节气，降雪量增多，雪深雪厚，万里雪飘，仲冬正式开始。',
    customs: ['喝红薯粥', '进补', '观赏封河', '滑冰'],
    poem: '燕山雪花大如席，片片吹落轩辕台。',
    keywords: ['大雪', '隆冬', '冰封', '寒梅']
  },
  {
    name: '冬至',
    pinyin: 'Dōngzhì',
    month: 12, day: 21,
    season: 'winter',
    desc: '冬至是北半球一年中白天最短、黑夜最长的一天，有"冬至大如年"之说。',
    customs: ['吃饺子', '吃汤圆', '祭祖', '数九'],
    poem: '天时人事日相催，冬至阳生春又来。',
    keywords: ['至阴', '最短日', '数九', '岁末']
  },
  {
    name: '小寒',
    pinyin: 'Xiǎohán',
    month: 1, day: 5,
    season: 'winter',
    desc: '小寒节气标志着开始进入一年中最冷的日子，但还未到极寒，此时要注意保暖防寒。',
    customs: ['吃菜饭', '吃糯米饭', '冰戏', '腊八粥'],
    poem: '小寒连大吕，欢鹊垒新巢。',
    keywords: ['严寒', '冰冻', '保暖', '三九']
  },
  {
    name: '大寒',
    pinyin: 'Dàhán',
    month: 1, day: 20,
    season: 'winter',
    desc: '大寒是二十四节气中最冷的节气，正值三九四九，民间有"大寒迎年"的说法。',
    customs: ['除旧布新', '制作腊味', '尾牙祭', '赶大集'],
    poem: '大寒须守火，无事莫出门。',
    keywords: ['极寒', '冰天', '岁末', '守岁']
  }
];

module.exports = { SOLAR_TERMS };
