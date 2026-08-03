/**
 * 修炼任务基础配置（仅保留元数据，不再决定经验和次数）
 * 修改或扩充任务只需编辑此文件：
 *   key       — 编程键名（唯一标识，用作元素 ID 后缀）
 *   name      — 简短展示名（按钮上显示）
 *   taskName  — 完整任务名（菜单中显示）
 *   color     — 菜单圆点颜色
 *
 * 注：points / max 已废弃，统一由 LEVEL_CONFIG 按境界决定：
 *   - 单次经验值 → LEVEL_CONFIG[level].points[key]
 *   - 每日最大次数 → LEVEL_CONFIG[level].times[key]
 */
var GAME_CONFIG = [
  { key:'poetry',        name:'诗词', taskName:'吟诗作对', color:'#f43f5e' },
  { key:'history',       name:'今日', taskName:'上古传承', color:'#8b5cf6' },
  { key:'constellation', name:'星座', taskName:'夜观星象', color:'#f59e0b' },
  { key:'explore',       name:'探索', taskName:'秘境探寻', color:'#06b6d4' }
];

/**
 * 境界等级配置表
 * index = level（0=凡人, 29=化神大圆满）
 * 每档包含：
 *   name   — 境界名（界面显示）
 *   times  — 每日各任务可完成次数 max（poetry/history/constellation/explore）
 *   points — 各任务每完成一次获得的经验（真气）值
 *   cost   — 从上一境界手动升级到本境界所需真气（凡人=0，最高境界无需升级）
 *
 * 注意：points / cost 已按原始表格 ×10（用户确认表中数值漏乘 10）
 */
var LEVEL_CONFIG = [
  { name:'凡人',         times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:100, history:50,   constellation:30,  explore:0 },  cost:0    },
  { name:'练气一层',     times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:100, history:50,  constellation:30,  explore:10 }, cost:180  },
  { name:'练气二层',     times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:110, history:50,  constellation:30,  explore:10 }, cost:190  },
  { name:'练气三层',     times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:120, history:50,  constellation:30,  explore:10 }, cost:200  },
  { name:'练气四层',     times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:120, history:50,  constellation:30,  explore:10 }, cost:250  },
  { name:'练气五层',     times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:120, history:70,  constellation:30,  explore:10 }, cost:300  },
  { name:'练气六层',     times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:120, history:90,  constellation:30,  explore:10 }, cost:350  },
  { name:'练气七层',     times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:120, history:90,  constellation:40,  explore:10 }, cost:400  },
  { name:'练气八层',     times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:120, history:90,  constellation:50,  explore:10 }, cost:450  },
  { name:'练气九层',     times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:120, history:90,  constellation:60,  explore:10 }, cost:500  },
  { name:'练气十层',     times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:120, history:90,  constellation:60,  explore:20 }, cost:600  },
  { name:'练气十一层',   times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:120, history:90,  constellation:60,  explore:30 }, cost:700  },
  { name:'练气十二层',   times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:120, history:90,  constellation:60,  explore:40 }, cost:800  },
  { name:'练气大圆满',   times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:120, history:90,  constellation:60,  explore:50 }, cost:900  },
  { name:'筑基初期',     times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:130, history:90,  constellation:70,  explore:60 }, cost:1000 },
  { name:'筑基中期',     times:{poetry:1, history:1, constellation:1, explore:2}, points:{poetry:140, history:100, constellation:70,  explore:60 }, cost:1200 },
  { name:'筑基后期',     times:{poetry:1, history:1, constellation:1, explore:2}, points:{poetry:150, history:110, constellation:70,  explore:60 }, cost:1400 },
  { name:'筑基大圆满',   times:{poetry:1, history:1, constellation:1, explore:2}, points:{poetry:160, history:110, constellation:70,  explore:60 }, cost:1600 },
  { name:'金丹初期',     times:{poetry:1, history:1, constellation:1, explore:2}, points:{poetry:170, history:120, constellation:80,  explore:70 }, cost:2000 },
  { name:'金丹中期',     times:{poetry:1, history:1, constellation:1, explore:3}, points:{poetry:180, history:130, constellation:90,  explore:70 }, cost:2200 },
  { name:'金丹后期',     times:{poetry:1, history:1, constellation:1, explore:3}, points:{poetry:190, history:140, constellation:100, explore:70 }, cost:2400 },
  { name:'金丹大圆满',   times:{poetry:1, history:1, constellation:1, explore:3}, points:{poetry:200, history:150, constellation:110, explore:70 }, cost:2600 },
  { name:'元婴初期',     times:{poetry:1, history:1, constellation:1, explore:3}, points:{poetry:210, history:160, constellation:120, explore:80 }, cost:3000 },
  { name:'元婴中期',     times:{poetry:1, history:1, constellation:1, explore:4}, points:{poetry:220, history:170, constellation:130, explore:90 }, cost:3400 },
  { name:'元婴后期',     times:{poetry:1, history:1, constellation:1, explore:4}, points:{poetry:230, history:180, constellation:140, explore:100}, cost:3800 },
  { name:'元婴大圆满',   times:{poetry:1, history:1, constellation:1, explore:4}, points:{poetry:240, history:190, constellation:150, explore:110}, cost:4200 },
  { name:'化神初期',     times:{poetry:1, history:1, constellation:1, explore:4}, points:{poetry:260, history:210, constellation:170, explore:130}, cost:5000 },
  { name:'化神中期',     times:{poetry:2, history:2, constellation:2, explore:5}, points:{poetry:280, history:230, constellation:190, explore:150}, cost:6000 },
  { name:'化神后期',     times:{poetry:2, history:2, constellation:2, explore:5}, points:{poetry:300, history:250, constellation:210, explore:170}, cost:7000 },
  { name:'化神大圆满',   times:{poetry:2, history:2, constellation:2, explore:5}, points:{poetry:320, history:270, constellation:230, explore:190}, cost:8000 }
];

/**
 * 功能解锁与发现列表合并配置（原 UNLOCK_CONFIG + DISCOVER_CONFIG）
 * 全部解锁项共用一个 key（英文键），解锁成本、回收比例、发现列表分组统一在此配置：
 *   unlockCost — 解锁成本表（key → 消耗真气；auto/oneKey/almanac/logo/story/yedu/zjsz/news/tv/runner）
 *   relockRate — 回收返还比例（0.8 = 返还解锁成本的 80%）
 *   discover   — 发现列表（打坐人形入口）分组：
 *     cat   — 分类名（术法 / 小世界 / 心法）
 *     items — 各秘藏项：
 *       key       — 与 unlockCost 同名的 key（固魂大法 = runner，即"奔跑的人"）
 *       name      — 秘藏显示名（已解锁显示名称，未解锁显示？？）
 *       unlockMsg — 解锁成功提示文案
 *       relockMsg — 回收真气重新上锁时的操作名
 *
 * 注意：固魂大法（key: runner）即"奔跑的人"——奔跑的人是其解锁窗口（解锁奔跑的人 = 发现固魂大法），
 *   解锁状态以 runnerUnlocked 为准（无独立锁，成本走 runner: 1000）。
 */
var FEATURE_CONFIG = {
  // 解锁成本：消耗真气值一次性解锁对应功能
  //   auto    — "自动"修炼功能（必须先解锁此项，才能解锁"一键"）
  //   oneKey  — "一键"修炼功能（需先解锁"自动"）
  //   almanac — 右上角日期卡片（黄历），解锁后方可缩小/展开
  // 真气不足时不允许解锁。
  unlockCost: {
    auto: 888,
    oneKey: 999,
    almanac: 666,
    logo: 777,
    story: 111,
    yedu: 222,
    zjsz: 333,
    news: 444,
    tv: 555,
    runner: 1000
  },
  relockRate: 0.8,  // 回收返还比例：已解锁秘藏回收时返还解锁成本的比例
  discover: [
    { cat: '术法', items: [
      { key:'logo', name:'隐灵术', unlockMsg:'破除封印！获得【隐灵术】', relockMsg:'收灵破法重修' },
      { key:'almanac', name:'轮回术', unlockMsg:'破除封印！获得【轮回术】', relockMsg:'收灵破法重修' },
      { key:'runner', name:'固魂大法', unlockMsg:'破除封印！获得【固魂大法】', relockMsg:'收灵破法重修' }
    ]},
    { cat: '小世界', items: [
      { key:'story', name:'小红故事', unlockMsg:'破除迷雾结界！发现【红光秘境】', relockMsg:'撤回结界入口破锁真气' },
      { key:'yedu', name:'夜读', unlockMsg:'破除迷雾结界！发现【心灵秘境】', relockMsg:'撤回结界入口破锁真气' },
      { key:'zjsz', name:'照见苏州', unlockMsg:'破除迷雾结界！发现【视界秘境】', relockMsg:'撤回结界入口破锁真气' },
      { key:'news', name:'新闻', unlockMsg:'破除迷雾结界！发现【正能光量小世界】', relockMsg:'撤回结界入口破锁真气' },
      { key:'tv', name:'播霸', unlockMsg:'破除迷雾结界！发现【光怪陆离小世界】', relockMsg:'撤回结界入口破锁真气' }
    ]},
    { cat: '心法', items: [
      { key:'auto', name:'吐气纳灵心法', unlockMsg:'破除禁锢！习得【吐气纳灵心法】', relockMsg:'聚灵归海' },
      { key:'oneKey', name:'引灵入体心法', unlockMsg:'破除禁锢！习得【引灵入体心法】', relockMsg:'聚灵归海' }
    ]}
  ]
};

/**
 * 双击背景图破除隐藏结界配置
 * 不记录解锁状态、不限次数——每次双击背景图都独立触发一次结界：
 *   弹窗确认 → 读库校验 → 扣除真气 → 保存当前背景图到相册
 *   min / max — 每次破除结界随机扣除真气下限/上限（含两端）
 *   title     — 询问窗标题
 *   text      — 询问窗正文（{cost} 会被替换为本次实际扣除的真气值）
 *   okText    — 确认按钮文字
 *   doneTitle / doneText — 破除成功后窗口显示文案（{cost} 同上）
 */
var BG_UNLOCK_CONFIG = {
  min: 1,
  max: 5,
  title: '🗝 隐藏结界',
  text: '发现隐藏结界，注入 {cost} 真气破除结界？',
  okText: '破除',
  doneTitle: '✓ 结界已破',
  doneText: '结界破除！-{cost} 真气，图片已保存到相册'
};

/**
 * WebView 环境识别关键字（App 封装 UA 中自定义的标识）
 * 命中任一关键字（不区分大小写）即判定为 App 内嵌 WebView：
 *   - 保存图片时不使用 a[download] 下载（WebView 无下载处理器，点击会导致 App 退出/无反应），
 *     改为「全屏预览 + 长按图片保存到相册」（iOS/Android WebView 均支持长按存图，不依赖下载机制）。
 * 默认自动识别通用 WebView 标识（wv / webview / wkwebview 等），无需配置；
 * 若你的 App 壳在 UA 里加了自定义标识（如 "MyApp/1.0"），把关键字填进数组即可精确识别。
 * 浏览器（含手机浏览器）不受影响，仍走 Web Share / 直接下载。
 */
var WEBVIEW_UA_KEYWORDS = [];