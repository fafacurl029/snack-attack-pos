let me = null;
let users = [];
let products = [];
let inventory = [];

function setTab(name) {
  qsa(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab===name));
  qsa(".panel").forEach(p => p.classList.toggle("active", p.id === `panel-${name}`));
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}

async function loadOverview() {
  const from = todayISO();
  const to = todayISO();
  const r = await api(`/api/reports/summary?from=${from}&to=${to}`);
  qs("#todaySales").textContent = `₱${money(r.totals.sales)}`;
  qs("#todayOrders").textContent = r.totals.orders;

  // also load a broader range for top items if report already ran
  const r2 = await api(`/api/reports/summary?from=${from}&to=${to}`);
  qs("#rangeProfit").textContent = `₱${money(r2.totals.profit)}`;

  qs("#topItems").innerHTML = (r2.topItems || []).length
    ? `<table class="table"><thead><tr><th>Item</th><th>Qty</th></tr></thead><tbody>${
        r2.topItems.map(x => `<tr><td>${x.name}</td><td>${x.qty}</td></tr>`).join("")
      }</tbody></table>`
    : `<div class="muted">No data yet.</div>`;
}

async function loadUsers() {
  const r = await api("/api/admin/users");
  users = r.users;
  const t = qs("#usersTable");
  t.innerHTML = `
    <thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Active</th><th>Created</th><th>Actions</th></tr></thead>
    <tbody>
      ${users.map(u => `
        <tr>
          <td>${u.id}</td>
          <td><input class="input" value="${u.username}" data-u="username" data-id="${u.id}" /></td>
          <td>
            <select class="input" data-u="role" data-id="${u.id}">
              ${["admin","staff","kitchen"].map(r => `<option value="${r}" ${u.role===r?"selected":""}>${r}</option>`).join("")}
            </select>
          </td>
          <td>
            <select class="input" data-u="active" data-id="${u.id}">
              <option value="1" ${u.active===1?"selected":""}>1</option>
              <option value="0" ${u.active===0?"selected":""}>0</option>
            </select>
          </td>
          <td>${u.created_at}</td>
          <td>
            <button class="btn secondary" onclick="saveUser(${u.id})">Save</button>
            <button class="btn secondary" onclick="resetUserPassword(${u.id})">Set Password</button>
          </td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

function getUserRow(id) {
  const row = {};
  qsa(`[data-id="${id}"]`).forEach(el => {
    row[el.dataset.u] = el.value;
  });
  return row;
}

async function saveUser(id) {
  const row = getUserRow(id);
  try {
    await api(`/api/admin/users/${id}`, {
      method:"PUT",
      body: JSON.stringify({
        username: row.username,
        role: row.role,
        active: Number(row.active)
      })
    });
    toast("User updated");
    await loadUsers();
  } catch(e) { toast(e.message); }
}

async function resetUserPassword(id) {
  const pw = prompt("Enter new password (min 8 chars):");
  if (!pw || pw.length < 8) return toast("Password too short");
  const row = getUserRow(id);
  try {
    await api(`/api/admin/users/${id}`, {
      method:"PUT",
      body: JSON.stringify({
        username: row.username,
        role: row.role,
        active: Number(row.active),
        password: pw
      })
    });
    toast("Password updated");
  } catch(e) { toast(e.message); }
}

async function createUser() {
  const username = qs("#uUsername").value.trim();
  const password = qs("#uPassword").value;
  const role = qs("#uRole").value;
  if (username.length < 3) return toast("Username too short");
  if (password.length < 8) return toast("Password too short");

  try {
    await api("/api/admin/users", { method:"POST", body: JSON.stringify({ username, password, role, active: 1 }) });
    toast("User created");
    qs("#uUsername").value = "";
    qs("#uPassword").value = "";
    await loadUsers();
  } catch(e) { toast(e.message); }
}

async function loadProducts() {
  const r = await api("/api/admin/products");
  products = r.products;
  const t = qs("#productsTable");
  t.innerHTML = `
    <thead><tr>
      <th>ID</th><th>Name</th><th>Cat</th><th>Price</th><th>Cost</th><th>Qty</th><th>Active</th><th>Track</th><th>Actions</th>
    </tr></thead>
    <tbody>
      ${products.map(p => `
        <tr>
          <td>${p.id}</td>
          <td><input class="input" data-p="name" data-id="${p.id}" value="${p.name}"/></td>
          <td><input class="input" data-p="category" data-id="${p.id}" value="${p.category}"/></td>
          <td><input class="input" data-p="price" data-id="${p.id}" type="number" step="0.01" value="${p.price}"/></td>
          <td><input class="input" data-p="cost" data-id="${p.id}" type="number" step="0.01" value="${p.cost}"/></td>
          <td><input class="input" data-p="quantity" data-id="${p.id}" type="number" value="${p.quantity}"/></td>
          <td>
            <select class="input" data-p="active" data-id="${p.id}">
              <option value="1" ${p.active===1?"selected":""}>1</option>
              <option value="0" ${p.active===0?"selected":""}>0</option>
            </select>
          </td>
          <td>
            <select class="input" data-p="trackStock" data-id="${p.id}">
              <option value="1" ${p.trackStock===1?"selected":""}>1</option>
              <option value="0" ${p.trackStock===0?"selected":""}>0</option>
            </select>
          </td>
          <td>
            <button class="btn secondary" onclick="saveProduct(${p.id})">Save</button>
          </td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

function getProductRow(id) {
  const row = {};
  qsa(`[data-id="${id}"]`).forEach(el => row[el.dataset.p] = el.value);
  return row;
}

async function saveProduct(id) {
  const row = getProductRow(id);
  const p = products.find(x => x.id===id);
  try {
    await api(`/api/admin/products/${id}`, {
      method:"PUT",
      body: JSON.stringify({
        name: row.name,
        category: row.category,
        price: Number(row.price),
        cost: Number(row.cost),
        sku: p.sku || "",
        imageUrl: p.imageUrl || "",
        active: Number(row.active),
        trackStock: Number(row.trackStock),
        quantity: Number(row.quantity),
        lowStockThreshold: p.lowStockThreshold || 5
      })
    });
    toast("Product updated");
    await loadProducts();
    await loadInventory();
  } catch(e) { toast(e.message); }
}

async function createProduct() {
  try {
    await api("/api/admin/products", {
      method:"POST",
      body: JSON.stringify({
        name: qs("#pName").value.trim(),
        category: qs("#pCategory").value.trim() || "Food",
        price: Number(qs("#pPrice").value || 0),
        cost: Number(qs("#pCost").value || 0),
        sku: qs("#pSku").value.trim(),
        imageUrl: qs("#pImageUrl").value.trim(),
        quantity: Number(qs("#pQty").value || 0),
        lowStockThreshold: Number(qs("#pLow").value || 5),
        active: Number(qs("#pActive").value),
        trackStock: Number(qs("#pTrack").value)
      })
    });
    toast("Product created");
    ["#pName","#pCategory","#pPrice","#pCost","#pSku","#pImageUrl","#pQty","#pLow"].forEach(id=>qs(id).value="");
    await loadProducts();
    await loadInventory();
  } catch(e) { toast(e.message); }
}

async function loadInventory() {
  const r = await api("/api/admin/inventory");
  inventory = r.inventory;
  const sel = qs("#invProduct");
  sel.innerHTML = inventory.map(i => `<option value="${i.id}">${i.category} — ${i.name} (qty ${i.quantity})</option>`).join("");

  const t = qs("#inventoryTable");
  t.innerHTML = `
    <thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Qty</th><th>Low</th><th>Track</th></tr></thead>
    <tbody>
      ${inventory.map(i => `
        <tr>
          <td>${i.id}</td>
          <td>${i.name}</td>
          <td>${i.category}</td>
          <td>${i.quantity}</td>
          <td>${i.low_stock_threshold}</td>
          <td>${i.track_stock}</td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

async function adjustInventory() {
  const productId = Number(qs("#invProduct").value);
  const delta = Number(qs("#invDelta").value);
  const reason = qs("#invReason").value.trim();
  if (!delta) return toast("Delta is required");
  try {
    await api("/api/admin/inventory/adjust", {
      method:"POST",
      body: JSON.stringify({ productId, delta, reason })
    });
    toast("Inventory updated");
    qs("#invDelta").value = "";
    qs("#invReason").value = "";
    await loadInventory();
    await loadProducts();
  } catch(e) { toast(e.message); }
}

async function runReport() {
  const from = qs("#rFrom").value;
  const to = qs("#rTo").value;
  if (!from || !to) return toast("Choose from/to dates");
  const r = await api(`/api/reports/summary?from=${from}&to=${to}`);
  qs("#rSales").textContent = `₱${money(r.totals.sales)}`;
  qs("#rOrders").textContent = r.totals.orders;
  qs("#rangeProfit").textContent = `₱${money(r.totals.profit)}`;
  qs("#rTop").innerHTML = (r.topItems || []).length
    ? `<table class="table"><thead><tr><th>Item</th><th>Qty</th></tr></thead><tbody>${
        r.topItems.map(x => `<tr><td>${x.name}</td><td>${x.qty}</td></tr>`).join("")
      }</tbody></table>`
    : `<div class="muted">No data.</div>`;

  qs("#csvLink").href = `/api/reports/export.csv?from=${from}&to=${to}`;
  qs("#xlsxLink").href = `/api/reports/export.xlsx?from=${from}&to=${to}`;
}

async function loadSettings() {
  const s = await api("/api/settings/gcash");
  qs("#sNumber").value = s.number || "";
  qs("#sQrPreview").innerHTML = s.qr ? `<img src="${s.qr}" alt="QR" style="max-width:320px;border-radius:14px;border:1px solid var(--border)" />`
                                     : `<div class="muted">No QR uploaded yet.</div>`;
}

async function saveSettings() {
  const fd = new FormData();
  fd.append("number", qs("#sNumber").value.trim());
  const f = qs("#sQr").files[0];
  if (f) fd.append("qr", f);

  try {
    const res = await fetch("/api/settings/gcash", { method:"POST", body: fd, credentials:"include" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to save");
    qs("#sStatus").textContent = "Saved";
    toast("Settings saved");
    await loadSettings();
  } catch(e) {
    qs("#sStatus").textContent = "Error";
    toast(e.message);
  }
}

function bindTabs() {
  qsa(".tab", qs("#tabs")).forEach(t => t.onclick = () => setTab(t.dataset.tab));
}

async function init() {
  me = await requireLogin(["admin"]);
  if (!me) return;
  qs("#meBadge").textContent = `${me.username} (${me.role})`;

  bindTabs();

  // defaults
  qs("#rFrom").value = todayISO();
  qs("#rTo").value = todayISO();

  qs("#btnReloadUsers").onclick = loadUsers;
  qs("#btnCreateUser").onclick = createUser;

  qs("#btnReloadProducts").onclick = loadProducts;
  qs("#btnCreateProduct").onclick = createProduct;

  qs("#btnReloadInventory").onclick = loadInventory;
  qs("#btnAdjust").onclick = adjustInventory;

  qs("#btnRunReport").onclick = runReport;

  qs("#btnSaveSettings").onclick = saveSettings;

  await loadOverview();
  await loadUsers();
  await loadProducts();
  await loadInventory();
  await loadSettings();
}
init();
