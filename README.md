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

## 部署

建议单独创建 GitHub 仓库（例如 `mappd-mobile`）并在 Vercel 新建项目关联，环境变量同样配置 `DEEPSEEK_API_KEY`。

## 项目结构

```
mappd-mobile/
├── api/              # 与主项目共享的 API
├── public/
│   └── index.html    # 含移动端 @media 样式
├── dev-server.js
└── vercel.json
```
