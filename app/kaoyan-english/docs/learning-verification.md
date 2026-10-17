# 持续学习流程验证（2026-10-18）

使用 Node 22.23.2、独立临时 Chromium 配置、本地模拟模型；未读写真实浏览器数据，也未调用收费模型。

- `npm run check`：类型检查、Vite 构建，18 项 CSS/构建检查通过。
- `npm run e2e:learning`：30/30 通过。包括 OCR 预览/取消/替换/去重、已识别图片跳过、预览确认前阻止批改、原题和原评分细则复用、带对话上下文的修改复评、原分数保留、对话刷新恢复、学习卡预览与确认入库、仿写保存、场景搜索和进度筛选、学习数据迁移、请求失败保留输入、手机布局。
- `npm run e2e:backup`：47 项格式与合并规则、15 项存储故障回归、32 项双浏览器迁移检查通过。
- `node scripts/verify-templates.mjs`：27/27 通过；`node scripts/verify-upload.mjs`：25/25 通过。
- `node scripts/verify-mobile.mjs`：33/33 通过（390×844，含作文/翻译报告）。
- 发布构建：以 `/kaoyan-english/` 子路径提供静态文件，`DSH_APP_URL=http://127.0.0.1:5274/kaoyan-english node scripts/verify-learning-production.mjs` 的 6 项检查通过，覆盖实际打包产物的追问请求、刷新恢复和手机布局。

复评提供修改反馈，不产生新的正式总分。回答与练习卡质量依赖用户配置的模型；学习卡需先核对编辑再入库。原有浏览器数据库和存储键保持兼容，新增对话与练习字段随 v2 完整备份迁移。
