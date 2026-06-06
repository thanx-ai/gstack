---
name: gstack-upgrade
version: 2.0.0
description: Pull the latest reviewed gstack release from origin (thanx-ai/gstack) and re-run setup.
triggers:
  - upgrade gstack
  - update gstack version
  - get latest gstack
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->


## When to invoke this skill

This is the Thanx fork: there is no remote VERSION poll, no
auto-upgrade, no SessionStart hook. To merge changes from upstream
garrytan/gstack, use /upstream-sync instead — it does an explicit
file-by-file security review.

Voice triggers (speech-to-text aliases): "upgrade the tools", "update the tools", "gee stack upgrade", "g stack upgrade".

# /gstack-upgrade

Pull the latest reviewed fork release from `thanx-ai/gstack` (the Thanx fork's
`origin`). For pulling from upstream `garrytan/gstack`, use `/upstream-sync`
instead — that skill does a file-by-file security review and is the only
sanctioned path for upstream merges.

This skill never reaches `garrytan/gstack` directly. If origin is somehow
pointing at upstream, stop and tell the user — this fork's whole point is
that origin is `thanx-ai/gstack`.

## Step 1: Detect install type

```bash
if [ -d "$HOME/.claude/skills/gstack/.git" ]; then
  INSTALL_TYPE="global-git"
  INSTALL_DIR="$HOME/.claude/skills/gstack"
elif [ -d "$HOME/.gstack/repos/gstack/.git" ]; then
  INSTALL_TYPE="global-git"
  INSTALL_DIR="$HOME/.gstack/repos/gstack"
elif [ -d ".claude/skills/gstack/.git" ]; then
  INSTALL_TYPE="local-git"
  INSTALL_DIR=".claude/skills/gstack"
elif [ -d ".agents/skills/gstack/.git" ]; then
  INSTALL_TYPE="local-git"
  INSTALL_DIR=".agents/skills/gstack"
elif [ -d ".claude/skills/gstack" ]; then
  INSTALL_TYPE="vendored"
  INSTALL_DIR=".claude/skills/gstack"
elif [ -d "$HOME/.claude/skills/gstack" ]; then
  INSTALL_TYPE="vendored-global"
  INSTALL_DIR="$HOME/.claude/skills/gstack"
else
  echo "ERROR: gstack not found"
  exit 1
fi
echo "Install type: $INSTALL_TYPE at $INSTALL_DIR"
```

## Step 2: Verify origin points at the Thanx fork

```bash
cd "$INSTALL_DIR"
ORIGIN_URL=$(git remote get-url origin 2>/dev/null || echo "")
echo "ORIGIN: $ORIGIN_URL"
```

The URL must match `thanx-ai/gstack` (either `git@github.com:thanx-ai/gstack.git`
or `https://github.com/thanx-ai/gstack.git`). If it points at `garrytan/gstack`
or any other repo, **stop**. Tell the user the origin remote is wrong for this
fork and suggest:

```bash
git -C "$INSTALL_DIR" remote set-url origin git@github.com:thanx-ai/gstack.git
```

Do not proceed with a `git pull` until origin is correct.

## Step 3: Save old version

```bash
OLD_VERSION=$(cat "$INSTALL_DIR/VERSION" 2>/dev/null || echo "unknown")
```

## Step 4: Pull and re-run setup

For git installs (global-git, local-git):

```bash
cd "$INSTALL_DIR"
STASH_OUTPUT=$(git stash 2>&1)
git fetch origin
git reset --hard origin/main
./setup
```

If `$STASH_OUTPUT` contains "Saved working directory", warn the user:
"Note: local changes were stashed. Run `git stash pop` in the skill directory
to restore them."

For vendored installs (vendored, vendored-global) — re-clone from the Thanx
fork:

```bash
PARENT=$(dirname "$INSTALL_DIR")
TMP_DIR=$(mktemp -d)
git clone --depth 1 git@github.com:thanx-ai/gstack.git "$TMP_DIR/gstack"
mv "$INSTALL_DIR" "$INSTALL_DIR.bak"
mv "$TMP_DIR/gstack" "$INSTALL_DIR"
cd "$INSTALL_DIR" && ./setup
rm -rf "$INSTALL_DIR.bak" "$TMP_DIR"
```

## Step 5: Run version migrations

```bash
MIGRATIONS_DIR="$INSTALL_DIR/gstack-upgrade/migrations"
if [ -d "$MIGRATIONS_DIR" ]; then
  for migration in $(find "$MIGRATIONS_DIR" -maxdepth 1 -name 'v*.sh' -type f 2>/dev/null | sort -V); do
    m_ver="$(basename "$migration" .sh | sed 's/^v//')"
    if [ "$OLD_VERSION" != "unknown" ] && [ "$(printf '%s\n%s' "$OLD_VERSION" "$m_ver" | sort -V | head -1)" = "$OLD_VERSION" ] && [ "$OLD_VERSION" != "$m_ver" ]; then
      echo "Running migration $m_ver..."
      bash "$migration" || echo "  Warning: migration $m_ver had errors (non-fatal)"
    fi
  done
fi
```

## Step 6: Show what changed

Read `$INSTALL_DIR/CHANGELOG.md` and summarise the entries between
`OLD_VERSION` and the new `VERSION` as 5–7 bullets. Skip purely internal
refactors. Format:

```
gstack v{new} — upgraded from v{old} (origin = thanx-ai/gstack).

What's new:
- ...

To merge changes from upstream garrytan/gstack, run /upstream-sync.
```

## Step 7: Continue

The upgrade is done. Continue with whatever skill the user originally
invoked, if anything.
