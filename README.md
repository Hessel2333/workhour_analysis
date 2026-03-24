# 工时分析工作台

一个基于 React + TypeScript + Vite 的工时分析仪表盘，用于从员工、项目、任务、数据质量和相关性几个维度观察研发工时结构，并在需要时通过 Gemini 生成补充解释。

项目默认加载仓库内的样例数据 `data.json`，也支持在页面设置中上传 `.txt` 或 `.json` 工时文件进行替换分析。

## 功能概览

- 总览页：查看总工时、活跃员工、加班趋势、项目投入结构和首页重点结论。
- 智能分析：先用本地规则生成风险诊断，再按需调用 Gemini 深化解释。
- 员工视图：查看员工画像、聚焦度、切换负担、救火型员工识别和热力图。
- 项目视图：查看项目投入规模、趋势波动、返工占比和项目四象限。
- 任务洞察：查看任务主题、关键词画像、待确认分类和任务明细。
- 数据质量：查看样本可信度、异常散点、质量旗标和治理清单。
- 相关性实验室：查看候选关系排行、完整相关矩阵和协同 mock 数据。
- 报告页：输出管理摘要并导出 PDF。
- 设置页：切换工时文件和加班口径。

## 技术栈

- React 19
- TypeScript
- Vite 8
- Zustand
- ECharts + echarts-for-react
- Framer Motion
- html2canvas + jsPDF
- Vercel Functions / 本地 Node API

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

可选环境变量：

- `GEMINI_API_KEY`：Gemini API Key
- `GEMINI_MODEL`：默认 `gemini-2.5-flash`
- `GEMINI_API_BASE`：默认 `https://generativelanguage.googleapis.com/v1beta`
- `PORT`：本地 API 端口，默认 `8787`

如果不配置 `GEMINI_API_KEY`，项目仍可运行，只是“智能分析”页不会调用 Gemini。

### 3. 启动项目

```bash
npm run dev
```

这个命令会同时启动：

- Vite 前端开发服务器
- 本地 Gemini 代理服务 `server/index.mjs`

其他可用命令：

```bash
npm run dev:client
npm run dev:server
npm run build
npm run preview
```

## 数据格式

项目支持上传 `.txt` 或 `.json` 工时文件，解析逻辑位于 `src/data/workhourData.ts`。

当前支持两种输入形态：

- 直接传入员工数组
- 带 `result` 字段的 JSON-RPC 响应对象

核心字段结构见 `src/types.ts`：

- 员工：`Id`、`Name`、`Avatar`、`DetailList`
- 员工日：`Date`、`ReportHour`、`VerifyHour`、`TaskList`
- 任务：`Id`、`Name`、`ProjectName`、`ReportHour`、`VerifyState`

解析阶段会自动做这些处理：

- 剔除超过 24 小时等明显不合理的工时记录
- 基于规则给任务打主题标签
- 生成质量旗标和 mock 协同数据
- 自动计算默认筛选区间

## Gemini 接口

前端调用的接口路径固定为：

- `GET /api/gemini/health`
- `POST /api/gemini/analyze`

共享逻辑在 `server/gemini.mjs`，本地开发使用 Node 服务，线上部署时可直接使用 Vercel Functions：

- `api/gemini/health.js`
- `api/gemini/analyze.js`

## 部署到 Vercel

这个项目已经适配 Vercel，前端结构不需要改成 Next.js。

Vercel 项目建议配置：

- Framework Preset：`Vite`
- Build Command：`npm run build`
- Output Directory：`dist`

需要在 Vercel 项目里配置的环境变量：

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_API_BASE`

部署后前端会直接调用仓库中的 `api/` 函数，不需要单独再部署一个常驻 Node 服务。

## 目录结构

```text
.
├── api/                  # Vercel Functions
├── server/               # 本地开发用 Node API 与共享 Gemini 逻辑
├── src/
│   ├── components/       # 通用组件
│   ├── data/             # 数据解析、主题规则、mock connectors
│   ├── hooks/            # 主题等前端 hooks
│   ├── lib/              # 分析与图表工具
│   ├── pages/            # 各功能页面
│   ├── store/            # Zustand 状态管理
│   └── types.ts          # 主要类型定义
├── data.json             # 默认样例数据
└── vite.config.ts
```

## 当前边界

- 当前样例数据窗口较短，更适合发现异常和结构问题，不适合直接做长期绩效判断。
- 任务主题分类主要基于规则词典，复杂语义任务仍建议人工复核。
- 相关性页中的 Git / AI / 用户反馈部分目前是 mock 数据，用于预留联动位，不应直接当作真实结论。

## 仓库说明

如果你只想快速体验：

```bash
npm install
cp .env.example .env
npm run dev
```

然后打开设置页上传你的工时文件，或者直接使用默认样例数据开始分析。
