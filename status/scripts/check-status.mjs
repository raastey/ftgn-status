import { readFile, writeFile } from 'node:fs/promises';

const STATUS_FILE = new URL('../data/status.json', import.meta.url);
const PUBLIC_STATUS_URL =
  process.env.PUBLIC_STATUS_URL ||
  'https://raastey.github.io/ftgn-status/data/status.json';

const checks = [
  // Web surface
  { id: 'frontend-home', group: 'Web', name: 'Main Website', method: 'GET', url: 'https://www.frametheglobe.xyz/', expectedStatuses: [200] },
  { id: 'frontend-war-premium', group: 'Web', name: 'War Premium Page', method: 'GET', url: 'https://www.frametheglobe.xyz/war-premium', expectedStatuses: [200] },
  { id: 'frontend-accountability', group: 'Web', name: 'Accountability Page', method: 'GET', url: 'https://www.frametheglobe.xyz/accountability', expectedStatuses: [200] },

  // Core backend
  { id: 'backend-health', group: 'Core API', name: 'Backend Health', method: 'GET', url: 'https://framtheglobe-xyz-original-production.up.railway.app/health', expectedStatuses: [200] },
  { id: 'api-news', group: 'Core API', name: 'News API', method: 'GET', url: 'https://www.frametheglobe.xyz/api/news?limit=1', expectedStatuses: [200] },
  { id: 'api-market', group: 'Core API', name: 'Market API', method: 'GET', url: 'https://www.frametheglobe.xyz/api/market', expectedStatuses: [200] },
  { id: 'api-rss', group: 'Core API', name: 'RSS API', method: 'GET', url: 'https://www.frametheglobe.xyz/api/rss', expectedStatuses: [200] },
  { id: 'api-live-metrics', group: 'Core API', name: 'Live Metrics API', method: 'GET', url: 'https://www.frametheglobe.xyz/api/live-metrics', expectedStatuses: [200] },
  { id: 'api-live-feeds', group: 'Core API', name: 'Live Feeds API', method: 'GET', url: 'https://www.frametheglobe.xyz/api/live-feeds', expectedStatuses: [200] },

  // Analytics modules
  { id: 'api-market-impact', group: 'Analytics', name: 'Market Impact API', method: 'GET', url: 'https://www.frametheglobe.xyz/api/market-impact', expectedStatuses: [200] },
  { id: 'api-theater-metrics', group: 'Analytics', name: 'Theater Metrics API', method: 'GET', url: 'https://www.frametheglobe.xyz/api/theater-metrics', expectedStatuses: [200] },
  { id: 'api-polymarket-history', group: 'Analytics', name: 'Polymarket History API', method: 'GET', url: 'https://www.frametheglobe.xyz/api/polymarket-history', expectedStatuses: [200, 400] },
  { id: 'api-flight-paths', group: 'Analytics', name: 'Flight Paths API', method: 'GET', url: 'https://www.frametheglobe.xyz/api/flight-paths', expectedStatuses: [200] },

  // AI platform (non-token-burning liveness checks)
  { id: 'ai-router-status', group: 'AI Platform', name: 'AI Router Status', method: 'GET', url: 'https://framtheglobe-xyz-original-production.up.railway.app/api/ai-router-status', expectedStatuses: [200] },
  { id: 'ai-intel-route', group: 'AI Platform', name: 'AI Intel Route', method: 'GET', url: 'https://www.frametheglobe.xyz/api/ai-intel', expectedStatuses: [405] },
  { id: 'ai-flash-brief-route', group: 'AI Platform', name: 'Flash Brief Route', method: 'GET', url: 'https://www.frametheglobe.xyz/api/flash-brief', expectedStatuses: [405] },
  { id: 'ai-analyst-route', group: 'AI Platform', name: 'Analyst Briefing Route', method: 'GET', url: 'https://www.frametheglobe.xyz/api/analyst-briefing', expectedStatuses: [200, 404, 405] },
  { id: 'ai-analyze-ticker-route', group: 'AI Platform', name: 'Analyze Ticker Route', method: 'GET', url: 'https://www.frametheglobe.xyz/api/analyze-ticker', expectedStatuses: [200, 404, 405] }
];

const timeoutMs = 20000;

function classify({ isExpectedStatus, status, elapsed }) {
  if (!isExpectedStatus) return { status: 'down', note: `Unexpected HTTP ${status}` };
  if (elapsed > 5000) return { status: 'degraded', note: `Slow response (${elapsed}ms)` };
  if (elapsed > 2500) return { status: 'degraded', note: `Elevated latency (${elapsed}ms)` };
  return { status: 'up', note: 'Operational' };
}

async function safeFetch(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(check.url, {
      method: check.method ?? 'GET',
      signal: controller.signal,
      headers: { 'user-agent': 'frametheglobe-status-check/1.0' }
    });
    const elapsed = Date.now() - start;
    return { httpStatus: res.status, elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    return { httpStatus: 0, elapsed, error: String(err) };
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

function summarizeByGroup(checkRows) {
  const groups = {};
  for (const row of checkRows) {
    const key = row.group || 'Other';
    if (!groups[key]) groups[key] = { group: key, total: 0, up: 0, degraded: 0, down: 0 };
    groups[key].total += 1;
    groups[key][row.status] += 1;
  }
  return Object.values(groups);
}

async function run() {
  const rows = [];
  for (const check of checks) {
    const result = await safeFetch(check);
    const expectedStatuses = Array.isArray(check.expectedStatuses) ? check.expectedStatuses : [200];
    const quality = classify({
      isExpectedStatus: expectedStatuses.includes(result.httpStatus),
      status: result.httpStatus,
      elapsed: result.elapsed
    });
    rows.push({
      id: check.id,
      group: check.group,
      name: check.name,
      method: check.method ?? 'GET',
      endpoint: check.url,
      expectedStatuses,
      status: quality.status,
      responseTimeMs: result.elapsed,
      httpStatus: result.httpStatus,
      note: result.error ? `${quality.note} (${result.error.slice(0, 120)})` : quality.note
    });
  }

  const prev = (await loadPrevious()) || JSON.parse(await readFile(STATUS_FILE, 'utf8'));
  const generatedAt = new Date().toISOString();
  const overallStatus = computeOverall(rows);
  const latencyValues = rows.map((r) => r.responseTimeMs).sort((a, b) => a - b);
  const p95LatencyMs = latencyValues[Math.floor((latencyValues.length - 1) * 0.95)] ?? 0;
  const avgLatencyMs = Math.round(latencyValues.reduce((sum, n) => sum + n, 0) / Math.max(1, latencyValues.length));
  const incidentSummary = rows
    .filter((r) => r.status !== 'up')
    .map((r) => `${r.name}: ${r.status.toUpperCase()}`)
    .join(' | ') || 'All monitored systems operational';

  const history = Array.isArray(prev.history) ? prev.history : [];
  const updated = [
    {
      ts: generatedAt,
      overallStatus,
      summary: incidentSummary,
      checkStatuses: Object.fromEntries(rows.map((r) => [r.id, r.status])),
      checkLatencyMs: Object.fromEntries(rows.map((r) => [r.id, r.responseTimeMs]))
    },
    ...history
  ].slice(0, 2016);

  const payload = {
    generatedAt,
    overallStatus,
    summary: {
      totalChecks: rows.length,
      up: rows.filter((r) => r.status === 'up').length,
      degraded: rows.filter((r) => r.status === 'degraded').length,
      down: rows.filter((r) => r.status === 'down').length,
      avgLatencyMs,
      p95LatencyMs
    },
    groups: summarizeByGroup(rows),
    checks: rows,
    history: updated
  };
  await writeFile(STATUS_FILE, JSON.stringify(payload, null, 2) + '\n');
}

run().catch((err) => {
  console.error('[status-check] failed:', err);
  process.exit(1);
});
