import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cleanupActiveContexts } from './lib/harness.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const TESTS_DIR = path.resolve(import.meta.dirname, 'tests');
const DEFAULT_TIMEOUT_MS = 60_000;

function printHelp() {
  console.log(`Filoteca E2E Test Runner

Usage:
  node e2e/run.mjs [options]

Options:
  --tier <1|2|3|4|all>   Filter tests by tier (default: all)
  --v1-only              Run only baseline v1.1.0 tests (tag: 'v1')
  --v2-only              Run only v2.0.0 feature tests (tag: 'v2')
  --filter <substr>      Case-insensitive substring match on id/feature/name/file
  --json <path>          Write JSON summary report to <path>
  --timeout <ms>         Override per-test timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})
  --help, -h             Show this help message
`);
}

function parseArgs(argv) {
  const opts = {
    tier: 'all',
    v1Only: false,
    v2Only: false,
    filter: '',
    jsonPath: '',
    timeoutMs: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--v1-only') {
      opts.v1Only = true;
    } else if (arg === '--v2-only') {
      opts.v2Only = true;
    } else if (arg === '--tier' || arg.startsWith('--tier=')) {
      const val = arg === '--tier' ? argv[++i] : arg.slice('--tier='.length);
      if (!val || !['1', '2', '3', '4', 'all'].includes(val)) {
        throw new Error(`Invalid --tier value "${val ?? ''}". Expected 1, 2, 3, 4, or all.`);
      }
      opts.tier = val;
    } else if (arg === '--filter' || arg.startsWith('--filter=')) {
      const val = arg === '--filter' ? argv[++i] : arg.slice('--filter='.length);
      if (val === undefined) {
        throw new Error('Missing value for --filter.');
      }
      opts.filter = val;
    } else if (arg === '--json' || arg.startsWith('--json=')) {
      const val = arg === '--json' ? argv[++i] : arg.slice('--json='.length);
      if (!val) {
        throw new Error('Missing value for --json.');
      }
      opts.jsonPath = val;
    } else if (arg === '--timeout' || arg.startsWith('--timeout=')) {
      const val = arg === '--timeout' ? argv[++i] : arg.slice('--timeout='.length);
      const parsed = Number(val);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid --timeout value "${val ?? ''}". Expected a positive integer.`);
      }
      opts.timeoutMs = parsed;
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  if (opts.v1Only && opts.v2Only) {
    throw new Error('Flags --v1-only and --v2-only cannot be combined.');
  }

  return opts;
}

function checkBuildArtifacts() {
  const rendererEntry = path.join(REPO_ROOT, 'dist', 'index.html');
  const mainEntry = path.join(REPO_ROOT, 'dist-electron', 'electron', 'main.js');
  if (!fs.existsSync(rendererEntry) || !fs.existsSync(mainEntry)) {
    throw new Error(
      `Missing build artifacts (${!fs.existsSync(rendererEntry) ? 'dist/index.html' : 'dist-electron/electron/main.js'}). Run npm run build first.`,
    );
  }
}

function validateTestDescriptor(test, file) {
  if (!test || typeof test !== 'object') {
    throw new Error(`Invalid test descriptor in ${file}: expected object.`);
  }
  if (typeof test.id !== 'string' || !test.id.trim()) {
    throw new Error(`Invalid test id in ${file}.`);
  }
  if (![1, 2, 3, 4].includes(test.tier)) {
    throw new Error(`Invalid tier "${test.tier}" for ${test.id} in ${file}. Expected 1..4.`);
  }
  if (!['v1', 'v2'].includes(test.tag)) {
    throw new Error(`Invalid tag "${test.tag}" for ${test.id} in ${file}. Expected 'v1' or 'v2'.`);
  }
  if (typeof test.feature !== 'string' || !test.feature.trim()) {
    throw new Error(`Invalid feature for ${test.id} in ${file}.`);
  }
  if (typeof test.name !== 'string' || !test.name.trim()) {
    throw new Error(`Invalid name for ${test.id} in ${file}.`);
  }
  if (typeof test.run !== 'function') {
    throw new Error(`Invalid run handler for ${test.id} in ${file}: expected function.`);
  }
  if (test.timeoutMs !== undefined && (!Number.isFinite(test.timeoutMs) || test.timeoutMs <= 0)) {
    throw new Error(`Invalid timeoutMs for ${test.id} in ${file}.`);
  }
}

function matchesFilters(test, file, opts) {
  if (opts.tier !== 'all' && test.tier !== Number(opts.tier)) return false;
  if (opts.v1Only && test.tag !== 'v1') return false;
  if (opts.v2Only && test.tag !== 'v2') return false;
  if (opts.filter) {
    const needle = opts.filter.toLowerCase();
    const haystack = `${test.id} ${test.feature} ${test.name} ${file}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

async function withTimeout(runFn, ms, label, onTimeout) {
  const controller = new AbortController();
  let timer = null;
  let timedOut = false;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const err = new Error(`Timeout after ${ms}ms in ${label}`);
      controller.abort(err);
      reject(err);
    }, ms);
  });

  const taskPromise = Promise.resolve().then(() => runFn(controller.signal));
  taskPromise.catch(() => {});

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } catch (err) {
    if (timedOut && typeof onTimeout === 'function') {
      await onTimeout(err).catch(() => {});
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildTierSummary(results) {
  const byTier = {};
  for (const tier of [1, 2, 3, 4]) {
    const items = results.filter((r) => r.tier === tier);
    const passed = items.filter((r) => r.status === 'pass').length;
    const failed = items.filter((r) => r.status === 'fail').length;
    byTier[`tier${tier}`] = {
      tier,
      total: items.length,
      passed,
      failed,
    };
  }
  return byTier;
}

function printSummary(results, byTier, totalDurationMs, hookErrors) {
  console.log('\n--- E2E Summary by Tier ---');
  for (const tier of [1, 2, 3, 4]) {
    const row = byTier[`tier${tier}`];
    console.log(
      `Tier ${tier}: ${String(row.passed).padStart(2)} / ${String(row.total).padStart(2)} passed (${row.failed} failed)`,
    );
  }
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  console.log(
    `Total : ${passed} / ${results.length} passed, ${failed} failed` +
      (hookErrors.length ? `, ${hookErrors.length} hook error(s)` : '') +
      ` in ${Math.round(totalDurationMs)}ms`,
  );
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Argument error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
    return;
  }

  if (opts.help) {
    printHelp();
    process.exitCode = 0;
    return;
  }

  try {
    checkBuildArtifacts();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(TESTS_DIR)) {
    console.error(`Tests directory not found: ${TESTS_DIR}`);
    process.exitCode = 1;
    return;
  }

  const testFiles = fs
    .readdirSync(TESTS_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.e2e.mjs'))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));

  const suiteStart = performance.now();
  const plan = [];

  for (const file of testFiles) {
    const fullPath = path.join(TESTS_DIR, file);
    const mod = await import(pathToFileURL(fullPath).href);
    const rawTests = mod.tests ?? [];
    if (!Array.isArray(rawTests)) {
      throw new Error(`Invalid export "tests" in ${file}: expected array.`);
    }
    for (const t of rawTests) {
      validateTestDescriptor(t, file);
    }
    const selected = rawTests.filter((t) => matchesFilters(t, file, opts));
    if (selected.length > 0) {
      plan.push({ file, mod, selected });
    }
  }

  const totalSelected = plan.reduce((acc, item) => acc + item.selected.length, 0);
  if (totalSelected === 0) {
    console.error('No E2E tests matched the provided filters.');
    process.exitCode = 1;
    return;
  }

  const results = [];
  const hookErrors = [];

  for (const { file, mod, selected } of plan) {
    console.log(`\n=== ${file} (${selected.length} test${selected.length === 1 ? '' : 's'}) ===`);
    let beforeAllErr = null;
    try {
      if (typeof mod.beforeAll === 'function') {
        try {
          await mod.beforeAll();
        } catch (err) {
          beforeAllErr = err instanceof Error ? err : new Error(String(err));
        }
      }

      if (beforeAllErr) {
        for (const t of selected) {
          console.log(`[FAIL] ${t.id} [T${t.tier}|${t.tag}] ${t.name} (0ms)`);
          console.log(`    beforeAll failed: ${beforeAllErr.stack || beforeAllErr.message}`);
          results.push({
            id: t.id,
            tier: t.tier,
            tag: t.tag,
            feature: t.feature,
            name: t.name,
            file,
            status: 'fail',
            durationMs: 0,
            error: `beforeAll failed: ${beforeAllErr.message}`,
          });
        }
        continue;
      }

      for (const t of selected) {
        const effectiveTimeout = opts.timeoutMs ?? t.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const start = performance.now();
        try {
          await withTimeout(
            (signal) => t.run({ signal }),
            effectiveTimeout,
            t.id,
            () => cleanupActiveContexts(),
          );
          const durationMs = Math.round(performance.now() - start);
          console.log(`[PASS] ${t.id} [T${t.tier}|${t.tag}] ${t.name} (${durationMs}ms)`);
          results.push({
            id: t.id,
            tier: t.tier,
            tag: t.tag,
            feature: t.feature,
            name: t.name,
            file,
            status: 'pass',
            durationMs,
          });
        } catch (err) {
          const durationMs = Math.round(performance.now() - start);
          const errorObj = err instanceof Error ? err : new Error(String(err));
          console.log(`[FAIL] ${t.id} [T${t.tier}|${t.tag}] ${t.name} (${durationMs}ms)`);
          console.log(`    ${errorObj.stack || errorObj.message}`);
          results.push({
            id: t.id,
            tier: t.tier,
            tag: t.tag,
            feature: t.feature,
            name: t.name,
            file,
            status: 'fail',
            durationMs,
            error: errorObj.message,
          });
        }
      }
    } finally {
      if (typeof mod.afterAll === 'function') {
        try {
          await mod.afterAll();
        } catch (err) {
          const msg = err instanceof Error ? err.stack || err.message : String(err);
          console.error(`[ERROR] afterAll failed in ${file}: ${msg}`);
          hookErrors.push({ file, hook: 'afterAll', error: msg });
        }
      }
      await cleanupActiveContexts().catch(() => {});
    }
  }

  const totalDurationMs = Math.round(performance.now() - suiteStart);
  const byTier = buildTierSummary(results);
  printSummary(results, byTier, totalDurationMs, hookErrors);

  const failedCount = results.filter((r) => r.status === 'fail').length;
  if (opts.jsonPath) {
    const outPath = path.resolve(opts.jsonPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const payload = {
      generatedAt: new Date().toISOString(),
      filters: {
        tier: opts.tier,
        v1Only: opts.v1Only,
        v2Only: opts.v2Only,
        filter: opts.filter || null,
        timeoutMs: opts.timeoutMs,
      },
      durationMs: totalDurationMs,
      summary: {
        total: results.length,
        passed: results.length - failedCount,
        failed: failedCount,
        hookErrors: hookErrors.length,
        byTier,
      },
      hookErrors,
      results,
    };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  process.exitCode = failedCount === 0 && hookErrors.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exitCode = 1;
});
