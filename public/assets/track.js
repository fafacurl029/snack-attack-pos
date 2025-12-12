function getQueryOrder() {
  const u = new URL(location.href);
  return u.searchParams.get("order") || "";
}

function renderStatus(s) {
  return `<span class="status ${s}">${s.toUpperCase()}</span>`;
}

async function track() {
  const orderNo = qs("#orderNo").value.trim();
  if (!orderNo) return toast("Enter order number");
  try {
    const r = await api(`/api/orders/track/${encodeURIComponent(orderNo)}`);
    const o = r.order;
    const items = r.items;
    const html = `
      <div class="row">
        <div>
          <div class="muted">Order</div>
          <div style="font-family:var(--mono);font-weight:800">${o.order_no}</div>
          <div class="small">Created: ${fmtDate(o.created_at)}</div>
        </div>
        <div style="text-align:right">
          ${renderStatus(o.status)}
          <div class="small">${o.order_type.toUpperCase()} • ${o.payment_method.toUpperCase()}</div>
        </div>
      </div>
      <hr class="sep" />
      <table class="table">
        <thead><tr><th>Item</th><th>Qty</th><th>Notes</th></tr></thead>
        <tbody>
          ${items.map(i => `<tr><td>${i.name_snapshot}</td><td>${i.qty}</td><td>${i.notes||""}</td></tr>`).join("")}
        </tbody>
      </table>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
        <div class="muted">Total</div>
        <div style="font-weight:900">₱${money(o.subtotal)}</div>
      </div>
      <div class="small" style="margin-top:10px;color:var(--muted)">
        Status guide: Pending → Preparing → Ready → Completed
      </div>
    `;
    qs("#result").innerHTML = html;
  } catch (e) {
    qs("#result").innerHTML = `<div class="muted">Order not found or invalid.</div>`;
    toast(e.message);
  }
}

async function copyLink() {
  const orderNo = qs("#orderNo").value.trim();
  if (!orderNo) return toast("Enter order number first");
  const link = `${location.origin}/track.html?order=${encodeURIComponent(orderNo)}`;
  await navigator.clipboard.writeText(link);
  toast("Tracking link copied");
}

function init() {
  const q = getQueryOrder();
  if (q) qs("#orderNo").value = q;
  qs("#btnTrack").onclick = track;
  qs("#btnCopy").onclick = copyLink;
  if (q) track();
}
init();
