let PRODUCTS = [];
let activeCategory = "All";
const cart = new Map();
let lastOrder = null;

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
    return `
      <div class="product">
        <div class="ph">${p.category[0] || "S"}</div>
        <div style="min-width:0">
          <h3>${p.name}</h3>
          <div class="meta">
            <span class="tag">₱${money(p.price)}</span>
            ${p.trackStock===1 ? `<span class="tag">${out ? "Out" : `Stock ${p.quantity}`}</span>` : `<span class="tag">∞</span>`}
          </div>
        </div>
        <div class="actions">
          <button class="btn ${out?'secondary':''}" ${out?'disabled':''} onclick="addToCart(${p.id})">${out?'Unavailable':'Add'}</button>
        </div>
      </div>
    `;
  }).join("");
}

function addToCart(id) {
  const p = PRODUCTS.find(x => x.id===id);
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
  renderCart();
}

function setNotes(id, notes) {
  const cur = cart.get(id);
  if (!cur) return;
  cur.notes = notes.slice(0,200);
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
          <strong>${ci.product.name}</strong>
          <div class="small">₱${money(ci.product.price)} each</div>
          <div style="margin-top:8px">
            <input class="input" placeholder="Notes (optional)" value="${ci.notes||""}" oninput="setNotes(${ci.product.id}, this.value)" />
          </div>
        </div>
        <div class="right">
          <div style="font-weight:900">₱${money(Number(ci.product.price)*ci.qty)}</div>
          <div class="qty" style="margin-top:10px;justify-content:flex-end">
            <button onclick="changeQty(${ci.product.id}, -1)">-</button>
            <input value="${ci.qty}" readonly />
            <button onclick="changeQty(${ci.product.id}, 1)">+</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  if (!items.length) list.innerHTML = `<div class="muted">Cart is empty.</div>`;
  qs("#subtotal").textContent = `₱${money(subtotal)}`;
  calcChange();
}

function toggleCashBox() {
  const pm = qs("#paymentMethod").value;
  qs("#cashBox").classList.toggle("hidden", pm !== "cash");
  calcChange();
}

function calcChange() {
  const pm = qs("#paymentMethod").value;
  if (pm !== "cash") { qs("#changeDue").textContent = "0.00"; return; }
  const total = Number(qs("#subtotal").textContent.replace(/[₱,]/g,"")) || 0;
  const cash = Number(qs("#cashReceived").value || 0);
  const change = cash - total;
  qs("#changeDue").textContent = money(Math.max(0, change));
}

async function pay() {
  const items = [...cart.values()].map(ci => ({
    productId: ci.product.id,
    qty: ci.qty,
    notes: ci.notes || ""
  }));
  if (items.length === 0) return toast("Cart is empty");

  const total = Number(qs("#subtotal").textContent.replace(/[₱,]/g,"")) || 0;
  const pm = qs("#paymentMethod").value;
  let cashReceived = null;
  if (pm === "cash") {
    cashReceived = Number(qs("#cashReceived").value || 0);
    if (cashReceived < total) return toast("Cash received is less than total");
  }

  const payload = {
    source: "pos",
    customerName: qs("#customerName").value.trim(),
    phone: "",
    orderType: qs("#orderType").value,
    paymentMethod: pm,
    paymentStatus: "paid",
    gcashRef: qs("#gcashRef").value.trim(),
    cashReceived,
    items
  };

  try {
    const r = await api("/api/orders", { method:"POST", body: JSON.stringify(payload) });
    toast(`Paid: ${r.orderNo}`);
    lastOrder = r;
    qs("#afterPay").classList.remove("hidden");
    qs("#lastOrderNo").textContent = r.orderNo;
    cart.clear();
    renderCart();
    // refresh products stock view
    const pr = await api("/api/products");
    PRODUCTS = pr.products;
    renderProducts();
  } catch (e) {
    toast(e.message);
  }
}

function printReceipt() {
  if (!lastOrder) return;
  const url = `/receipt.html?order=${encodeURIComponent(lastOrder.orderNo)}`;
  window.open(url, "_blank", "width=420,height=720");
}

async function init() {
  const user = await requireLogin(["admin","staff"]);
  if (!user) return;
  qs("#meBadge").textContent = `${user.username} (${user.role})`;

  const pr = await api("/api/products");
  PRODUCTS = pr.products;
  updateCategoryPills();
  renderProducts();
  renderCart();

  qs("#paymentMethod").onchange = toggleCashBox;
  qs("#cashReceived").oninput = calcChange;
  toggleCashBox();

  qs("#btnPay").onclick = pay;
  qs("#btnClear").onclick = () => { cart.clear(); renderCart(); };
  qs("#btnReceipt").onclick = printReceipt;
}
init();
