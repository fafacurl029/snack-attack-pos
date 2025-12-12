async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    credentials: "include",
    ...opts
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const msg = (data && data.message) ? data.message : `Request failed: ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function money(n) {
  return (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toFixed(2);
}

function qs(sel, el=document){ return el.querySelector(sel); }
function qsa(sel, el=document){ return [...el.querySelectorAll(sel)]; }

function toast(msg) {
  const t = qs("#toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2600);
}

function fmtDate(ts) {
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

async function getMe() {
  const r = await api("/api/auth/me");
  return r.user;
}

function requireLogin(roles = null) {
  return getMe().then(user => {
    if (!user) { location.href = "/login.html"; return null; }
    if (roles && !roles.includes(user.role)) {
      toast("Forbidden for your role");
      location.href = "/";
      return null;
    }
    return user;
  });
}

function byCategory(products) {
  const map = {};
  for (const p of products) {
    if (!map[p.category]) map[p.category] = [];
    map[p.category].push(p);
  }
  return map;
}

