/**
 * 回補關稅到既有進貨（一次性腳本）
 *
 * 用途：店主 2026-09-16 告知第一批貨關稅 NT$803，
 * 但 51 筆進貨明細是在有關稅欄位之前就匯入的，需要回頭攤提。
 *
 * 執行：node --experimental-strip-types scripts/backfill-duty.ts <DB路徑> <關稅台幣元>
 * 加 --dry-run 只試算不寫入。
 */
import Database from 'better-sqlite3'
import { calcShipmentCosts, calcMovingAverageCost, type ShipmentLineInput } from '../src/lib/costing.ts'
import { formatTWD, type Cents } from '../src/lib/money.ts'

const dbPath = process.argv[2]
const dutyYuan = Number.parseFloat(process.argv[3] ?? '0')
const dryRun = process.argv.includes('--dry-run')

if (!dbPath || !Number.isFinite(dutyYuan) || dutyYuan <= 0) {
  console.error('用法：node --experimental-strip-types scripts/backfill-duty.ts <DB路徑> <關稅台幣元> [--dry-run]')
  process.exit(1)
}

const dutyTwdCents = Math.round(dutyYuan * 100)
const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

const rows = db.prepare(`
  SELECT pi.id, pi.purchase_id, pi.unit_price_cny_cents, pi.quantity, pi.beads_per_unit,
         pi.bead_id, p.freight_cny_cents, p.fx_rate_x100
  FROM purchase_items pi
  JOIN purchases p ON p.id = pi.purchase_id
  WHERE pi.beads_per_unit IS NOT NULL
  ORDER BY pi.id
`).all() as Array<{
  id: number; purchase_id: number; unit_price_cny_cents: number; quantity: number
  beads_per_unit: number; bead_id: number | null; freight_cny_cents: number; fx_rate_x100: number
}>

if (rows.length === 0) {
  console.error('找不到可攤提的進貨明細')
  process.exit(1)
}

const lines: ShipmentLineInput[] = rows.map((r) => ({
  purchaseItemId: r.id,
  unitPriceCnyCents: r.unit_price_cny_cents,
  quantity: r.quantity,
  beadsPerUnit: r.beads_per_unit,
  freightCnyCents: r.freight_cny_cents,
  fxRateX100: r.fx_rate_x100,
}))

const costs = calcShipmentCosts(lines, dutyTwdCents)
const costById = new Map(costs.map((c) => [c.purchaseItemId, c]))

console.log(`關稅 ${formatTWD(dutyTwdCents)} 攤到 ${rows.length} 筆進貨明細\n`)
console.log('id   顆數   原每顆      關稅攤      新每顆')
console.log('─'.repeat(52))

let dutySum = 0
for (const r of rows.slice(0, 8)) {
  const c = costById.get(r.id)!
  const before = db.prepare('SELECT computed_unit_cost_cents FROM purchase_items WHERE id=?')
    .get(r.id) as { computed_unit_cost_cents: number | null }
  dutySum += c.dutyShareTwdCents
  console.log(
    `${String(r.id).padStart(3)} ${String(c.totalBeads).padStart(5)} ` +
    `${formatTWD(before.computed_unit_cost_cents ?? 0, true).padStart(10)} ` +
    `${formatTWD(c.dutyShareTwdCents, true).padStart(11)} ` +
    `${formatTWD(c.unitCostCents, true).padStart(10)}`
  )
}
if (rows.length > 8) console.log(`... 其餘 ${rows.length - 8} 筆`)

const total = costs.reduce((s, c) => s + c.dutyShareTwdCents, 0)
console.log(`\n關稅攤提加總：${formatTWD(total)}（應等於 ${formatTWD(dutyTwdCents)}）`)
if (total !== dutyTwdCents) {
  console.error('❌ 加總不符，中止')
  process.exit(1)
}

if (dryRun) {
  console.log('\n--dry-run：未寫入資料庫')
  process.exit(0)
}

const tx = db.transaction(() => {
  const ship = db.prepare(
    'INSERT INTO shipments (name, arrived_at, duty_twd_cents, note) VALUES (?, ?, ?, ?)'
  ).run('2026-09 第一批', Math.floor(Date.parse('2026-09-11') / 1000), dutyTwdCents,
        '首次進貨，6 張淘寶訂單集運併單一次清關')
  const shipmentId = ship.lastInsertRowid

  db.prepare('UPDATE purchases SET shipment_id = ? WHERE shipment_id IS NULL').run(shipmentId)

  const updItem = db.prepare(
    'UPDATE purchase_items SET duty_share_twd_cents = ?, computed_unit_cost_cents = ? WHERE id = ?'
  )
  const updBead = db.prepare('UPDATE beads SET unit_cost_cents = ?, updated_at = unixepoch() WHERE id = ?')

  /*
   * 回補是「重算」不是「疊加」：這批貨的成本本來就已經寫進 beads，
   * 現在只是把關稅加進去重算一次，所以起算基準要歸零，
   * 用 calcMovingAverageCost 從 0 開始累積本批的量與金額。
   *
   * 同一顆珠若在這批有多筆明細（例如同商品分兩次下單），
   * 會依序加權平均，與 import/actions.ts 的邏輯一致。
   */
  const acc = new Map<number, { qty: number; cost: Cents }>()

  for (const r of rows) {
    const c = costById.get(r.id)!
    updItem.run(c.dutyShareTwdCents, c.unitCostCents, r.id)

    if (r.bead_id === null) continue
    const prev = acc.get(r.bead_id) ?? { qty: 0, cost: 0 }
    const newCost = calcMovingAverageCost(prev.qty, prev.cost, c.totalBeads, c.lineTotalCents)
    acc.set(r.bead_id, { qty: prev.qty + c.totalBeads, cost: newCost })
    updBead.run(newCost, r.bead_id)
  }
  return shipmentId
})

const id = tx()
console.log(`\n✅ 已寫入。批次 id=${id}，${rows.length} 筆明細與對應珠子成本已更新。`)
