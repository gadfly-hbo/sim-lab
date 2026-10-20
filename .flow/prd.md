# SimLab 经营仿真实验室 v0.2 · PRD（Reviewed-Input 薄转录与验收规范）

> **模式说明**：本 PRD 由 `dev-flow` reviewed-input 模式生成，以 `.flow/proposal.md`（源自评审包 `方案.md`、`工具合同与Pi接点.md`、`使用与验证说明.md`）为唯一上游规格源，将已确认方案薄转录为任务级可检验验收条件（Acceptance Criteria），并将 `.flow/red-team.md` 的 5 项非阻断风险转化为显式工程约束与缓解措施。未配置外部 Issue Tracker，按 fallback 规则落盘于 `.flow/prd.md`。

---

## Problem Statement

活动与业务负责人在大促备战前需要判断“需求上行与供货延迟同时发生时，基准促销、提前备货、分批限量三种方案哪里先撑不住（现金低点或履约积压）、何时越过护栏、修改某项假设会付出什么代价”。静态表格测算无法反映 30 天内到货、接单、FIFO 发货、超时取消与固定采购付款的逐日耦合；而纯自由对话 Agent 容易编造数值、混淆单变量敏感性与经营政策修改、或在断连/取消/重试时丢失版本与回执权威。

## Solution

交付可独立运行的 **SimLab 经营仿真实验室 v0.2** 本地产品与工作台：
1. **字节级固化 v0.1 确定性 FIFO 内核**（`simulation-core.js`，SHA-256 `8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`，模型版本 `simlab-daily-fifo-0.1.0`），确保 417 次模型运行、129,724 条断言回归全绿；
2. **本地事务性实验存储与应用服务**：支持工作稿 `revision`、口径确认 `confirmedRevision`、结构化提案 `proposal`（含内核真实重算影响预览与政策联动声明）、运行 `run`、操作回执 `operation receipt` 与不可变快照 `snapshot`，严守宿主授权凭据（`hostAcceptanceRef` / `hostReviewRef` / `hostFreezeRef` / `hostStopRef`）与版本 CAS；
3. **13 个声明式仿真工具与 `pi-agent-runtime@0.4.3` 适配层**：通过 `vendor/pi-agent-runtime-0.4.3.tgz` 对接 `createRuntime().runAgent()` 与 `createSessionRuntime()`，提供离线可脚本化 `ModelTransport`、持久 JSONL `AuditSink`、原子文件 `BudgetStore`、独占会话 writer 锁 `SessionStorage`、`bindOperation` 与 `reconcile`；
4. **1:1 复刻已批准 v0.2 UI 原型的双模工作台与 CLI + JuanerAI 插件最小接缝**：既保留自包含 `index.html`（通过全部 57 项真实 Chromium 桌面/窄屏断言），又提供 `sim-lab ui` 本地 HTTP 工作台服务端 API、CLI 命令与一键启动脚本（`启动工作台.command` / `scripts/start-ui.sh`），并暴露 JuanerAI 插件最小服务接缝。

---

## User Stories & Task-Level Acceptance Criteria（按规格章节可追溯）

### A. 确定性内核与数值守恒（追溯：`proposal.md` §2 / `方案.md` §2, §6, §14）

1. **As a 业务负责人**, I want the simulation engine to preserve the exact v0.1 deterministic FIFO rules and SHA-256 (`8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`), so that UI and Agent upgrades never alter accounting formulas.
   - **AC-A1**: `simulation-core.js` 字节级 SHA-256 恒等于 `8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`；原版测试 `tests/test_simlab.cjs` 在不修改断言的条件下运行 417 次仿真、129,724 条断言全部 PASS。
   - **AC-A2**: 完整支持 14 个可调数值参数与 2 个布尔冲击（`PARAM_RULES` 与 `DEFAULTS`），非法参数（超范围、非整数、NaN、`days !== 30`）立即拒绝且不改变状态。
   - **AC-A3**: 默认参数下三方案（`baseline` / `advance` / `split`）一次生成 30 天逐日记录与 4 项冻结政策单变量敏感性（`demandDown` / `demandUp` / `capacityDown` / `leadUp`），默认 `baseline` 累计贡献毛利精确为 `274010` 元，`validationPassed === true`。
   - **AC-A4**: 当 `demand === 0` 时，零分母比率（`fulfillmentRate`、`acceptedFulfillmentRate`、`cancelRate`）保持 `null`，UI 渲染为 `不适用`。
   - **AC-A5**: 提供确定性 canonical `inputHash`（格式 `sha256:<hex>`），对 canonical 参数、模型版本、内核 hash、三方案定义、冲击与采购政策计算唯一摘要；相同业务输入恒得相同 `inputHash`。

### B. 实验工作稿生命周期、提案预览、CAS 与快照（追溯：`proposal.md` §1, §4 / `方案.md` §4, §9, §10）

2. **As a 业务负责人**, I want to start from a natural-language business goal or scenario template and get an editable experiment draft (`revision = 1`, `confirmedRevision = null`), so that assumptions are explicit before any simulation runs.
   - **AC-B1**: 支持 3 条起步样例与场景模板创建工作稿（初始 `revision = 1`，`confirmedRevision = null`，无虚构运行结果）；不支持的自由文本起步或修改请求返回诚实边界说明（或 `UNSUPPORTED_MODEL`），不编造模型或假建议。
3. **As a 业务负责人**, I want natural-language or structured change proposals to preview deterministic kernel deltas and policy coupling before I decide to adopt or discard them, so that suggestions never silently overwrite my draft.
   - **AC-B2**: `propose_change` 仅创建绑定 `baseRevision` 的提案（`P-xxx`），不修改工作稿参数、不推进 `revision`、不使已有确认失效；`preview_change` 必须实际调用确定性内核重算 before/after `inputHash`、三方案完整数值 delta（及基准方案现金低点/贡献毛利/取消单变化）、阈值变化与守恒，并在修改 `capacity`（联动改变 `split.acceptanceCap`）或 `demand`（联动改变计划采购量 `round(demand * 7)`）时显式返回 `policyCoupling` 声明。
   - **AC-B3**: 放弃提案（`discard`）保持 `revision`、`confirmedRevision` 与参数不变；采纳提案（`apply_proposal`）必须核验 `expectedRevision === baseRevision`、`acceptedPreviewHash` 与宿主保存的 `hostAcceptanceRef`（拒绝模型自称用户同意），成功后 `revision` 递增、`confirmedRevision` 清空（`confirmationInvalidated: true`），旧运行结果字节级保留并标记为过期/历史。
4. **As a 业务负责人**, I want caliber confirmation (`confirm_caliber`) and snapshot freezing (`save_snapshot`) to be strictly gated by revision consistency and host UI authority, so that stale results cannot be exported as current or overwritten.
   - **AC-B4**: `confirm_caliber` 必须核验 `expectedRevision === draft.revision`、`scopeHash` 与有效 `hostReviewRef`（Agent 无宿主凭据自行调用时返回 `AUTHORITY_REQUIRED` / `rejected_not_executed`）；修改工作稿目标文本或参数后旧确认立即失效，阻断未确认运行与过期“当前结果”导出。
   - **AC-B5**: `save_snapshot` 要求 `expectedRevision === confirmedRevision === run.revision` 且 `run.validationPassed === true` 及有效 `hostFreezeRef`；同一 `(runId, revision)` 重复固定去重拒绝；最多保留 10 份快照（或可配置上限），后续修改工作稿与重跑绝不改变已固定快照内容，历史导出明确标记 `historical: true`。

### C. 13 个声明式仿真工具合同与结构化信封（追溯：`proposal.md` §4 / `工具合同与Pi接点.md` §2–§4）

5. **As a 平台工程师**, I want all 13 simulation tools (`inspect_model`, `read_draft`, `propose_change`, `preview_change`, `apply_proposal`, `confirm_caliber`, `run_experiment`, `get_operation`, `get_run`, `read_evidence`, `cancel_operation`, `save_snapshot`, `export_snapshot`) to enforce `additionalProperties: false` and structured request/result/error envelopes, so that Agent tool execution is auditable and side-effect safe.
   - **AC-C1**: 全部 13 个工具按 `Tool` 接口注册（含 `name`, `description`, `effect`, `parameters`, `resourceUnits`, `executionMode`, `replay`, `policyVersion`, `execute`），根 schema 均设 `additionalProperties: false`；副作用工具（`effect: 'write'`）默认 `executionMode: 'sequential'`, `replay: 'never'`，纯读工具（`effect: 'read'`）设 `replay: 'safe'`。
   - **AC-C2**: 参数范围（`PARAM_RULES`）、`expectedRevision` CAS、`confirmedRevision` 前置条件或模型版本不匹配时，返回结构化 `rejected_not_executed` 信封（含 `operationId`, `status: "rejected_not_executed"`, `execution: "not_started"`, `code`, `issues`, `retry: "after_correction"`），禁止用笼统 `ok: false` 混淆是否已执行，且不启动内核或产生写副作用。
   - **AC-C3**: `run_experiment` 要求 `confirmedRevision === revision`、`inputHash` 与服务端当前工作稿 canonical 输入一致，且必须从服务端读取当前 `revision` 参数计算（忽略/拒绝任何外部传入的结果数字）；支持 `idempotencyKey`（同键同输入返回同一回执与结果，同键异输入拒绝 `IDEMPOTENCY_CONFLICT`）。
   - **AC-C4**: `read_evidence` 支持 `scenarioId: baseline|advance|split`、`kind: summary|day|ledger|thresholds|sensitivity|conservation` 及 `day: 0..30`，返回带单位、公式定义、来源、日号及守恒残差的真实数据；查询不存在的 `runId`、非法 `day` 或缺失证据时返回结构化 `NOT_FOUND`，绝不补数。

### D. `pi-agent-runtime@0.4.3` 适配、取消、未知回执与会话恢复（追溯：`proposal.md` §4, §5 / `方案.md` §7, §11 / `工具合同与Pi接点.md` §1, §5, §6）

6. **As a 平台工程师**, I want the Pi Adapter to integrate `pi-agent-runtime@0.4.3` (`runAgent` and `createSessionRuntime`) with persistent audit/budget/session stores and deterministic failure/cancellation/unknown recovery semantics, so that interrupted or uncertain executions never trigger blind retries.
   - **AC-D1**: 仅在 Pi Adapter 模块内 import `pi-agent-runtime`（业务与 UI 层零 Pi 直接依赖，由 guard 测试锁定）；支持 `createRuntime().runAgent()` 与 `createSessionRuntime()`，配备 JSONL 持久 `AuditSink`、带文件锁的跨进程原子 `BudgetStore`（重启或重开不重置历史消耗）、带独占 writer 锁的 `SessionStorage`（`acquireWriter`，未物理收尾 `waitForIdle` 不释放且拒绝并发抢占）、`bindOperation` 与 `reconcile`。
   - **AC-D2**: 区分 6 类运行与回执状态：
     1. `rejected_not_executed`（`execution: "not_started"`, `retry: "after_correction"`）
     2. `cancelled_not_executed`（计算开始前取消，`execution: "not_started"`, `retry: "new_operation_allowed"`，保留旧结果）
     3. `cancelling`（执行中收到 `cancel_operation` / `AbortSignal`，传递信号并等待物理收尾与回执结算，支持测试“取消后迟到成功”与“取消后中止”）
     4. `failed`（已知计算或提交失败、或守恒未通过，`retry: "new_operation_allowed"`，不提交成功结果）
     5. `unknown`（超时、断连、进程崩溃或回执丢失，`execution: "unknown"`, `retry: "query_only"`，阻断自动与手动重跑/重放）
     6. `succeeded`（查询 `get_operation` / `reconcile` 确认已有权威成功回执时，直接回收原 `runId` 与结果，不重新运行内核）。
   - **AC-D3**: 恢复顺序严格执行：`inspect` / `get_operation` 只读 → 对齐 session / task / revision / budgets / receipt → `reconcile` 返回 `'ready'` 才推进；当存在未结算或 `unknown` 操作时，`reconcile` 返回 `'unknown'` 并在 Adapter 层映射为产品 `unknown` 状态（`retry: "query_only"`），阻断 fallback 或自动重跑业务工具。

### E. 工作台 UI（1:1 复刻基线）、本地 HTTP 服务、CLI 与 JuanerAI 插件接缝（追溯：`proposal.md` §3, §6, §7 / `方案.md` §5, §12, §14）

7. **As a 业务负责人与评审员**, I want both the self-contained `index.html` and the local HTTP workbench (`sim-lab ui` / `启动工作台.command`) to render the exact approved v0.2 UI and pass all 57 real Chromium desktop (1440×1000) and mobile (390×844) checks, so that the product experience matches the approved baseline pixel-for-pixel and interaction-for-interaction.
   - **AC-E1**: `python3 build.py` 生成的自包含 `index.html` 内嵌字节级一致的 `simulation-core.js`，并通过 `node tests/test_simlab.cjs index.html`（417 次运行 / 129,724 断言）与真实 Chromium `node tests/browser-flow.cjs` 的全部 57 项断言（含 230px 侧栏、64px 顶栏、5 视图、D0–D30 键盘滑块、30 行日账弹窗、Esc 关闭焦点回归、4 项敏感性、采纳/放弃、过期阻断、零分母“不适用”、取消/失败/未知查询恢复、刷新恢复、`file://` 直开、1440×1000 与 390×844 零横向溢出、控制台错误 0、外部请求 0）。
   - **AC-E2**: 提供本地 HTTP 服务（`sim-lab ui --port <port> --data-root <dir>`，仅监听 `127.0.0.1`）与 REST/JSON API（`/api/v1/health`, `/api/v1/models`, `/api/v1/experiments`, `/api/v1/experiments/:id/proposals`, `/api/v1/experiments/:id/confirm`, `/api/v1/experiments/:id/runs`, `/api/v1/operations/:opId`, `/api/v1/runs/:runId/evidence`, `/api/v1/experiments/:id/snapshots`, `/api/v1/tools/:toolName`），以及 `启动工作台.command` + `scripts/start-ui.sh`。
   - **AC-E3**: 提供 JuanerAI 插件最小接缝模块（`src/plugin/juanerai-seam.ts`），围绕 `modelVersion`, `inputHash`, `runId`, `operationId`, `snapshotId`, `evidenceRefs`, `scope / units / limitations` 暴露类型化应用服务契约，不把业务账放进宿主 prompt，不修改外部仓库。

---

## Risk & Mitigation Register（源自 `.flow/red-team.md` KA1–KA5）

| 风险 ID | 红队发现摘要 | 工程缓解措施（纳入实现与测试） |
| --- | --- | --- |
| **KA1** | 双模 UI 状态权威冲突：若 `app.js` 改为全异步等待 `/api/v1/...` 会破坏 `tests/browser-flow.cjs` 的同步 `window.SimLab.getState()` 断言与 `file://` 零请求要求；若仅做后台镜像则服务端 CAS/凭据无法阻断非法状态 | **双模同源 + 显式模式接缝**：默认静态模式（`file://` 及默认无 query 的 `index.html`）保持 100% 同步本地状态机与 `localStorage`，确保 `browser-flow.cjs` 57 项断言零改动全绿；同时在 `app.js` / `server.ts` 提供服务端权威 API 通道（`/api/v1/...` 及 `?mode=server` 或 `window.SimLab.syncWithServer` API），由专门的服务端 HTTP + Playwright/API 集成测试验证 409 CAS 冲突与宿主凭据阻断。 |
| **KA2** | `pi-agent-runtime@0.4.3` 的 `validateToolArguments` 在调用 `tool.execute` 前拦截 JSON Schema 错误并抛出 `RuntimeFault('INVALID_TOOL')` 终止整轮运行，且 `tool.execute` 内抛错会触发 `TOOL_FAILED` | **双层校验与结构化返回**：(1) `Tool.parameters` 保持严格的根级 `type: 'object'`, `additionalProperties: false` 与字段基础类型声明，拦截未知字段；(2) 业务参数范围（`PARAM_RULES`）、`expectedRevision` CAS、`confirmedRevision` 等规则在 `tool.execute` 顶部校验并**正常 return（不 throw）**结构化 `rejected_not_executed` JSON 信封，供 Agent 在下一轮自我修正；(3) 在 Pi Adapter 边界将 SDK 抛出的 `INVALID_TOOL` / `INVALID_REQUEST` 统一映射为应用层 `rejected_not_executed`（`execution: "not_started"`）回执。 |
| **KA3** | `SessionRuntime` 原生 `operationId` 是单次 session turn 级别（多工具共享），`runAgent` 下 `invocation` 为 `undefined`，且 `reconcile` 返回 `'unknown'` 时 SDK 抛出 `STATE_FAILED` | **操作身份分层与 `STATE_FAILED` 精准映射**：(1) 应用操作回执 ID（`OP-xxx`）按每次工具调用（关联 `invocation.toolCallId` / `invocation.invocationId` 与 session `invocation.operationId`，无 `invocation` 时由应用服务分配）独立建档，避免同轮多工具覆盖；(2) Adapter 在调用 `sessionRuntime.run` 前后结合 `reconcile` 状态：当因存在 `unknown` 回执使 `reconcile` 返回 `'unknown'`（SDK 返回 `status: 'failed', reason: 'STATE_FAILED'`）时，Adapter 将其还原映射为产品状态 `unknown`（`retry: "query_only"`），绝不误标为可重跑的 `failed`。 |
| **KA4** | 同步内核 `simulation-core.js` 单次计算仅需 ~1–2ms，若在主线程直接同步执行并立即落盘，则无法在计算中触发 `cancelling` 或确定性验证“取消后迟到成功” | **受控异步执行阶段钩子（Execution Stage Boundary）**：在不改动 `simulation-core.js` 一字节的前提下，应用服务的 `run_experiment` 将执行划分为 `admitted (pre-calc wait/hook)` → `kernel calculation (in-flight hook/worker boundary)` → `settlement (atomic commit)` 三阶段。支持传入确定性阶段门闩（Execution Gate / Delay Hook）：在 `pre-calc` 收到 `cancel_operation` / `AbortSignal` 立即结算为 `cancelled_not_executed`；在 `in-flight` 收到取消则进入 `cancelling`，并可确定性测试“内核物理算完后迟到成功结算 vs 放弃提交”。 |
| **KA5** | 固定周采购（`round(demand * 7)`）与发货即收款假设在真实业务中可能与账期/动态补货不符，用户自然语言尝试修改这些规则时易受挫 | **诚实边界与结构化拒止**：在 `inspect_model`、`propose_change` 与 UI 助手明确列出 `unmodeled` 列表（账期、退货、多仓、动态补货等），当自然语言或工具请求触及未建模规则时，返回 `UNSUPPORTED_MODEL` 及具体原因说明，绝不静默近似或篡改现有参数冒充支持。 |

---

## Implementation Decisions

1. **工程与构建栈**：Node.js (`>=22.19.0`，本机 `v24.21.0`)、TypeScript (`strict: true`, ESM `NodeNext`)、`tsup`（打包 `dist/cli.js` 并复制静态前端资产）、`vitest`（单元/合同/集成测试）、`playwright`（真实 Chromium 端到端验收）。依赖 `pi-agent-runtime`（通过本地 `vendor/pi-agent-runtime-0.4.3.tgz` 引入）。
2. **模块划分**：
   - `simulation-core.js`（根级与 `review-package/SimLab-v0.2/simulation-core.js` 字节一致）+ `src/kernel/index.ts`：封装类型化内核接口 `simulate`, `sensitivityFor`, `buildRun`, `validateParams`, `computeInputHash`, `CORE_SHA256`, `MODEL_VERSION`。
   - `src/store/experiment-store.ts`：基于本地文件系统的事务性存储（`writeTempThenRename` + 文件锁），持久化实验工作稿、提案、宿主授权凭据（`hostAcceptanceRef`, `hostReviewRef`, `hostFreezeRef`, `hostStopRef`）、操作回执、运行结果与快照（最多 10 份，同 `(runId, revision)` 去重）。
   - `src/service/simlab-service.ts`：应用服务层，实现全部 13 个工具对应的业务命令、CAS 校验、政策联动分析、幂等回执管理、受控三阶段运行执行器（支持 pre-calc 取消、in-flight `cancelling`、迟到成功结算、`unknown` 故障注入与 `reconcile` 恢复）。
   - `src/tools/simulation-tools.ts`：将应用服务包装为 13 个符合 `pi-agent-runtime@0.4.3` `Tool` 接口的声明式工具（根级 `additionalProperties: false` schema + 结构化 `rejected_not_executed` / 成功 / 失败信封）。
   - `src/pi/runtime-adapter.ts`、`src/pi/budget-store.ts`、`src/pi/audit-sink.ts`、`src/pi/session-storage.ts`、`src/pi/offline-transport.ts`：唯一允许直接 `import "pi-agent-runtime"` 的适配层，封装 `runAgent` 与 `createSessionRuntime`、持久 JSONL 审计、跨进程文件预算账本、独占会话 writer 锁、`bindOperation` 与 `reconcile` 状态映射。
   - `src/plugin/juanerai-seam.ts`：面向未来 JuanerAI 插件宿主的类型化调用接缝。
   - `src/ui/server.ts` + 根级 `template.html` / `style.css` / `app.js` / `build.py` / `index.html`：保持静态自包含原型与本地 HTTP 服务（`/api/v1/...`）双模可用。
   - `src/cli/index.ts` + `启动工作台.command` + `scripts/start-ui.sh`：提供 `sim-lab ui`、`sim-lab inspect-model`、`sim-lab run` 等 CLI 命令与双击一键启动脚本。

## Testing Decisions

1. **测试原则**：只通过公开接口与系统边界（Seams）测试可观察行为，禁止耦合内部私有实现或编写同义反复（tautological）断言；期望值均来自规格已知常量或独立核验。
2. **预设测试接缝（Seams）**：
   - **Seam S1 — 确定性内核与原始回归接缝**：`node tests/test_simlab.cjs index.html`（417 次运行 / 129,724 断言）+ `src/kernel` 公开函数与 `computeInputHash` 确定性测试。
   - **Seam S2 — 本地事务存储与应用服务接缝**：基于真实临时目录（`fs.mkdtemp`）测试 `SimLabService` 的工作稿生命周期、提案预览（政策联动 vs 冻结敏感性）、宿主凭据核验、revision CAS 冲突、幂等回执、计算前取消、执行中 `cancelling` 与迟到成功、`unknown` 状态阻断重跑与查询恢复、快照不可变与去重。
   - **Seam S3 — 13 工具合同与 `pi-agent-runtime@0.4.3` 会话/预算/恢复接缝**：注入离线脚本化 `ModelTransport`，通过真实 `createRuntime().runAgent()` 与 `createSessionRuntime()` 验证 13 个工具 schema（`additionalProperties: false`）、参数错误 Agent 二轮自修正、未知回执 `reconcile` 阻断、独占会话 writer 锁（未 `waitForIdle` 拒绝并发 writer）与持久预算账本（重开不重置消耗），并用静态扫描守卫测试锁定“非 `src/pi/` 目录零 `pi-agent-runtime` 直接依赖”。
   - **Seam S4 — 本地 HTTP JSON API 与 JuanerAI 插件接缝**：启动真实 `127.0.0.1` loopback HTTP 服务，用真实 `fetch` 验证 `/api/v1/...` 全部端点、409 CAS 冲突、凭据拦截及 `JuanerAiPluginSeam` 契约。
   - **Seam S5 — 真实 Chromium 浏览器端到端验收接缝**：运行 `node tests/browser-flow.cjs`（57 项桌面 1440×1000 与窄屏 390×844 真实点击、键盘、弹窗、下载、`file://` 直开、零溢出、零错误断言）+ 服务端 HTTP 模式浏览器冒烟验证。

## Out of Scope

1. 真实付费 LLM Provider 网络调用、密钥扫描或生产环境部署（按 `方案.md` §1, §7, §12 规定，须另行单独授权）。
2. 多 SKU、多仓调拨、退货回仓、随机分布仿真、账期融资、税费与固定成本、自动求最优策略。
3. 修改 `metric-factory`、`JuanerAI` 或本机其他任何既有项目仓库。

---

## PRD Diff Gate Record（相对 `.flow/proposal.md`）

- **改动或删减项（Changes / Drops）**：**无（0 项）**。`proposal.md`（及评审包 `方案.md`、`工具合同与Pi接点.md`、`使用与验证说明.md`）中的所有产品决定、模型公式、14 参数 + 2 冲击、13 工具定义、状态机语义与 UI  baseline 全部 100% 保留。
- **纯增量细化项（Purely Additive Details，auto / reviewed-input 模式自批准）**：
  1. 采纳红队 KA1–KA5 的具体工程缓解措施（双模 UI 接缝、双层校验与 `rejected_not_executed` 映射、`operationId` 分层与 `reconcile` `STATE_FAILED -> unknown` 映射、受控异步执行阶段钩子）；
  2. 明确 TypeScript 模块目录结构、HTTP REST 路由前缀 `/api/v1/...` 与默认一键启动端口 `4175`（占用顺延 `4176`）；
  3. 明确 5 条测试接缝（S1–S5）。

---

## GRILL Round 1 Resolution Record (1x9 Quick-Scan Convergence)

在 reviewed-input 模式下，针对 PRD 与 proposal 留有的工程实现细节，执行 1 轮 9 包（G1–G9）内联深审决议。全部 9 项决议均遵守“`.flow/proposal.md` 决定为不可变约束”原则，零删改、纯增量，推荐方案全面通过：

### G1: 双模 UI 状态权威（KA1 缓解）
- **决议**：`review-package/SimLab-v0.2/index.html` 与 `app.js` 保持纯前端同步内存/`localStorage` 状态机不变，确保 `file://` 直开和既有 `tests/browser-flow.cjs`（57 项断言）零改动 100% 通过。
- **服务端模式**：`src/ui/server.ts` 提供 HTTP 模式工作台服务，前端在探测到 `window.location.protocol.startsWith('http')` 时通过 `/api/v1/...` REST 端点与服务端本地事务存储通信，实现双模平滑共存。

### G2: `Tool.parameters` 与 `rejected_not_executed` 映射（KA2 缓解）
- **决议**：13 个工具的 `Tool.parameters` 严格声明根级 `additionalProperties: false`，拦截未声明的脏字段。
- **业务校验**：参数范围（`PARAM_RULES`）及 `revision` 匹配在 `tool.execute()` 内核执行前校验；若校验不通过，直接 `return`（不 throw）标准化 JSON 信封 `{ status: "rejected_not_executed", error: { code: "PARAM_OUT_OF_BOUNDS" | "STALE_REVISION", ... } }`，允许 Agent 在单会话内感知并自修正。SDK 层的 `INVALID_TOOL`/`INVALID_REQUEST` 由 Pi Adapter 拦截并包装为相同语义的信封。

### G3: 会话与操作回执映射（KA3 缓解）
- **决议**：业务层统一使用独立分配的 `operationId`（`OP-xxx`）作为幂等回执键，会话日志及持久存储双向建立 `operationId <-> runId/revision` 关联索引。
- **恢复策略**：当 `reconcile` 因未决状态或回执不可达返回 `'unknown'`（SDK 抛出 `STATE_FAILED`）时，Adapter 拦截并将其逆向映射为业务状态 `unknown`（附带 `retry: "query_only"`），严禁自动盲目重试，必须由操作员调用 `inspect_model` 或查询回执进行处置。

### G4: 异步执行阶段钩子（KA4 缓解）
- **决议**：冻结内核 `simulation-core.js` 字节级不变（SHA-256 `8e6d44d5...`）。
- **执行阶段**：应用服务 `SimLabService` 在内核运行外围包装为 `admitted -> calc -> settled` 三阶段：
  1. `admitted` 检查点：支持预计算取消（`cancelled_not_executed`）；
  2. `calc` 执行阶段：内核同步计算（通常 < 15ms），外部取消信号进入 `cancelling` 阶段；
  3. `settled` 检查点：若计算完成时收到取消信号，标记为迟到成功结算，产生可审计回执，保证无野悬挂任务。

### G5: 未建模能力诚实拒止（KA5 缓解）
- **决议**：在 `inspect_model` 输出与 Agent Prompt 边界明确声明退货回仓、多仓调拨、随机分布、账期融资为 `unmodeled`。当工具入参或自然语言请求试图引入这些未建模机制时，工具返回 `{ status: "rejected_not_executed", error: { code: "UNSUPPORTED_MODEL", message: "SimLab v0.2 是单仓确定性 FIFO 模型，不支持未建模的复杂退货/多仓/账期机制" } }`，诚实拒止。

### G6: 构建与依赖栈
- **决议**：Node.js `>=22.19.0`（当前环境 Node `v24.21.0`），采用 TypeScript + ESM + `tsup` 打包 + `vitest` 测试 + `playwright` 端到端浏览器验证。
- **Vendor**：从 `/Users/huangbo/Dev/Projects/metric-factory/vendor/pi-agent-runtime-0.4.3.tgz` 复制到项目 `vendor/` 并在 `package.json` 中以 `"pi-agent-runtime": "file:./vendor/pi-agent-runtime-0.4.3.tgz"` 声明。

### G7: 本地服务端口与一键启动
- **决议**：默认监听端口为 `4175`，若被占用自动顺延至 `4176`。根目录提供 macOS 双击可执行脚本 `启动工作台.command` 与 Shell 脚本 `scripts/start-ui.sh`，启动后打印清晰可点击的 HTTP 访问地址。

### G8: 离线 Scripted Transport
- **决议**：严格恪守零外部付费 LLM API 调用的纪律，测试与离线演示默认采用脚本化离线 `ModelTransport`（基于预设对话脚本和规则匹配响应），支持从基线提案一步步执行修改、分析和运行。

### G9: JuanerAI 插件接缝
- **决议**：在 `src/plugin/juanerai-seam.ts` 中暴露中立的 TypeScript 契约与适配方法，基于 `(modelVersion, inputHash, runId, operationId, snapshotId)` 暴露能力，不修改任何外部仓库代码。
