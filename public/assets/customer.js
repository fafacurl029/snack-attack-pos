let PRODUCTS = [];
let activeCategory = "All";
const cart = new Map(); // productId -> {product, qty, notes}

function updateCategoryPills() {
  const pills = qs("#categoryPills");
  const cats = ["All", ...new Set(PRODUCTS.map(p => p.category))];
  pills.innerHTML = cats.map(c => `<div class="pill ${c===activeCategory?'active':''}" data-cat="${c}">${c}</div>`).join("");
  qsa(".pill", pills).forEach(p => p.onclick = () => {
    activeCategory = p.dataset.cat;
    updateCategoryPills();
    renderProducts();
  });
}

function renderProducts() {
  const grid = qs("#productGrid");
  const list = PRODUCTS.filter(p => activeCategory==="All" ? true : p.category===activeCategory);

  grid.innerHTML = list.map(p => {
    const out = p.trackStock===1 && p.quantity<=0;
    const low = p.trackStock===1 && p.quantity>0 && p.quantity <= 5;
    return `
      <div class="product">
        <div class="ph">${p.category[0] || "S"}</div>
        <div style="min-width:0">
          <h3>${escapeHtml(p.name)}</h3>
          <div class="meta">
            <span class="tag">₱${money(p.price)}</span>
            ${p.trackStock===1 ? `<span class="tag">${out ? "Out of stock" : (low ? `Low (${p.quantity})` : `Stock ${p.quantity}`)}</span>` : `<span class="tag">∞</span>`}
          </div>
        </div>
        <div class="actions">
          <button class="btn ${out?'secondary':''}" ${out?'disabled':''} onclick="addToCart(${p.id})">${out?'Unavailable':'Add'}</button>
        </div>
      </div>
    `;
  }).join("");

  if (list.length === 0) grid.innerHTML = `<div class="muted">No items in this category.</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function addToCart(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const cur = cart.get(id) || { product: p, qty: 0, notes: "" };
  cur.qty += 1;
  cart.set(id, cur);
  renderCart();
}

function changeQty(id, delta) {
  const cur = cart.get(id);
  if (!cur) return;
  cur.qty += delta;
  if (cur.qty <= 0) cart.delete(id);
  else cart.set(id, cur);
  renderCart();
}

function setNotes(id, notes) {
  const cur = cart.get(id);
  if (!cur) return;
  cur.notes = notes.slice(0, 200);
  cart.set(id, cur);
}

function renderCart() {
  const list = qs("#cartList");
  const items = [...cart.values()];
  qs("#cartCount").textContent = `${items.reduce((a,i)=>a+i.qty,0)} item(s)`;

  let subtotal = 0;
  list.innerHTML = items.map(ci => {
    subtotal += Number(ci.product.price) * ci.qty;
    return `
      <div class="cart-item">
        <div style="min-width:0">
          <strong>${escapeHtml(ci.product.name)}</strong>
          <div class="small">₱${money(ci.product.price)} each</div>
          <div style="margin-top:8px">
            <input class="input" placeholder="Notes (optional)" value="${escapeHtml(ci.notes)}"
              oninput="setNotes(${ci.product.id}, this.value)" />
          </div>
        </div>
        <div class="right">
          <div style="font-weight:800">₱${money(Number(ci.product.price)*ci.qty)}</div>
          <div class="qty" style="margin-top:10px;justify-content:flex-end">
            <button onclick="changeQty(${ci.product.id}, -1)">-</button>
            <input value="${ci.qty}" readonly />
            <button onclick="changeQty(${ci.product.id}, 1)">+</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  if (items.length === 0) list.innerHTML = `<div class="muted">Cart is empty.</div>`;

  qs("#subtotal").textContent = `₱${money(subtotal)}`;
}

async function loadGcash() {
  const s = await api("/api/settings/gcash");
  qs("#gcashNumber").textContent = s.number || "—";
  const wrap = qs("#gcashQrWrap");
  wrap.innerHTML = s.qr ? `<img src="${s.qr}" alt="GCash QR" style="max-width:100%;border-radius:12px;border:1px solid var(--border)" />`
                        : `<div class="muted">No QR uploaded yet.</div>`;
}

function toggleGcashBox() {
  const pm = qs("#paymentMethod").value;
  qs("#gcashBox").classList.toggle("hidden", pm !== "gcash");
}

async function placeOrder() {
  const items = [...cart.values()].map(ci => ({
    productId: ci.product.id,
    qty: ci.qty,
    notes: ci.notes || ""
  }));
  if (items.length === 0) return toast("Cart is empty");

  const payload = {
    source: "customer",
    customerName: qs("#customerName").value.trim(),
    phone: qs("#phone").value.trim(),
    orderType: qs("#orderType").value,
    paymentMethod: qs("#paymentMethod").value,
    paymentStatus: "unpaid",
    gcashRef: qs("#gcashRef").value.trim(),
    items
  };

  try {
    const r = await api("/api/orders", { method: "POST", body: JSON.stringify(payload) });
    cart.clear();
    renderCart();
    toast(`Order placed: ${r.orderNo}`);
    setTimeout(() => location.href = `/track.html?order=${encodeURIComponent(r.orderNo)}`, 600);
  } catch (e) {
    toast(e.message);
  }
}

async function init() {
  const pr = await api("/api/products");
  PRODUCTS = pr.products;
  updateCategoryPills();
  renderProducts();
  renderCart();
  await loadGcash();
  toggleGcashBox();
  qs("#paymentMethod").onchange = toggleGcashBox;
  qs("#placeOrder").onclick = placeOrder;
  qs("#clearCart").onclick = () => { cart.clear(); renderCart(); };
}

init();
