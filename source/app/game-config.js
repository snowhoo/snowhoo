/**
 * 修炼任务配置
 * 修改或扩充任务只需编辑此文件，无需改动 APP.html
 *
 * 每条任务包含：
 *   key       — 编程键名（唯一标识，用作元素 ID 后缀）
 *   name      — 简短展示名（显示在按钮上）
 *   taskName  — 完整任务名（显示在菜单中）
 *   points    — 每次完成获得的真气值
 *   max       — 每日上限次数
 *   color     — 菜单圆点颜色
 */
var GAME_CONFIG = [
  { key:'poetry',        name:'诗词', taskName:'吟诗作对', points:20, max:2, color:'#f43f5e' },
  { key:'history',       name:'今日', taskName:'上古传承', points:20, max:2, color:'#8b5cf6' },
  { key:'constellation', name:'星座', taskName:'夜观星象', points:20, max:2, color:'#f59e0b' },
  { key:'explore',       name:'探索', taskName:'秘境探寻', points:10, max:5, color:'#06b6d4' }
];

/**
 * 境界等级对应表
 * key = 等级数值，value = 显示文字
 */
var LEVEL_TABLE = [
  '凡人',
  '练气一层','练气二层','练气三层','练气四层','练气五层','练气六层','练气七层','练气八层','练气九层','练气十层','练气十一层','练气十二层',
  '练气大圆满',
  '筑基初期','筑基中期','筑基后期','筑基大圆满',
  '金丹初期','金丹中期','金丹后期','金丹大圆满',
  '元婴初期','元婴中期','元婴后期','元婴大圆满',
  '化神初期','化神中期','化神后期','化神大圆满'
];
