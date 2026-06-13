# Hexo AutoPOST 自动评论发布系统

## 任务目标
参照 schedule-generator.js，在 `D:\hexo\hexo-bot\AutoPOST\` 下创建新的自动评论发布系统，每天 02:00 执行，随机3个时间（06:00-23:00，精确到秒），每个时间生成一篇随机文章评论，创建3个一次性Windows计划任务。

## 核心文件

### auto-poster.js
- 随机选3篇文章（使用与 schedule-generator.js 相同的正确路径计算逻辑）
- 生成3个随机时间（06:00-23:00，精确到秒）并按时间排序
- 写入 `daily-comment-schedule.json`
- 创建3个一次性 Windows 计划任务（Hexo-Bot\AutoPost_Task_1/2/3）

### setup-daily-trigger.js
- 创建/更新每日 02:00 的主调度任务（Hexo-Bot\AutoPost_Daily）
- 运行 `auto-poster.js` 生成当日计划

## Windows 计划任务（Hexo-Bot 分类）
| 任务名 | 触发时间 | 说明 |
|--------|---------|------|
| AutoPost_Daily | 每天 02:00 | 运行 auto-poster.js 生成当日计划 |
| AutoPost_Task_1 | 随机时间1 | 运行 comment-executor.js --taskIndex=1 |
| AutoPost_Task_2 | 随机时间2 | 运行 comment-executor.js --taskIndex=2 |
| AutoPost_Task_3 | 随机时间3 | 运行 comment-executor.js --taskIndex=3 |

## 关键区别（vs schedule-generator.js）
- 时间精确到**秒**（而非分钟）
- 每次运行生成**新**的3个随机时间（不重复）
- 随机时间范围限定在 06:00-23:00
- 所有任务放在 Hexo-Bot 分类下
- 一次性任务执行后自动失效（不重复）

## 测试结果
- 今日生成计划：08:55:47、09:35:07、12:55:52
- 所有任务创建成功，已推送到 Git
