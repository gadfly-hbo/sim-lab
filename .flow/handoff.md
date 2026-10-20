# SimLab v0.2 · 交付与交接卡片 (Handoff Card)

> **交付版本**：SimLab 经营仿真实验室 v0.2.0  
> **提交 SHA**：`f65e3ea` (`main`)  
> **远程仓库**：`https://github.com/gadfly-hbo/sim-lab.git`  
> **输入包源**：`/Users/huangbo/Dev/Projects/sim-lab/review-package/SimLab-v0.2` (解压自 `SimLab_产品方案与UI评审包_v0.2.zip`)  
> **流程模式**：`dev-flow` reviewed-input mode (Auto)  

---

## 1. 交付物完整清单

### 核心引擎与算法
- **确定性 FIFO 内核**：`simulation-core.js` (SHA-256: `8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`)，逐字节完全固化，417 次运行、129,724 断言全绿。
- **TypeScript 强类型内核合同**：`src/kernel/index.ts`，导出 `simulate`、`buildRun`、`sensitivityFor`、`validateParams`、`computeInputHash`，哈希覆盖内核指纹、版本与 17 项完整参数。

### 存储与应用服务
- **本地事务存储**：`src/store/experiment-store.ts`，基于目录锁、原子临时写入与 `fsync` 刷盘，支持 `CASConflictError` 乐观锁冲突检测。
- **实验应用服务**：`src/service/simlab-service.ts`，管理工作稿版本生命周期、多版本口径确认门禁（`AuthorityRequiredError`）、确定性前瞻提案预览（真实差值量化）、不可变历史快照（上限 10 份、同运行去重）、三阶段执行回执与断连恢复（`reconcileOperation`）。

### 声明式工具与 Agent 适配
- **13 声明式仿真工具合同**：`src/tools/simulation-tools.ts`
  1. `inspect_model` (read/safe)
  2. `read_draft` (read/safe)
  3. `propose_change` (write/never)
  4. `preview_change` (read/safe)
  5. `apply_proposal` (write/never - 强制 hostAcceptanceRef)
  6. `confirm_caliber` (write/never - 强制 hostReviewRef)
  7. `run_experiment` (write/never - 支持 inputHash 与 idempotencyKey 校验)
  8. `get_operation` (read/safe)
  9. `get_run` (read/safe)
  10. `read_evidence` (read/safe)
  11. `cancel_operation` (write/never)
  12. `save_snapshot` (write/never - 强制 hostFreezeRef)
  13. `export_snapshot` (read/safe)
  - 根对象均设 `additionalProperties: false`，错误统一采用标准 `rejected_not_executed` 结构化信封。
- **Pi Agent 运行时适配**：`src/pi/`，对接 `pi-agent-runtime@0.4.3`，提供基于文件锁的独占会话写入锁 `SimLabSessionStorage`、持久预算账本 `PersistentBudgetStore`、持久 JSONL 审计槽 `PersistentJsonlAuditSink`、鉴权守护 `createSimLabAuthorizer`，并通过静态架构扫描保证零外围直接引用 Pi。

### 产品工作台与集成接缝
- **双模 UI 工作台**：自包含 `index.html`（支持 `file://` 直开）及本地 HTTP 服务（`src/ui/server.ts`，默认端口 `4175` / 顺延 `4176`，提供全功能 REST API：`/api/v1/models`、`/api/v1/tools`、`/api/v1/operations`、`/api/v1/runs`、`/api/v1/experiments`）。
- **命令行工具与一键启动**：`bin/sim-lab.js`、`启动工作台.command`（macOS 双击自启）、`scripts/start-ui.sh`。
- **JuanerAI 宿主接缝**：`src/plugin/juanerai-seam.ts`，提供类型化中立契约，不侵入外部仓库。

---

## 2. 真实门禁验证数据记录

- **全量门禁命令**：`npm run verify` (两拍双重验核均通过，退出码 0)
- **构建状态**：`tsup` 成功输出 9 个 ESM 入口与 `.d.ts` 类型声明文件。
- **类型检查**：`tsc --noEmit` 零类型错误。
- **内核基准回归**：417 次模拟、129,724 条断言 100% 绿色。
- **单元与集成测试**：Vitest 4 个测试套件（`kernel.test.ts`、`service.test.ts`、`pi-adapter.test.ts`、`http-server.test.ts`），25/25 测试项全通（767ms）。
- **浏览器端到端**：Playwright 驱动真实 Chromium (156.0.8078.4)，执行桌面端 (1440×1000) 与移动端 (390×844) 流程，57 项关键断言全部 PASS，零控制台/页面错误，零外部网络请求。

---

## 3. 运行指南

### 快速启动工作台
```bash
# 方式 A：macOS Finder 双击
双击根目录 "启动工作台.command"

# 方式 B：终端一键启动脚本
./scripts/start-ui.sh

# 方式 C：通过 npm / CLI
npm run build
node bin/sim-lab.js ui
# 服务就绪后浏览器访问: http://127.0.0.1:4175
```

### 命令行推演与口径巡检
```bash
# 查询内核版本与口径范围
node bin/sim-lab.js inspect-model

# 命令行单次仿真推演
node bin/sim-lab.js run --demand 220 --capacity 300 --price 128
```

---

## 4. 后续演进建议与前置条件

1. **真实付费大模型联调（未来扩展）**：
   - 当前交付严格恪守零外部付费 API 纪律，采用离线确定性脚本传输层 `offline-transport.ts`。
   - 未来若需启用在线大模型（如 DeepSeek / Claude / GPT），可在宿主环境注入 Provider API Key，并调用 `createPiTransport` 进行有界联调。
2. **JuanerAI 宿主插件集成**：
   - 已在 `src/plugin/juanerai-seam.ts` 预留标准化提取接口；宿主仅需引入 `JuanerAiPluginSeam`，调用 `getContext` 与 `exportMetricsForHost` 获取权威指标，无需在 Prompt 中搬运复杂业务账。
