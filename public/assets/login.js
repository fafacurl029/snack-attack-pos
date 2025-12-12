async function refreshMe() {
  const u = await getMe();
  qs("#who").textContent = u ? `Logged in as ${u.username} (${u.role})` : "Not logged in";
}

async function login() {
  const username = qs("#username").value.trim();
  const password = qs("#password").value;
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    toast("Logged in");
    await refreshMe();
  } catch (e) {
    toast(e.message);
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
    toast("Logged out");
    await refreshMe();
  } catch (e) {
    toast(e.message);
  }
}

qs("#btnLogin").onclick = login;
qs("#btnLogout").onclick = logout;
refreshMe();
