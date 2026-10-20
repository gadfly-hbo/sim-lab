import fs from 'node:fs';
import path from 'node:path';
import type { BudgetStore, BudgetLease, Limits, Usage } from 'pi-agent-runtime';

export class PersistentBudgetStore implements BudgetStore {
  private filePath: string;
  private maxCumulativeCost: number;

  constructor(storageDir?: string, maxCumulativeCost = 1000000) {
    const dir = storageDir || path.resolve(process.cwd(), '.simlab-data');
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, 'budget.json');
    this.maxCumulativeCost = maxCumulativeCost;
  }

  private loadUsage(): Usage {
    if (!fs.existsSync(this.filePath)) {
      return {
        modelCalls: 0,
        toolCalls: 0,
        outputTokens: 0,
        resourceUnits: 0,
        activeMs: 0
      };
    }
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      return {
        modelCalls: 0,
        toolCalls: 0,
        outputTokens: 0,
        resourceUnits: 0,
        activeMs: 0
      };
    }
  }

  private saveUsage(usage: Usage): void {
    const tempPath = `${this.filePath}.${Date.now()}.tmp`;
    const fd = fs.openSync(tempPath, 'w');
    fs.writeSync(fd, JSON.stringify(usage, null, 2), undefined, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tempPath, this.filePath);
  }

  public getUsage(): Usage {
    return this.loadUsage();
  }

  public claim = async (
    taskId: string,
    runId: string,
    configuration: string,
    limits: Limits
  ): Promise<BudgetLease> => {
    const usage = this.loadUsage();

    if (usage.outputTokens >= this.maxCumulativeCost) {
      throw new Error(`Budget exhausted: cumulative tokens ${usage.outputTokens} >= limit ${this.maxCumulativeCost}`);
    }

    const self = this;
    let runTokens = 0;
    let runTools = 0;

    return {
      snapshot(): Usage {
        return self.loadUsage();
      },
      async reserveModel(): Promise<number> {
        return 1024;
      },
      async reserveModelUpTo(maximumTokens: number): Promise<number> {
        return Math.min(maximumTokens, 4096);
      },
      async settleModel(reservedTokens: number, actualTokens: number): Promise<void> {
        const u = self.loadUsage();
        u.modelCalls++;
        u.outputTokens += actualTokens;
        runTokens += actualTokens;
        self.saveUsage(u);
      },
      async reserveTool(units: number): Promise<void> {
        const u = self.loadUsage();
        u.toolCalls++;
        u.resourceUnits += units;
        runTools++;
        self.saveUsage(u);
      },
      async release(activeMs: number): Promise<void> {
        const u = self.loadUsage();
        u.activeMs += activeMs;
        self.saveUsage(u);
      }
    };
  };
}
