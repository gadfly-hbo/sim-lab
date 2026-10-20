#!/usr/bin/env bash
# 一键启动 SimLab v0.2 电商经营仿真实验室工作台（macOS / Linux 通用）
# 参考 metric-factory 生产级标准：
#   PATH 兜底 → 依赖检查 → 增量构建 → 端口探活与顺延 → 后台启动 → 健康检查 → 唤起浏览器
set -e
cd "$(dirname "$0")/.."

# 兜底 macOS 非交互环境常见 PATH
export PATH="$HOME/.local/node/bin:$HOME/Dev/Env/homebrew/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js 环境，请先安装 Node.js (>=18)。" >&2
  exit 1
fi

echo "======================================================"
echo "  SimLab v0.2 电商经营仿真实验室工作台"
echo "======================================================"

if [ ! -d node_modules ]; then
  echo "[首次运行] 正在安装依赖..."
  npm install --no-audit --no-fund
fi

# 构建判定：产物缺失，或 src/package.json 比产物新（拉取新代码后自动重建）
if [ ! -f dist/cli/index.js ] || [ -n "$(find src package.json -newer dist/cli/index.js -print -quit 2>/dev/null)" ]; then
  echo "[构建] 仿真引擎与工作台（源码更新或缺失产物）..."
  npm run build
fi

PORT="${SIMLAB_PORT:-4175}"
if curl -s -o /dev/null "http://127.0.0.1:${PORT}/api/v1/health" 2>/dev/null || curl -s -o /dev/null "http://127.0.0.1:${PORT}/" 2>/dev/null; then
  echo "[端口] ${PORT} 已被占用，自动切换至 4176"
  PORT=4176
fi

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "[启动] 正在启动本地服务 http://127.0.0.1:${PORT} ..."
# UI 服务端已内建 SIMLAB_NO_OPEN 防重，脚本在确认健康检查就绪后再行唤起浏览器
SIMLAB_NO_OPEN=1 node bin/sim-lab.js ui --port "$PORT" &
SERVER_PID=$!

echo "[等待] 正在等待服务就绪..."
READY=0
for _ in $(seq 1 40); do
  if curl -sf -o /dev/null "http://127.0.0.1:${PORT}/api/v1/health" 2>/dev/null; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" -eq 1 ]; then
  echo "======================================================"
  echo "  SimLab v0.2 仿真实验室工作台服务已就绪"
  echo "  本地访问地址: http://127.0.0.1:${PORT}"
  echo "  按 Ctrl+C 可停止服务"
  echo "======================================================"
  if [ -z "${SIMLAB_NO_OPEN:-}" ]; then
    if command -v open >/dev/null 2>&1; then
      echo "正在打开系统默认浏览器..."
      open "http://127.0.0.1:${PORT}"
    elif command -v xdg-open >/dev/null 2>&1; then
      echo "正在打开系统默认浏览器..."
      xdg-open "http://127.0.0.1:${PORT}"
    fi
  fi
else
  echo "[错误] 工作台启动超时，请检查控制台输出。"
fi

wait "$SERVER_PID"
