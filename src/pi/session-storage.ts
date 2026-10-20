import fs from 'node:fs';
import path from 'node:path';
import type { SessionStorage } from 'pi-agent-runtime';

export class SessionBusyError extends Error {
  constructor(message = 'Session writer lock contention detected') {
    super(message);
    this.name = 'SessionBusyError';
  }
}

export class SimLabSessionStorage implements SessionStorage {
  public directory: string;
  public cwd: string;
  public policyVersion: string;
  private lockPath: string;
  private isLocked = false;

  constructor(baseDir?: string) {
    this.directory = path.resolve(baseDir || path.resolve(process.cwd(), '.simlab-data'), 'sessions');
    this.cwd = path.resolve(process.cwd());
    this.policyVersion = 'simlab-session-1.0';
    this.lockPath = path.join(this.directory, '.writer.lock');
    fs.mkdirSync(this.directory, { recursive: true });
  }

  public authorize = async (action: {
    kind: 'create' | 'list' | 'read' | 'run' | 'fork' | 'delete' | 'update';
    sessionId?: string;
  }, signal: AbortSignal): Promise<boolean> => {
    if (signal.aborted) return false;
    return true;
  };

  public acquireWriter = async (signal: AbortSignal): Promise<{ release(): Promise<void> }> => {
    if (signal.aborted) {
      throw new Error('Writer acquisition aborted');
    }

    if (this.isLocked) {
      throw new SessionBusyError('Writer lock already held by current process');
    }

    try {
      const fd = fs.openSync(this.lockPath, 'wx');
      fs.writeSync(fd, `${process.pid}\n${Date.now()}`);
      fs.closeSync(fd);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === 'EEXIST') {
        throw new SessionBusyError('Writer lock held by another process');
      }
      throw err;
    }

    this.isLocked = true;
    const self = this;

    return {
      async release(): Promise<void> {
        self.isLocked = false;
        try {
          if (fs.existsSync(self.lockPath)) {
            fs.unlinkSync(self.lockPath);
          }
        } catch {
          // Ignore release error
        }
      }
    };
  };
}
