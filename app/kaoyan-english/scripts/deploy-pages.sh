#!/usr/bin/env bash
# ==========================================================================
# 构建产物并同步到站点仓库的 public/kaoyan-english/
#
# 用法：
#   scripts/deploy-pages.sh /path/to/fuzzy-han.github.io      只构建并同步（不动 git）
#   scripts/deploy-pages.sh /path/to/fuzzy-han.github.io --push  同步并提交推送
#
# 线上地址是「目录 + hash 路由」：austcoder.cn/kaoyan-english/#/workbench
# 因此不需要任何服务端重写规则，也不会和站点上其他页面冲突。
# ==========================================================================
set -euo pipefail

REPO_DIR="${1:-}"
PUSH="${2:-}"
ROUTE_NAME="kaoyan-english"

if [[ -z "$REPO_DIR" ]]; then
  echo "用法: $0 <站点仓库路径> [--push]" >&2
  exit 1
fi

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "错误: $REPO_DIR 不是一个 git 仓库" >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$REPO_DIR/public/$ROUTE_NAME"

echo "▸ 类型检查"
cd "$APP_DIR"
./node_modules/.bin/tsc -p tsconfig.json --noEmit

echo "▸ 构建（base=/$ROUTE_NAME/）"
APP_BASE="/$ROUTE_NAME/" APP_OUT_DIR="dist" ./node_modules/.bin/vite build

echo "▸ 校验产物"
node scripts/verify-css-order.mjs >/dev/null
if ! grep -q "/$ROUTE_NAME/assets/" dist/index.html; then
  echo "错误: 产物里的资源路径没有带上 /$ROUTE_NAME/ 前缀，线上会 404" >&2
  exit 1
fi

echo "▸ 同步到 $TARGET"
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp -r dist/. "$TARGET/"

# GitHub Pages 默认走 Jekyll，会忽略下划线开头的目录。
# 放在站点根目录，对所有子项目都生效。
touch "$REPO_DIR/.nojekyll"

echo "▸ 产物体积"
du -sh "$TARGET" | awk '{print "  " $1}'

if [[ "$PUSH" == "--push" ]]; then
  cd "$REPO_DIR"
  git add -A "public/$ROUTE_NAME" .nojekyll
  if git diff --cached --quiet; then
    echo "▸ 没有变化，跳过提交"
    exit 0
  fi
  git commit -m "feat(kaoyan-english): 更新考研英语写作批改平台构建产物"
  git push origin HEAD
  echo "▸ 已推送，等待 GitHub Actions 自动部署"
else
  echo "✓ 已同步（未提交）。加 --push 可自动提交推送。"
fi
