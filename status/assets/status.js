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

  // Banner
  const banner = document.getElementById('statusBanner');
  if (banner) {
    banner.classList.remove('status-banner--up', 'status-banner--degraded', 'status-banner--down');
    banner.classList.add(`status-banner--${status}`);
  }
  
  const labelEl = document.getElementById('overallLabel');
  if (labelEl) labelEl.textContent = headline(overall);
  
  const breakingEl = document.getElementById('breakingStatus');
  if (breakingEl) {
    breakingEl.textContent = data.summary ? data.summary.summary || data.history[0]?.summary : 'System monitoring active.';
  }

  // Grouped Checks
  const grid = document.getElementById('checksGrid');
  if (grid) {
    grid.innerHTML = '';

    if (!checks.length) {
      grid.innerHTML = '<p style="color:var(--ink-3);font-size:.85rem;padding:1rem">No services configured.</p>';
    } else {
      const groups = {};
      for (const check of checks) {
        const g = check.group || 'Other';
        if (!groups[g]) groups[g] = [];
        groups[g].push(check);
      }

      for (const [groupName, groupChecks] of Object.entries(groups)) {
        const groupEl = document.createElement('div');
        groupEl.className = 'check-group';
        groupEl.innerHTML = `<h3 class="check-group-title">${groupName}</h3>`;
        
        const groupGrid = document.createElement('div');
        groupGrid.className = 'checks-grid';

        for (const check of groupChecks) {
          const s = cls(check.status);
          const checkHistory = history.filter(h => h.checkStatuses && h.checkStatuses[check.id]);
          
          let barHtml = '';
          const snapshotCount = 60;
          for (let i = snapshotCount - 1; i >= 0; i--) {
            const h = checkHistory[i];
            const barStatus = h ? cls(h.checkStatuses[check.id]) : 'up';
            barHtml += `<div class="uptime-bar uptime-bar--${barStatus}" title="${h ? formatTs(h.ts) : 'Operational'}"></div>`;
          }

          const orbIcons = {
            up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6L9 17L4 12" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            degraded: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 8V12M12 16H12.01" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="10"/></svg>`,
            down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg>`
          };

          const checkUptimePct = checkHistory.length
            ? ((checkHistory.filter(h => h.checkStatuses[check.id] === 'up').length / checkHistory.length) * 100).toFixed(2)
            : "100.00";

          const card = document.createElement('article');
          card.className = `check-card`;
          card.innerHTML = `
            <div class="check-header">
              <span class="check-name" style="font-size:0.85rem">${check.name}</span>
              <div class="status-orb status-orb--${s}">
                ${orbIcons[s] || orbIcons.down}
              </div>
            </div>
            <div class="uptime-viz">
              <div class="uptime-bars">${barHtml}</div>
              <div class="uptime-meta">
                <span>60 snapshots ago</span>
                <span class="uptime-pct">${checkUptimePct}% uptime</span>
                <span>Today</span>
              </div>
            </div>
            <div class="check-footer-status" style="font-size:0.75rem;color:var(--ink-4);margin-top:0.25rem">
              ${s === 'up' ? 'Normal' : s === 'degraded' ? 'Degraded' : 'Disrupted'}
            </div>
          `;
          groupGrid.appendChild(card);
        }
        groupEl.appendChild(groupGrid);
        grid.appendChild(groupEl);
      }
    }
  }

  // Incident log
  const list = document.getElementById('eventsList');
  if (list) {
    list.innerHTML = '';
    const events = history.filter(h => h.overallStatus !== 'up').slice(0, 8);

    if (!events.length) {
      list.innerHTML = '<li class="event"><span class="event-body"><p class="event-title" style="color:var(--ink-3)">No recent incidents recorded.</p></span></li>';
    } else {
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
  }
}

loadStatus().then(render).catch(err => {
  const banner = document.getElementById('statusBanner');
  if (banner) {
    banner.classList.remove('status-banner--up', 'status-banner--degraded');
    banner.classList.add('status-banner--down');
  }
  const labelEl = document.getElementById('overallLabel');
  if (labelEl) labelEl.textContent = 'Status feed unavailable';
  
  const breakingEl = document.getElementById('breakingStatus');
  if (breakingEl) breakingEl.textContent = err.message;
  
  const list = document.getElementById('eventsList');
  if (list) {
    list.innerHTML = `<li class="event"><span class="event-body"><p class="event-title" style="color:var(--ink-3)">${err.message}</p></span></li>`;
  }
});
