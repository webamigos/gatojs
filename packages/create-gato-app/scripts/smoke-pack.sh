#!/usr/bin/env bash
set -euo pipefail

# Packs gato-cli and create-gato-app, installs both tarballs into an empty prefix and creates
# projects from a local GatoJS checkout with the packed gato-cli. Never touches the npm registry
# for these two packages.
# Usage: scripts/smoke-pack.sh <gatojs-checkout> [extra create-gato-app flags]
# SMOKE_INSTALL=1 also runs npm install in both projects and checks their gato-cli.

kit_dir=$(cd "${1:?usage: smoke-pack.sh <gatojs-checkout>}" && pwd)
shift
packages_dir="$kit_dir/packages"
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

fail() {
  echo "smoke test failed: $*" >&2
  exit 1
}

version_of() {
  node -p "require('$packages_dir/$1/package.json').version"
}

gato_version=$(version_of gato-cli)
creator_version=$(version_of create-gato-app)
pinned=$(node -p "require('$packages_dir/create-gato-app/package.json').dependencies['gato-cli']")
[ "$pinned" = "$gato_version" ] ||
  fail "create-gato-app pins gato-cli $pinned, the workspace has $gato_version"

mkdir -p "$work_dir/pack"
(cd "$packages_dir/gato-cli" && npm pack --silent --pack-destination "$work_dir/pack" >/dev/null)
(cd "$packages_dir/create-gato-app" && npm pack --silent --pack-destination "$work_dir/pack" >/dev/null)
gato_tarball="$work_dir/pack/gato-cli-$gato_version.tgz"
creator_tarball="$work_dir/pack/create-gato-app-$creator_version.tgz"
test -f "$gato_tarball" || fail "missing $gato_tarball"
test -f "$creator_tarball" || fail "missing $creator_tarball"

expected_files=$'package/LICENSE\npackage/NOTICE\npackage/README.md\npackage/dist/gato.mjs\npackage/package.json'
actual_files=$(tar -tzf "$gato_tarball" | LC_ALL=C sort)
[ "$actual_files" = "$expected_files" ] ||
  fail "gato-cli tarball holds unexpected files:"$'\n'"$actual_files"
if tar -tzf "$creator_tarball" | grep -q '__tests__'; then
  fail "the create-gato-app tarball contains tests"
fi

mkdir -p "$work_dir/prefix"
(cd "$work_dir/prefix" && npm init -y >/dev/null &&
  npm install --no-audit --no-fund --silent "$gato_tarball" "$creator_tarball")
bin_dir="$work_dir/prefix/node_modules/.bin"
gato="$bin_dir/gato"
creator="$bin_dir/create-gato-app"

[ "$("$gato" --version)" = "$gato_version" ] || fail "gato --version is not $gato_version"
[ "$("$creator" --version)" = "$creator_version" ] ||
  fail "create-gato-app --version is not $creator_version"
if "$gato" nope >/dev/null 2>&1; then
  fail "gato accepted an unknown command"
fi
if "$creator" "$work_dir/refused" --skip-docker >/dev/null 2>&1; then
  fail "create-gato-app accepted the unsupported --skip-docker flag"
fi

dependency_of() {
  node -p "require('$1/package.json').devDependencies['gato-cli'] ?? 'missing'"
}

app="$work_dir/smoke-app"
"$creator" "$app" --kit "$kit_dir" --yes --no-install --no-git --cli-source "$gato_tarball" "$@"
test -f "$app/.wa/kit.json" || fail "no .wa/kit.json in the project"
[ "$(dependency_of "$app")" = "file:$gato_tarball" ] ||
  fail "the project does not use the packed gato-cli: $(dependency_of "$app")"
for kit_only in kit packages/gato-cli packages/create-gato-app; do
  [ ! -e "$app/$kit_only" ] || fail "kit-only $kit_only reached the project"
done

registry_app="$work_dir/registry-app"
"$creator" "$registry_app" --kit "$kit_dir" --yes --no-install --no-git
[ "$(dependency_of "$registry_app")" = "^$gato_version" ] ||
  fail "a project without --cli-source should depend on gato-cli ^$gato_version"
kit_only_lock_entries=$(node -e '
  const lock = require(process.argv[1]);
  const kitOnly = Object.keys(lock.packages).filter((key) => /(^|\/)(gato-cli|create-gato-app)$/.test(key) || /^packages\/(gato-cli|create-gato-app)\//.test(key));
  if (lock.name !== "registry-app") kitOnly.push(`name ${lock.name}`);
  console.log(kitOnly.join(" "));
' "$registry_app/package-lock.json")
[ -z "$kit_only_lock_entries" ] ||
  fail "the project lockfile keeps kit-only entries: $kit_only_lock_entries"

if [ "${SMOKE_INSTALL:-0}" = "1" ]; then
  (cd "$app" && npm install --no-audit --no-fund --ignore-scripts --silent)
  [ "$(cd "$app" && npx --no-install gato --version)" = "$gato_version" ] ||
    fail "the project's gato is not $gato_version"
  # WHY: the project depends on gato-cli from the registry, which may not have this version yet;
  # --no-save installs the packed one under the same name without touching package.json.
  (cd "$registry_app" && npm install --no-save --no-audit --no-fund --ignore-scripts --silent "$gato_tarball")
  [ "$(cd "$registry_app" && npx --no-install gato --version)" = "$gato_version" ] ||
    fail "the gato of a project created without --cli-source is not $gato_version"
fi

echo "smoke test passed: gato-cli $gato_version, create-gato-app $creator_version"
