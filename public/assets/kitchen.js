let user = null;

function statusPill(s) {
  return `<span class="status ${s}">${s.toUpperCase()}</span>`;
}

function since(ts) {
  const t = new Date(ts).getTime();
  const d = Date.now() - t;
  const m = Math.floor(d/60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  return `${h}h ${m%60}m ago`;
}

async function setStatus(id, status) {
  try {
    await api(`/api/orders/${id}/status`, { method:"PUT", body: JSON.stringify({ status }) });
    toast(`Updated: ${status}`);
    await refresh();
  } catch (e) {
    toast(e.message);
  }
}

async function refresh() {
  const r = await api("/api/orders/active");
  qs("#countTag").textContent = r.orders.length;

  const grid = qs("#kgrid");
  grid.innerHTML = r.orders.map(x => {
    const o = x.order;
    const items = x.items;
    return `
      <div class="kcard">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div>
            <div style="font-family:var(--mono);font-weight:900">${o.order_no}</div>
            <div class="small">${since(o.created_at)} • ${o.source.toUpperCase()} • ${o.order_type.toUpperCase()}</div>
          </div>
          ${statusPill(o.status)}
        </div>
        <div class="kitems">
          ${items.map(i => `
            <div class="kitem">
              <div style="min-width:0">
                <div><strong>${i.name_snapshot}</strong></div>
                ${i.notes ? `<small>${i.notes}</small>` : `<small class="muted">—</small>`}
              </div>
              <div class="tag">x${i.qty}</div>
            </div>
          `).join("")}
        </div>
        <div class="kactions">
          <button class="btn secondary" ${o.status==="pending" ? "" : "disabled"} onclick="setStatus(${o.id}, 'preparing')">Preparing</button>
          <button class="btn" ${o.status==="preparing" ? "" : "disabled"} onclick="setStatus(${o.id}, 'ready')">Ready</button>
          <button class="btn secondary" ${o.status==="ready" ? "" : "disabled"} onclick="setStatus(${o.id}, 'completed')">Completed</button>
          <button class="btn danger" onclick="setStatus(${o.id}, 'cancelled')">Cancel</button>
        </div>
      </div>
    `;
  }).join("");

  if (!r.orders.length) grid.innerHTML = `<div class="muted">No active orders.</div>`;
}

async function init() {
  user = await requireLogin(["admin","staff","kitchen"]);
  if (!user) return;
  qs("#meBadge").textContent = `${user.username} (${user.role})`;
  await refresh();
  setInterval(refresh, 3000);
}
init();
