# Upstream Sync Log

This file is the source of truth for "the last point we trust from upstream
`garrytan/gstack`." `/upstream-sync` reads the newest entry to compute the next
review range. Newest entry on top.

## Sync 2026-06-05 (cab774cc)

- **Reviewer:** Darren Cheng
- **Reviewed range:** `49cc4ff9c99e9b24f39aa7dcbfc456e840be29a8..upstream/main` (cab774cc, v1.56.0.0)
- **Commits reviewed:** 40
- **Files in delta:** 583 (+86,015 / -15,515)
- **New npm dependencies:** 0 (`bun.lock` unchanged, no postinstall hooks)
- **Outcome:** MERGE-ALL (with fork hardening preserved + 1 new remote surface gated)
- **Sync branch:** `argus/Pull-in-latest-version-of` → fork version `1.57.0.0`
- **Audit method:** 6 parallel reviewers, one per supply-chain checklist domain
  (telemetry/consent, gbrain/Supabase, iOS/Tailscale, CI/setup/hooks,
  deps/artifacts/bin, fork-guard/voice-drift).

### Verdict

No malicious supply-chain injection found. No new dependencies, no install
hooks, no obfuscated code, no credential-format strings, no PII, no
prompt-injection in commit messages. The only real risk was upstream
**regressing the fork's hardening** by re-touching every file the fork stubbed
or deleted. The merge resolved every such conflict in favor of the fork's
hardened version.

### BLOCK findings — resolved by keeping fork hardening (KEEP-OURS / STRIP)

- `bin/gstack-telemetry-sync` — upstream re-arms POST of skill-usage to
  `frugpmstpnojnhfyimgv.supabase.co`. Kept the fork's `exit 0` stub.
- `scripts/resolvers/preamble/generate-telemetry-prompt.ts` — upstream re-adds
  the opt-in prompt. Kept the fork's empty-string return.
- `supabase/` (config.sh + functions + migrations + verify-rls.sh) — upstream
  re-adds the directory carrying the hardcoded Supabase URL + anon key. Kept
  deleted; `git rm` the re-added `supabase/verify-rls.sh`.
- `bin/gstack-update-check` — upstream re-arms `git ls-remote` +
  `curl raw.githubusercontent.com/.../VERSION` + telemetry POST. Kept the
  fork's `exit 0` stub.
- `bin/gstack-session-update` + `setup` §10 team mode — upstream re-registers a
  SessionStart auto-`git pull` hook. Kept the stub; setup forces
  `auto_upgrade false` and only ever removes the hook.
- `scripts/resolvers/preamble/generate-upgrade-check.ts` — upstream re-wires
  `_UPD=$(... gstack-update-check)` into every preamble. Kept the fork's
  neutered resolver; verified no generated SKILL.md invokes the binary.
- `bin/gstack-community-dashboard`, `bin/gstack-security-dashboard`,
  `bin/gstack-thanx-fork-check` — fork-only guards preserved.
- Step-0 `gstack-thanx-fork-check` guards in `setup-deploy`, `setup-gbrain`,
  `pair-agent` (remote path) — preserved through template regen.

### ASK findings — gated or accepted with rationale

- **iOS device-farm `--tailnet`** (v1.43.0.0): local-USB QA is clean; the
  optional Tailscale remote-access listener violates fork policy. Gated behind
  `gstack-thanx-fork-check` in `bin/gstack-ios-qa-daemon` and hardened to reject
  `GSTACK_IOS_TAILNET_BIND=0.0.0.0` / `::`. Local USB mode unaffected.
- **gbrain** (v1.37/v1.40/v1.52): engine code clean (all DB traffic to a
  user-provisioned Supabase via the local `gbrain` CLI). Already fork-gated by
  the setup-gbrain Step-0 guard; left dormant.
- **gbrain memory ingest**: kept the fork's unconditional fail-closed secret
  scan rather than upstream's opt-in `--scan-secrets`.
- **plan-tune hooks** (`setup`): opt-in local PostToolUse/PreToolUse hooks on
  AskUserQuestion; verified no network egress. Accepted as upstream designed.

### NOTE — net-positive upstream hardening adopted (TAKE-THEIRS)

- `bin/gstack-slug` cache shell-injection fix.
- `bin/gstack-timeline-read` code-injection (JS-interpolation) fix.
- `bin/gstack-paths` cross-plugin state-hijack guard.
- `bin/gstack-redact` / `gstack-redact-prepush` local PII/secret/legal scanner.
- `bin/gstack-settings-hook` schema-aware rewrite (taken only with setup's
  SessionStart-add line confirmed stripped).
- CI runner swaps + Windows setup E2E gate. No `pull_request_target` anywhere.

### OpenClaw

The fork removed OpenClaw at v1.32.0.0. The merge re-introduced OpenClaw
references in new upstream content; cleaned the user-facing ones (iOS skill
template, README, generated outputs). The pre-existing `openclaw)` case in
`setup` was already present on the fork pre-merge and is left as-is (out of
sync scope).

### Test reconciliation

The merge brought upstream's test suite, including tests that assert the exact
exfiltration code the fork removed. Handling:

- **Deleted** `test/telemetry-repo-strip.test.ts` (asserted `gstack-telemetry-sync`'s
  repo-identity sed pipeline) and `test/regression-pr1169-mktemp-fallbacks.test.ts`
  (asserted `gstack-telemetry-sync` + the deleted `supabase/verify-rls.sh`).
  Keeping them green would require re-arming the exfil path. The fork's stub is
  still covered by `test/telemetry.test.ts` and `test/skill-validation.test.ts`.
- **Adapted** `test/skill-coverage-matrix.ts` (registered fork-only
  `/upstream-sync`), `test/skill-size-budget.test.ts` (exempted the fork-rewritten
  smaller `gstack-upgrade`), and the CHANGELOG reference for
  `test/parity-baseline-integrity.test.ts`.
- **Remaining `bun test` failures are environment / upstream-inherited**, not
  fork regressions. Verified against an `origin/main` baseline run (which itself
  fails 24 in this sandbox): missing toolchains (gbrain CLI, swift, gitleaks,
  codex), TS bins needing `bun` in the test's restricted PATH, chromium quirks,
  and one upstream `testName` vs touchfiles-key naming inconsistency that fails
  on upstream too. The merge fixed 17 baseline failures (golden fixtures,
  gbrain-sync). CI (with full toolchains) is the real gate.

### Rejected commits

None. All 40 commits merged; risky surfaces neutralized in-tree rather than
excluded.
