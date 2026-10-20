# SimLab 经营仿真实验室 v0.2 · Proposal（Reviewed-Input 根规格源）

> **来源**：用户 2026-10-20 启动指令 + 已确认评审包 `/Users/huangbo/Dev/Projects/sim-lab/review-package/SimLab-v0.2`（解压自 `/Users/huangbo/Dev/Projects/sim-lab/SimLab_产品方案与UI评审包_v0.2.zip`，35 项 SHA-256 校验全过）。
> **地位**：本文为 `dev-flow`（reviewed-input 模式）的根规格源（`.flow/proposal.md` > `.flow/prd.md` > 实现建议）。后续 PRD、GRILL、UI-GATE（demo pinning）、ISSUES、IMPLEMENT、VERIFY、REVIEW 均以此为准，不得静默推翻。

---

## 0. 评审包完整清单与四分类（ASSESS 盘点）

评审包路径：`/Users/huangbo/Dev/Projects/sim-lab/review-package/SimLab-v0.2`

| 路径（相对评审包根） | 分类 | 说明与 SHA-256 摘要 |
| --- | --- | --- |
| `方案.md` | **(a) spec source** | 主产品方案 v0.2（产品决定、相对 v0.1 差异、metric-factory 借鉴、用户闭环、UI 结构、不变模型与 14 参数 + 2 冲击、Pi SDK 底座、分层架构、自然语言修改闭环与版本、工具合同、错误/失败/取消/未知状态、JuanerAI 插件接缝、工程切片与验收标准） |
| `工具合同与Pi接点.md` | **(a) spec source** | 配套实施合同规范（与 `pi-agent-runtime@0.4.3` 匹配的 `Tool` 接口与 `createSessionRuntime`/`createRuntime` 接法、通用请求/结果/错误信封、13 个完整工具清单、参数与影响贯穿执行、事件/错误/恢复语义、工程验收切口） |
| `使用与验证说明.md` | **(a) spec source / (c) validation record** | 5 分钟评审路径、模型/内核/浏览器验证说明、文件导航、复跑命令、限制与交付边界 |
| `README.md` | **(a) spec source** | 评审包总入口说明 |
| `index.html` | **(b) UI artifact** | 自包含可点击批准原型 demo（含内联 CSS、`simulation-core` 与 `app.js`），SHA-256 `6c04bf299a4084d57cf95b8ed443aa835e6cda262e179620c5c9547635e51858` |
| `template.html` | **(b) UI artifact** | UI HTML 骨架模板（230px 左栏、64px 顶栏、`<main id="main">`、`<dialog id="modal">`、`#toast`、skip-link） |
| `style.css` | **(b) UI artifact** | 完整视觉样式表（17,824 bytes，浅色灰绿工作台风格 `#f6f7f4`/`#fcfcfa`/`#27664f`） |
| `app.js` | **(b) UI artifact** | 原型前端交互逻辑（47,658 bytes，5 工作视图、右侧共创助手、建议差异与影响预览、采纳/放弃、口径确认门、D0–D30 滑块、完整日账弹窗、快照固定与导出、故障注入与未知回执查询） |
| `output/playwright/screenshots/00-home-desktop.png` | **(b) UI artifact** | 桌面端起步页批准截图（1440×1000） |
| `output/playwright/screenshots/01-draft-overview-desktop.png` | **(b) UI artifact** | 桌面端实验总览工作稿截图 |
| `output/playwright/screenshots/02-results-desktop.png` | **(b) UI artifact** | 桌面端三方案运行与结果截图 |
| `output/playwright/screenshots/03-proposal-desktop.png` | **(b) UI artifact** | 桌面端助手修改建议与差异影响预览截图 |
| `output/playwright/screenshots/04-evidence-desktop.png` | **(b) UI artifact** | 桌面端证据与口径（单变量敏感性与守恒）截图 |
| `output/playwright/screenshots/05-stale-result-desktop.png` | **(b) UI artifact** | 桌面端采纳修改后旧结果过期状态截图 |
| `output/playwright/screenshots/06-unknown-receipt-desktop.png` | **(b) UI artifact** | 桌面端运行结果未知与回执查询截图 |
| `output/playwright/screenshots/07-results-mobile.png` | **(b) UI artifact** | 窄屏端（390×844）结果页截图 |
| `output/playwright/screenshots/08-home-mobile.png` | **(b) UI artifact** | 窄屏端（390×844）起步页截图 |
| `output/playwright/screenshots/reference-current-home.png` | **(b) UI artifact** | 参考仓 metric-factory 首页对照截图 |
| `research/reference-approved-prototype-overview.jpg` | **(b) UI artifact** | 历史认可原型参考图 |
| `validation/model-regression.json` | **(c) validation record** | v0.1/v0.2 确定性内核 417 次运行、129,724 条断言回归通过记录及默认三方案数值摘要 |
| `validation/browser-verification.json` | **(c) validation record** | 真实 Chromium 156（Playwright）桌面 + 窄屏 57 项断言通过记录 |
| `validation/browser-run.log` | **(c) validation record** | 浏览器验收运行日志（注：`SHA256SUMS.json` 生成后附加或独立日志） |
| `validation/current-run-downloaded.json` | **(c) validation record** | 浏览器实际下载的当前运行 JSON 样本 |
| `validation/historical-snapshot-downloaded.json` | **(c) validation record** | 浏览器实际下载的历史快照 JSON 样本 |
| `research/core-sha256.txt` | **(c) validation record** | 冻结内核 SHA-256（`8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`） |
| `research/metric-factory-evidence.md` | **(c) validation record** | `metric-factory` 只读借鉴证据与源码行号定位 |
| `research/metric-factory-before.json` | **(c) validation record** | 参考仓只读检查前 Git 状态 |
| `research/metric-factory-after.json` | **(c) validation record** | 参考仓只读检查后 Git 状态 |
| `research/v0.1-preservation-manifest.json` | **(c) validation record** | v0.1 原始交付件 SHA-256 清单 |
| `SHA256SUMS.json` | **(c) validation record** | 评审包 35 个核心文件字节数与 SHA-256 清单 |
| `simulation-core.js` | **(d) tooling/scratch (frozen kernel source)** | v0.1 原样确定性 FIFO 仿真内核源码（9,906 bytes，SHA-256 `8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`），供产品直接复用与核验 |
| `build.py` | **(d) tooling/scratch** | 单文件原型组装脚本（校验 `simulation-core.js` SHA-256 并合成 `index.html`） |
| `tests/test_simlab.cjs` | **(d) tooling/scratch** | v0.1 原版 417 次运行 / 129,724 断言确定性内核回归测试脚本（不可删改语义） |
| `tests/browser-flow.cjs` | **(d) tooling/scratch** | 真实 Chromium 57 项端到端浏览器验收脚本 |
| `tests/browser-smoke.cjs` | **(d) tooling/scratch** | 浏览器冒烟脚本 |
| `archive/SimLab_v0.1_original.zip` | **(d) tooling/scratch** | 第一版完整 ZIP 字节级归档副本 |

---

## 1. 产品决定与定位（源自 `方案.md` §1–§4）

1. **核心定位**：做一个让业务负责人在活动开始前看清“哪里先撑不住、何时调整、会付出什么代价”的经营实验工作台（SimLab · 经营仿真实验室 v0.2）。默认从经营目标自然语言开始，Agent 先组织可讨论的实验草稿，用户修改假设、比较方案，再沿着每日库存、履约队列与现金追溯结果。
2. **第一期模型边界**：只做促销、库存、履约联动：30 天窗口（D1–D30，D0 单独记额外备货）、单 SKU、单仓、一单一件、确定性 FIFO。三种候选方案为：**基准促销（`baseline`）**、**提前备货（`advance`）**、**分批限量（`split`）**。
3. **权责边界**：Agent 负责理解、提议和解释；可验证的确定性内核（`simlab-daily-fifo-0.1.0`）负责数值与守恒。结果用于支持有条件的选择，不能把合成情景表述为现实预测、最优策略、因果效果或采购批准。
4. **演进策略**：先作为独立可运行工具验证使用价值，未来通过小而明确的接口成为 JuanerAI 插件。禁止修改 `metric-factory`、`JuanerAI` 或其他既有项目仓库；禁止未经另行明确授权发起真实付费模型调用、读取外部生产系统或外发敏感数据。
5. **最短用户闭环（7 步）**：
   - (1) 描述经营目标（如大促需求上行、供货延迟时，提前备货还是分批限量）；支持三条自然语言起步样例与场景模板起点，不支持的自由输入明确报错说明，不编造模型或假建议。
   - (2) 生成初始实验工作稿（目标理解、模型适用范围、参数来源、三方案与待确认假设；未知事实留空或明确用合成默认值）。
   - (3) 直接表单编辑参数或通过右侧助手提出结构化自然语言修改；助手先展示 before/after 结构化差异、政策联动说明与基于原内核计算的真实影响预览（现金低点、贡献毛利、取消单变化），再由用户显式点击“采纳修改”或“放弃”。
   - (4) 显式确认当前工作稿 revision 的口径与假设（`confirm_caliber`），再主动运行三方案（`run_experiment`）。确认不是模型正确性替代，也不是业务行动批准；未确认或有未保存表单编辑时阻断运行。
   - (5) 在同一外部环境下比较三方案（现金低点、贡献毛利、取消/未受理、首触护栏），切换队列/库存/现金逐日曲线，点击风险首触日或拖动 D0–D30 滑块查看当日日账与完整 30 天逐日账弹窗。
   - (6) 在“证据与口径”查看逐日/窗口守恒、需求分解、冻结政策下的 4 项单变量敏感性重跑、计算定义与内核 SHA-256。
   - (7) 在“检查与快照”核对 4 项状态检查（输入参数有效、当前口径确认、运行与工作稿一致、当前计算守恒），固定不可变快照（`save_snapshot`）并下载全量 JSON（`export_snapshot`）。后续修改工作稿使 revision 递增、旧确认失效、旧运行标记为“结果已过期”且阻断当前结果导出，但历史快照保持不变且仍可独立下载。

---

## 2. 严格保留的确定性内核与数值口径（源自 `方案.md` §2, §6）

1. **原内核字节级不变**：`simulation-core.js` 与 v0.1 原文本逐字一致，SHA-256 必须为：
   `8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`
   模型版本固定为 `simlab-daily-fifo-0.1.0`。原版测试 `tests/test_simlab.cjs`（417 次模型运行、129,724 条断言）原样保留且必须全部通过。
2. **14 个数值参数与 2 个布尔外部冲击（`PARAM_RULES` 与 `DEFAULTS`）**：
   - `days`: 固定 30（D1–D30，D0 记额外备货）
   - `demand`: 默认 180，单/天，整数 `0..5000`
   - `inventory`: 默认 1800，件，整数 `0..100000`（期前已付）
   - `capacity`: 默认 250，件/天，整数 `0..10000`
   - `leadTime`: 默认 5，天，整数 `1..30`
   - `promo`: 默认 80，%，浮点数 `0..200`（`baseline`/`advance` 在 D8–D14 增需 `promo%`；`split` 在 D8–D21 增需 `promo/2%` 且每日最多接 `capacity` 单）
   - `price`: 默认 128，元/件，`0..100000`
   - `cost`: 默认 72，元/件，`0..100000`
   - `fulfillmentCost`: 默认 9，元/发货件，`0..1000`
   - `holdingCost`: 默认 0.15，元/日末现货件/天，`0..100`
   - `cash`: 默认 180000，元，`0..100000000`（D0 采购前）
   - `extraStock`: 默认 900，件，整数 `0..100000`（仅 `advance` 方案 D0 取得额外现货，库存增加且现金立即扣减 `extraStock * cost`）
   - `maxWait`: 默认 3，天，整数 `0..30`（下单日年龄为 0）
   - `cashThreshold`: 默认 20000，元，`0..100000000`（严格小于 `<` 触发）
   - `backlogThreshold`: 默认 500，件，整数 `0..100000`（严格大于 `>` 触发）
   - `demandShock`: 默认 `true`（D8–D21 需求再乘 `1.30`）
   - `supplyShock`: 默认 `true`（D1/D8/D15/D22 四笔计划采购提前期 `+3` 天，D0 现货不受影响）
3. **每日顺序与守恒规则**：
   - 每日顺序：到货 → 生成并接收订单 → FIFO 发货 → 发货尝试后超时取消（`当前日 - 下单日 >= maxWait`） → 确认收款、成本、履约与持有费 → 固定计划采购（D1/D8/D15/D22 各下单 `round(demand * 7)` 件）并付款 → 保存日末状态和阈值。
   - 贡献毛利 = `shipped * (price - cost - fulfillmentCost)`；模型经营结余 = `贡献毛利 - holdingCost`（不是净利润）。
   - 日末现金 = `前日现金 + 发货收款 - 当日采购付款 - 履约费 - 持有费`；现金低点含 D0。
   - 零分母（如 `demand === 0` 时潜在需求发货率、已接单发货率、已接单取消率）保持 `null`，界面显示“不适用”。
   - 单变量敏感性：对 `demandDown`（需求 −20%）、`demandUp`（需求 +20%）、`capacityDown`（履约能力 −20%）、`leadUp`（到货周期 +2 天）独立重跑，冻结原采购日、采购量及分批方案接单上限。修改工作稿 `capacity` 或 `demand` 属于修改经营政策，预览时必须明确声明政策联动，不与冻结政策的单变量敏感性混称。

---

## 3. UI 结构与已批准原型基线（源自 `方案.md` §3, §5 及 `index.html`/`app.js`/`style.css`）

1. **视觉与布局壳层**：复用 `metric-factory` 产品壳与密度（`#f6f7f4` / `#fcfcfa` / `#f0f2ed` 浅色表面，`#27664f` 绿色主动作，230px 左栏，64px 顶栏，五个工作视图 tab，右侧共创助手栏，原生 `<dialog id="modal">` 弹层，底部 `#toast`，中文系统字体栈）。
2. **窄屏与无障碍**：390×844 窄屏隐藏固定左栏并通过菜单按钮展开，助手置于成果之后，工作视图导航与宽日账局部横向滚动，整页无横向溢出（`documentElement.scrollWidth <= innerWidth`）；保留 skip-link、键盘焦点、`<label>` 绑定、原生 dialog Esc 关闭且焦点回归、D0–D30 滑块键盘 Home/Arrow 操作、`aria-current`/`aria-pressed`/`aria-live`/`role="alert"`。
3. **五个工作视图**：
   - `01 实验总览 (overview)`：经营目标理解、修正目标弹窗、实验边界说明、三方案可检验选择、共同环境与经营护栏、口径确认盒。
   - `02 参数与情景 (params)`：共同经营参数（8 项）、费用与现金口径（6 项）、外部冲击开关（2 项）、表单脏状态拦截（未保存编辑暂停运行与导出，并阻断页面切换丢失输入）、放弃编辑 / 保存参数。
   - `03 运行与结果 (results)`：三方案比较表、方案切换按钮、三项核心指标卡（日末现金低点含 D0、累计贡献毛利、积压峰值）、逐日 SVG 曲线（队列/库存/现金切换 + D8–D21 冲击窗口 + 护栏线 + 选日竖线）、D0–D30 滑块与当日 8 项日账摘要、完整 30 天逐日账弹窗、风险首触日跳转与窗口末尾 8 项状态指标。
   - `04 证据与口径 (evidence)`：4 条核心计算口径定义、当前所选方案 3 项守恒校验状态、4 行单变量敏感性表格、计算身份与来源（`modelVersion`、`core SHA-256`、限制说明）。
   - `05 检查与快照 (versions)`：4 项一致性检查（输入参数有效、当前口径确认、运行与工作稿一致、当前计算守恒）、固定当前实验快照（最多 10 份，同一运行+revision 去重）、历史快照列表与独立 JSON 下载、运行状态演示（故障注入：`normal` / `failed` / `unknown`）及回执显示。

---

## 4. 正式产品架构、工具合同与 Pi 接点（源自 `方案.md` §7–§12 及 `工具合同与Pi接点.md` §1–§6）

1. **分层架构与权威边界（`方案.md` §8）**：
   - **UI 层**：输入、展示差异、明确采纳、确认与运行、定位证据；不写公式、不伪造运行状态。既支持纯静态离线打开（`index.html`），也支持通过本地工作台服务端 API 持久化协作。
   - **应用服务层（Application Service）**：管理实验工作稿（`experimentId`, `revision`, `confirmedRevision`）、参数校验、提案（`proposal`）、运行（`run`）、操作回执（`operation receipt`）、不可变快照（`snapshot`）与 JSON 导出；强制版本 CAS 与前置条件核验。
   - **Pi Adapter 层**：对接本机共享基础包 `pi-agent-runtime@0.4.3`（`file:vendor/pi-agent-runtime-0.4.3.tgz`，内部 `@earendil-works/pi-agent-core@0.86.1` 与 `@earendil-works/pi-ai@0.86.1`），收敛 `createRuntime().runAgent()` 与 `createSessionRuntime()` 调用；业务代码与 UI 不直接散落 import Pi 内部包。提供离线可脚本化的 `ModelTransport`（默认零外部网络调用、零模型费用）以及持久 `AuditSink`、原子持久 `BudgetStore`、`SessionStorage`（独占 writer 锁 `acquireWriter`）、`bindOperation` 与 `reconcile`。
   - **声明式仿真工具层（13 个工具）**：所有工具 `parameters` 根对象设 `additionalProperties: false`，校验失败返回结构化 `rejected_not_executed`（含 `operationId`, `status`, `execution: "not_started"`, `code`, `issues`, `retry: "after_correction"`），不得用笼统 `ok: false` 混淆是否已执行：
     1. `inspect_model` (`read` / `safe`): 输入 `modelId`, `version?` → 返回 `modelVersion`, `coreHash`, `parameterSchema`, `units`, 三方案规则, 日序, 口径, 支持冲击, 限制, 来源资格；未知模型拒绝。
     2. `read_draft` (`read` / `safe`): 输入 `experimentId` → 返回 `revision`, `goal`, `parameters`, `confirmedRevision`, 最新结果引用；只读不改确认。
     3. `propose_change` (`write` / `never`): 输入 `experimentId`, `expectedRevision`, `patch`, `rationale`, `assumptions` → 返回 `proposalId`, `baseRevision`, 规范化 `patch`, 来源与未决项；只存提案不改稿；模型不适配返回 `UNSUPPORTED_MODEL`。
     4. `preview_change` (`read` / `safe`): 输入 `experimentId`, `proposalId`, `baseRevision`, `modelVersion` → 实际调用确定性内核重算 before/after `inputHash`、三方案完整 delta、基准方案摘要 delta、阈值变化、守恒、政策联动（`split.acceptanceCap follows capacity` / `scheduledProcurement follows demand`）；过期提案返回 `STALE_PROPOSAL`。
     5. `apply_proposal` (`write` / `never`): 输入 `experimentId`, `proposalId`, `expectedRevision`, `acceptedPreviewHash`, `hostAcceptanceRef` → 核验宿主保存的 UI 采纳凭据（拒绝模型自述用户已同意），CAS 更新工作稿至 `newRevision`，清空 `confirmedRevision`（`confirmationInvalidated: true`），保留历史运行并标记受影响运行 `affectedRuns`。
     6. `confirm_caliber` (`write` / `never`): 输入 `experimentId`, `expectedRevision`, `scopeHash`, `hostReviewRef` → 仅 UI/宿主直接命令凭有效 `hostReviewRef` 可授予（Agent 自行调用无宿主凭据时拒绝），记录 `confirmedRevision` 与 review 记录。
     7. `run_experiment` (`write` / `never`): 输入 `experimentId`, `expectedRevision` (`revision`), `modelVersion`, `inputHash`, `idempotencyKey`, `requestedEvidence` → 核验 `confirmedRevision === revision` 与 `inputHash` 一致；支持幂等回执（同键同输入返回原回执，同键异输入拒绝）；从服务端读取当前 revision 参数运行确定性内核（绝不接受 Agent 传入结果数字或暗改参数）；核验守恒通过后原子提交 `runId`、三方案结果、30 天记录、采购/订单、敏感性、守恒检验。
     8. `get_operation` (`read` / `safe`): 输入 `operationId` → 返回 `admission`, `status`, `execution`, `runId`, `knownEffects`, `retry`；查不到权威结算回执时维持 `unknown`。
     9. `get_run` (`read` / `safe`): 输入 `runId` → 返回冻结 `parameters`, `modelVersion`, `inputHash`, 结果与验证，以及相对于当前工作稿是否 `historical`。
     10. `read_evidence` (`read` / `safe`): 输入 `runId`, `scenarioId` (`baseline|advance|split`), `kind` (`summary|day|ledger|thresholds|sensitivity|conservation`), `day?` (`0..30`) → 返回带单位、公式定义、来源、日号及残差的真实数据；不存在的证据返回 `NOT_FOUND`，不补数。
     11. `cancel_operation` (`write` / `never`): 输入 `operationId`, `hostStopRef` → 传递 `AbortSignal` 并记录 `stopRequested`；计算开始前取消为 `cancelled_not_executed`（`execution: "not_started"`），执行中收到取消进入 `cancelling` 并等待物理结算与回执。
     12. `save_snapshot` (`write` / `never`): 输入 `experimentId`, `runId`, `expectedRevision`, `confirmedRevision`, `hostFreezeRef` → 核验当前稿、确认、运行版本一致且守恒通过，生成不可变 `snapshotId` 与 hash；同一 `(runId, revision)` 去重。
     13. `export_snapshot` (`read` / `safe`): 输入 `snapshotId`（或当前运行导出）, `format: "json"` → 返回固定输入、模型/参数 schema 版本、完整结果/日账/敏感性/检验、来源、限制、hash 及 `historical` 标识。
   - **单一实验存储层（Store）**：本地事务性文件存储（写临时文件 + fsync/rename 原子提交），持久化工作稿、提案、宿主授权凭据（采纳/确认/冻结/停止）、运行回执、运行结果与不可变快照。
   - **未来 JuanerAI 插件入口接缝（`方案.md` §12）**：提供小而明确的应用服务调用接缝（以 `modelVersion`, `inputHash`, `runId`, `operationId`, `snapshotId`, `evidenceRefs`, `scope / units / limitations` 为核心），不把业务账搬进宿主 Agent prompt，不修改宿主仓库。

---

## 5. 错误、失败、取消与结果未知语义（源自 `方案.md` §11 及 `工具合同与Pi接点.md` §5）

| 情况 | 已执行？ | 状态与产品行为 |
| --- | --- | --- |
| 参数范围 / schema / revision 错误 | 否 (`not_started`) | `rejected_not_executed`；指出字段与原因，保留工作稿与旧结果，不启动内核，`retry: "after_correction"` |
| 计算或提交已知失败（含守恒未通过） | 是或已进入执行 (`started` / `settled`) | `failed`；记录阶段和原因，不提交成功结果，`retry: "new_operation_allowed"` |
| 计算前取消已确认 | 否 (`not_started`) | `cancelled_not_executed`；保留旧结果，`retry: "new_operation_allowed"` |
| 执行中收到取消 | 尚不能断言 (`started`) | `cancelling`；传 `AbortSignal`，等待物理结束与回执，最终可能结算为成功、失败、已取消或未知 |
| 超时、断连、进程崩溃、回执丢失 | 不确定 (`unknown`) | `unknown`；阻断自动/手动盲目重跑（`retry: "query_only"`），必须先按 `operationId` 查询回执（`get_operation` / `reconcile`） |
| 查询确认已经成功 | 是 (`settled`) | 回收原 `runId` 与原计算结果，不重新计算，恢复同一 `operationId` 关联 |

- 恢复顺序：`inspect` / `get_operation` 只读 → 对齐 session / task / revision / budgets / receipt → `reconcile` 返回 `ready` 才推进 → `resume` 同一 operation；`unknown` 保持暂停并阻断 fallback 重跑工具。

---

## 6. 四个工程切片与验收标准（源自 `方案.md` §12, §14 及 `工具合同与Pi接点.md` §6）

1. **切片 ①：固化独立内核服务与回归**
   - 保持 `simulation-core.js` 原字节与 SHA-256（`8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`）完全不变；
   - 封装 TypeScript 内核服务与 canonical `inputHash`、参数校验器（复用 `PARAM_RULES`）；
   - 原 `tests/test_simlab.cjs`（417 次运行、129,724 条断言）全绿通过。
2. **切片 ②：当前共享 runtime adapter、离线 transport 和完整 13 工具合同**
   - 集成 `vendor/pi-agent-runtime-0.4.3.tgz`；
   - 实现本地事务性实验存储、应用服务与全部 13 个声明式仿真工具（含 `additionalProperties: false` schema 校验、结构化信封、宿主采纳/确认/冻结凭据核验、revision CAS、幂等冲突检测）；
   - 使用离线 `ModelTransport` 验证 `runAgent` 与 `createSessionRuntime` 工具调用闭环。
3. **切片 ③：原子回执 / 会话恢复与受控执行边界**
   - 实现原子操作回执落盘、计算前取消（`cancelled_not_executed`）、取消后迟到成功处理、断连/回执丢失后的 `unknown` 阻断盲目重试、按 `operationId` 查询恢复同一结果（不重算）、`createSessionRuntime` 独占会话 writer 锁（未 `waitForIdle` 不释放）与持久预算账本（重启/重开不重置历史消耗）。
   - 注：真实付费模型 Provider 联调按 `方案.md` §1/§7/§12 规定保持未启用（零外部调用、零费用），保留环境配置与 adapter 接缝并在交付中如实披露。
4. **切片 ④：独立工作台产品闭环（UI 1:1 复刻基线 + 本地 HTTP 服务 + CLI + 一键启动 + JuanerAI 插件最小接缝）**
   - 保持自包含 `index.html`（`python3 build.py` 生成）与本地 HTTP 工作台服务（`sim-lab ui` / `启动工作台.command` / `scripts/start-ui.sh`）双路径可用，前端同时支持服务端 API 持久化与离线回退；
   - 暴露 JuanerAI 插件最小应用服务接缝（`src/plugin/juanerai-seam.ts`）与契约测试；
   - 真实 Chromium（Playwright）57 项桌面（1440×1000）与窄屏（390×844）端到端验收全绿，控制台/页面错误 0，外部请求 0。

---

## 7. 评审包内的开放实现细节（留给 PRD / GRILL 落定）

1. **代码组织与构建栈**：采用与参考仓 `metric-factory` 一致的 Node.js (`>=22.19.0`) + TypeScript ESM + `tsup` + `vitest` + `playwright` 栈，复用本机 `/Users/huangbo/Dev/Projects/metric-factory/vendor/pi-agent-runtime-0.4.3.tgz`。
2. **前端双模同源策略**：`build.py` 产出的自包含 `index.html` 供 `file://` 与静态评审验收（保持 57 项浏览器验收 100% 兼容），同时本地 HTTP 服务（`sim-lab ui`）挂载 `/api/v1/...` 服务端事务存储与回执接口，并将状态同步到服务端落盘。
3. **一键启动脚本端口**：遵循 `metric-factory` / `data-mcps` 惯例提供 `启动工作台.command` 与 `scripts/start-ui.sh`（默认端口 4175，被占用自动顺延 4176，`SIMLAB_PORT` 可覆盖，`SIMLAB_NO_OPEN=1` 跳过自动打开浏览器）。
