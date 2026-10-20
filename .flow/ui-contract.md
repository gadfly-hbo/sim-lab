# SimLab v0.2 UI 契约与批准基线（UI Contract & Pinned Baseline）

> **Reviewed-Input Mode 批准声明**：本 UI 契约依据 `dev-flow` reviewed-input 流程规则，将用户已确认并严格通过 57 项 Chromium 浏览器断言的 `review-package/SimLab-v0.2/index.html` 正式锁定为批准 UI 基线。不再重新推导视觉系统或改动像素，直接映射 PRD 验收条件与交互状态。

- **批准视觉基线工件**：
  - 仓库内基线原件：`review-package/SimLab-v0.2/index.html`（SHA-256 `6bb9fb0a99ff1e37bc6ecbe750bfe05fe7d8856fc00f28dc2c1a8597397c8cf0`）
  - 流程固化工件：`.flow/ui/index.html`
  - 源码拼装源：`review-package/SimLab-v0.2/template.html` + `style.css` + `app.js`（经 `build.py` 字节级确定性注入生成）
- **数据保真度（Data Fidelity）**：100% 绑定真实 `simulation-core.js` 确定性内核计算与起步真实基线参数（`demand=180, price=89, cost=42, ...`），零假数据、零模糊占位符。
- **验证基准**：严格匹配 `tests/browser-flow.cjs`（57 项断言全部 PASS，包含桌面 1440×1000 与移动端 390×844 双端验证）。

---

## 1. 界面与视口布局（Surfaces & Viewports）

### 1.1 桌面端布局（1440 × 1000）
- **左侧固定侧边栏（Sidebar）**：
  - 宽度严格为 `230px`，深色高对比度主题。
  - 包含产品标识（Logo + SimLab v0.2）、工作区切换、5 个核心导航选项卡（总览、参数、结果、证据、版本）、模型版本/口径标识、底端“关于”入口。
- **顶部操作栏（Topbar）**：
  - 高度严格为 `64px`，吸顶固定。
  - 包含当前实验名称、当前修订版本徽标（`Revision rX`）、口径确认状态徽标（未确认黄色警告 / 已确认绿色通过）、主操作按钮组（`确认口径`、`运行仿真`、`导出 JSON`）。
- **主工作区内容卡片（Workbench Body）**：
  - 响应式多列栅格，包含统计摘要、SVG 折线趋势图、数据表格、AI 提案对比区。

### 1.2 移动端与窄屏布局（390 × 844）
- **顶部导航条**：包含折叠菜单按钮（Hamburger Menu `[data-action="menu"]`）、标题与关键状态。
- **抽屉式侧边栏（Drawer Navigation）**：点击汉堡菜单滑出，点击遮罩或选项后自动收回。
- **视口自适应**：整个文档保证 `document.documentElement.scrollWidth <= innerWidth`，水平零滚动、零元素溢出。
- **对话框自适应**：模态弹窗宽度 `getBoundingClientRect().width <= innerWidth - 24`。

---

## 2. 界面视图（Views & Tabs）

### 2.1 启动引导视图（Home / Start Surface）
- **元素**：
  - 实验目标自然语言输入框 `#goal` 与创建按钮 `[data-action="create"]`；
  - 3 个预设起步样例卡片（如“大促备货保守方案”、“激进扩容方案”）；
  - 错误与合规提示条 `#homeError`。
- **状态行为**：
  - 点击预设样例：将参数与目标填入输入框，点击创建进入工作台草稿；
  - 输入未建模能力（例如“自动优化十个仓库并下单”）：诚实拦截并在 `#homeError` 明确解释“不在起步演示脚本支持范围”，绝不捏造虚假实验。

### 2.2 工作台 — 实验总览标签页（Tab: `overview`）
- **元素**：
  - 实验元信息卡片（ID、创建时间、参数指纹 `inputHash`）；
  - 助手对话与建议面板（Assistant Panel）：输入框 `#refine`、建议气泡（如“将日发货能力改为300”）；
  - 提案对比卡片（Proposal Card）：显示基准值与提议值差异、现金影响与利润影响量化预览、`采纳提案` 与 `废弃提案` 按钮。
- **状态行为**：
  - 提议产生时：不修改当前活动参数（`live params` 保持不变）；
  - 采纳提案（Adopt）：修改活动参数，自增 `revision`（r1 -> r2），立即使已有结果与口径确认失效（`confirmed = null`, `stale = true`）；
  - 废弃提案（Discard）：清空提案，保留当前参数、当前 revision 与当前确认状态。

### 2.3 工作台 — 参数配置标签页（Tab: `params`）
- **元素**：
  - 14 项业务参数输入控件（包含需求、售价、采购价、基础运费、首重、超重费、发货能力、初始库存、初始现金、安全库存、目标库存、订货点、固定订货量、补货周期）；
  - 2 项冲击参数（需求脉冲日/乘数、履约约束日/限额）；
  - 参数保存按钮 `[data-action="save-params"]`、重置按钮。
- **状态行为**：
  - 空值或越界校验：输入非法值（如空字符）点击保存，触发字段错误高亮，不变更系统 sequence，当前合法参数保持不变；
  - 未保存离开防护：有脏改动时点击导航切走，弹窗拦截避免误操作丢失；
  - 边界合法值：支持 `demand = 0`，计算后交付率与周转率正确渲染为“不适用”或 `-`，不报错、不崩溃。

### 2.4 工作台 — 仿真结果标签页（Tab: `results`）
- **元素**：
  - 核心指标卡片：交付率（%）、贡献利润（元）、期末现金（元）、期末库存（件）；
  - 三情景切换器（`baseline` 基准、`split` 拆单优先、`single` 单件优先）；
  - 趋势图表：SVG 渲染 30 天日现金/库存轨迹折线图；
  - 交互控制器：键盘与鼠标可控日滑块 `#daySlider`（支持 `Home` 键跳至 D0，`ArrowRight` 逐日步进）；
  - 明细账本入口：`[data-action="ledger"]` 按钮，点击打开 30 天日账本模态对话框。
- **状态行为**：
  - 运行前/未确认：`运行仿真` 按钮禁用；
  - 采纳新参数后：旧运行结果标记为已失效（Stale），导出按钮禁用，提示重新确认口径并运行；
  - 运行成功后：三情景同时生成，30 天完整流水可查，守恒性校验通过。

### 2.5 工作台 — 证据链标签页（Tab: `evidence`）
- **元素**：
  - 单变量敏感性分析表（`table[aria-label="单变量敏感性"]`）：包含日需求、进价、运费、发货能力的扰动幅度、边际贡献利润波动与弹性比率；
  - 守恒性校验记录（期初+入库-出库=期末库存，期初现金+销售收款-支出=期末现金）。
- **状态行为**：
  - 敏感性数据由内核实时重跑 4 组真实单变量扰动生成，确保数据实打实对齐。

### 2.6 工作台 — 版本与快照标签页（Tab: `versions`）
- **元素**：
  - 快照操作区：`创建快照` 按钮 `[data-action="snapshot"]`、快照列表（展示 snapshotId、创建时间、revision、参数与关键指标）、`下载快照` 按钮；
  - 故障注入与状态恢复演示区（折叠手风琴面板）：故障模式选择器 `#faultMode`（normal / unknown / failed）、取消仿真按钮、对账恢复按钮 `[data-action="reconcile"]`。
- **状态行为**：
  - 快照去重：对同一 `(runId, revision)` 重复点击创建快照，被幂等拦截，保持唯一样本；
  - 快照不可变：参数迭代或新运行不会篡改已创建历史快照中的旧参数与旧指标；
  - `unknown` 状态：当选择注入 unknown 运行，系统生成带未决回执的 unknown 状态，禁用盲目重跑按钮，必须点击 `对账恢复`（reconcile）通过回执恢复成功状态；
  - `failed` 状态：运行报错提交为 failed，不覆盖已有的成功运行结果；
  - 取消执行：计算前点击取消，状态置为 `cancelled`，回执记录未启动执行（`executionStarted: false`）。

### 2.7 全局模态对话框（Native `<dialog id="modal">`）
- **日明细账本**：展示 30 天每一天的订单、发货、缺货、入库、结存、收入、成本与现金结余。
- **口径确认对话框**：弹窗展示 14 项当前活动参数及其业务口径说明，要求操作员明确点击“确认提交”。
- **通用键盘交互**：所有模态对话框支持键盘 `Escape` 键直接关闭，符合无障碍规范。

---

## 3. 验收条件追踪矩阵（PRD Traceability Matrix）

| 页面 / 交互区块 | 对应 PRD 验收条件 | 验证手段与断言锚点 |
| :--- | :--- | :--- |
| **启动引导页** | AC-B1, AC-B5 | `tests/browser-flow.cjs` 行 29-32：输入未建模能力诚实拒止；选择样例创建草稿 |
| **顶栏与口径确认** | AC-A2, AC-B1 | `tests/browser-flow.cjs` 行 33-37：未确认时运行按钮禁用；确认后绑定当前 revision |
| **仿真结果与守恒** | AC-A1, AC-B2 | `tests/browser-flow.cjs` 行 38-43：三情景 30 天生成；基准贡献利润 274,010 元全等 |
| **运行导出** | AC-B2, AC-B5 | `tests/browser-flow.cjs` 行 44-47：下载 JSON 包含 `id`, `revision`, `scripted-no-Pi-no-LLM` |
| **情景与滑块控制** | AC-E1, AC-E2 | `tests/browser-flow.cjs` 行 48-56：切换 split；Home 跳至 D0；日账本模态 30 行流水 |
| **证据与敏感性** | AC-A3, AC-E1 | `tests/browser-flow.cjs` 行 57-58：单变量敏感性表格渲染 4 行真实重跑结果 |
| **快照不可变与去重** | AC-B4 | `tests/browser-flow.cjs` 行 59-60, 75, 96-99：重复点击去重；采纳新版不篡改旧快照 |
| **提案影响量化** | AC-B3 | `tests/browser-flow.cjs` 行 61-66：发货能力改为 300 提案量化差异严格等于内核运行差值 |
| **提案废弃与采纳** | AC-B1, AC-B3 | `tests/browser-flow.cjs` 行 67-76：废弃保留原样；采纳自增 revision 并失效口径与旧导出 |
| **参数校验与边界** | AC-A2, AC-E2 | `tests/browser-flow.cjs` 行 78-84：非法空值拦截保留原值；demand=0 交付率安全呈现“不适用” |
| **受控取消与故障恢复** | AC-B5, AC-C2 | `tests/browser-flow.cjs` 行 85-95：计算前取消；unknown 阻断重试；reconcile 回执恢复 |
| **移动端适配与零溢出** | AC-E1, AC-E2 | `tests/browser-flow.cjs` 行 103-111：390px 视口无水平滚动；抽屉侧边栏与弹窗自适应 |
| **独立文件直开支持** | AC-E1, AC-E3 | `tests/browser-flow.cjs` 行 100-102：`file://` 协议自包含原生加载 |

---

## 4. 视觉与交互偏差审计（Deviations relative to Proposal / PRD）

审计结论：**无任何破坏性或未授权偏差（0 项）**。
- 原型完全实现 Proposal 中规定的 14 参数、2 冲击、3 情景、单变量敏感性、受控状态机以及不可变快照。
- 原型中的 `scripted-no-Pi-no-LLM` 标识准确遵循零外部模型调用的安全约束。
- 原型在 `file://` 与 HTTP 双模态下提供一致的界面契约。
