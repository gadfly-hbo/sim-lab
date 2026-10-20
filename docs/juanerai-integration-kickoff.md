# JuanerAI 接入启动文档 · SimLab 产品插件接入

| 项 | 值 |
|---|---|
| 日期 | 2026-10-20 |
| 发起方 | sim-lab（插件原仓，`/Users/huangbo/Dev/Projects/sim-lab`） |
| 接收方 | JuanerAI（宿主仓，`/Users/huangbo/JuanerAI`） |
| 性质 | 产品级插件接入启动（kickoff）导引。**接入形态 = 整个产品作为固定插件随 JuanerAI 打包交付**，参照 Report Studio / metric-factory 链路；权威标准在 JuanerAI 仓，本文件提供供应侧产品事实与对齐输入，不预设宿主内部装配 |

---

## 1. 一句话任务

把 **SimLab v0.2 电商经营仿真实验室** 整个产品（离散事件供应链确定性仿真、30 天日账推演、13 个声明式工具合同、Pi Agent 运行时适配、本地交互式仿真工作台）作为 **JuanerAI 固定插件** 接入：业务实现在原仓维护、独立可运行；JuanerAI 随包携带固定物料与运行依赖，宿主拥有入口、授权、dataRoot 与实例生命周期；集成用户安装 JuanerAI 即可用，不另装独立版。

---

## 2. 权威标准（在 JuanerAI 仓）

按 `docs/engineering/plugin-integration/README.md` 入口按需读取：

1. **接入标准** `docs/engineering/plugin-integration/standard.md`：
   - 共用业务实现分别装配交付；
   - 按真实形态选择承载（同机服务 + 随包固定物料）；
   - §3 信息项完备性；
   - 五步连续接入（盘点 → 对齐 → 接线 → 验证 → 接受与固定交付）；
   - 原仓维护与受控升级。
2. **Report Studio 参考 Adapter** `docs/engineering/plugin-integration/report-studio-reference-adapter.md`：
   - 宿主入口 → Application → 业务 Port（Gateway/Store）→ Profile（显式 bundleRoot/identity/dataRoot，懒启动）→ 随包 Node 运行自有实例 → 插件共用业务 → 显式 deliver / 已保存 snapshot → 宿主稳定副本 + receipt 读回。
3. **通用验收清单** `docs/engineering/plugin-integration/acceptance-checklist.md`：
   - C01-C12 按适用性选择，填预期/身份/证据/未执行原因。
4. **Mini 治理政策**（`AGENTS.md` / `workflow.md`）：
   - 适用 **Mini-led Plugin Integration** 规则：由 Mac mini 独立主导从方案设计、输入冻结、工程实现、测试验证到 PR 交付全流程，无需 MacBook 介入或中间审批。

---

## 3. 供应侧产品事实（标准 §3 信息项输入）

| 信息项 | SimLab 现状事实 |
|---|---|
| **产品/版本** | `sim-lab@0.2.0`，bin `sim-lab` → `dist/cli/index.js`；Node **>= 22.19.0**（本地在 Node 24.21.0 验证通过）；构建 `tsup`（ESM，`npm run build`）。 |
| **固定源** | 本仓 GitHub：`https://github.com/gadfly-hbo/sim-lab.git`；HEAD 提交已推送并同步。 |
| **内核指纹** | 纯确定性 FIFO 内核（`src/kernel/simulation-core.js`），SHA-256：`8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`，模型版本：`simlab-daily-fifo-0.1.0`。417 次核心守恒测试 100% PASS。 |
| **运行依赖** | 见 `package.json`：`commander`、`pi-agent-runtime`（本地包 `vendor/pi-agent-runtime-0.4.3.tgz`，SHA-256 与 `metric-factory` 完全一致：`475480217d5...`）。无任何沉重或未知三方依赖。 |
| **主入口形态** | **同机服务**：`sim-lab ui -p <port> -h 127.0.0.1 -d <dataRoot>` 启动本地 Web 工作台，仅监听 127.0.0.1（默认端口 4175，占用自动顺延 4176）。<br>环境变量 `SIMLAB_NO_OPEN=1` 可实现宿主静默托管（不弹出外部浏览器）。<br>CLI 另提供 `inspect-model`、`batch-run` 等命令。 |
| **健康探活端点** | `GET /api/v1/health`：返回 `{ status: "ok", modelVersion, coreSha256, timestamp }`，供宿主秒级探活。 |
| **用户任务与成果** | 业务人员完成“设定大促/供应链假设 → 确认口径 → 运行 Baseline / Advance / Split 三情景仿真 → 查看 30 天日账推演与敏感性分析 → 保存不可变快照”；<br>正式产物 = **带 inputHash 与 revision CAS 校验的 `ExperimentSnapshot`（`SNAP-xxx`）**与确认回执 `StampedRun`。 |
| **宿主业务接缝** | [`src/plugin/juanerai-seam.ts`](file:///Users/huangbo/Dev/Projects/sim-lab/src/plugin/juanerai-seam.ts) 提供 `JuanerAiPluginSeam`：<br>1. `getContext(experimentId)`：读回仿真元数据；<br>2. `exportMetricsForHost(experimentId)`：为宿主提取三大情景的标准决策指标（贡献毛利、最低现金、期末库存、履约率）。 |
| **数据与历史** | 事务性文件存储（`src/store/experiment-store.ts`）；支持通过 CLI `-d/--data-dir` 或环境变量 `SIMLAB_DATA_DIR` 显式重定向 `dataRoot`，完全适配宿主 Profile 用户目录隔离。 |
| **Pi 工具与安全** | 包含 13 个符合 `pi-agent-runtime@0.4.3` 规范的声明式仿真工具；内置确定性离线脚本化 `ModelTransport`（`src/pi/offline-transport.ts`）；内置文件锁独占会话（`SimLabSessionStorage`）与跨进程预算账本（`PersistentBudgetStore`）；**零外网调用、零凭据泄露风险、零模型费用**。 |
| **生命周期** | 自有 Node 进程；监听即通过 `/api/v1/health` 就绪；支持 `SIGINT`/`SIGTERM` 信号优雅关闭与端口释放。 |
| **验证基线** | `npm run verify` 全通：417 次核心守恒测试、25 项单元/合同测试（含 Pi 架构边界隔离扫描测试）、57 项 Playwright 浏览器端到端验收全部 PASS。 |

---

## 4. 需要对齐的已知差异

1. **静默启动与浏览器控制**：宿主托管子进程时，必须注入 `SIMLAB_NO_OPEN=1`，确保服务在后台就绪而不调起系统默认浏览器。
2. **数据根隔离（dataRoot）**：宿主 Profile 在启动命令中显式指定 `-d <hostDataDir>` 或设置 `SIMLAB_DATA_DIR`，确保仿真草稿与快照落在宿主用户空间。
3. **端口协商**：宿主 Adapter 分配本地空闲端口并通过 `-p <port>` 传入，启动后轮询 `http://127.0.0.1:<port>/api/v1/health` 确认 `status === 'ok'`。
4. **成果回程映射**：宿主既可以通过 Web 视图直接查看仿真，也可以通过 `JuanerAiPluginSeam.exportMetricsForHost(experimentId)` 提取决策指标读回宿主 Store。

---

## 5. 验收建议（Checklist C01-C12）

建议适用项：
- **C01 固定身份/兼容**：固定源提交，版本 `0.2.0`，内核指纹 `8e6d44d5...` 绑定。
- **C02 资源与随包物料**：随包物料包含 `dist/` 与前端单页静态资产。
- **C03 生命周期**：宿主拉起子进程、健康检查轮询、正常通信、停止后进程回收。
- **C05 凭据与数据隔离**：独立 `dataRoot`，无公网凭据依赖（离线确定性）。
- **C07 状态与停止**：口径未确认阻断运行、CAS 乐观锁防篡改。
- **C08 产物与来源**：快照 `SNAP-xxx` 与推演指标可精确读回。
- **C09 持久与恢复**：重启服务后指定同一 `dataRoot`，历史草稿与快照完整还原。
- **C10 工具执行**：13 个声明式工具通过 `pi-agent-runtime@0.4.3` 正常适配与自纠错。

---

## 6. 边界与非目标

- 业务计算与确定性内核在原仓（`sim-lab`）维护；宿主负责入口路由、用户权限、多工作区协调与装配。
- 本次接入为**产品插件接入**（同机 Web 服务 + 业务接缝）；不涉及将 SimLab 改造成公共云 SaaS 或引入未建模的多仓/复杂账期。

---

## 7. 供应侧事实源

- 仓库地址：`https://github.com/gadfly-hbo/sim-lab.git`
- 业务内核：`src/kernel/simulation-core.js`（SHA-256: `8e6d44d5...`）
- HTTP 服务与健康检查：`src/ui/server.ts`、`src/cli/index.ts`
- 宿主插件接缝：`src/plugin/juanerai-seam.ts`
- 13 工具合同与 Pi 适配：`src/tools/simulation-tools.ts`、`src/pi/`
