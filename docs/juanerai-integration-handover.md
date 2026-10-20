# JuanerAI 插件接入交接卡 · SimLab 电商经营仿真实验室

| 项 | 值 |
|---|---|
| 发起方 | `sim-lab` 原仓（`/Users/huangbo/Dev/Projects/sim-lab`，GitHub: `https://github.com/gadfly-hbo/sim-lab.git`） |
| 接收方 | `JuanerAI` 宿主仓（Mac mini 侧 `/Users/huangbo/JuanerAI`） |
| 当前版本 | `sim-lab@0.2.0`（当前 HEAD：`c00d3b8`） |
| 接入形态 | **随包同机产品插件（Bundled Same-Machine Service Plugin）**，参照 Report Studio / metric-factory |
| 接入政策 | 适用 JuanerAI 治理政策之 **Mini-led Plugin Integration**（Mac mini 主导方案、接线、验证与交付全流程） |
| 就绪状态 | **完全就绪（READY FOR INTAKE）** |

---

## 1. 插件接入就绪性评估报告

| 核查维度 | 评估要点 | 现状核验 | 状态 |
| :--- | :--- | :--- | :---: |
| **1. 业务共用与原仓独立** | 业务逻辑在原仓维护，独立 CLI 与同机 Web 工作台完整可用；构建产物干净标准 | `npm run build` 输出 9 个标准 ESM/DTS 产物，主入口 `dist/cli/index.js`，内核与 UI 独立可用 | **PASS** |
| **2. 内核纯净与确定性** | 确定性 FIFO 供应链算法，字节冻结与指纹绑定，不修改公式 | SHA-256：`8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`，417 次守恒回归全通 | **PASS** |
| **3. 同机服务与探活协议** | 仅绑定 127.0.0.1，端口顺延防冲突，具备标准 HTTP 探活就绪接口 | 监听 127.0.0.1:4175（占用自动顺延 4176），提供 `GET /api/v1/health` 探活端点 | **PASS** |
| **4. 宿主静默托管** | 宿主拉起子进程时不跳系统外部浏览器 | 环境变量 `SIMLAB_NO_OPEN=1` 彻底禁用浏览器唤起，确保宿主后台静默托管 | **PASS** |
| **5. 数据根空间隔离** | 插件工作区与宿主数据隔离，支持 Profile 注入 `dataRoot` | 支持 CLI `-d <path>` 与 `SIMLAB_DATA_DIR` 环境变量，支持草稿与快照重定向 | **PASS** |
| **6. 宿主业务接缝** | 提供类型化的成果与上下文提取接口，避免深层私有依赖 | [`src/plugin/juanerai-seam.ts`](file:///Users/huangbo/Dev/Projects/sim-lab/src/plugin/juanerai-seam.ts) 导出 `JuanerAiPluginSeam`，提取 4 大经营决策指标 | **PASS** |
| **7. Pi SDK 规范与安全** | 对接 `pi-agent-runtime@0.4.3`，零外网与凭据泄露风险 | 使用 `vendor/pi-agent-runtime-0.4.3.tgz`（与 metric-factory SHA 一致），内置确定性离线传输 | **PASS** |
| **8. 门禁验证基线** | 自动化测试全绿，具备正式的供应侧 Kickoff 导引 | 57 项 Playwright 浏览器验收全部 PASS，已生成 `docs/juanerai-integration-kickoff.md` | **PASS** |

---

## 2. 宿主接线技术要点

### 2.1 子进程拉起与就绪握手
- **启动命令**：`node dist/cli/index.js ui -p <port> -d <dataRoot>`
- **环境变量**：注入 `SIMLAB_NO_OPEN=1`（强制禁止弹出系统浏览器）
- **就绪探活**：轮询 `http://127.0.0.1:<port>/api/v1/health`，收到 HTTP 200 且 `status === "ok"` 即确认就绪
- **进程生命周期**：宿主退出时发送 `SIGTERM`/`SIGINT`，或调用子进程 `kill` 安全回收

### 2.2 宿主业务接缝消费
宿主可通过 `import { JuanerAiPluginSeam } from 'sim-lab/plugin'` 消费：
- `seam.getContext(experimentId)`：读回仿真版本、内核指纹、CAS revision 与当前运行回执
- `seam.exportMetricsForHost(experimentId)`：读回 Baseline / Advance / Split 三情景的：
  - `contribution_profit`（贡献毛利，CNY）
  - `min_cash`（最低现金储备，CNY）
  - `closing_inventory`（期末库存件数，pieces）
  - `fulfillment_rate`（订单履约率，ratio）

---

## 3. 可转发给 Mac mini 的启动 Prompt

```markdown
请在 JuanerAI 仓库中，执行「SimLab 电商经营仿真实验室」作为固定产品插件的接入工作：

### 1. 任务性质与治理原则
- 本任务性质为 **产品插件接入**（随包携带同机服务与业务接缝），参照已发布的 Report Studio 链路及 metric-factory 接入模式。
- 适用 JuanerAI 治理政策中的 **Mini-led Plugin Integration** 规则：由 Mac mini 独立主导方案设计、输入冻结、薄 Adapter 接线、测试验证与 Git 交付全流程，无需 MacBook 审批或跨设备等待。

### 2. 权威标准与供应侧事实
1. **宿主权威标准**（在 JuanerAI 仓中按需阅读）：
   - `docs/engineering/plugin-integration/standard.md`（插件接入五步法）
   - `docs/engineering/plugin-integration/report-studio-reference-adapter.md`（参考 Adapter 链路与骨架）
   - `docs/engineering/plugin-integration/acceptance-checklist.md`（C01-C12 验收清单）
2. **供应侧产品事实**：
   - 插件原仓地址：`https://github.com/gadfly-hbo/sim-lab.git`（当前 HEAD：`c00d3b8`，或同机路径 `/Users/huangbo/Dev/Projects/sim-lab`）
   - 详细供应侧事实见原仓导引：`docs/juanerai-integration-kickoff.md`
   - 产品版本：`sim-lab@0.2.0`（Node >= 22.19.0，构建产物 `dist/cli/index.js`）
   - 内核指纹：确定性 FIFO 内核（SHA-256：`8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`）
   - 运行时依赖：与 metric-factory 共享相同的 `vendor/pi-agent-runtime-0.4.3.tgz`

### 3. 核心接线与实现要点
1. **进程与生命周期管理**：
   - 使用自有子进程拉起 `node dist/cli/index.js ui -p <port> -d <dataRoot>`；
   - 环境变量必须注入 `SIMLAB_NO_OPEN=1`，防止启动时弹出宿主外部浏览器；
   - 通过轮询 `http://127.0.0.1:<port>/api/v1/health` 确认 `status === 'ok'` 完成就绪握手；
   - 宿主关闭时通过 `kill` 子进程安全回收端口与资源。
2. **Profile 与数据根（dataRoot）隔离**：
   - 在个人 Profile / composition root 中为 SimLab 分配专用的 `dataRoot`，实现用户仿真草稿与历史快照的宿主用户空间隔离。
3. **业务 Port 与成果回程**：
   - 实现 SimLabGateway / SimLabStore 业务 Port；
   - 既支持在工作台中交互式推演，也支持通过 `dist/plugin/index.js` 的 `JuanerAiPluginSeam`（`exportMetricsForHost`）读回 Baseline / Advance / Split 三情景的贡献毛利、最低现金、期末库存与履约率指标，存入宿主 Store 形成稳定副本。

### 4. 验证与交付
- 按 `acceptance-checklist.md` 选取适用项（C01 身份、C02 物料、C03 生命周期、C05 数据隔离、C07 状态、C08 成果回程、C09 持久恢复、C10 工具）编写合成与集成测试；
- 运行验证通过后，在 JuanerAI 完成交付收口。
```
