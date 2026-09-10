# 砚台 · 考研英语写作批改平台

**线上地址：https://austcoder.cn/kaoyan-english/**

面向考研英语一（大作文 / 小作文 / 翻译）的**评分 + 逐句语法优化 + 结构划分**平台。

设计语言对齐 [anthropic.com](https://www.anthropic.com/)：暖白纸面、石板色行动色、陶土色稀疏强调、衬线标题 + 无衬线界面 + 等宽数字、低阴影暖描边。界面语言为中文。

---

## 现在能做什么（P0 + P1 已交付）

| 能力 | 状态 |
|---|---|
| 三段式外壳：侧栏导航 + 吸顶工具栏 + 纸面内容区 | ✅ |
| **评分细则管理**：三题型独立编辑、Markdown 预览、保存归档、版本回滚、细则体检 | ✅ |
| **内置批改指令**：大作文 + 小作文 + 翻译全部就位（用户提供，原文照录 + 平台追加结构化契约） | ✅ |
| **模型配置**：DeepSeek / Kimi / 通义 / 智谱 / OpenAI / 自定义，多配置并存、连接测试、温度与输出上限、视觉能力开关 | ✅ |
| **通用设置**：请求通道（直连 / 本地代理）、批改严格度、逐句诊断开关、超时、配置导出导入 | ✅ |
| 数据持久化：设置与细则存 localStorage，报告预留 IndexedDB | ✅ |
| **批改引擎**：prompt 组装、SSE 流式输出、JSON 容错解析、失败自动重试 | ✅ |
| **批改台输入**：粘贴文本 / 拍照 / 选文件 / 拖拽 / 粘贴图片；题目可选 | ✅ |
| **报告页**：分数环 + 维度条 + 逐句折叠卡 + 翻译采分点对照 + 全文/积累/复盘 | ✅ |
| **本地代理后端**：可选通道，解决跨域与 Key 不外露 | ✅ |
| **历史记录**：按题型筛选、得分趋势、进入报告、删除 | ✅ |
| **手机端适配**：抽屉导航、无横向溢出、触控目标、输入防缩放 | ✅ |
| 错题本（按错误类型聚合） | ⏳ P4 |

---

## 细则与输出契约

批改时，题型细则的**全文**会作为 system prompt 主体上传，是模型唯一的评分依据。

| 题型 | 细则正文 | 逐句 schema | 专有字段 |
|---|---|---|---|
| 英语一 · 大作文 | ✅ 已内置 | 原句 → 问题 → 修改句 → 中文解释 | — |
| 英语一 · 小作文 | ✅ 已内置 | 同上 | `essayFormat`（格式逐项 + 词数统计） |
| 英语一 · 翻译 | ✅ 已内置 | 原句 → 采分点（分值/得分）→ 错误分析 → 修改译文 | `typoDeduction`（错别字累计扣分） |

三个题型的批改口径不同，所以契约里的逐句 schema 与专有字段也不同：

**大作文**（整体定档给分）

```
band / total                    → 分数环 + 档次徽标
dimensions[4]                   → 内容要点 6 / 语言表达 8 / 篇章结构 4 / 格式语域 2
sentences[]                     → 逐句折叠卡
  └ level: must|optional|ok     → 「必须修改」徽标 + 严重度配色
  └ labels[]                    → 问题类型标签（主谓一致 / 时态 / 搭配 / 指代 / 中式表达）
phrases[] / structure           → 表达积累卡 / 写作思路卡
topFixes[] / practice[]         → 优先改进 + 练习建议
notes[]                         → 需你确认的地方
```

**小作文**（格式与要点优先）

```
essayFormat                     → 文本类型 / 称呼 / 结束语 / 署名 分别列出
  └ bodyWordCount               → 正文词数（不含称呼、结束语、署名）
  └ wordCountNote               → 按题目要求评价长度，不套用「每少 10 词扣 1 分」
  └ formatIssues[]              → 格式问题清单
dimensions[4]                   → 格式与语域 2 / 要点完整 4 / 语言表达 3 / 连贯得体 1
sentences[]                     → 逐句折叠卡（同大作文）
```

**翻译**（按采分点给分）

```
sentences[5]                    → 逐句采分点卡（每句满分 2 分）
  └ points[]                    → 英文片段 / 应表达的意思 / 分值 / 得分 / 我的译文片段 / 状态
      status: hit|partial|mistranslated|missed|over
  └ problems[] / explanation    → 错误分析（误译漏译 + 主干与指代讲解）
  └ yourTranslation / revised   → 我的译文 / 修改译文
typoDeduction                   → 错别字累计扣分（每满 3 个扣 0.5，最低 0 分）
dimensions[3]                   → 准确完整 4 / 通顺连贯 3 / 词汇语法 3
notes[]                         → 手写图片无法辨认处需你确认
```

> 契约是平台自动追加的。你可以自由改写上半部分的批改要求，但**建议保留契约那一节**，
> 否则报告页只能拿到纯文本，无法渲染逐句卡片与分数可视化。细则体检会对此给出提示。

---

## 部署

已部署到 `fuzzy-han.github.io` 仓库（Astro 站点，push 到 main 后 GitHub Actions 自动构建）。

| 项 | 值 |
|---|---|
| 路由 | `/kaoyan-english/` |
| 线上 | https://austcoder.cn/kaoyan-english/ |
| 完整示例 | https://austcoder.cn/kaoyan-english/#/workbench |
| 产物位置 | 站点仓库 `public/kaoyan-english/`（Astro 会原样复制进 `dist/`） |
| 源码位置 | 站点仓库 `app/kaoyan-english/`（便于追溯与重建） |

**为什么用 hash 路由**：`austcoder.cn` 是用户根站点，仓库里还有数独、贪吃蛇等其他项目。
hash 路由把路径部分固定在一个子目录里，不需要任何服务端重写规则，
也不会和站点上其他页面抢路由。

从本机重新部署：

```bash
scripts/deploy-pages.sh /path/to/fuzzy-han.github.io          # 只构建并同步
scripts/deploy-pages.sh /path/to/fuzzy-han.github.io --push    # 同步并提交推送
```

脚本会先跑类型检查与构建产物自检，并确认资源路径带了 `/kaoyan-english/` 前缀才同步——
这个前缀一旦漏掉，线上就是整页白屏。

## 快速开始

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5273
```

想用「本地代理」通道时（解决部分服务商不允许浏览器跨域）：

```bash
pnpm proxy        # http://127.0.0.1:8787
# 也可以固定上游，这样前端不用填 Key：
# UPSTREAM_BASE_URL=https://api.deepseek.com/v1 UPSTREAM_API_KEY=sk-xxx ACCESS_TOKEN=my-token pnpm proxy
```

其他命令：

```bash
pnpm check        # 类型检查 + 生产构建 + 构建产物自检
pnpm verify       # 只跑构建产物自检（层叠顺序 / 类名对账）
pnpm e2e          # 三套端到端自检，需先启动 pnpm dev
```

### 端到端自检

`pnpm e2e` 依次跑：

| 脚本 | 覆盖内容 |
|---|---|
| `scripts/e2e.mjs` | 首屏渲染、导航、细则编辑/保存/持久化/版本历史、模型配置增删与状态联动、通道切换 |
| `scripts/verify-rubric.mjs` | 三个题型的内置指令是否落地、关键规则是否保留（含小作文格式项与翻译采分点规则）、结构化契约与专有字段是否完整、tab 切回不串改、体检是否通过 |
| `scripts/verify-migration.mjs` | 老用户升级：不覆盖用户内容、缺项补种（大作文 / 小作文各测一次）、补种必须落盘、用户清空后不被强塞 |

> **注意**：本机 shell 设置了 `http_proxy`，用 curl 访问本地端口需要加 `--noproxy '*'`。

---

## 上线前请做两件事

1. **配置模型**（「模型配置」页）
   选服务商 → 自动带出接口地址与常用模型名 → 填 API Key → 点「测试连接」跑通。
   Key 仅存本机浏览器，调用时直接发往所选服务商。

三个题型的批改指令都已内置，开箱可用；想调整口径直接在「评分细则」页改。

---

## 架构

```
src/
├── main.tsx                入口（只引入 styles/index.css，再挂载 App）
├── App.tsx                 路由分发
├── app/
│   ├── router.ts           极简 hash 路由
│   ├── store.ts            zustand：设置 / 模型配置 / 细则（localStorage 持久化）
│   └── ui.ts               toast 状态
├── components/
│   ├── Shell.tsx           外壳：侧栏 + 工具栏 + 内容区
│   ├── Icon.tsx            手写单色线性图标（不引第三方图标库）
│   ├── Markdown.tsx        轻量 Markdown 渲染（细则预览用，不注入 HTML）
│   └── Toast.tsx           toast + 复制到剪贴板（含降级路径）
├── lib/
│   ├── tasks.ts            三题型定义 + 服务商预设（分值/档次/维度均在此配置）
│   ├── rubric.ts           细则模板、占位符判空、细则体检
│   ├── api.ts              OpenAI 兼容调用层（直连 / 代理双通道、错误人话化）
│   └── storage.ts          localStorage + IndexedDB 封装
├── pages/                  批改台 / 评分细则 / 模型配置 / 通用设置 / 报告 / 记录
└── styles/
    ├── index.css           ★ 全站唯一 CSS 入口，顺序即层叠顺序
    ├── tokens.css          设计 token
    ├── components.css      组件层
    └── ../pages/*.css      页面层（允许覆盖组件层）
```

### 两条必须遵守的规则

**1. 样式只在 `styles/index.css` 里引入。**
Vite 会把各模块 `import` 的 CSS 按模块图顺序注入产物。若页面自己 `import './xxx.css'`，这些样式会被注入到 `components.css` **之前**，导致同特异性的覆盖静默失效。
（真实事故：`.rubric-textarea { height: 560px }` 被后出现的 `.textarea { min-height: 88px }` 吃掉，编辑器退化成 88px 高。）

**2. 改完跑 `pnpm verify`。**
它会断言产物里的层叠顺序（tokens → components → pages）并对账 JSX 类名与 CSS 定义，防止上述问题复发。

---

## 设计 token 速查

```
纸面阶梯   #faf9f5 页面   #f0eee6 组件   #e8e6dc hover/选中
石板行动   #141413 主按钮与正文   #3d3d3a 次级文字
陶土强调   #d97757（仅稀疏使用）  #c7  hover #c9674a
文字       #6b6a63 次级   #93918a 辅助
描边       #e3e0d6 / #cfcbbc / #d5d1c5
圆角       卡片 8px   控件 12px   chip 6px
数字       一律 Mono + tabular-nums（.numeric）
```

---

## 输入方式

**题目是可选的。** 不填题目也能批改——按批改指令，此时只批语言与结构、不给确定总分，
界面用中性提示说明这一点（不是报错）。右侧状态栏会显示「未填写（只批语言）」。

作文的四条上传路径：

| 方式 | 适用 | 实现 |
|---|---|---|
| 直接粘贴文本 | 通用 | 文本域 |
| **拍照** | 手机 | `capture="environment"` 直接唤起后置摄像头 |
| **粘贴图片** | 电脑 | 拦截 `paste` 事件，剪贴板里的图片转成附件；剪贴板同时有文字时优先保留文字 |
| 选文件 / 拖拽 | 通用 | 多选，支持图片与 `.txt` `.md` `.docx` |

图片会先压到长边 1600px 再上传（界面显示压缩前后体积）。若模型支持视觉，
可点「识别图片中的文字」先转录——转录严格保留原有拼写、语法与分段，不顺手纠错，
无法辨认处用 ⍰ 占位并单独列出请你确认。

## 手机端适配

断点与行为：

| 宽度 | 变化 |
|---|---|
| ≤960px | 侧栏收成图标轨；多列栅格降为单列 |
| ≤720px | 侧栏改为覆盖式抽屉（汉堡打开、遮罩/Esc/跳转自动收起、锁背景滚动）；面板内边距收紧；触控目标 ≥40px；输入框字号 16px 防 iOS 聚焦缩放 |
| ≤480px | 字号与内边距进一步收紧；各类网格强制单列 |

已实测（390×844）：7 个页面无横向溢出，报告页展开态与翻译采分点表均不溢出。

自检里对「越界」判定做了豁免：处在 `overflow-x: auto/scroll` 容器内的元素
（题型页签、筛选条）本来就比视口宽，不算缺陷——否则每加一个横滑条都会误报。

## 服务端返回空？先看这里

「服务端返回内容为空」有几种完全不同的成因，平台会按证据给出**不同的**可执行建议，
而不是笼统一句话。排查顺序：

| 现象 | 成因 | 处理 |
|---|---|---|
| `finish_reason=length` 且只有 reasoning_content | 用了思考型模型，`max_tokens` 全被推理吃掉 | 平台会**自动放大额度并用非流式重试一次**；仍失败就换 `deepseek-chat` 这类普通对话模型 |
| 只返回 reasoning_content | 同上 | 同上 |
| HTTP 400 `Prompt must contain the word 'json'` | 开了 `response_format: json_object` 但提示词里没有 "json" | 已自动兜底：`ensureJsonKeyword` 会在缺失时补一句 |
| 没有 `choices` 字段 | Base URL 指错了（不是对话补全端点） | 检查 Base URL 是否到 `/v1` |
| `finish_reason=content_filter` | 被服务商安全策略拦截 | 改写输入或换服务商 |

**注意**：「测试连接」用的是 `max_tokens=16` 的一句 ping，它通过**不代表**批改能通过。
现在连接测试会额外检查三项隐患并给出警告：模型名像思考型模型、输出上限低于 4096、
Base URL 指向 localhost。

三个相关的自动兜底（都在 `src/lib/` 里，有单元测试覆盖）：

- `json.ts → ensureJsonKeyword`：`jsonMode` 时保证提示词含 "json"，避免必然 400
- `json.ts → describeEmptyResponse`：按 `finish_reason` / `reasoning_content` 分情况说明
- `grade.ts → gradeWithBudget`：识别到「被截断 / 正文为空」时，翻倍 `max_tokens`
  并**改用非流式**重试一次（首次流式都已吐不出正文，再流式一次大概率还是空）

## 「已填写」是怎么判定的

细则的填写状态是**显式标记**（`Rubric.filled`），只在这两种情况下为真：

- 内置指令写入时
- 用户点「保存并归档」且正文非空时

之所以不用「正文里出现了占位符字样就当作未填写」这种启发式判断：用户只要在正文里
引用一次那句话，整份细则就会被误判成「待填写」，而界面其他部分完全正常，极难排查。
老数据没有该标记时，退回**统计式**判断：骨架的特征是占位符成片出现（≥3 处），
而真实内容里即便提到一次也只是零星一处。

回归测试见 `scripts/verify-migration.mjs` 场景 E 与 `scripts/verify-rubric.mjs` 的全站扫描。

## 已知取舍

- **细则草稿在切换题型 tab 时不同步**：每个题型各自保留已保存内容，未保存的编辑在切走时会丢失（切回即还原为已保存版本）。理由是避免「一页三份草稿」的状态管理复杂度。
- **翻译模块的报告视图与作文不同**：作文走「逐句折叠卡」，翻译走「原句 → 结构拆解 → 你的译文 → 参考译文 → 采分点对照」。这是 P3 的实现分支，已在数据结构里预留。
- **代理后端尚未交付**：设置页可以选「本地代理」并填写地址，但代理服务本身（约 200 行 Node 脚本）安排在 P2。当前选它会因找不到服务而报错——想先用起来请保持「浏览器直连」。
