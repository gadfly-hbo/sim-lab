# SimLab v0.2 开发任务分解（Vertical Slice Tasks）

- [x] 1. 确定性仿真内核与回归测试基线 (T1: Frozen Kernel, TypeScript Contracts & Regression Seam S1)
  - **Verification Evidence**:
    - `shasum -a 256 simulation-core.js` = `8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca` (100% exact match)
    - `node tests/test_simlab.cjs index.html`: 417 runs, 129,724 assertions passed, baseline contribution = 274,010 (exit code 0)
    - `npm run build`: tsup emitted ESM + DTS in `dist/` with 0 errors
    - `vitest run tests/kernel.test.ts`: 6/6 tests passed in 7ms
- [x] 2. 本地事务性实验存储与应用服务 (T2: Transactional File Store & Application Service Seam S2)
  - **Verification Evidence**:
    - `vitest run tests/service.test.ts`: 7/7 tests passed in 158ms
    - Verified atomic persistence, file locks, CAS conflict detection (`CASConflictError`)
    - Verified caliber confirmation gating (`CaliberNotConfirmedError`), proposal before/after kernel impact preview, adoption revision invalidation
    - Verified snapshot deduplication on identical `(runId, revision)` and max 10 bounds
    - Verified cancellation before execution (`cancelled_not_executed`), `unknown` state blind retry block (`UnknownOperationPendingError`) and recovery via `reconcileOperation`
    - Verified unmodeled capability honest rejection (`UnsupportedModelError`)
- [x] 3. 13 声明式仿真工具合同与 pi-agent-runtime@0.4.3 适配层 (T3: 13 Tool Contracts & Pi Agent Adapter Seam S3)
  - **Verification Evidence**:
    - `vitest run tests/pi-adapter.test.ts`: 7/7 tests passed in 61ms
    - Verified all 13 tools declared with strict `additionalProperties: false`
    - Verified structured `rejected_not_executed` envelope on invalid inputs without throwing
    - Verified static architectural boundary: zero imports of `pi-agent-runtime` outside `src/pi/`
    - Verified persistent `BudgetStore` across re-instantiation
    - Verified structured JSONL `AuditSink` appending and reading
    - Verified `SessionStorage` writer lock contention protection (`SessionBusyError`)
    - Verified multi-turn offline session execution via `createOfflineScriptedTransport` and `reconcile` unknown mapping to `{ status: 'unknown', retry: 'query_only' }`
- [x] 4. 本地 HTTP 工作台服务、CLI、JuanerAI 接缝与双端浏览器验收 (T4: HTTP UI Server, CLI, JuanerAI Seam & Browser E2E Seams S4, S5)
  - **Verification Evidence**:
    - `vitest run tests/http-server.test.ts`: 3/3 tests passed in 67ms
    - Verified static assets serving (`index.html`, `style.css`, `app.js`, `simulation-core.js`) and REST API `/api/v1/...` (health, create, list, CAS conflict 409, confirm, propose, run, snapshots, export)
    - Verified `JuanerAiPluginSeam` context extraction and host metric contract
    - `npm run test:e2e` (`node scripts/run-browser-tests.mjs` executing `tests/browser-flow.cjs` in real Chromium): 57/57 assertions PASS, 0 console errors, 0 network leaks, 390px zero horizontal overflow
    - CLI execution verified: `node bin/sim-lab.js inspect-model` and `node bin/sim-lab.js run` executed with code 0

---

## 1. 确定性仿真内核与回归测试基线 (T1)

### Parent
.flow/prd.md §切片 1: 确定性内核固化与类型安全接缝

### What to build
以 100% 字节不变的原则将评审包中的确定性仿真内核 `simulation-core.js` 固化至仓库根目录（校验 SHA-256 必须严格等于 `8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`）。
配置现代 Node.js ESM + TypeScript 工程脚手架（`package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`）。
创建 `src/kernel/index.ts`，导出带强类型签名的公开接口（`simulate`, `sensitivityFor`, `buildRun`, `validateParams`, `computeInputHash`, `CORE_SHA256`, `MODEL_VERSION`），对 14 参数与 2 冲击提供严密 TypeScript 类型定义。
配置并运行 `tests/test_simlab.cjs` 原始内核回归，保证 417 次仿真运行、129,724 条断言全部绿色通过，并编写 Vitest 测试覆盖内核与输入哈希计算。

### Acceptance criteria
- [ ] 根目录 `simulation-core.js` SHA-256 与基线 `8e6d44d5...` 逐字相同（AC-A1, AC-E3）
- [ ] `tests/test_simlab.cjs` 417 次运行 / 129,724 断言全量通过，且数值 100% 守恒（基准贡献利润 274,010 元）（AC-A1, AC-E1）
- [ ] `src/kernel/index.ts` 提供完整的 TypeScript 类型定义，`validateParams` 严格执行 `PARAM_RULES` 校验（AC-A2）
- [ ] 敏感性分析 `sensitivityFor` 正确重跑 4 组单变量扰动并产生弹性系数（AC-A3）
- [ ] Vitest 单元测试覆盖内核接口与接缝 S1，测试通过

### Blocked by
None - can start immediately

---

## 2. 本地事务性实验存储与应用服务 (T2)

### Parent
.flow/prd.md §切片 2: 本地事务性实验存储与应用服务

### What to build
实现 `src/store/experiment-store.ts` 与 `src/service/simlab-service.ts`：
1. **本地原子文件存储**：基于临时文件写入再重命名（`writeTempThenRename`）与会话互斥文件锁，实现并发安全、抗突发中断的实验工作稿持久化；
2. **多版本与生命周期管理**：支持草稿创建、编辑、版本自增（`revision`）、口径确认版本（`confirmedRevision`）、参数采纳时旧口径确认失效；
3. **提案机制与真实影响量化**：支持自然语言提案解析、基准对比、现金差与贡献利润差由内核同步计算预览，支持提案采纳与废弃；
4. **宿主授权凭据核验**：持久化并校验 `hostAcceptanceRef`, `hostReviewRef`, `hostFreezeRef`, `hostStopRef`；
5. **操作回执与状态机**：生成唯一 `operationId`（`OP-xxx`），记录 `executionStarted` 与阶段状态；提供受控三阶段执行器（`admitted -> calc -> settled`），支持计算前取消（`cancelled_not_executed`）、计算中取消（`cancelling`）与迟到成功结算；
6. **故障模式与未知恢复**：针对注入的 `unknown` 状态，生成挂起回执并阻断盲目重跑，提供 `reconcile` 对账查询，恢复既有执行结果而不重复扣除或重复运行；
7. **不可变快照版本链**：每个实验最多保留 10 份快照，对同一 `(runId, revision)` 幂等去重，快照元数据冻结不可篡改。

### Acceptance criteria
- [ ] 文件存储在真实临时目录（`fs.mkdtemp`）下实现原子提交与版本冲突检测（CAS 检查）（AC-B1）
- [ ] 口径未确认时禁止执行仿真，确认后严格绑定当前 `revision`（AC-B1）
- [ ] 运行结果完整输出三情景、30 天流水、守恒性校验与输入指纹 `inputHash`（AC-B2）
- [ ] 提案量化预览严格等于内核重跑差值，采纳自增 revision 并不覆盖旧快照（AC-B3）
- [ ] 快照存储实现上限 10 份、同 `(runId, revision)` 去重与历史不可变（AC-B4）
- [ ] 计算前取消标记 `cancelled_not_executed`；`unknown` 状态阻断盲目重试；`reconcile` 成功恢复执行回执（AC-B5, AC-C2）
- [ ] Vitest 针对应用服务与存储接缝 S2 的测试用例全部通过

### Blocked by
T1

---

## 3. 13 声明式仿真工具合同与 pi-agent-runtime@0.4.3 适配层 (T3)

### Parent
.flow/prd.md §切片 3: 13 声明式仿真工具合同与 Pi Agent 适配层

### What to build
从 `/Users/huangbo/Dev/Projects/metric-factory/vendor/pi-agent-runtime-0.4.3.tgz` 复制 vendor 依赖并在 `package.json` 声明。
1. **13 个声明式工具合同**（`src/tools/simulation-tools.ts`）：
   - `create_experiment`, `inspect_model`, `inspect_experiment`, `propose_parameter_patch`, `confirm_experiment_caliber`, `run_simulation`, `evaluate_simulation`, `cancel_simulation`, `freeze_experiment_snapshot`, `list_experiment_snapshots`, `export_simulation_result`, `reconcile_operation`, `restore_experiment_draft`；
   - 每个工具的 `parameters` JSON Schema 根级严格标记 `additionalProperties: false`；
   - 工具执行前后实现双层校验与结构化信封：参数越界或 revision 不匹配时返回 `{ status: "rejected_not_executed", error: ... }`；对未建模能力（退货、多仓、账期）诚实拒止返回 `UNSUPPORTED_MODEL`；
2. **Pi Agent 运行时适配层**（`src/pi/`）：
   - `runtime-adapter.ts`：唯一引入 `pi-agent-runtime` 的模块，实现 `runAgent` 与 `createSessionRuntime` 封装；
   - `audit-sink.ts`：实现持久化 JSONL 审计追踪（记录每个工具调用的 `toolName`, `inputHash`, `durationMs`, `success`, `envelope`）；
   - `budget-store.ts`：实现跨进程原子的本地预算账本（重开不重置消耗，达到限制阻断调用）；
   - `session-storage.ts`：会话独占 writer 锁（未 `waitForIdle` 拒绝并发写入）；
   - `offline-transport.ts`：提供完全离线的脚本化 `ModelTransport`，满足零付费 API 调用且驱动多轮交互；
   - 逆向映射 `reconcile` 返回 `'unknown'` 导致的 `STATE_FAILED` 为业务状态 `unknown`（`retry: "query_only"`）；
3. **架构边界守卫测试**：静态扫描确保全仓库仅 `src/pi/` 目录直接依赖 `pi-agent-runtime`。

### Acceptance criteria
- [ ] 13 个工具全部实现，Schema 根级 `additionalProperties: false`，非法参数与未建模请求正确返回 `rejected_not_executed`（AC-C1）
- [ ] `offline-transport.ts` 支持离线完成多轮提案、采纳、确认与运行，零外部 API 请求（AC-C1, AC-E3）
- [ ] `reconcile` 失败或未决状态正确映射为业务 `unknown`，阻止自动盲目重试（AC-C2）
- [ ] 持久化 `BudgetStore` 在会话重启后保持消耗累计，超限阻断（AC-C3）
- [ ] `AuditSink` 完整记录结构化 JSONL 审计事件（AC-C4）
- [ ] 静态架构扫描测试验证：`src/pi/` 之外零直接导入 `pi-agent-runtime`（AC-C1）
- [ ] Vitest 工具合同与适配层测试（Seam S3）全部通过

### Blocked by
T2

---

## 4. 本地 HTTP 工作台服务、CLI、JuanerAI 接缝与双端浏览器验收 (T4)

### Parent
.flow/prd.md §切片 4: 1:1 工作台 UI、本地服务、CLI 与插件接缝

### What to build
1. **双模 UI 工作台与本地 HTTP 服务**：
   - 根目录 `index.html`, `style.css`, `app.js`, `template.html`, `build.py` 完整保留并支持 `file://` 直开；
   - `src/ui/server.ts` 提供轻量本地 HTTP 静态与 REST API 服务，默认监听端口 `4175`（被占用自动顺延至 `4176`）；提供 `/api/v1/...` 系列端点与本地事务存储连接；
   - 双模交互适配：前端检测到 HTTP 服务模式时可与后端事务服务同步；
2. **CLI 与一键脚本**：
   - `src/cli/index.ts` 编译为可执行 `bin/sim-lab.js`，提供 `sim-lab ui`、`sim-lab inspect-model`、`sim-lab run` 等命令；
   - 根目录提供 macOS 双击脚本 `启动工作台.command` 与 Shell 脚本 `scripts/start-ui.sh`；
3. **JuanerAI 插件调用接缝**：
   - `src/plugin/juanerai-seam.ts` 提供中立的宿主调用契约，基于 `(modelVersion, inputHash, runId, operationId, snapshotId)` 暴露接口；
4. **全量端到端验证**：
   - 运行既有 `tests/browser-flow.cjs`，真实 Chromium 验证桌面 1440×1000 与窄屏 390×844 共 57 项断言全部绿色通过；
   - 测试 HTTP 模式服务端点与接缝 S4，测试覆盖命令行与 JuanerAI 接缝。

### Acceptance criteria
- [ ] 本地 HTTP 服务正常启动（默认 4175 端口），REST API `/api/v1/...` 正常响应且支持 CAS 并发冲突校验（AC-D1, AC-D2）
- [ ] CLI `bin/sim-lab.js` 及 `启动工作台.command` / `scripts/start-ui.sh` 正常执行（AC-D3）
- [ ] `src/plugin/juanerai-seam.ts` 导出类型化接缝契约，不侵入修改任何外部仓库（AC-D1）
- [ ] `node tests/browser-flow.cjs` 在真实 Chromium 下 57 项断言全部 PASS，零 console error，零水平溢出，`file://` 直开与下载全通（AC-E1, AC-E2）
- [ ] `npm run build && npm test` 全绿，无类型错误，无编译警告

### Blocked by
T3
