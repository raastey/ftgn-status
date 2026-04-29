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

function render(data) {
  const overallBadge = document.getElementById('overallBadge');
  const lastUpdated = document.getElementById('lastUpdated');
  const checksGrid = document.getElementById('checksGrid');
  const eventsList = document.getElementById('eventsList');

  const overall = data.overallStatus || 'down';
  overallBadge.className = `badge badge-${statusClass(overall)}`;
  overallBadge.textContent = toLabel(overall);
  lastUpdated.textContent = `Last updated: ${formatTs(data.generatedAt)}`;

  checksGrid.innerHTML = '';
  for (const check of data.checks || []) {
    const status = statusClass(check.status);
    const card = document.createElement('article');
    card.className = 'check-card';
    card.innerHTML = `
      <div class="check-head">
        <h3 class="check-name">${check.name}</h3>
        <span class="dot dot-${status}" aria-hidden="true"></span>
      </div>
      <p class="check-sub">${check.status.toUpperCase()} · ${check.responseTimeMs ?? '-'}ms</p>
      <p class="check-sub">${check.note || 'No additional note'}</p>
    `;
    checksGrid.appendChild(card);
  }

  eventsList.innerHTML = '';
  const events = (data.history || []).slice(0, 12);
  if (!events.length) {
    const li = document.createElement('li');
    li.className = 'event';
    li.innerHTML = '<p class="event-title">No incidents recorded yet.</p>';
    eventsList.appendChild(li);
    return;
  }

  for (const item of events) {
    const li = document.createElement('li');
    li.className = 'event';
    li.innerHTML = `
      <p class="event-title">${item.summary}</p>
      <p class="event-meta">${formatTs(item.ts)} · ${item.overallStatus.toUpperCase()}</p>
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
