# 工具合同与 Pi 接点 · v0.2 设计稿

这是正式产品的实施合同提案，不是已发布 SDK 或生产 schema。本次 HTML 仅以脚本与本地内核演示同样的产品语义；没有导入、修改或调用 Pi。

## 1. 与当前 runtime 匹配的接口

依据 metric-factory 实际安装的 `pi-agent-runtime@0.4.3/dist/types.d.ts`：

```ts
interface Tool {
  name: string;
  description: string;
  effect: 'read' | 'write' | 'external';
  parameters: JsonObject; // JSON Schema
  resourceUnits: number;
  executionMode?: 'sequential' | 'parallel';
  replay?: 'never' | 'safe';
  policyVersion?: string;
  execute(args: JsonObject, signal: AbortSignal,
          invocation?: ToolExecutionContext): Promise<JsonValue>;
}
```

`ToolExecutionContext` 有 sessionId / branch / operationId / invocationId / toolCallId，以及 getMemo / setMemo / update。工具执行器必须把这些关联到应用回执；没有调用上下文时用应用创建的 operationId，不能凭自然语言生成信任凭据。

一次工具循环用 `createRuntime().runAgent()`；持续实验讨论用 `createSessionRuntime().run()`。不使用 `runText` 伪装成已接入工具。以下为适配伪代码，host 变量必须由应用真实实现，不能直接当可运行代码：

```ts
const runtime = createSessionRuntime({
  model: approvedModel,
  transport: createPiTransport({model: approvedModel, apiKey: hostCredential}),
  authorize: hostAuthorize,
  audit: durableAuditSink,
  budgets: atomicPersistentBudgetStore,
  storage: { directory: sessionRoot, cwd: workspaceRoot,
             policyVersion, authorize: sessionAuthorize, acquireWriter },
  bindOperation: applicationBindOperation,
  reconcile: applicationReconcile, // unknown / denied 阻断推进
  onEvent: e => uiObserver.publish(projectSafeMetadata(e)),
});
const result = await runtime.run({
  taskId, sessionId, operation: 'prompt', prompt,
  tools: registeredSimulationTools,
  contextVersions: { model: modelVersion, draft: revision.toString(), policy: policyVersion },
  limits: approvedLimits,
  signal: controller.signal,
});
// 持久提交只走应用服务。onEvent 不能代替 bindOperation 或结果回执。
```

参考当前 metric-factory 的候选链、审计与预算 adapter，但不要照搬其 `authorize: async () => true`：当前该 adapter 只返回无工具文本。SimLab 有工作稿和结果写入，必须核验 effect、scope、revision 和采纳凭据。真实模型的 provider、外发内容与费用不在本次授权内。

## 2. 通用请求 / 结果信封

所有应用工具 `parameters` 根对象设 `additionalProperties:false`，校验失败不得进入 execute 的业务效果阶段。下列通用字段由工具 schema 明确声明；实际 JSON 参数不必重复发送所有空字段。

```json
{
  "experimentId":"EXP-001",
  "expectedRevision":2,
  "modelVersion":"simlab-daily-fifo-0.1.0",
  "operationId":"OP-003",
  "idempotencyKey":"EXP-001:r2:run:client-nonce",
  "inputHash":"sha256:canonical-input"
}
```

| 字段 | 类型 / 规则 |
| --- | --- |
| experimentId | 非空字符串；应用核对当前用户 / 独立工作区所有权 |
| expectedRevision | 非负整数；变更与运行必须精确匹配服务端工作稿 |
| modelVersion | 注册表中的固定版本，不接受任意模型脚本 |
| operationId | 应用预先分配的逻辑操作 ID；唯一绑定实验 / revision / scope |
| idempotencyKey | 变更与运行必需；同键同输入返回同一回执，同键异输入拒绝 |
| inputHash | 服务端对 canonical 参数、模型 hash、三方案、冲击与政策重算核对 |

参数错误时，执行器可以返回结构化工具错误供 Agent 修正；禁止用一个 `ok:false` 混淆是否已经执行：

```json
{
  "operationId":"OP-003",
  "status":"rejected_not_executed",
  "execution":"not_started",
  "code":"INVALID_PARAMETER",
  "issues":[{"path":"parameters.leadTime","expected":"integer 1..30","received":0}],
  "retry":"after_correction"
}
```

成功信封含 operationId、runId / proposalId / snapshotId、revision、modelVersion、inputHash、validation、data / evidenceRefs。失败信封含 stage、code、execution（not_started / started / settled / unknown）、knownEffects、retry（after_correction / new_operation_allowed / query_only / never）。未知不得返回空对象装成成功。

## 3. 完整工具清单

下表中的 Input / Output 为产品字段合同；JSON Schema 应逐字段生成。数值规则唯一复用内核 `PARAM_RULES`，days 固定 30，shock 严格 boolean；无 additionalProperties。UI 与工具执行均调用同一 validator。

| 工具 | effect / replay | Input（除通用字段外） | Output / 前置条件 |
| --- | --- | --- | --- |
| inspect_model | read / safe | modelId:string，version?:string | modelVersion、coreHash、parameterSchema、units、三方案规则、日序、口径、支持冲击、限制、来源资格；未知模型拒绝 |
| read_draft | read / safe | experimentId:string | revision、goal、parameters、confirmedRevision、最新结果引用；只读不改变确认 |
| propose_change | write / never | expectedRevision、patch:允许字段的部分参数、rationale:string、assumptions:array | proposalId、baseRevision、规范化 patch、来源与未决项；只存提案，不改稿；模型不适配返回 UNSUPPORTED_MODEL |
| preview_change | read / safe | proposalId、baseRevision、modelVersion | before / after inputHash、三方案 delta、阈值变化、守恒、政策联动、证据；实际内核重算；过期提案返回 STALE_PROPOSAL |
| apply_proposal | write / never | proposalId、expectedRevision、acceptedPreviewHash、hostAcceptanceRef | CAS 更新稿、newRevision、confirmationInvalidated、affectedRuns；只信应用保存的采纳事件，不信模型自述用户同意 |
| confirm_caliber | write / never | expectedRevision、scopeHash、hostReviewRef | confirmedRevision、review记录；仅 UI / 宿主直接命令可授予，Agent 不能自行确认 |
| run_experiment | write / never | revision、modelVersion、inputHash、idempotencyKey、requestedEvidence:[dailyLedger,thresholds,sensitivity,conservation] | 原子 admitted 回执 → runId、三方案、30 天记录、采购 / 订单、敏感性、守恒；确认必须覆盖当前 revision；不允许 Agent 传入结果数字 |
| get_operation | read / safe | operationId | admission、执行状态、是否提交、runId、knownEffects；有权威回执才报告成功 / 未执行，查不到则维持 unknown |
| get_run | read / safe | runId | 原冻结 input、modelVersion、hash、结果与验证；旧运行可读，明确 historical |
| read_evidence | read / safe | runId、scenarioId:baseline\|advance\|split、kind:summary\|day\|ledger\|thresholds\|sensitivity\|conservation、day?:integer 0..30 | 带单位、公式定义、来源、日号及残差的真实数据；不存在的证据返回 NOT_FOUND，不补数 |
| cancel_operation | write / never | operationId、hostStopRef | stopRequested 与当前已知效果；传 signal 并等待结算。stopRequested 不等于 cancelled_not_executed |
| save_snapshot | write / never | runId、expectedRevision、confirmedRevision、hostFreezeRef | 不可变 snapshotId / hash；当前稿、确认、运行一致且守恒通过才固定；同一运行去重 |
| export_snapshot | read / safe | snapshotId、format:json | 固定输入、模型 / 参数 schema版本、完整结果 / 日账 / 敏感性 / 检验、来源、限制、hash。导出当前结果则额外核对 revision；历史导出标 historical |

副作用工具默认串行，resourceUnits 按确定的运算 / 写入成本计，不用金额猜计费。纯查询可并行；预览与运行受模型天数、方案数、批次数和超时上限限制。工具层没有 arbitrary code、shell、file path 或 URL 参数。

## 4. 参数与影响贯穿执行

例如“将日发货能力改为300”：Agent 只能提议 `{capacity:300}`。应用先核验范围，再用注册内核在相同环境下计算前后差异。preview 返回必须声明这是政策修改：分批方案的接单上限会一并改变。不能称为冻结接单政策的“能力单变量敏感性”。

用户采纳后 revision 从 r1 到 r2；confirmedRevision 清空，r1 的 run 与 snapshot 保持。用户确认 r2 后运行，run_experiment 从服务端读 r2 的参数，不从 Agent 参数接受一份暗改的完整输入。结果引用 `r2 / modelVersion / inputHash / operationId / runId`，解释按同一 run 读取证据。

```json
{
  "proposalId":"P-001","baseRevision":1,"patch":{"capacity":300},
  "impact":{
    "mode":"deterministic-preview",
    "policyCoupling":["split.acceptanceCap follows capacity"],
    "perScenarioDelta":"kernel-generated numeric fields, never LLM supplied"
  },
  "requires":["explicit_adoption","caliber_review","rerun"]
}
```

上例字符串字段为合同说明占位，真实接口必须返回带单位的数值对象。Demo 仅在助手展示基准方案现金低点 / 贡献毛利 / 取消变化；完整三方案影响矩阵属于正式工具合同，未宣称已经实现。

## 5. 事件、错误与恢复

runtime 实际事件包括 run.started、model.admitted、model.finished、tool.admitted、tool.finished、run.finished、session.control；包含 taskId、runId、sequence、contextVersions，可有 session / invocation。宿主另发业务事件 draft.changed、proposal.created / applied / discarded、caliber.confirmed、experiment.admitted / settled、snapshot.created。

UI 以应用 operation 回执为权威，按 sequence 去重并可重查。onEvent / onHarnessEvent 只做观察，不能用回调成功代替结果提交。回调丢失不丢业务结果；无法确认是否提交时进入 unknown。

| SDK / 业务输入 | 应用判定 |
| --- | --- |
| INVALID_REQUEST / INVALID_TOOL，且尚未 admission | rejected_not_executed；指出字段 / 版本，修正后新操作 |
| TOOL_FAILED / STATE_FAILED | 结合回执确定失败阶段和效果；若无结算证据则 unknown |
| CANCELLED / DEADLINE_EXCEEDED | 不直接等价未执行；查 effect receipt 与物理 idle |
| waiting / BUSINESS_WAIT | 正常业务等待，保留 checkpoint，不借此提升授权 |
| suspended / DEFERRED | 保存 session binding，显式 poll / resume 同一操作，不重新提交 prompt |
| CONFIGURATION_CHANGED / AUTHORITY_REQUIRED / BUDGET_EXHAUSTED | blocked，保留原 task 预算与配置身份；不静默切换到宽松路径 |
| 成功但结果守恒失败 | 产品运行失败，不提交成功结果，也不继续出推荐 |

恢复顺序：inspect / get_operation 只读 → 对齐 session / task / revision / budgets / receipt → reconcile 返回 ready 才推进 → resume 同一 operation。Unknown 返回 unknown，保持暂停，等待权威查证；不调用 fallback 再跑一次业务工具。fork 只复制对话历史，不复制旧授权或退回预算。

`replay:'never'` 是效果保护，幂等回执是第二道防线，两者不能互相代替。已提交成功的同键请求返回原结果；确定未执行才能修正后提交新操作；不确定的同键请求只能查询。停止不能撤销已经发生的写入。

## 6. 工程验收切口

先用离线 transport 验证工具 schema / validator / 正常与非法调用；再验证采纳凭据、revision CAS、幂等冲突、断连后未知不重试、取消后迟到成功、回执恢复、独占会话写入与预算不重置。最后单独批准真实 provider、外发数据与费用，做有界联调。SDK 自身测试和当前产品的 runText 接通均不能替代 SimLab 的这些验收。
