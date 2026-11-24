#!/usr/bin/env bash
set -euo pipefail

# Packs gato-cli and create-gato-app, installs both tarballs into an empty prefix and creates
# projects from a local GatoJS checkout with the packed gato-cli. Never touches the npm registry
# for these two packages.
# Usage: scripts/smoke-pack.sh <gatojs-checkout> [extra create-gato-app flags]
# Without SMOKE_INSTALL it checks generated secrets, COMPOSE_PROJECT_NAME, storage and mail answers in .env.
# SMOKE_INSTALL=1 lets the wizard install one project with --skip-docker (one clean commit), checks the
# projects' gato-cli, checks the .env of the default and the --mail-provider console projects with
# checkEnv, and runs the wizard against a busy DB_PORT (exit 1, port report, no containers).

kit_dir=$(cd "${1:?usage: smoke-pack.sh <gatojs-checkout>}" && pwd)
shift
packages_dir="$kit_dir/packages"
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

if ! git config user.name >/dev/null 2>&1; then
  export GIT_AUTHOR_NAME="GatoJS smoke" GIT_COMMITTER_NAME="GatoJS smoke"
fi
if ! git config user.email >/dev/null 2>&1; then
  export GIT_AUTHOR_EMAIL="smoke@gatojs.invalid" GIT_COMMITTER_EMAIL="smoke@gatojs.invalid"
fi

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
if "$creator" "$work_dir/refused" --yes --nope >/dev/null 2>&1; then
  fail "create-gato-app accepted an unknown flag"
fi
[ ! -e "$work_dir/refused" ] || fail "a refused run created the project directory"

dependency_of() {
  node -p "require('$1/package.json').devDependencies['gato-cli'] ?? 'missing'"
}

env_value() {
  sed -n "s/^$2=//p" "$1/.env"
}

assert_env() {
  local value
  value=$(env_value "$1" "$2")
  [[ "$value" =~ $3 ]] || fail "$2 in $1/.env is \"$value\", expected $3"
}

app="$work_dir/smoke-app"
if [ "${SMOKE_INSTALL:-0}" = "1" ]; then
  "$creator" "$app" --kit "$kit_dir" --yes --skip-docker --cli-source "$gato_tarball" "$@" | tee "$work_dir/app.log"
  test -d "$app/node_modules" || fail "the wizard did not run npm install"
  [ "$(git -C "$app" rev-list --count HEAD)" = "1" ] || fail "the project does not have exactly one commit"
  [ -z "$(git -C "$app" status --porcelain)" ] ||
    fail "the tree is dirty after the first commit:"$'\n'"$(git -C "$app" status --porcelain)"
  grep -q "docker compose up -d" "$work_dir/app.log" ||
    fail "next steps after --skip-docker do not mention docker compose up -d"
  if grep -q "npm install$" "$work_dir/app.log"; then
    fail "next steps list npm install although the wizard ran it"
  fi
else
  "$creator" "$app" --kit "$kit_dir" --yes --skip-install --no-git --cli-source "$gato_tarball" "$@"
fi
test -f "$app/.wa/kit.json" || fail "no .wa/kit.json in the project"
assert_env "$app" BETTER_AUTH_SECRET '^[A-Za-z0-9_-]{43}$'
assert_env "$app" COMPOSE_PROJECT_NAME '^smoke-app-[a-z0-9]{6}$'

secrets_app="$work_dir/secrets-app"
"$creator" "$secrets_app" --kit "$kit_dir" --yes --skip-install --no-git --modules api-keys,uploads \
  --storage s3 --s3-endpoint https://s3.example.com --s3-access-key-id SMOKEKEY --s3-secret-access-key smoke/secret+1 \
  >/dev/null
assert_env "$secrets_app" API_KEY_PEPPER '^[A-Za-z0-9_-]{43}$'
assert_env "$secrets_app" COMPOSE_PROJECT_NAME '^secrets-app-[a-z0-9]{6}$'
assert_env "$secrets_app" STORAGE_PROVIDER '^s3$'
assert_env "$secrets_app" S3_ENDPOINT '^https://s3\.example\.com$'
assert_env "$secrets_app" S3_ACCESS_KEY_ID '^SMOKEKEY$'
assert_env "$secrets_app" S3_SECRET_ACCESS_KEY '^smoke/secret\+1$'
assert_env "$app" SMTP_URL '^smtp://localhost:1025$'
assert_env "$app" MAIL_PROVIDER '^$'

mail_app="$work_dir/mail-app"
"$creator" "$mail_app" --kit "$kit_dir" --yes --skip-install --no-git --cli-source "$gato_tarball" \
  --mail-provider console "$@" >/dev/null
assert_env "$mail_app" MAIL_PROVIDER '^console$'
assert_env "$mail_app" SMTP_URL '^$'
[ "$(grep -c '^SMTP_URL=' "$mail_app/.env")" = "1" ] || fail "$mail_app/.env has more than one SMTP_URL line"

# Checks a project's .env with checkEnv from @gatojs/env and the env schemas of the project's modules.
check_project_env() {
  cat >"$1/smoke-check-env.mts" <<'EOF'
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { checkEnv, formatEnvReport } from "@gatojs/env";

const features = readdirSync("src/features").filter((name) => existsSync(`src/features/${name}/env.ts`));
const schemas = await Promise.all(
  features.map(async (name) => (await import(`./src/features/${name}/env.ts`)).envSchema),
);
const result = checkEnv({ ...parse(readFileSync(".env", "utf8")), NODE_ENV: "development" }, schemas);
if (!result.ok) {
  console.error(formatEnvReport(result.issues));
  process.exit(1);
}
EOF
  (cd "$1" && npx --no-install tsx smoke-check-env.mts) || fail "$1/.env does not pass checkEnv"
  rm "$1/smoke-check-env.mts"
}

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
  [ "$(cd "$app" && npx --no-install gato --version)" = "$gato_version" ] ||
    fail "the project's gato is not $gato_version"
  # WHY: the project depends on gato-cli from the registry, which may not have this version yet;
  # --no-save installs the packed one under the same name without touching package.json.
  (cd "$registry_app" && npm install --no-save --no-audit --no-fund --ignore-scripts --silent "$gato_tarball")
  [ "$(cd "$registry_app" && npx --no-install gato --version)" = "$gato_version" ] ||
    fail "the gato of a project created without --cli-source is not $gato_version"
  check_project_env "$app"
  # WHY: mail-app has the same modules as the installed app, so it borrows its node_modules
  # instead of a second npm install.
  ln -s "$app/node_modules" "$mail_app/node_modules"
  check_project_env "$mail_app"
fi

if [ "${SMOKE_INSTALL:-0}" = "1" ]; then
  busy_port=$(node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();})')
  node -e 'require("net").createServer().listen(Number(process.argv[1]),"127.0.0.1")' "$busy_port" &
  holder=$!
  sleep 1
  busy_app="$work_dir/busy-app"
  busy_status=0
  DB_PORT="$busy_port" "$creator" "$busy_app" --kit "$kit_dir" --yes --cli-source "$gato_tarball" \
    >"$work_dir/busy.log" 2>&1 || busy_status=$?
  kill "$holder"
  [ "$busy_status" = "1" ] || fail "a busy port should end with exit code 1, got $busy_status:"$'\n'"$(cat "$work_dir/busy.log")"
  grep -q "Port $busy_port (DB_PORT, service db) is already in use" "$work_dir/busy.log" ||
    fail "the busy port report does not name DB_PORT:"$'\n'"$(cat "$work_dir/busy.log")"
  grep -Eq "^ +DB_PORT=[0-9]+$" "$work_dir/busy.log" || fail "no DB_PORT suggestion in the report"
  grep -q "docker compose up -d" "$work_dir/busy.log" || fail "next steps after a busy port miss docker compose up -d"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^busy-app-"; then
    fail "containers of busy-app were started despite the busy port"
  fi
  [ -z "$(git -C "$busy_app" status --porcelain)" ] || fail "busy-app is dirty after the first commit"
fi

echo "smoke test passed: gato-cli $gato_version, create-gato-app $creator_version"
