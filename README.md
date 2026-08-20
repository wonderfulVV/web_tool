# 汪汪导航

一个纯静态的实用网址导航站，聚合 AI 工具、开发工具、设计资源、学习资源、网盘资源、金融财经、影音视频等常用网站。

线上地址：https://dognav.org

## 技术栈

纯静态站点，无需构建、无后端依赖：

- HTML + Bootstrap 4.3.1 + jQuery 3.2.1
- Font Awesome 5.15.4（仅保留 CSS 与字体文件）
- 投稿表单通过 [EmailJS](https://www.emailjs.com/) 直接发信，无需自建后端
- 访问统计使用 51.LA

## 目录结构

```
.
├── index.html                      # 首页，全部导航数据内联在此文件
├── 404.html                        # 404 页面
├── about/index.html                # 关于页面
├── pages/
│   ├── submit_site.html            # 网站投稿（EmailJS）
│   ├── tool_guide.html             # 工具使用指南
│   └── resource_recommendation.html # 资源推荐
├── assets/
│   ├── css/                        # 样式
│   ├── js/                         # 脚本
│   ├── images/logos/               # 各站点图标
│   └── fontawesome-5.15.4/         # 图标字体（css + webfonts）
├── robots.txt
├── sitemap.xml
├── ads.txt                         # Google AdSense 验证
└── vercel.json                     # Vercel 部署配置
```

## 本地预览

任意静态服务器即可，注意必须通过 HTTP 访问（部分页面用了绝对路径 `/assets/...`，直接双击打开 HTML 会丢样式）：

```bash
npx serve .
# 或
python -m http.server 8000
```

## 部署（Vercel）

仓库已接入 Vercel，`master` 分支推送后自动部署。

- Framework Preset：Other
- Build Command：留空
- Output Directory：留空（仓库根目录即站点根目录）

根目录的 `404.html` 会被 Vercel 自动作为 404 页面，无需额外配置。

`vercel.json` 里按资源变更频率做了分级缓存，注意各级差异：

| 路径 | 缓存策略 | 原因 |
| --- | --- | --- |
| `assets/fontawesome-5.15.4/**` | 1 年 immutable | 目录名带版本号，内容不会变 |
| `assets/images/**` | 30 天 | 文件名无内容哈希，**替换图片请改文件名**，否则最长 30 天才生效 |
| `assets/css/**`、`assets/js/**` | 1 天 + stale-while-revalidate | 改代码后最迟次日全量生效 |
| HTML | Vercel 默认 `max-age=0, must-revalidate` | 内容改动立即可见 |

没有启用 `cleanUrls`：站点已有搜索收录都是带 `.html` 的 URL，开启后会产生 308 跳转，故保持原样。

## 资源体检

清理死文件、排查坏链：

```bash
node tools/check-assets.mjs            # 只报告
node tools/check-assets.mjs --delete   # 报告并删除未被引用的资源
```

存在坏链时会以非 0 退出码结束，可用于部署前检查。

## 二次开发

- **新增/修改导航站点**：编辑 `index.html`。每个站点是一个 `.url-card` 区块，复制现有卡片修改即可；图标放到 `assets/images/logos/`
- **新增侧边栏分类**：在 `#sidebar` 的 `.sidebar-menu-inner` 中加锚点，并在主体区域加对应 `id` 的分区
- **修改关于页**：编辑 `about/index.html`
- **修改投稿邮箱**：编辑 `pages/submit_site.html` 顶部的 EmailJS 配置常量

新增页面后记得同步更新 `sitemap.xml`。

## 说明

本项目基于 [WebStack](https://github.com/WebStackPage/WebStackPage.github.io) 主题二次开发，已按实际使用情况精简掉未引用的图标、脚本与设计源文件。
