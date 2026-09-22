/**
 * 建立示範用的假訂單，讓店主在畫面上實際點看。
 *
 * ⚠️ 只寫入 worktree 內的測試資料庫（.data/local.sqlite），
 *    絕不碰店主桌面的正式資料庫。
 *
 * 所有假資料都可以一鍵清掉：
 *   node scripts/seed-demo-orders.cjs --clean
 *
 * 辨識方式：
 *   - 訂單編號以 DEMO- 開頭
 *   - 示範手串的 slug 以 demo- 開頭
 *   - 示範商品照檔名為 <商品id>-<序號>.png，放在 public/uploads/products/
 */
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const ROOT = path.join(__dirname, '..')
const db = new Database(path.join(ROOT, '.data', 'local.sqlite'))
const now = Math.floor(Date.now() / 1000)
const DAY = 86400

/* ────────────── 清除模式 ────────────── */
if (process.argv.includes('--clean')) {
  const orderIds = db
    .prepare("SELECT id FROM orders WHERE order_no LIKE 'DEMO-%'")
    .all()
    .map((r) => r.id)
  for (const id of orderIds) {
    db.prepare("DELETE FROM stock_ledger WHERE reason='order_paid' AND ref_id=?").run(id)
    db.prepare('DELETE FROM order_items WHERE order_id=?').run(id)
    db.prepare('DELETE FROM orders WHERE id=?').run(id)
  }

  const demoProducts = db.prepare("SELECT id FROM products WHERE slug LIKE 'demo-%'").all()
  for (const p of demoProducts) {
    for (const img of db
      .prepare('SELECT r2_key FROM product_images WHERE product_id=?')
      .all(p.id)) {
      fs.rmSync(path.join(ROOT, 'public', 'uploads', img.r2_key), { force: true })
    }
    db.prepare('DELETE FROM product_images WHERE product_id=?').run(p.id)
    db.prepare('DELETE FROM recipes WHERE product_id=?').run(p.id)
    db.prepare('DELETE FROM products WHERE id=?').run(p.id)
  }

  console.log(`已清除 ${orderIds.length} 筆示範訂單、${demoProducts.length} 條示範手串`)
  db.close()
  process.exit(0)
}

/* ────────────── 建立示範手串 ────────────── */

/** 依分類挑珠子組配方，讓每條手串用料不同 */
function pickBeads(category, limit) {
  return db
    .prepare(
      `SELECT id, name, unit_cost_cents, stock_qty FROM beads
       WHERE is_archived = 0 AND category = ? AND stock_qty > 0
       ORDER BY id LIMIT ?`,
    )
    .all(category, limit)
}

const beadImages = fs
  .readdirSync(path.join(ROOT, 'public', 'uploads', 'beads'))
  .filter((f) => f.endsWith('.png'))

const DEMO_PRODUCTS = [
  { slug: 'demo-peach', name: '桃花手串', priceCents: 128000, beads: [...pickBeads('水晶', 3), ...pickBeads('配件', 2)] },
  { slug: 'demo-calm', name: '沉靜手串', priceCents: 98000, beads: [...pickBeads('玉石', 3), ...pickBeads('配件', 1)] },
]

const productIds = {}
for (const p of DEMO_PRODUCTS) {
  const existing = db.prepare('SELECT id FROM products WHERE slug=?').get(p.slug)
  if (existing) {
    productIds[p.slug] = existing.id
    continue
  }
  const id = db
    .prepare(
      `INSERT INTO products (slug, name, price_cents, status, sort_order, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(p.slug, p.name, p.priceCents, 'active', 0, now, now).lastInsertRowid
  productIds[p.slug] = id

  // 配方：每種珠 1–4 顆
  p.beads.forEach((b, i) => {
    db.prepare(
      'INSERT INTO recipes (product_id, bead_id, qty, position, created_at, updated_at) VALUES (?,?,?,?,?,?)',
    ).run(id, b.id, (i % 4) + 1, i, now, now)
  })

  // 商品照：借用珠子圖當示範素材
  const dstDir = path.join(ROOT, 'public', 'uploads', 'products')
  fs.mkdirSync(dstDir, { recursive: true })
  beadImages.slice(0, 2).forEach((src, i) => {
    const name = `${id}-${i + 1}.png`
    fs.copyFileSync(path.join(ROOT, 'public', 'uploads', 'beads', src), path.join(dstDir, name))
    db.prepare(
      `INSERT INTO product_images (product_id, r2_key, alt, sort_order, created_at, updated_at)
       VALUES (?,?,?,?,?,?)`,
    ).run(id, `products/${name}`, null, i + 1, now, now)
  })
  console.log('建立示範手串:', p.name)
}

/** 某條手串的材料成本（分） */
function costOf(productId) {
  const rows = db
    .prepare(
      `SELECT r.qty, b.unit_cost_cents FROM recipes r
       JOIN beads b ON b.id = r.bead_id WHERE r.product_id = ?`,
    )
    .all(productId)
  return rows.reduce((s, r) => s + r.qty * r.unit_cost_cents, 0)
}

/* ────────────── 建立示範訂單 ────────────── */

const SHIPPING = 6000 // 運費 $60

const ORDERS = [
  {
    no: 'DEMO-0001', name: '林小美', phone: '0912345678',
    addr: '台北市大安區復興南路一段 100 號 5 樓',
    note: '想要 16cm 手圍，謝謝！',
    items: [{ slug: 'demo-peach', qty: 1 }],
    status: 'completed', daysAgo: 12, last5: '48213',
  },
  {
    no: 'DEMO-0002', name: '陳怡君', phone: '0922333444',
    addr: '新北市板橋區文化路二段 88 號',
    note: null,
    items: [{ slug: 'demo-calm', qty: 1 }, { slug: 'demo-peach', qty: 1 }],
    status: 'shipped', daysAgo: 5, last5: '90127', tracking: '一般宅配 1234567890',
  },
  {
    no: 'DEMO-0003', name: '黃雅婷', phone: '0933555666',
    addr: '台中市西屯區台灣大道三段 251 號',
    note: '可以幫我包成禮盒嗎？要送人的',
    items: [{ slug: 'demo-peach', qty: 2 }],
    status: 'paid', daysAgo: 1, last5: '33512',
  },
  {
    no: 'DEMO-0004', name: '吳品萱', phone: '0955777888',
    addr: '高雄市苓雅區三多四路 21 號',
    note: null,
    items: [{ slug: 'demo-calm', qty: 1 }],
    status: 'pending_payment', daysAgo: 0, last5: null,
  },
]

for (const o of ORDERS) {
  if (db.prepare('SELECT id FROM orders WHERE order_no=?').get(o.no)) {
    console.log('已存在，略過:', o.no)
    continue
  }

  const createdAt = now - o.daysAgo * DAY
  const lines = o.items.map((it) => {
    const pid = productIds[it.slug]
    const p = db.prepare('SELECT id, name, price_cents FROM products WHERE id=?').get(pid)
    return { productId: p.id, name: p.name, unitPrice: p.price_cents, unitCost: costOf(p.id), qty: it.qty }
  })

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0)
  const costSnapshot = lines.reduce((s, l) => s + l.unitCost * l.qty, 0)
  const total = subtotal + SHIPPING

  // 已收款以後的狀態才扣過庫存
  const deducted = ['paid', 'shipped', 'completed'].includes(o.status)
  const paidAt = deducted ? createdAt + 3600 : null

  const orderId = db
    .prepare(
      `INSERT INTO orders
        (order_no, customer_name, customer_phone, shipping_address, customer_note,
         subtotal_cents, shipping_fee_cents, total_cents, cost_snapshot_cents,
         status, transfer_last5, transfer_reported_at, paid_at, shipped_at, tracking_no,
         stock_deducted, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      o.no, o.name, o.phone, o.addr, o.note,
      subtotal, SHIPPING, total, costSnapshot,
      o.status, o.last5, o.last5 ? createdAt + 1800 : null,
      paidAt,
      o.status === 'shipped' || o.status === 'completed' ? createdAt + DAY : null,
      o.tracking ?? null,
      deducted ? 1 : 0, createdAt, createdAt,
    ).lastInsertRowid

  for (const l of lines) {
    db.prepare(
      `INSERT INTO order_items
        (order_id, product_id, product_name, unit_price_cents, unit_cost_cents, qty, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(orderId, l.productId, l.name, l.unitPrice, l.unitCost, l.qty, createdAt, createdAt)
  }

  // 已扣庫存的訂單才有用料流水帳——這就是「當時用了哪些料」的依據
  if (deducted) {
    const demand = new Map()
    for (const l of lines) {
      for (const r of db
        .prepare('SELECT bead_id, qty FROM recipes WHERE product_id=?')
        .all(l.productId)) {
        demand.set(r.bead_id, (demand.get(r.bead_id) ?? 0) + r.qty * l.qty)
      }
    }
    for (const [beadId, qty] of demand) {
      const b = db.prepare('SELECT stock_qty FROM beads WHERE id=?').get(beadId)
      db.prepare(
        `INSERT INTO stock_ledger (bead_id, delta_qty, balance_after, reason, ref_id, note, created_at)
         VALUES (?,?,?,?,?,?,?)`,
      ).run(beadId, -qty, b.stock_qty - qty, 'order_paid', orderId, `訂單 ${o.no} 確認收款`, paidAt)
    }
  }

  console.log(`建立訂單 ${o.no}（${o.status}）— ${o.name}，${lines.length} 項，$${(total / 100).toFixed(0)}`)
}

console.log('\n訂單總數:', db.prepare('SELECT COUNT(*) c FROM orders').get().c)
console.log('要清除示範資料：node scripts/seed-demo-orders.cjs --clean')
db.close()
