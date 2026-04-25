# MEMORY.md - 博客运维记忆

## 定时任务清单

| 任务名 | 脚本 | 时间 | 状态 |
|--------|------|------|------|
| HexoDailyQuote | quote-bot.js | 06:00 每日 | ✅ 正常 |
| HexoHotNewsMorning | hot-news-bot.js | 08:00 每日 | ✅ 已修复 |
| HexoHotNewsEvening | hot-news-bot.js | 20:00 每日 | ✅ 已修复 |
| SolarTermsBot | solar-terms-bot.js | 08:00 每日 | ✅ 已修复 |
| HexoEmailBot | email-cron.ps1 | 常驻后台 | ✅ 正常（邮件发送后35分钟内自动发布到博客）|
| HexoHoliday-* | run-holiday-task.bat | 节假日当天09:00 | ⏳ 一次性 |

## 脚本修复记录 (2026-04-25)

修复了 quote-bot.js 的相同问题：

### hot-news-bot.js
- ❌ commit message `post: 热搜晨报推送` 含中文冒号
- ✅ 改为 `post-daily-hotnews-morning` / `post-daily-hotnews-evening`
- ❌ git push 无降级处理
- ✅ 添加 force push 降级
- ❌ spawn 无超时保护
- ✅ 添加 runCmd 超时包装 (30-120s)

### email-to-hexo.js
- ❌ commit message `post: 邮件发布文章 - ${filename}` 含中文冒号
- ✅ 改为 `post-email-article-${safeName}`
- ❌ git push 无降级处理
- ✅ 添加 force push 降级
- ❌ spawn 无超时保护
- ✅ 添加 runCmd 超时包装
- 2026-04-25 测试通过，发布成功

### solar-terms-bot.js
- ❌ 使用嵌套 spawn 回调（顺序不确定）
- ✅ 改为 async/await
- ❌ commit message `post: 节气文章推送 - ${termName}` 含中文
- ✅ 改为 `post-daily-solar-term-${termName}`
- ❌ git push 无降级处理
- ✅ 添加 force push 降级
- ❌ spawn 无超时保护
- ✅ 添加 runCmd 超时包装

## 修复模式总结

所有 hexo-bot 脚本的 Git 操作应遵循：
1. **Commit message**: 纯 ASCII，无中文冒号
2. **Push**: 先普通 push，失败后 force push
3. **超时**: 所有命令 30-120s 超时保护
4. **异步**: 使用 async/await 而非嵌套回调
