#!/usr/bin/env bash
# Собирает статику для GitHub Pages в docs/ (клиент как есть + SPA-фолбэк).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf docs/assets docs/src docs/index.html docs/404.html docs/.nojekyll
cp -r client/assets docs/assets
cp -r client/src docs/src
cp client/index.html docs/index.html
cp client/index.html docs/404.html   # SPA-фолбэк для deep-links (/Tick/play и т.п.)
# Академия Blender: код и готовая база (исходники мануала vendor/ не публикуем)
rm -rf docs/blender
mkdir -p docs/blender
cp -r blender/src docs/blender/src
cp -r blender/content docs/blender/content
cp -r blender/data docs/blender/data
cp blender/index.html blender/sw.js blender/manifest.webmanifest blender/icon.svg docs/blender/
cp blender/README.md docs/blender/README.md

touch docs/.nojekyll
echo "docs/ обновлён (игра + академия Blender)"
