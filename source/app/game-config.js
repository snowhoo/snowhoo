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
 */
var LEVEL_CONFIG = [
  { name:'凡人',         times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:10, history:0,  constellation:3,  explore:0 },  cost:0   },
  { name:'练气一层',     times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:10, history:5,  constellation:3,  explore:1 },  cost:18  },
  { name:'练气二层',     times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:11, history:5,  constellation:3,  explore:1 },  cost:19  },
  { name:'练气三层',     times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:12, history:5,  constellation:3,  explore:1 },  cost:20  },
  { name:'练气四层',     times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:12, history:5,  constellation:3,  explore:1 },  cost:25  },
  { name:'练气五层',     times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:12, history:7,  constellation:3,  explore:1 },  cost:30  },
  { name:'练气六层',     times:{poetry:1, history:1, constellation:1, explore:0}, points:{poetry:12, history:9,  constellation:3,  explore:1 },  cost:35  },
  { name:'练气七层',     times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:12, history:9,  constellation:4,  explore:1 },  cost:40  },
  { name:'练气八层',     times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:12, history:9,  constellation:5,  explore:1 },  cost:45  },
  { name:'练气九层',     times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:12, history:9,  constellation:6,  explore:1 },  cost:50  },
  { name:'练气十层',     times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:12, history:9,  constellation:6,  explore:2 },  cost:60  },
  { name:'练气十一层',   times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:12, history:9,  constellation:6,  explore:3 },  cost:70  },
  { name:'练气十二层',   times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:12, history:9,  constellation:6,  explore:4 },  cost:80  },
  { name:'练气大圆满',   times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:12, history:9,  constellation:6,  explore:5 },  cost:90  },
  { name:'筑基初期',     times:{poetry:1, history:1, constellation:1, explore:1}, points:{poetry:13, history:9,  constellation:7,  explore:6 },  cost:100 },
  { name:'筑基中期',     times:{poetry:1, history:1, constellation:1, explore:2}, points:{poetry:14, history:10, constellation:7,  explore:6 },  cost:120 },
  { name:'筑基后期',     times:{poetry:1, history:1, constellation:1, explore:2}, points:{poetry:15, history:11, constellation:7,  explore:6 },  cost:140 },
  { name:'筑基大圆满',   times:{poetry:1, history:1, constellation:1, explore:2}, points:{poetry:16, history:11, constellation:7,  explore:6 },  cost:160 },
  { name:'金丹初期',     times:{poetry:1, history:1, constellation:1, explore:2}, points:{poetry:17, history:12, constellation:8,  explore:7 },  cost:200 },
  { name:'金丹中期',     times:{poetry:1, history:1, constellation:1, explore:3}, points:{poetry:18, history:13, constellation:9,  explore:7 },  cost:220 },
  { name:'金丹后期',     times:{poetry:1, history:1, constellation:1, explore:3}, points:{poetry:19, history:14, constellation:10, explore:7 },  cost:240 },
  { name:'金丹大圆满',   times:{poetry:1, history:1, constellation:1, explore:3}, points:{poetry:20, history:15, constellation:11, explore:7 },  cost:260 },
  { name:'元婴初期',     times:{poetry:1, history:1, constellation:1, explore:3}, points:{poetry:21, history:16, constellation:12, explore:8 },  cost:300 },
  { name:'元婴中期',     times:{poetry:1, history:1, constellation:1, explore:4}, points:{poetry:22, history:17, constellation:13, explore:9 },  cost:340 },
  { name:'元婴后期',     times:{poetry:1, history:1, constellation:1, explore:4}, points:{poetry:23, history:18, constellation:14, explore:10}, cost:380 },
  { name:'元婴大圆满',   times:{poetry:1, history:1, constellation:1, explore:4}, points:{poetry:24, history:19, constellation:15, explore:11}, cost:420 },
  { name:'化神初期',     times:{poetry:1, history:1, constellation:1, explore:4}, points:{poetry:26, history:21, constellation:17, explore:13}, cost:500 },
  { name:'化神中期',     times:{poetry:2, history:2, constellation:2, explore:5}, points:{poetry:28, history:23, constellation:19, explore:15}, cost:600 },
  { name:'化神后期',     times:{poetry:2, history:2, constellation:2, explore:5}, points:{poetry:30, history:25, constellation:21, explore:17}, cost:700 },
  { name:'化神大圆满',   times:{poetry:2, history:2, constellation:2, explore:5}, points:{poetry:32, history:27, constellation:23, explore:19}, cost:800 }
];

/**
 * 功能解锁配置
 * 消耗真气值一次性解锁对应功能：
 *   auto   — "自动"修炼功能解锁所需真气（必须先解锁此项，才能解锁"一键"）
 *   oneKey — "一键"修炼功能解锁所需真气（需先解锁"自动"）
 * 真气不足时不允许解锁。
 */
var UNLOCK_CONFIG = {
  auto: 888,
  oneKey: 999
};