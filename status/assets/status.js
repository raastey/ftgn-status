async function loadStatus() {
  const res = await fetch('./data/status.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load status data');
  return res.json();
}

function cls(s) {
  return s === 'up' ? 'up' : s === 'degraded' ? 'degraded' : 'down';
}

function headline(s) {
  if (s === 'up')       return 'All Systems Operational';
  if (s === 'degraded') return 'Degraded Performance';
  return 'Service Disruption';
}

function relativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatTs(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function latencyPct(ms) {
  if (!Number.isFinite(ms)) return 0;
  return Math.round((Math.max(0, Math.min(ms, 2000)) / 2000) * 100);
}

function render(data) {
  const overall = data.overallStatus || 'down';
  const status  = cls(overall);
  const checks  = data.checks  || [];
  const history = data.history || [];

  // Top stripe
  const stripe = document.getElementById('statusStripe');
  if (stripe) stripe.className = `status-stripe stripe-${status}`;

  // Hero
  document.getElementById('overallLabel').textContent = headline(overall);
  const badge = document.getElementById('overallBadge');
  badge.className   = `status-tag status-tag--${status}`;
  badge.textContent = status === 'up' ? 'Operational' : status === 'degraded' ? 'Degraded' : 'Outage';

  const ts = data.generatedAt;
  document.getElementById('lastUpdated').textContent =
    ts ? `Updated ${relativeTime(ts)} · ${formatTs(ts)}` : '—';

  // Metrics
  const upCount   = checks.filter(c => c.status === 'up').length;
  const incidents = checks.filter(c => c.status !== 'up').length;
  const avgMs = checks.length
    ? Math.round(checks.reduce((s, c) => s + (Number.isFinite(c.responseTimeMs) ? c.responseTimeMs : 0), 0) / checks.length)
    : null;
  const uptimePct = history.length
    ? ((history.filter(h => h.overallStatus === 'up').length / history.length) * 100).toFixed(1)
    : null;

  document.getElementById('kpiUp').textContent        = checks.length ? `${upCount}/${checks.length}` : '—';
  document.getElementById('kpiLatency').textContent   = avgMs !== null ? `${avgMs}ms` : '—';
  document.getElementById('kpiUptime').textContent    = uptimePct !== null ? `${uptimePct}%` : '—';

  const kpiInc = document.getElementById('kpiIncidents');
  kpiInc.textContent   = String(incidents || 0);
  kpiInc.style.color   = incidents > 0 ? 'var(--red)' : 'var(--green)';

  // Service cards
  const grid = document.getElementById('checksGrid');
  grid.innerHTML = '';

  if (!checks.length) {
    grid.innerHTML = '<p style="color:var(--ink-3);font-size:.85rem">No services configured.</p>';
  } else {
    for (const check of checks) {
      const s   = cls(check.status);
      const lat = Number.isFinite(check.responseTimeMs) ? check.responseTimeMs : null;
      const card = document.createElement('article');
      card.className = `check-card check-card--${s}`;
      card.innerHTML = `
        <div class="check-header">
          <span class="check-name">${check.name}</span>
          <span class="dot-indicator dot-indicator--${s}" aria-label="${check.status}"></span>
        </div>
        <div class="check-latency-row">
          <span class="check-latency">${lat !== null ? lat : '—'}</span>
          <span class="check-latency-unit">${lat !== null ? 'ms' : ''}</span>
        </div>
        <div class="latency-bar" aria-hidden="true">
          <div class="latency-fill" style="width:${latencyPct(lat)}%"></div>
        </div>
        ${check.note ? `<p class="check-note">${check.note}</p>` : ''}
      `;
      grid.appendChild(card);
    }
  }

  // Incident log
  const list = document.getElementById('eventsList');
  list.innerHTML = '';
  const events = history.slice(0, 12);

  if (!events.length) {
    list.innerHTML = '<li class="event"><span class="event-body"><p class="event-title" style="color:var(--ink-3)">No incidents recorded yet.</p></span></li>';
    return;
  }

  for (const item of events) {
    const es = cls(item.overallStatus);
    const li = document.createElement('li');
    li.className = 'event';
    li.innerHTML = `
      <span class="event-tag-wrap">
        <span class="status-tag status-tag--${es}">${item.overallStatus}</span>
      </span>
      <span class="event-body">
        <p class="event-title">${item.summary}</p>
        <p class="event-time">${formatTs(item.ts)}</p>
      </span>
    `;
    list.appendChild(li);
  }
}

loadStatus().then(render).catch(err => {
  const stripe = document.getElementById('statusStripe');
  if (stripe) stripe.className = 'status-stripe stripe-down';
  document.getElementById('overallLabel').textContent = 'Status feed unavailable';
  const badge = document.getElementById('overallBadge');
  badge.className   = 'status-tag status-tag--down';
  badge.textContent = 'Error';
  document.getElementById('eventsList').innerHTML =
    `<li class="event"><span class="event-body"><p class="event-title" style="color:var(--ink-3)">${err.message}</p></span></li>`;
});
