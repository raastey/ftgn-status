import { readFile, writeFile } from 'node:fs/promises';

const STATUS_FILE = new URL('../data/status.json', import.meta.url);
const PUBLIC_STATUS_URL =
  process.env.PUBLIC_STATUS_URL ||
  'https://raastey.github.io/framtheglobe-xyz-original/data/status.json';

const checks = [
  { id: 'frontend-home', name: 'Main Website', url: 'https://www.frametheglobe.xyz/' },
  { id: 'backend-health', name: 'Backend Health', url: 'https://framtheglobe-xyz-original-production.up.railway.app/health' },
  { id: 'api-news', name: 'News API', url: 'https://www.frametheglobe.xyz/api/news?limit=1' },
  { id: 'api-market', name: 'Market API', url: 'https://www.frametheglobe.xyz/api/market' },
  { id: 'api-rss', name: 'RSS API', url: 'https://www.frametheglobe.xyz/api/rss' },
  { id: 'ai-router-status', name: 'AI Router Status', url: 'https://framtheglobe-xyz-original-production.up.railway.app/api/ai-router-status' }
];

const timeoutMs = 20000;

function classify({ ok, status, elapsed }) {
  if (!ok) return { status: 'down', note: `HTTP ${status}` };
  if (elapsed > 5000) return { status: 'degraded', note: `Slow response (${elapsed}ms)` };
  return { status: 'up', note: 'Operational' };
}

async function safeFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'frametheglobe-status-check/1.0' }
    });
    const elapsed = Date.now() - start;
    return { ok: res.ok, httpStatus: res.status, elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    return { ok: false, httpStatus: 0, elapsed, error: String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadPrevious() {
  try {
    const res = await fetch(PUBLIC_STATUS_URL, {
      headers: { 'user-agent': 'frametheglobe-status-check/1.0' }
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function computeOverall(checkRows) {
  if (checkRows.some((c) => c.status === 'down')) return 'down';
  if (checkRows.some((c) => c.status === 'degraded')) return 'degraded';
  return 'up';
}

async function run() {
  const rows = [];
  for (const check of checks) {
    const result = await safeFetch(check.url);
    const quality = classify({ ok: result.ok, status: result.httpStatus, elapsed: result.elapsed });
    rows.push({
      id: check.id,
      name: check.name,
      url: check.url,
      status: quality.status,
      responseTimeMs: result.elapsed,
      httpStatus: result.httpStatus,
      note: result.error ? `${quality.note} (${result.error.slice(0, 120)})` : quality.note
    });
  }

  const prev = (await loadPrevious()) || JSON.parse(await readFile(STATUS_FILE, 'utf8'));
  const generatedAt = new Date().toISOString();
  const overallStatus = computeOverall(rows);
  const incidentSummary = rows
    .filter((r) => r.status !== 'up')
    .map((r) => `${r.name}: ${r.status.toUpperCase()}`)
    .join(' | ') || 'All monitored systems operational';

  const history = Array.isArray(prev.history) ? prev.history : [];
  const updated = [
    {
      ts: generatedAt,
      overallStatus,
      summary: incidentSummary
    },
    ...history
  ].slice(0, 288);

  const payload = { generatedAt, overallStatus, checks: rows, history: updated };
  await writeFile(STATUS_FILE, JSON.stringify(payload, null, 2) + '\n');
}

run().catch((err) => {
  console.error('[status-check] failed:', err);
  process.exit(1);
});
