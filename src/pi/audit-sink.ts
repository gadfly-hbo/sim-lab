import fs from 'node:fs';
import path from 'node:path';
import type { AuditSink, AuditEvent } from 'pi-agent-runtime';

export class PersistentJsonlAuditSink implements AuditSink {
  private logPath: string;

  constructor(storageDir?: string) {
    const dir = storageDir || path.resolve(process.cwd(), '.simlab-data');
    fs.mkdirSync(dir, { recursive: true });
    this.logPath = path.join(dir, 'audit.jsonl');
  }

  public getLogPath(): string {
    return this.logPath;
  }

  public async append(event: Readonly<AuditEvent>, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw new Error('Audit sink write aborted');
    }
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(this.logPath, line, 'utf8');
  }

  public readEvents(): AuditEvent[] {
    if (!fs.existsSync(this.logPath)) {
      return [];
    }
    const lines = fs.readFileSync(this.logPath, 'utf8').trim().split('\n');
    return lines.filter(Boolean).map(l => JSON.parse(l));
  }
}
