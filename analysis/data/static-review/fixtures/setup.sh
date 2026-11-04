#!/usr/bin/env bash
# Installs the dependencies of the static-review fixtures next to them and
# prints how to run one. Usage: setup.sh [target directory] (default: a copy in
# /home/user/projects/static). npm 10 needs --legacy-peer-deps with Vitest 5.
set -euo pipefail
source_dir=$(cd "$(dirname "$0")" && pwd)
target=${1:-/home/user/projects/static}
tgz=${MOOTANT_TGZ:-/home/user/artifacts/mootant-0.1.0-170ec52.tgz}
mkdir -p "$target"
cp -r "$source_dir/vt" "$source_dir/nt" "$target/"
cd "$target/vt"
npm pkg set "devDependencies.mootant=file:$tgz" devDependencies.vite=^8.3.5 devDependencies.vitest=5.0.5
npm install --legacy-peer-deps
echo "Run a fixture: cd $target/vt/<name> && rm -f .runs && PATH=$target/vt/node_modules/.bin:\$PATH mootant run --no-cache --verbose"
echo "node:test fixture: cd $target/nt/hook && rm -f .runs && PATH=$target/vt/node_modules/.bin:\$PATH mootant run --no-cache --verbose"
