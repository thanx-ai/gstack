/**
 * Tests for bin/gstack-thanx-fork-check.
 *
 * Exits 0 when the gstack repo origin points at the Thanx fork
 * (= block gated skills). Exits 1 otherwise.
 *
 * Tests cover the env override, every origin URL flavor we expect to
 * encounter (SSH, HTTPS, optional .git suffix, thanx-ai/* and thanx/*),
 * and the fail-closed behavior when git lookup fails.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const SCRIPT = join(import.meta.dir, '..', '..', 'bin', 'gstack-thanx-fork-check');

let gstackDir: string;

function run(env: Record<string, string> = {}) {
  // Drop any inherited GSTACK_THANX_FORK / GSTACK_DIR so each test runs hermetic.
  const baseEnv = { ...process.env };
  delete baseEnv.GSTACK_THANX_FORK;
  delete baseEnv.GSTACK_DIR;
  const result = Bun.spawnSync(['bash', SCRIPT], {
    env: { ...baseEnv, GSTACK_DIR: gstackDir, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

function initRepoWithOrigin(originUrl: string) {
  Bun.spawnSync(['git', 'init', '-q', gstackDir]);
  Bun.spawnSync(['git', '-C', gstackDir, 'remote', 'add', 'origin', originUrl]);
}

beforeEach(() => {
  gstackDir = mkdtempSync(join(tmpdir(), 'gstack-thanx-check-'));
});

afterEach(() => {
  rmSync(gstackDir, { recursive: true, force: true });
});

describe('gstack-thanx-fork-check — env override', () => {
  test('GSTACK_THANX_FORK=1 forces exit 0 (block) regardless of origin', () => {
    initRepoWithOrigin('https://github.com/garrytan/gstack.git');
    expect(run({ GSTACK_THANX_FORK: '1' }).exitCode).toBe(0);
  });

  test('GSTACK_THANX_FORK=true forces exit 0', () => {
    expect(run({ GSTACK_THANX_FORK: 'true' }).exitCode).toBe(0);
  });

  test('GSTACK_THANX_FORK=yes forces exit 0', () => {
    expect(run({ GSTACK_THANX_FORK: 'yes' }).exitCode).toBe(0);
  });

  test('GSTACK_THANX_FORK=0 forces exit 1 (allow) regardless of origin', () => {
    initRepoWithOrigin('git@github.com:thanx-ai/gstack.git');
    expect(run({ GSTACK_THANX_FORK: '0' }).exitCode).toBe(1);
  });

  test('GSTACK_THANX_FORK=false forces exit 1', () => {
    initRepoWithOrigin('git@github.com:thanx-ai/gstack.git');
    expect(run({ GSTACK_THANX_FORK: 'false' }).exitCode).toBe(1);
  });

  test('GSTACK_THANX_FORK=no forces exit 1', () => {
    initRepoWithOrigin('git@github.com:thanx-ai/gstack.git');
    expect(run({ GSTACK_THANX_FORK: 'no' }).exitCode).toBe(1);
  });

  test('GSTACK_THANX_FORK with unrecognized value falls through to auto-detect', () => {
    initRepoWithOrigin('https://github.com/garrytan/gstack.git');
    // Unknown value → does not match the case, falls through to git origin check.
    expect(run({ GSTACK_THANX_FORK: 'maybe' }).exitCode).toBe(1);
  });
});

describe('gstack-thanx-fork-check — auto-detect (Thanx origin)', () => {
  test('SSH origin git@github.com:thanx-ai/gstack.git → exit 0', () => {
    initRepoWithOrigin('git@github.com:thanx-ai/gstack.git');
    expect(run().exitCode).toBe(0);
  });

  test('HTTPS origin without .git suffix → exit 0', () => {
    initRepoWithOrigin('https://github.com/thanx-ai/gstack');
    expect(run().exitCode).toBe(0);
  });

  test('HTTPS origin with .git suffix → exit 0', () => {
    initRepoWithOrigin('https://github.com/thanx-ai/gstack.git');
    expect(run().exitCode).toBe(0);
  });

  test('Alt org name "thanx/gstack" also matches → exit 0', () => {
    initRepoWithOrigin('git@github.com:thanx/gstack.git');
    expect(run().exitCode).toBe(0);
  });
});

describe('gstack-thanx-fork-check — auto-detect (non-Thanx origin)', () => {
  test('Upstream garrytan/gstack origin → exit 1', () => {
    initRepoWithOrigin('git@github.com:garrytan/gstack.git');
    expect(run().exitCode).toBe(1);
  });

  test('Some random fork origin → exit 1', () => {
    initRepoWithOrigin('https://github.com/some-other-user/gstack.git');
    expect(run().exitCode).toBe(1);
  });

  test('Look-alike org (thanx-other/gstack-fork) does NOT match → exit 1', () => {
    // The globs require the literal substring "thanx-ai/gstack" or
    // "thanx/gstack". A repo at thanx-other/gstack-fork has neither —
    // the slash separates "thanx-other" from "gstack-fork", so the
    // "thanx/gstack" substring isn't present. Confirms the patterns are
    // tight enough to reject lookalikes.
    initRepoWithOrigin('https://github.com/thanx-other/gstack-fork.git');
    expect(run().exitCode).toBe(1);
  });
});

describe('gstack-thanx-fork-check — fail-closed on lookup failure', () => {
  test('No .git directory → exit 0 (fail-closed)', () => {
    // gstackDir has no .git inside; treat as Thanx fork to be safe.
    expect(run().exitCode).toBe(0);
  });

  test('Git repo but no remote configured → exit 0 (fail-closed)', () => {
    Bun.spawnSync(['git', 'init', '-q', gstackDir]);
    // No `git remote add` — origin lookup returns empty.
    expect(run().exitCode).toBe(0);
  });

  test('GSTACK_DIR points to nonexistent path → exit 0 (fail-closed)', () => {
    expect(run({ GSTACK_DIR: '/nonexistent/path/does-not-exist' }).exitCode).toBe(0);
  });

  test('GSTACK_DIR is empty string → script falls back to script-path resolution', () => {
    // Empty GSTACK_DIR triggers script-path resolution. Since the actual
    // script lives in the Thanx fork repo at runtime, this exits 0 here.
    // The test asserts the empty-string code path doesn't crash.
    const result = run({ GSTACK_DIR: '' });
    expect([0, 1]).toContain(result.exitCode);
  });
});

describe('gstack-thanx-fork-check — script properties', () => {
  test('script produces no stdout / stderr in any scenario', () => {
    initRepoWithOrigin('https://github.com/thanx-ai/gstack');
    const r = run();
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('');
  });
});
