## LRN-20260414-001 博客配置和部署方式

**Logged**: 2026-04-14T12:50:00+08:00
**Priority**: high
**Status**: pending
**Area**: config

### Summary
博客配置信息需要记住，避免每次重复询问用户

### 博客配置信息

| 项目 | 值 |
|------|-----|
| 博客根目录 | `D:\hexo` |
| 主题 | `hexo-theme-butterfly` (npm 包，在 `node_modules` 中) |
| 部署方式 | `hexo deploy` → GitHub Pages |
| 仓库 | `https://github.com/snowhoo/snowhoo.git` |
| 网站 | `https://snowhoo.net` |
| 配置文件 | `D:\hexo\_config.yml` |
| 主题配置 | `D:\hexo\node_modules\hexo-theme-butterfly\_config.yml` |
| 自定义 CSS | `D:\hexo\source\css\custom.css` |
| 数据文件 | `D:\hexo\source\_data\` |

### 部署命令

```bash
cd D:\hexo
hexo clean
hexo deploy
```

### 常见错误

1. **路径错误**：不要使用 `C:\Users\Administrator\BoClaw\workspace\blog`，正确的路径是 `D:\hexo`
2. **主题位置**：Butterfly 主题在 `node_modules/hexo-theme-butterfly`，不在 `themes` 目录
3. **配置修改**：主题配置应修改 `node_modules/hexo-theme-butterfly/_config.yml` 中的 `inject` 部分

### 教训

用户反复强调过配置信息，但每次都重新询问，导致效率低下。应该在首次获取后就记住这些信息。

---
