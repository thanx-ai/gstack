---
name: upstream-sync
version: 1.0.0
description: |
  Pull changes from upstream garrytan/gstack into the Thanx fork with an
  explicit, file-by-file security review of every commit. Refuses to merge
  without your sign-off. Defends against supply-chain attacks: malicious
  hooks, hidden network calls, MCP server registration, exfil through
  telemetry, etc. Use when asked to "sync upstream", "pull from garrytan",
  "merge upstream gstack", or "review upstream changes". (gstack)
  Voice triggers (speech-to-text aliases): "sync upstream", "pull from upstream", "merge upstream gstack", "review upstream changes".
triggers:
  - sync upstream gstack
  - pull from garrytan gstack
  - merge upstream changes
  - upstream security review
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
  - Agent
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# /upstream-sync — pull from upstream with a security review

This is the only sanctioned path for bringing changes from upstream
`garrytan/gstack` into this fork. Every commit gets read; every diff gets
reviewed against the supply-chain checklist below; nothing merges without
explicit user approval.

If the user wants to update from `thanx-ai/gstack` (the Thanx fork's `origin`),
they want `/gstack-upgrade`, not this skill.

## Refusal posture

Default to "this isn't safe to merge yet" rather than "looks fine to me." The
upstream repo moves fast, accepts community PRs, and ships executable code that
runs on every Claude Code SessionStart, every skill preamble, and every Bash
tool invocation in this project. A single rubber-stamped sync is enough for an
attacker to land a backdoor. **The job here is to be paranoid.**

If at any point you want to skip a step "to save time," stop and ask the user
first. The point of this skill is the review.

## Step 0: Confirm scope and intent

Before fetching anything, AskUserQuestion:

- Question: "Run the upstream sync now? This fetches from `garrytan/gstack`
  and walks every new commit through a security review. Merging requires
  your explicit approval at the end."
- Options:
  - "Yes, do the sync now"
  - "Show me what's new first, no merge" (review-only mode)
  - "Cancel"

If "Cancel", stop. If "review-only", note that we will not propose any merge
at the end — the skill becomes a reporting exercise.

## Step 1: Locate the install + verify origin

```bash
if [ -d "$HOME/.claude/skills/gstack/.git" ]; then
  INSTALL_DIR="$HOME/.claude/skills/gstack"
elif [ -d ".claude/skills/gstack/.git" ]; then
  INSTALL_DIR=".claude/skills/gstack"
elif [ -d "$(pwd)/.git" ] && [ -f "$(pwd)/SKILL.md.tmpl" ]; then
  INSTALL_DIR="$(pwd)"
else
  echo "ERROR: gstack git checkout not found"
  exit 1
fi
echo "INSTALL_DIR=$INSTALL_DIR"

cd "$INSTALL_DIR"
ORIGIN_URL=$(git remote get-url origin 2>/dev/null || echo "")
echo "ORIGIN=$ORIGIN_URL"
```

The origin URL must reference `thanx-ai/gstack`. If it does not, stop and tell
the user — running this skill against a non-fork checkout will silently
push upstream commits into the wrong remote when they merge.

## Step 2: Set up the upstream remote (read-only)

```bash
cd "$INSTALL_DIR"
if git remote | grep -q '^upstream$'; then
  UPSTREAM_URL=$(git remote get-url upstream)
  echo "EXISTING_UPSTREAM=$UPSTREAM_URL"
else
  git remote add upstream https://github.com/garrytan/gstack.git
  # Set push URL to a refusal sentinel so we cannot accidentally push to upstream.
  git remote set-url --push upstream DISABLED-NO-PUSH-TO-UPSTREAM
  echo "ADDED_UPSTREAM=https://github.com/garrytan/gstack.git"
fi
```

If `EXISTING_UPSTREAM` is set and points anywhere other than
`https://github.com/garrytan/gstack.git` (or
`git@github.com:garrytan/gstack.git`), **stop** and confirm with the user
before continuing.

## Step 3: Fetch upstream (no merge, no rebase)

```bash
cd "$INSTALL_DIR"
git fetch upstream --no-tags --prune
```

`--no-tags` deliberately — upstream tags can otherwise pull in arbitrary
commits we haven't reviewed. We only want refs we can enumerate and inspect.

## Step 4: Determine what's new since the last sync

The last reviewed sync point lives in `UPSTREAM_SYNC_LOG.md` at the repo root.

```bash
cd "$INSTALL_DIR"
LAST_SYNC=""
if [ -f UPSTREAM_SYNC_LOG.md ]; then
  LAST_SYNC=$(awk '/^## Sync /{print $NF; exit}' UPSTREAM_SYNC_LOG.md | tr -d '()')
fi
if [ -z "$LAST_SYNC" ]; then
  # Fall back to the merge-base between origin/main and upstream/main.
  LAST_SYNC=$(git merge-base origin/main upstream/main 2>/dev/null || echo "")
fi
echo "LAST_SYNC=$LAST_SYNC"

if [ -z "$LAST_SYNC" ]; then
  echo "ERROR: cannot determine last sync point. Ask the user."
  exit 1
fi

echo "=== Commits to review ==="
git log --oneline --no-decorate "$LAST_SYNC..upstream/main" | tee /tmp/upstream-sync-commits.txt
COMMIT_COUNT=$(wc -l < /tmp/upstream-sync-commits.txt | tr -d ' ')
echo "TOTAL_COMMITS=$COMMIT_COUNT"
```

If `COMMIT_COUNT` is 0, tell the user "No new upstream commits since
`$LAST_SYNC`. Already up to date." and stop.

If `COMMIT_COUNT` is large (say > 30), AskUserQuestion whether to:
- "Review all of them in one batch" (slow but thorough, recommended for
  small batches),
- "Review in chunks of 10" (the skill walks 10 commits, asks for sign-off,
  then continues),
- "Stop here and pick a narrower range" (user gives an explicit
  `<from>..<to>` SHA range to review).

## Step 5: Per-commit security review

For each commit in `/tmp/upstream-sync-commits.txt`:

```bash
SHA=<sha>
git show --stat "$SHA"          # file summary first
git show "$SHA"                  # full diff
```

Run the **Supply-chain checklist** (below) against the diff. Note every
finding with severity (BLOCK / ASK / NOTE) and the specific file + line.

Use the Agent tool to parallelise review of independent commits when the
batch is large — spawn multiple `Explore` agents, each reviewing one commit
against the same checklist, then synthesise the findings. Prepend the Thanx
security policy to every spawned subagent prompt; subagent PreToolUse hooks
do not fire and the policy is the only protection.

After each commit is reviewed, record the verdict in memory (or a scratch
file at `/tmp/upstream-sync-review.md`):

```
## SHA <sha> — <one-line subject>
verdict: APPROVE | REJECT | ASK
findings:
  - severity: BLOCK | ASK | NOTE
    file: <path>:<line>
    issue: <what the diff does that triggered the rule>
    rationale: <why it's risky here>
```

Do NOT skip commits because the subject "looks fine." Subjects lie. Read
the diff.

## Supply-chain checklist (run on every diff)

These are the failure modes we're explicitly defending against. A diff is
not safe just because it doesn't trip a rule — judgment matters — but if
it trips ANY of these and the rationale isn't immediately clear, treat it
as `BLOCK` until the user signs off.

### A. Code that runs on session start or skill load

- New or modified files in `bin/`, `setup`, `setup-deploy/`, or any
  `*.sh` / `*.bash` invoked by the SessionStart hook.
- New or modified `scripts/resolvers/preamble/**` — this code is
  injected into every skill preamble and runs on every skill invocation.
- Anything that writes to `$HOME/.claude/settings.json` (the Claude Code
  settings file) or registers a `SessionStart` / `PreToolUse` /
  `PostToolUse` / `Stop` hook.
- Anything that registers an MCP server (`claude mcp add ...`,
  `mcp_servers` config edits).

### B. Network egress

- New `curl`, `wget`, `fetch`, `http.get`, `https.request`,
  `axios`, `node-fetch`, `request` calls.
- Any URL that is NOT one of:
  - `https://api.anthropic.com` / `https://anthropic.com`
  - `https://github.com/thanx-ai/*` / `git@github.com:thanx-ai/*`
  - `https://github.com/garrytan/gstack` (read-only fetch only)
  - The Anthropic-published SDK package registries (`registry.npmjs.org`
    only when running `bun install` / `npm install`, never inline at
    runtime).
- Telemetry endpoints, feature-flag services, error reporters, analytics —
  even ones that "look familiar." Confirm domain ownership.
- WebSocket endpoints, ngrok / cloudflared / localtunnel calls.
- DNS lookups via `getent`, `dig`, `nslookup` (rare but real exfil
  primitive).

### C. Code execution primitives

- `eval "$(...)"`, `bash <(curl ...)`, `source <(...)`, `node -e`,
  `python -c`, `npx <something not pinned in package.json>`.
- New use of `sudo`, `doas`, anything escalating privileges.
- New `exec` / `spawn` of binaries fetched at runtime.
- Background daemons (`&` / `nohup` / `disown`) that persist past the
  current command.
- Cron entries (`crontab`), `launchctl` plists, systemd units.

### D. Filesystem reach

- Writes to anything under `~/.ssh/`, `~/.aws/`, `~/.config/`, `~/.gnupg/`,
  `~/Library/Keychains/`, `~/.npmrc`, `~/.pypirc`, `~/.netrc`, `~/.git-credentials`.
- Writes to `/etc/`, `/usr/local/bin/`, anywhere outside the user's
  home or the repo working tree without an obvious reason.
- Reads of credential files (same list) where the value is sent
  anywhere — even via logging.
- New `chmod` / `chown` on files outside the repo.

### E. Credential handling

- New environment variable reads matching `*KEY*`, `*TOKEN*`, `*SECRET*`,
  `*PASS*`, `*AUTH*`, `*COOKIE*`, `*BEARER*`. Trace where each one ends up.
- Logging or echoing of values that came from such env vars.
- New persistent state files that contain auth material.

### F. Dependency surface

- Every new entry in `package.json` `dependencies` /
  `devDependencies` / `peerDependencies`. Look up each on npm; reject
  packages with <1 month of life, < 100 weekly downloads, or recently
  transferred maintainership.
- Version range bumps that widen the allowed range (`^1.0.0` → `*`,
  pinned → caret, etc.).
- New `bun.lock` / `package-lock.json` entries that don't match a
  `package.json` change.
- `postinstall` / `preinstall` / `prepare` scripts in package.json or
  in any newly-introduced dependency.

### G. CI / GitHub Actions

- New or modified files under `.github/workflows/`. CI runs with
  repo secrets — a malicious workflow exfils them on the first push.
- Workflows that trigger on `pull_request_target` (runs with secrets
  on a PR's branch — high-risk by default).
- New `uses: <action>` references — pin every action to a SHA,
  reject `@main` / `@master` / unversioned references.

### H. Voice / behaviour drift

- Changes to skill prompts, voice directives, or AskUserQuestion
  templates that subtly steer the agent toward auto-merging,
  auto-installing, or running shell commands without asking.
- New "auto-confirm if X" flags or branches.
- Changes to the `confusion protocol`, `careful` skill, or any other
  guardrail.

### I. Stuff specific to this fork

- Any change that re-arms the disabled update-check / session-update
  stubs in `bin/` (currently they `exit 0` — restoring their original
  network-fetching bodies is the precise threat this fork defends against).
- Any change that re-adds a SessionStart hook registration.
- Any change that swaps `origin` from `thanx-ai/gstack` to anything else.
- Any change to `/upstream-sync` itself (this skill) that loosens the
  review steps.

### Severity rules

- **BLOCK**: hits a checklist item AND there is no clear, benign
  explanation in the diff or commit message. Cannot merge until
  resolved (either upstream changes its mind, or we revert the
  specific commit on our side).
- **ASK**: hits a checklist item but the diff has plausible context.
  Surface to the user; they decide.
- **NOTE**: doesn't hit a checklist item, but is worth recording in the
  sync log for context (e.g., "added a new skill — reviewed prompt for
  drift, looks consistent with existing voice").

## Step 6: Synthesise the report

Build a markdown summary covering:

1. The SHA range reviewed (`$LAST_SYNC..upstream/main`).
2. Total commits, total files changed, total lines added / removed.
3. **All BLOCK findings**, listed individually with file + commit + rationale.
4. **All ASK findings**, listed individually with file + commit + rationale.
5. **NOTE findings**, summarised by category.
6. A recommended verdict: `MERGE-ALL` / `MERGE-SUBSET` / `REJECT`.

Show the full report to the user. If review-only mode (Step 0), stop here.

## Step 7: Resolve BLOCK / ASK findings

For every BLOCK and ASK finding, AskUserQuestion with three options:

- "Approve this finding — safe to merge"
- "Reject this commit — exclude from the merge"
- "Need more info — explain further" (in which case re-run Step 5
  diff display for the specific commit and walk through the rationale)

Track each user decision. If any finding is "Reject this commit", record
the SHA in a "rejected commits" list — the merge in Step 8 will exclude
those commits via cherry-picking the safe range only.

## Step 8: Merge (only with explicit approval)

AskUserQuestion one final time:

- Question: "Ready to merge upstream into a sync branch? This creates a
  branch named `upstream-sync/<date>`, performs the merge or cherry-pick,
  and stops short of pushing. Nothing lands on `main` until you open a PR."
- Options:
  - "Yes, create the sync branch and merge"
  - "No, just save the review to UPSTREAM_SYNC_LOG.md and stop"

If "No", proceed to Step 9 (logging) without merging.

If "Yes":

```bash
cd "$INSTALL_DIR"
SYNC_BRANCH="upstream-sync/$(date -u +%Y-%m-%d)"
git checkout -b "$SYNC_BRANCH" origin/main
```

If there are no rejected commits, do a straight merge:

```bash
git merge --no-ff upstream/main -m "upstream-sync: merge upstream/main through <sha-of-upstream-main>

Reviewed range: <LAST_SYNC>..upstream/main
Findings: see UPSTREAM_SYNC_LOG.md"
```

If there ARE rejected commits, cherry-pick the approved commits one at a
time instead of merging the whole range. Stop on conflicts and ask the
user how to resolve.

After the merge or cherry-pick, run `bun install` (in case dependencies
moved) and `bun test`. If tests fail, **stop** — do not push, do not
open a PR. Surface the failures and let the user decide whether to
fix-on-this-branch or abort the sync.

## Step 9: Log the sync

Append (or create) `UPSTREAM_SYNC_LOG.md` at the repo root. Newest entry on top:

```markdown
## Sync <YYYY-MM-DD> (<short-sha-of-new-upstream-main>)

- **Reviewer:** <git config user.name>
- **Reviewed range:** <LAST_SYNC>..<upstream/main sha>
- **Commits reviewed:** N
- **Outcome:** MERGE-ALL | MERGE-SUBSET | REJECT | REVIEW-ONLY
- **Sync branch:** <upstream-sync/YYYY-MM-DD or "n/a">

### Findings

#### BLOCK
- <commit>: <file>:<line> — <issue>. Resolution: <approved | rejected | reverted>

#### ASK
- <commit>: <file>:<line> — <issue>. Resolution: <approved | rejected>

#### NOTE
- <category>: <count> — <one-line summary>

### Rejected commits

- <sha> — <reason>
```

This file is the source of truth for "what's the last point we trust from
upstream." The next `/upstream-sync` reads it to compute `$LAST_SYNC` in
Step 4.

## Step 10: Hand off

If a sync branch was created, tell the user:

- The branch name (`upstream-sync/<date>`).
- The merge or cherry-pick SHA(s).
- Test status.
- Suggest: "open a PR to `thanx-ai/gstack` and get a second pair of eyes
  on `UPSTREAM_SYNC_LOG.md` before merging to `main`."

Do NOT push or open the PR for the user. The sync branch stays local
until they're ready.

## Notes

- This skill is intentionally slow. Speed is not a goal; review fidelity is.
- Run `/upstream-sync` on a quiet branch with no other work in flight, so
  the diff you're reviewing is exactly the upstream delta.
- If upstream rebases or force-pushes `main`, the previous `$LAST_SYNC`
  may no longer be reachable. AskUserQuestion how to recover — usually
  by re-deriving from `git merge-base` and re-reviewing the gap.
