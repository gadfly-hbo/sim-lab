import fs from 'node:fs';
import path from 'node:path';
import type { ExperimentDraft } from './types.js';

export class CASConflictError extends Error {
  public currentRevision: number;
  public expectedRevision: number;

  constructor(experimentId: string, currentRevision: number, expectedRevision: number) {
    super(`CAS Conflict for experiment ${experimentId}: expected revision ${expectedRevision}, but current is ${currentRevision}`);
    this.name = 'CASConflictError';
    this.currentRevision = currentRevision;
    this.expectedRevision = expectedRevision;
  }
}

export class ExperimentNotFoundError extends Error {
  constructor(experimentId: string) {
    super(`Experiment not found: ${experimentId}`);
    this.name = 'ExperimentNotFoundError';
  }
}

export class ExperimentStore {
  private baseDir: string;
  private experimentsDir: string;
  private locksDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), '.simlab-data');
    this.experimentsDir = path.join(this.baseDir, 'experiments');
    this.locksDir = path.join(this.baseDir, 'locks');
    this.ensureDirs();
  }

  private ensureDirs(): void {
    fs.mkdirSync(this.experimentsDir, { recursive: true });
    fs.mkdirSync(this.locksDir, { recursive: true });
  }

  private getFilePath(id: string): string {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.experimentsDir, `${safeId}.json`);
  }

  private getLockPath(id: string): string {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.locksDir, `${safeId}.lock`);
  }

  public async acquireLock(id: string, timeoutMs = 5000): Promise<() => Promise<void>> {
    const lockPath = this.getLockPath(id);
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        const fd = fs.openSync(lockPath, 'wx');
        fs.writeSync(fd, `${process.pid}\n${Date.now()}`);
        fs.closeSync(fd);

        let released = false;
        return async () => {
          if (!released) {
            released = true;
            try {
              if (fs.existsSync(lockPath)) {
                fs.unlinkSync(lockPath);
              }
            } catch {
              // Ignore release errors
            }
          }
        };
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === 'EEXIST') {
          // Check if stale lock (> 10s old)
          try {
            const stat = fs.statSync(lockPath);
            if (Date.now() - stat.mtimeMs > 10000) {
              fs.unlinkSync(lockPath);
              continue;
            }
          } catch {
            // Lock may have been removed
          }
          await new Promise(resolve => setTimeout(resolve, 25));
        } else {
          throw err;
        }
      }
    }

    throw new Error(`Failed to acquire lock for experiment ${id} within ${timeoutMs}ms`);
  }

  public async get(id: string): Promise<ExperimentDraft | null> {
    const filePath = this.getFilePath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw) as ExperimentDraft;
    } catch (err) {
      console.error(`Error reading experiment file ${filePath}:`, err);
      return null;
    }
  }

  public async save(draft: ExperimentDraft, expectedRevision?: number): Promise<ExperimentDraft> {
    const unlock = await this.acquireLock(draft.id);
    try {
      const filePath = this.getFilePath(draft.id);

      if (fs.existsSync(filePath)) {
        if (expectedRevision !== undefined) {
          const existing = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ExperimentDraft;
          if (existing.revision !== expectedRevision) {
            throw new CASConflictError(draft.id, existing.revision, expectedRevision);
          }
        }
      }

      const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
      const data = JSON.stringify(draft, null, 2);

      const fd = fs.openSync(tempPath, 'w');
      fs.writeSync(fd, data, undefined, 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);

      fs.renameSync(tempPath, filePath);

      return draft;
    } finally {
      await unlock();
    }
  }

  public async list(): Promise<Array<{ id: string; name: string; revision: number; updatedAt: string }>> {
    if (!fs.existsSync(this.experimentsDir)) {
      return [];
    }
    const files = fs.readdirSync(this.experimentsDir).filter(f => f.endsWith('.json'));
    const items: Array<{ id: string; name: string; revision: number; updatedAt: string }> = [];

    for (const f of files) {
      try {
        const full = path.join(this.experimentsDir, f);
        const content = JSON.parse(fs.readFileSync(full, 'utf8')) as ExperimentDraft;
        items.push({
          id: content.id,
          name: content.name,
          revision: content.revision,
          updatedAt: content.updatedAt
        });
      } catch {
        // Skip corrupted files
      }
    }

    return items.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  }
}
