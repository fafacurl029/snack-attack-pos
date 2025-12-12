function makeOrderNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SA-${ts}-${rnd}`;
}

function money(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

module.exports = { makeOrderNo, money };
