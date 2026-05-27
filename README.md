# mappd-mobile

[Mappd](https://github.com/ggjay/mappd) 的**手机端独立版本**，针对小屏与触控优化，不修改桌面版主仓库。

## 与 mappd 的区别

| | mappd（桌面） | mappd-mobile |
|---|---------------|--------------|
| 布局 | 左方案 + 右地图双栏 | 上地图 + 下方方案单栏 |
| 详情面板 | 右侧滑出 | 底部抽屉 |
| 触控 | 鼠标优先 | 更大点击区域、安全区适配 |

API 与后端逻辑与主项目相同（`api/plan_options.js`、`api/day_detail.js` 等）。

## 本地开发

```bash
npm install
cp .env.example .env.local   # 填入 DEEPSEEK_API_KEY
npm run dev
```

浏览器访问 [http://localhost:3000](http://localhost:3000)，建议用 Chrome 开发者工具切换手机视口，或直接在手机上访问局域网地址。

## 部署到 Vercel

项目**可以**部署到 Vercel；本地用 `npm run dev`（`dev-server.js`），线上由 Vercel 自动托管 `public/` 静态文件 + `api/*.js` 无服务器函数。

### 步骤

1. 将代码推送到 GitHub（或在本目录执行 `npx vercel` 直接部署）
2. [Vercel Dashboard](https://vercel.com/new) → Import 该仓库
3. **Framework Preset** 选 **Other**（无需 Build Command）
4. **Environment Variables** 添加 `DEEPSEEK_API_KEY`（Production / Preview 都勾选）
5. Deploy

### 常见问题

| 现象 | 原因 |
|------|------|
| 首页 404 | 旧版 `vercel.json` 把 `/` 重写到 `/public/`（目录不存在）。已移除该 rewrite，`public/index.html` 会由 Vercel 自动挂在 `/` |
| 推演失败 / API KEY Missing | 未在 Vercel 项目设置里配置 `DEEPSEEK_API_KEY`（`.env.local` 不会上传） |
| 函数超时 | DeepSeek 较慢；Hobby 计划单函数默认最长约 10s，需在 Dashboard → Functions 调高或升级 Pro 以使用 `maxDuration: 60` |
| 无法 Import | 仓库未推送、或选错根目录（根目录应含 `api/` 与 `public/`） |

本地模拟 Vercel 环境：`npm run dev:vercel`（需已 `vercel login`）。

## 设计说明（huashu-design 重构）

- **交付形态**：全屏移动 Web App（`viewport-fit=cover` + 安全区），地图在上（约 42dvh）、方案列表在下
- **视觉**：衬线标题（Source Serif 4 / Noto Serif SC）+ 墨绿/赤陶双色 accent，见 `public/brand-spec.md`
- **技术栈**：React 18 + Babel inline 单文件；Leaflet 地图与 `/api/*` 逻辑保留
- **交互**：底部抽屉详情、地图横向卡片条、日级 Tab 切换总览/分日

## 项目结构

```
mappd-mobile/
├── api/              # 与主项目共享的 API
├── public/
│   ├── index.html    # 移动原型主界面（React）
│   └── brand-spec.md # 品牌色与字体规范
├── dev-server.js
└── vercel.json
```
