#!/usr/bin/env bash
# PLAT-06 gate. Run from the repo root. Read-only except a mktemp -d self-test directory.
set -eu

fail() { echo "FAIL: $*"; exit 1; }

# (a) secrets, CLI scratch, and build output are git-ignored
for p in .env.local app/.env app/.dev.vars app/dist/index.html app/.wrangler/x src/frontend/dist/index.html supabase/.temp/x; do
  git check-ignore -q "$p" || fail "$p is not git-ignored"
done

# (b) example files stay tracked
for p in .env.example app/.env.example app/.dev.vars.example; do
  ! git check-ignore -q "$p" || fail "$p is git-ignored but must stay tracked"
done

# (c) no tracked build output
test "$(git ls-files src/frontend/dist | wc -l)" -eq 0 || fail "src/frontend/dist has tracked files"

# (d) exactly one lockfile, at the repo root
test -f pnpm-lock.yaml || fail "pnpm-lock.yaml is missing at the repo root"
for p in app/package-lock.json app/yarn.lock app/pnpm-lock.yaml; do
  test ! -e "$p" || fail "$p exists; the only lockfile is the root pnpm-lock.yaml"
done

# (e) Node engine pinned and enforced
grep -q '"node": ">=22.12"' app/package.json || fail 'app/package.json lacks "node": ">=22.12"'
grep -q '^engine-strict=true' .npmrc || fail ".npmrc lacks engine-strict=true"

# (f) 500-line gate over app/
node app/scripts/check-file-sizes.mjs || fail "a code file under app/ exceeds 500 lines"

# (g) boundary self-test: a 500-line file passes, a 501-line file fails
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/ok" "$tmp/bad"
seq 500 > "$tmp/ok/a.ts"
seq 501 > "$tmp/bad/b.ts"
node app/scripts/check-file-sizes.mjs --root "$tmp/ok" || fail "a 500-line file was rejected"
! node app/scripts/check-file-sizes.mjs --root "$tmp/bad" 2>/dev/null || fail "a 501-line file was accepted"

echo "hygiene ok"
