# 前端与 UI/UX 优化任务清单（Apple HIG 规范参考）

> 定级：P0（必须）/ P1（强烈建议）/ P2（中期演进）  
> 参考规范：Apple Human Interface Guidelines (HIG) — macOS / visionOS / 通用原则

---

## 一、布局与导航 (Layout & Navigation)

- [ ] **P1 — 侧边栏折叠支持（HIG: Navigation → Sidebar）**  
  当前侧边栏固定 232px，窄屏下严重溢出。参考 macOS Finder/Safari，添加响应式折叠（`≤ 900px` 时缩为 icon-only 或 hamburger menu）。

- [ ] **P1 — 标注当前页面层级（HIG: Navigation → Hierarchical）**  
  侧边栏导航项缺少活跃状态的动画高亮过渡；建议 active 项通过 `framer-motion` 做 layout 动画，而非静态颜色切换。

- [ ] **P2 — 支持键盘导航（HIG: Keyboard Input → Focus Ring）**  
  当前所有 nav-item 无焦点环（focus-visible），不符合 HIG 对键盘用户的可访问性要求。需补充 `:focus-visible` 样式。

---

## 二、顶部控制栏 (Top Toolbar)

- [x] **P1 — 统一控件高度（HIG: Controls → Size Classes）**  
  已优化为单行横向布局、28–32px 统一高度。

- [x] **P1 — 导航箭头改为矢量 Chevron SVG（HIG: Icons → SF Symbols）**  
  已替换为精确 SVG chevron（strokeWidth 1.6）。

- [ ] **P1 — 分段控件动画过渡（HIG: Segmented Controls）**  
  月份/年份切换时 active pill 缺少滑动过渡（sliding indicator）。参考 HIG，active 状态应以平滑的 layout 动画运动而非闪切。

- [ ] **P2 — 筛选器改为 Popover Picker（HIG: Popovers → Menus）**  
  当前 `<select>` 原生控件在 macOS/Windows 上外观差异大，建议替换为自定义 Dropdown + Popover 组合，统一外观。

---

## 三、卡片与面板 (Cards & Panels)

- [ ] **P1 — 添加骨架屏（HIG: Loading → Activity Indicators）**  
  数据上传/重新解析期间会出现白屏闪烁。参考 HIG，长操作应通过骨架屏或 spinner 给予即时视觉反馈。为 `MetricCard`、`ChartPanel`、`DataTable` 添加 loading 状态变体。

- [ ] **P1 — MetricCard 数字动画（HIG: Animation → Meaningful Transitions）**  
  KPI 卡片数值切换时应有数字滚动 count-up 动画（`framer-motion`），增强数据变化感知。

- [ ] **P2 — 卡片 hover 与点击反馈（HIG: Feedback → Visual）**  
  可点击 panel（如员工风险图点击）缺少 cursor: pointer 和 hover 阴影提升，用户无法识别其可交互性。

---

## 四、数据可视化 (Data Visualization)

- [ ] **P1 — 图表添加区域缩放（HIG: Data → Zooming）**  
  年维度下趋势图 X 轴密集，无法局部放大。为趋势图、加班图添加 ECharts `dataZoom`（`type: 'slider'`）控件。

- [ ] **P1 — 空状态设计（HIG: Empty States）**  
  筛选无结果时图表显示空画布，缺少引导性说明。参考 HIG，空状态应给出图标 + 简洁说明 + 行动指引。

- [ ] **P2 — 图表 tooltip 样式统一（HIG: Tooltips）**  
  当前 ECharts tooltip 使用默认样式，与整体磨砂玻璃风格不一致。建议通过 ECharts `tooltip.extraCssText` 统一为圆角 + 浅色背景。

- [ ] **P2 — 深色模式图表适配（HIG: Dark Mode → Color）**  
  系统切换深色模式后，ECharts 图表背景为白色，与深色界面严重冲突。`chartTheme.ts` 需添加 dark 分支，并监听 `prefers-color-scheme` 动态切换。

---

## 五、反馈与通知 (Feedback & Notifications)

- [ ] **P1 — 全局 Toast 通知系统（HIG: Alerts → Notifications）**  
  当前操作反馈极弱：文件解析失败只有一行红字，AI 分析完成无任何回调提示，导出完成静默无反馈。参考 HIG，短暂操作结果应通过非模态 Toast 呈现（可使用 `sonner` 库）。

- [ ] **P2 — 抽屉详情关闭动画（HIG: Sheets → Dismissal）**  
  `DetailDrawer` 打开有动画，但关闭应有相反方向的退出动画，目前行为不一致。

---

## 六、色彩与可访问性 (Color & Accessibility)

- [ ] **P1 — 语义化色彩系统（HIG: Color → Semantic Colors）**  
  当前颜色好看但语义不一致。应类比 HIG 的 systemRed / systemOrange / systemGreen，建立全局语义变量（如 `--color-risk`、`--color-healthy`、`--color-derived`）并统一映射。

- [ ] **P1 — 对比度合规（HIG: Accessibility → Color Contrast）**  
  `--muted` 颜色（`#6e6e73`）在白色背景上对比度约 4.2:1，勉强符合 AA 标准，正文及标注类文字建议提升至 4.5:1 以上。

- [ ] **P2 — 全局深色模式支持（HIG: Dark Mode）**  
  添加 `@media (prefers-color-scheme: dark)` 覆盖所有 CSS 变量；ECharts 主题联动切换。

---

## 七、报告与导出 (Reporting & Export)

- [ ] **P2 — 正式化报告导出模板（HIG: Printing → Page Layout）**  
  当前报告基于 `html2canvas` + `jspdf` 截图，输出质量差。参考 HIG 对打印内容的建议，设计独立报告视图（标题页→指标摘要→图表说明→建议），支持导出预览与模块选择。

---

## 汇总任务表

| 优先级 | 区域 | 任务 |
|--------|------|------|
| **P1** | 布局 | 侧边栏响应式折叠 | [x] |
| **P1** | 工具栏 | 分段控件添加 sliding 动画 | [x] |
| **P1** | 卡片 | MetricCard 、ChartPanel 骨架屏 | [x] |
| **P1** | 卡片 | MetricCard 数字 count-up 动画 | [x] |
| **P1** | 图表 | ECharts dataZoom 区域缩放控件 | [已移除] |
| **P1** | 图表 | 空状态设计 | [x] |
| **P1** | 反馈 | 全局 Toast 通知系统 | [x] |
| **P1** | 色彩 | 建立语义化 CSS 色彩变量体系 | [x] |
| **P1** | 可访问 | 补充 `:focus-visible` 键盘焦点环 | [x] |
| **P1** | 可访问 | 正文对比度提升至 WCAG AA+ | [x] |
| **P1** | 实施 | UI/UX 优化实施（第一阶段：基础与布局）| [x] |
| **P1** | 实施 | UI/UX 优化实施（第二阶段：组件与反馈）| [x] |
| **P1** | 实施 | UI/UX 优化实施（第三阶段：动画与交互）| [x] |
| **P2** | 工具栏 | 筛选器改为自定义 Dropdown Popover |
| **P2** | 图表 | ECharts tooltip 统一磨砂玻璃样式 |
| **P2** | 图表 | 深色模式 ECharts 主题适配 |
| **P2** | 全局 | 深色模式 CSS 变量覆盖 |
| **P2** | 抽屉 | DetailDrawer 退出动画补全 |
| **P2** | 报告 | 正式化报告导出模板 + 预览页 |
