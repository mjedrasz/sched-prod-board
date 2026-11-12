#!/usr/bin/env sh
# Copies app/ to dist/ and stamps the build sha (R6) into the meta tag and footer.
set -eu
SHA="${1:-$(git rev-parse HEAD)}"
rm -rf dist && cp -r app dist
sed -i "s/__BUILD_SHA__/${SHA}/g" dist/index.html
echo "built dist/ at ${SHA}"
