/**
 * validators.js
 * Central place for validating and sanitizing request bodies.
 * CommonJS module (Node/Express).
 */

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function asTrimmedString(v) {
  return typeof v === "string" ? v.trim() : "";
}

function addErr(errors, field, message) {
  errors.push({ field, message });
}

function requireString(body, key, errors, label = key) {
  const val = asTrimmedString(body?.[key]);
  if (!val) addErr(errors, key, `${label} is required`);
  return val;
}

function optionalString(body, key) {
  return asTrimmedString(body?.[key]);
}

function normalizePhone(phone) {
  // Basic normalization; keeps + and digits only
  const p = asTrimmedString(phone);
  return p.replace(/[^\d+]/g, "");
}

function isValidPhone(phone) {
  // Lightweight check: 8–16 digits (allows leading +)
  const p = normalizePhone(phone);
  const digits = p.replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 16;
}

function isValidOrderStatus(s) {
  return ["pending", "preparing", "ready", "completed", "cancelled"].includes(s);
}

function needsPaymentReference(method) {
  const m = asTrimmedString(method).toLowerCase();
  return ["gcash", "qr", "online", "card", "bank"].includes(m);
}

/**
 * Validate login payload
 */
function validateLogin(body) {
  const errors = [];
  const username = requireString(body, "username", errors, "Username");
  const password = requireString(body, "password", errors, "Password");

  return {
    ok: errors.length === 0,
    errors,
    value: { username, password },
  };
}

/**
 * Validate customer / POS order creation payload
 * Expected fields (typical):
 * - source: "customer" | "pos"
 * - customer_name, customer_phone, customer_address
 * - payment_method: "cash" | "gcash" | "qr" | ...
 * - payment_reference (or reference_no)
 * - order_type: "dinein" | "takeout" | "delivery"
 * - items: [{ product_id, qty, notes }]
 */
function validateCreateOrder(body) {
  const errors = [];

  const source = optionalString(body, "source").toLowerCase() || "customer";
  if (!["customer", "pos"].includes(source)) {
    addErr(errors, "source", "Invalid source");
  }

  const customer_name = requireString(body, "customer_name", errors, "Customer name");

  const rawPhone = requireString(body, "customer_phone", errors, "Phone number");
  const customer_phone = normalizePhone(rawPhone);
  if (isNonEmptyString(rawPhone) && !isValidPhone(rawPhone)) {
    addErr(errors, "customer_phone", "Phone number looks invalid");
  }

  const customer_address = requireString(body, "customer_address", errors, "Exact address");

  const payment_method = optionalString(body, "payment_method").toLowerCase() || "cash";

  // Accept either payment_reference or reference_no (for flexibility)
  const payment_reference =
    optionalString(body, "payment_reference") || optionalString(body, "reference_no");

  if (needsPaymentReference(payment_method) && !payment_reference) {
    addErr(errors, "payment_reference", "Reference number is required for this payment method");
  }

  const order_type = optionalString(body, "order_type").toLowerCase() || "takeout";
  if (!["dinein", "takeout", "delivery"].includes(order_type)) {
    addErr(errors, "order_type", "Invalid order type");
  }

  const notes = optionalString(body, "notes");

  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) addErr(errors, "items", "At least one item is required");

  const normalizedItems = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const qty = Number(it.qty);

    // allow product_id OR name_snapshot depending on your flow
    const product_id = it.product_id != null ? Number(it.product_id) : null;
    const name_snapshot = optionalString(it, "name_snapshot");
    const price_snapshot = it.price_snapshot != null ? Number(it.price_snapshot) : null;

    if (!Number.isFinite(qty) || qty <= 0) {
      addErr(errors, `items[${i}].qty`, "Quantity must be > 0");
    }

    if (product_id == null && !name_snapshot) {
      addErr(errors, `items[${i}]`, "Item must include product_id or name_snapshot");
    }

    normalizedItems.push({
      product_id: Number.isFinite(product_id) ? product_id : null,
      qty: Number.isFinite(qty) ? qty : 0,
      notes: optionalString(it, "notes"),
      name_snapshot: name_snapshot || null,
      price_snapshot: Number.isFinite(price_snapshot) ? price_snapshot : null,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      source,
      customer_name,
      customer_phone,
      customer_address,
      payment_method,
      payment_reference: payment_reference || "",
      order_type,
      notes,
      items: normalizedItems,
    },
  };
}

/**
 * Validate order status update
 */
function validateUpdateOrderStatus(body) {
  const errors = [];
  const status = optionalString(body, "status").toLowerCase();

  if (!isValidOrderStatus(status)) {
    addErr(errors, "status", "Invalid status");
  }

  return {
    ok: errors.length === 0,
    errors,
    value: { status },
  };
}

module.exports = {
  validateLogin,
  validateCreateOrder,
  validateUpdateOrderStatus,

  // Backwards-compatible aliases (in case other files use different names)
  validateLoginBody: validateLogin,
  validateOrderCreate: validateCreateOrder,
  validateOrderStatus: validateUpdateOrderStatus,
};
