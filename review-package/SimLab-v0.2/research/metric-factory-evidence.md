# metric-factory 只读借鉴证据

本次检查日期：2026-10-20。实际仓库 `/Users/huangbo/Dev/Projects/metric-factory`；认可原型 `/Users/huangbo/Documents/Codex/2026-10-18/task/metric-factory-product-prototype/`。未修改两处来源。

| 当前源码证据 | 观察 |
| --- | --- |
| `package.json` dependencies；`node_modules/pi-agent-runtime/package.json:3` | `pi-agent-runtime` 为本地 tgz 0.4.3；runtime 内部 pi-ai 与 pi-agent-core 精确为 0.86.1；根 pi-ai 为 0.87.1 |
| `src/ui/public/style.css:1` 及 shell 类 | #f6f7f4 / #fcfcfa / #f0f2ed，#27664f 绿色；230px 左栏，64px 顶栏，主工作区和右侧助手 |
| `src/ui/public/index.html:13` 起 | 创建、体系、模板、最近编辑、个人空间；顶栏上下文和方案入口 |
| `src/ui/public/app.js:55` | 自然语言起步，模板为次要起点 |
| 同文件 `:77`–`:81` | 标题状态、工作视图、主内容与右侧助手布局 |
| 同文件 `:110`–`:117` | 右侧共创、建议 before / after / impact、采纳与放弃 |
| 同文件 `:129`–`:136`、`:548` 起 | 设计检查、确认失效提示、版本交付；不是业务结论成立 |
| `src/ui/public/api.js` | refine-job、refine-proposal、apply-refine、discard-refine、confirm-review、deliver 真实 API |
| `src/ui/server.ts:485`、`:493`、`:527` 起 | 新工作区实例、草稿异步任务、待采纳文件；createLlmClientFromEnv 与 generate* 验证 |
| `src/llm/index.ts:171`–`:202` | faux 分支与 createPiTransport → createPiClient；预算和审计注入 |
| `src/llm/pi-client.ts:93`–`:161` | createRuntime 惰性缓存；runText；model.finished 归因；modelRecovery extraAttempts:1；INVALID_OUTPUT 返回空串供业务解析失败；其余非成功抛错 |
| `node_modules/pi-agent-runtime/dist/types.d.ts:273`–`:342` | Tool、AgentRequest、RunResult、runAgent、waitForIdle 类型存在；当前 MF adapter 未使用工具循环 |
| 同文件 `:345`–`:362`、`:384`–`:395`、`:438`–`:545` | SessionStorage、独占 writer、SessionRunRequest、bindOperation、reconcile、inspect / result / run；当前 MF 接入未使用这些 API |
| runtime `docs/NATIVE-SESSION-CANDIDATE.md:17`、`:42`–`:44` | 恢复前核验，unknown 阻断；取消不代表效果撤销；未 idle 不释放写入者 |

代码行号为本次 HEAD 的本地阅读定位，不是外部网页引用。没有将 package README 中滞后的“0.4.1”当作当前安装版本。没有把 runtime API 可用等同于产品已接通。

认可原型的 `方案.md` 第 3 节明确自然语言 → 可讨论草稿 → 同一工作稿；`app.js`、`style.css` 和 `screenshots-v0.2/01-经营分析总览.jpg` 支持助手、影响预览与版本方向。该原型此前使用合成 / 预设交互，不能证明生产后端能力。

视觉依据：`output/playwright/screenshots/reference-current-home.png` 是本次真实 Chromium 渲染当前 dist 的截图，工作目录隔离、MF_LLM_BACKEND=faux；`research/reference-approved-prototype-overview.jpg` 是此前认可原型的原截图副本，明确为历史参考。当前 UI 仅发现 favicon 404，不是 SimLab 原型错误。

未发现适用 AGENTS.md；初始与最终 Git branch / HEAD / status 存在 `metric-factory-before.json` 与 `metric-factory-after.json`，三项既有未跟踪工作保留。
