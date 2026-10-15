#!/usr/bin/env bash
# Забирает вендорные исходники (Markdown-зеркала руководства, Python API и перевод ru.po).
# Нужен только для пересборки базы данных: node blender/tools/build-data.mjs
set -euo pipefail
cd "$(dirname "$0")/../vendor"

fetch () {  # <repo> <dir>
  rm -rf "$2"
  git clone --depth 1 --filter=blob:none --no-checkout -q "https://github.com/$1.git" "$2"
  ( cd "$2" && git sparse-checkout set --no-cone '/**/*.md' >/dev/null && git checkout -q )
  echo "$2: $(find "$2" -name '*.md' -not -path '*/.git/*' | wc -l) страниц"
}

fetch wlk-r-dev/blender-manual-5.0 manual
fetch wlk-r-dev/blender-python-reference-5.0 api

# Официальный перевод интерфейса Blender на русский
rm -rf ru-manual-src && git clone --depth 1 --filter=blob:none --no-checkout -q https://github.com/blender/blender.git ru-manual-src
( cd ru-manual-src && git sparse-checkout set --no-cone '/locale/po/ru.po' >/dev/null && git checkout -q )
cp ru-manual-src/locale/po/ru.po ru.po
rm -rf ru-manual-src
echo "ru.po: $(grep -c '^msgid ' ru.po) строк перевода"
