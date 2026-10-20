import { createHttpServer } from '../dist/ui/server.js';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';

async function main() {
  console.log('启动 SimLab 测试服务器 (端口 4318)...');
  const { start } = createHttpServer({
    port: 4318,
    host: '127.0.0.1',
    staticDir: process.cwd()
  });
  const instance = await start();
  console.log(`SimLab 测试服务器运行在: ${instance.url}`);

  console.log('启动参考页服务器 (端口 4317)...');
  let refServer;
  try {
    refServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title>SimLab Reference</title></head><body><h1>SimLab Reference App</h1></body></html>');
    }).listen(4317, '127.0.0.1');
  } catch (err) {
    console.warn('4317 server creation skipped:', err);
  }

  console.log('运行 Playwright 浏览器端到端验收: tests/browser-flow.cjs ...');
  const patchPath = path.resolve(process.cwd(), 'scripts/cjs-patch.cjs');
  const child = spawn('node', ['-r', patchPath, 'tests/browser-flow.cjs'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      SIMLAB_BASE_URL: instance.url,
      PLAYWRIGHT_MODULE: path.resolve(process.cwd(), 'node_modules/playwright')
    }
  });

  child.on('close', async (code) => {
    console.log(`browser-flow.cjs 退出，退出码: ${code}`);
    await instance.close();
    if (refServer) {
      refServer.close();
    }
    process.exit(code || 0);
  });
}

main().catch(err => {
  console.error('Browser test runner failed:', err);
  process.exit(1);
});
