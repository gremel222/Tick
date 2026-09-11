#!/usr/bin/env bash
# Собирает статику для GitHub Pages в docs/ (клиент как есть + SPA-фолбэк).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf docs/assets docs/src docs/index.html docs/404.html docs/.nojekyll
cp -r client/assets docs/assets
cp -r client/src docs/src
cp client/index.html docs/index.html
cp client/index.html docs/404.html   # SPA-фолбэк для deep-links (/Tick/play и т.п.)
touch docs/.nojekyll
echo "docs/ обновлён"
