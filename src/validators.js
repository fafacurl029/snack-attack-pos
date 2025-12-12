const { z } = require("zod");

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(6).max(128)
});

const orderItemSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.number().int().min(1).max(99),
  notes: z.string().max(200).optional().default("")
});

const createOrderSchema = z.object({
  source: z.enum(["customer","pos"]),
  customerName: z.string().max(80).optional().default(""),
  phone: z.string().max(30).optional().default(""),
  address: z.string().max(200).optional().default(""),
  orderType: z.enum(["dine-in","takeout"]),
  paymentMethod: z.enum(["cash","gcash"]),
  paymentStatus: z.enum(["unpaid","paid"]).optional().default("unpaid"),
  gcashRef: z.string().max(60).optional().default(""),
  cashReceived: z.number().optional(),
  items: z.array(orderItemSchema).min(1).max(60)
}).superRefine((o, ctx) => {
  if (o.source === \"customer\") {
    if (!String(o.customerName||\"\").trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: \"Customer name is required\", path: [\"customerName\"] });
    if (!String(o.phone||\"\").trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: \"Phone number is required\", path: [\"phone\"] });
    if (!String(o.address||\"\").trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: \"Exact address is required\", path: [\"address\"] });
    if (o.paymentMethod === \"gcash\" && !String(o.gcashRef||\"\").trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: \"GCash reference number is required\", path: [\"gcashRef\"] });
  }
});


const statusSchema = z.object({
  status: z.enum(["pending","preparing","ready","completed","cancelled"])
});

const upsertUserSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(["admin","staff","kitchen"]),
  active: z.number().int().min(0).max(1).optional().default(1)
});

const upsertProductSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(50),
  price: z.number().min(0),
  cost: z.number().min(0).optional().default(0),
  sku: z.string().max(80).optional().default(""),
  imageUrl: z.string().max(500).optional().default(""),
  active: z.number().int().min(0).max(1).optional().default(1),
  trackStock: z.number().int().min(0).max(1).optional().default(1),
  quantity: z.number().int().min(0).optional().default(0),
  lowStockThreshold: z.number().int().min(0).optional().default(5)
});

const inventoryAdjustSchema = z.object({
  productId: z.number().int().positive(),
  delta: z.number().int().min(-100000).max(100000),
  reason: z.string().max(200).optional().default("")
});

module.exports = {
  loginSchema,
  createOrderSchema,
  statusSchema,
  upsertUserSchema,
  upsertProductSchema,
  inventoryAdjustSchema
};
