#!/usr/bin/env bash
set -euo pipefail

# Packs create-gato-app, installs the tarball into a temp dir and creates a project from a local kit checkout.
# Usage: scripts/smoke-pack.sh <kit-checkout> [extra create-gato-app flags]

kit_dir=$(cd "${1:?usage: smoke-pack.sh <kit-checkout>}" && pwd)
shift
package_dir=$(cd "$(dirname "$0")/.." && pwd)
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

tarball=$(cd "$package_dir" && npm pack --silent --pack-destination "$work_dir" | tail -n 1)
mkdir "$work_dir/install"
npm install --prefix "$work_dir/install" --no-audit --no-fund --silent "$work_dir/$tarball"
bin="$work_dir/install/node_modules/.bin/create-gato-app"

expected_version=$(node -p "require('$package_dir/package.json').version")
actual_version=$("$bin" --version)
if [ "$actual_version" != "$expected_version" ]; then
  echo "create-gato-app --version printed '$actual_version', expected '$expected_version'" >&2
  exit 1
fi

if "$bin" smoke-app --skip-docker >/dev/null 2>&1; then
  echo "create-gato-app accepted the unsupported --skip-docker flag" >&2
  exit 1
fi

if find "$work_dir/install/node_modules/create-gato-app" -path '*__tests__*' | grep -q .; then
  echo "the packed package contains tests" >&2
  exit 1
fi

"$bin" "$work_dir/smoke-app" --kit "$kit_dir" --yes --no-install --no-git "$@"

test -f "$work_dir/smoke-app/.wa/kit.json"
test -f "$work_dir/smoke-app/package.json"
if [ -e "$work_dir/smoke-app/kit" ]; then
  echo "kit-only files reached the project" >&2
  exit 1
fi
echo "smoke test passed: $tarball"
