import type { ModelTransport, ModelRequest, ModelReply } from 'pi-agent-runtime';

export function createOfflineScriptedTransport(): ModelTransport {
  return async (request: ModelRequest): Promise<ModelReply> => {
    const lastMsg = request.messages[request.messages.length - 1];

    // If last message was a tool result, produce an assistant text response summarizing it
    if (lastMsg && lastMsg.role === 'tool') {
      return {
        content: [
          {
            kind: 'text',
            text: `[离线助手] 工具 ${lastMsg.toolName || 'tool'} 执行完成：${lastMsg.text.slice(0, 120)}...`
          }
        ],
        stop: 'complete',
        usage: { inputTokens: 50, outputTokens: 25 }
      };
    }

    const text = (lastMsg?.text || '').trim();

    // Check intent in user prompt
    if (text.includes('查询模型') || text.includes('inspect_model')) {
      return {
        content: [
          {
            kind: 'tool',
            id: 'call_inspect_model_' + Date.now(),
            name: 'inspect_model',
            arguments: { modelId: 'simlab-daily-fifo-0.1.0' }
          }
        ],
        stop: 'tools',
        usage: { inputTokens: 40, outputTokens: 15 }
      };
    }

    if (text.includes('读取工作稿') || text.includes('read_draft')) {
      return {
        content: [
          {
            kind: 'tool',
            id: 'call_read_draft_' + Date.now(),
            name: 'read_draft',
            arguments: {
              experimentId: 'EXP-MOCK'
            }
          }
        ],
        stop: 'tools',
        usage: { inputTokens: 40, outputTokens: 20 }
      };
    }

    if (text.includes('发货能力') || text.includes('修改参数') || text.includes('提议') || text.includes('propose_change')) {
      return {
        content: [
          {
            kind: 'tool',
            id: 'call_propose_' + Date.now(),
            name: 'propose_change',
            arguments: {
              experimentId: 'EXP-MOCK',
              expectedRevision: 1,
              patch: { capacity: 300 },
              rationale: '将日发货能力改为300'
            }
          }
        ],
        stop: 'tools',
        usage: { inputTokens: 40, outputTokens: 20 }
      };
    }

    if (text.includes('确认口径') || text.includes('confirm_caliber')) {
      return {
        content: [
          {
            kind: 'tool',
            id: 'call_confirm_' + Date.now(),
            name: 'confirm_caliber',
            arguments: {
              experimentId: 'EXP-MOCK',
              expectedRevision: 1,
              hostReviewRef: 'HOST-REVIEW-001'
            }
          }
        ],
        stop: 'tools',
        usage: { inputTokens: 40, outputTokens: 20 }
      };
    }

    if (text.includes('运行仿真') || text.includes('run_experiment')) {
      return {
        content: [
          {
            kind: 'tool',
            id: 'call_run_' + Date.now(),
            name: 'run_experiment',
            arguments: {
              experimentId: 'EXP-MOCK',
              expectedRevision: 1,
              modelVersion: 'simlab-daily-fifo-0.1.0',
              inputHash: 'sha256:mock',
              idempotencyKey: 'offline-run-1'
            }
          }
        ],
        stop: 'tools',
        usage: { inputTokens: 40, outputTokens: 20 }
      };
    }

    // Default conversational reply
    return {
      content: [
        {
          kind: 'text',
          text: `[SimLab 离线助手] 您好！我是 SimLab 离线脚本助手（零付费模型调用）。您可以指示我：查询模型口径、创建实验、调整参数提议、确认口径或运行仿真。`
        }
      ],
      stop: 'complete',
      usage: { inputTokens: 30, outputTokens: 30 }
    };
  };
}
