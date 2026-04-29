async function loadStatus() {
  const res = await fetch('./data/status.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load status data');
  return res.json();
}

function toLabel(status) {
  if (status === 'up') return 'All Systems Operational';
  if (status === 'degraded') return 'Degraded Performance';
  return 'Major Outage';
}

function formatTs(ts) {
  const date = new Date(ts);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function statusClass(status) {
  return status === 'up' ? 'up' : status === 'degraded' ? 'degraded' : 'down';
}

function pct(v, total) {
  return total <= 0 ? 0 : Math.round((v / total) * 100);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function latencyClass(ms) {
  if (ms <= 1200) return 'good';
  if (ms <= 3500) return 'warn';
  return 'bad';
}

function bucketHourly(history, checkId) {
  const now = Date.now();
  const hours = [];
  for (let i = 23; i >= 0; i--) {
    const from = now - (i + 1) * 60 * 60 * 1000;
    const to = now - i * 60 * 60 * 1000;
    const rows = history.filter((h) => {
      const ts = Date.parse(h.ts);
      return ts >= from && ts < to;
    });
    if (!rows.length) {
      hours.push('unknown');
      continue;
    }
    const statuses = rows.map((r) => r.checkStatuses?.[checkId]).filter(Boolean);
    if (statuses.includes('down')) hours.push('down');
    else if (statuses.includes('degraded')) hours.push('degraded');
    else if (statuses.includes('up')) hours.push('up');
    else hours.push('unknown');
  }
  return hours;
}

function uptime24h(history, checkId) {
  const windowStart = Date.now() - 24 * 60 * 60 * 1000;
  const rows = history.filter((h) => Date.parse(h.ts) >= windowStart);
  if (!rows.length) return 100;
  const good = rows.filter((h) => h.checkStatuses?.[checkId] === 'up').length;
  return Math.round((good / rows.length) * 1000) / 10;
}

function avgUptime24h(history, checks) {
  if (!checks.length) return 100;
  const total = checks.reduce((sum, c) => sum + uptime24h(history, c.id), 0);
  return Math.round((total / checks.length) * 10) / 10;
}

function countIncidents24h(history) {
  const windowStart = Date.now() - 24 * 60 * 60 * 1000;
  return history.filter((h) => Date.parse(h.ts) >= windowStart && h.overallStatus !== 'up').length;
}

function statusScore(summary) {
  const total = summary.totalChecks || 0;
  if (!total) return 100;
  const up = summary.up || 0;
  const degraded = summary.degraded || 0;
  return Math.round(((up + degraded * 0.55) / total) * 1000) / 10;
}

function render(data) {
  const overallBadge = document.getElementById('overallBadge');
  const lastUpdated = document.getElementById('lastUpdated');
  const summaryCards = document.getElementById('summaryCards');
  const fleetBars = document.getElementById('fleetBars');
  const checksTable = document.getElementById('checksTable');
  const uptimeBars = document.getElementById('uptimeBars');
  const eventsList = document.getElementById('eventsList');
  const checks = data.checks || [];
  const history = data.history || [];

  const overall = data.overallStatus || 'down';
  overallBadge.className = `badge badge-${statusClass(overall)}`;
  overallBadge.textContent = toLabel(overall);
  lastUpdated.textContent = `Last updated: ${formatTs(data.generatedAt)}`;

  const summary = data.summary || {};
  const bestLatency = checks.reduce((m, c) => Math.min(m, Number(c.responseTimeMs || 999999)), 999999);
  const worstLatency = checks.reduce((m, c) => Math.max(m, Number(c.responseTimeMs || 0)), 0);
  const incidents24h = countIncidents24h(history);
  const fleetUptime = avgUptime24h(history, checks);
  const score = statusScore(summary);
  summaryCards.innerHTML = `
    <article class="summary-card"><p class="summary-label">TOTAL CHECKS</p><p class="summary-value">${summary.totalChecks ?? checks.length}</p></article>
    <article class="summary-card"><p class="summary-label">UP</p><p class="summary-value">${summary.up ?? checks.filter((c) => c.status === 'up').length}</p></article>
    <article class="summary-card"><p class="summary-label">DEGRADED</p><p class="summary-value">${summary.degraded ?? checks.filter((c) => c.status === 'degraded').length}</p></article>
    <article class="summary-card"><p class="summary-label">DOWN</p><p class="summary-value">${summary.down ?? checks.filter((c) => c.status === 'down').length}</p></article>
    <article class="summary-card"><p class="summary-label">AVG LATENCY</p><p class="summary-value">${summary.avgLatencyMs ?? '-'}ms</p></article>
    <article class="summary-card"><p class="summary-label">P95 LATENCY</p><p class="summary-value">${summary.p95LatencyMs ?? '-'}ms</p></article>
    <article class="summary-card"><p class="summary-label">BEST LATENCY</p><p class="summary-value">${bestLatency === 999999 ? '-' : bestLatency + 'ms'}</p></article>
    <article class="summary-card"><p class="summary-label">SLOWEST CHECK</p><p class="summary-value">${worstLatency || '-'}ms</p></article>
    <article class="summary-card"><p class="summary-label">24H FLEET UPTIME</p><p class="summary-value">${fleetUptime}%</p></article>
    <article class="summary-card"><p class="summary-label">INCIDENTS / 24H</p><p class="summary-value">${incidents24h}</p></article>
    <article class="summary-card"><p class="summary-label">STATUS SCORE</p><p class="summary-value">${score}</p></article>
  `;

  fleetBars.innerHTML = '';
  for (const group of data.groups || []) {
    const upW = pct(group.up, group.total);
    const degradedW = pct(group.degraded, group.total);
    const downW = Math.max(0, 100 - upW - degradedW);
    const row = document.createElement('article');
    row.className = 'fleet-row';
    row.innerHTML = `
      <p class="fleet-name">${group.group}</p>
      <div class="bar-track" aria-label="${group.group} health">
        <div class="bar-ok" style="width:${upW}%"></div>
        <div class="bar-degraded" style="width:${degradedW}%"></div>
        <div class="bar-down" style="width:${downW}%"></div>
      </div>
      <p class="fleet-meta">${group.up}/${group.total} up</p>
    `;
    fleetBars.appendChild(row);
  }

  const grouped = checks.reduce((acc, check) => {
    const key = check.group || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(check);
    return acc;
  }, {});

  checksTable.innerHTML = '';
  for (const [groupName, groupChecks] of Object.entries(grouped)) {
    const section = document.createElement('section');
    section.innerHTML = `<p class="check-group">${groupName}</p>`;
    for (const check of groupChecks) {
      const status = statusClass(check.status);
      const latency = Number(check.responseTimeMs || 0);
      const width = clamp(Math.round((latency / 5000) * 100), 6, 100);
      const card = document.createElement('article');
      card.className = 'check-card';
      card.innerHTML = `
        <div class="check-head">
          <h3 class="check-name">${check.name}</h3>
          <span class="dot dot-${status}" aria-hidden="true"></span>
        </div>
        <p class="check-sub">${check.status.toUpperCase()} · HTTP ${check.httpStatus ?? '-'} · ${check.method || 'GET'}</p>
        <p class="check-sub">${check.note || 'No additional note'}</p>
        <div class="check-bars">
          <div class="latency-row">
            <p class="latency-label">Latency</p>
            <div class="bar-track">
              <div class="latency-fill latency-${latencyClass(latency)}" style="width:${width}%"></div>
            </div>
            <p class="latency-value">${latency}ms</p>
          </div>
          <div class="latency-row">
            <p class="latency-label">24h Uptime</p>
            <div class="bar-track">
              <div class="bar-ok" style="width:${uptime24h(history, check.id)}%"></div>
            </div>
            <p class="latency-value">${uptime24h(history, check.id)}%</p>
          </div>
        </div>
      `;
      section.appendChild(card);
    }
    checksTable.appendChild(section);
  }

  uptimeBars.innerHTML = '';
  for (const check of checks.slice(0, 12)) {
    const hourly = bucketHourly(history, check.id);
    const card = document.createElement('article');
    card.className = 'uptime-card';
    const bars = hourly
      .map((s) => `<span class="spark spark-${s === 'unknown' ? 'unknown' : statusClass(s)}"></span>`)
      .join('');
    card.innerHTML = `
      <div class="uptime-head">
        <p class="uptime-name">${check.name}</p>
        <p class="uptime-value">${uptime24h(history, check.id)}% / 24h</p>
      </div>
      <div class="sparkline">${bars}</div>
    `;
    uptimeBars.appendChild(card);
  }

  eventsList.innerHTML = '';
  const events = history.slice(0, 20);
  if (!events.length) {
    const li = document.createElement('li');
    li.className = 'event';
    li.innerHTML = '<p class="event-title">No incidents recorded yet.</p>';
    eventsList.appendChild(li);
    return;
  }

  for (const item of events) {
    const sev = statusClass(item.overallStatus || 'down');
    const li = document.createElement('li');
    li.className = 'event';
    li.innerHTML = `
      <p class="event-title">${item.summary}</p>
      <p class="event-meta"><span class="badge badge-${sev}">${(item.overallStatus || 'down').toUpperCase()}</span> ${formatTs(item.ts)}</p>
    `;
    eventsList.appendChild(li);
  }
}

loadStatus().then(render).catch((err) => {
  const overallBadge = document.getElementById('overallBadge');
  const eventsList = document.getElementById('eventsList');
  overallBadge.className = 'badge badge-down';
  overallBadge.textContent = 'Status Feed Unavailable';
  eventsList.innerHTML = `<li class="event"><p class="event-title">${err.message}</p></li>`;
});
