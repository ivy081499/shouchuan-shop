/**
 * 成本計算測試 — 資料取自實際的 订单数据.xlsx
 * 執行：node --experimental-strip-types src/lib/costing.test.ts
 */
import { calcPurchaseCosts, calcBuildableQty, calcShortages, calcMargin, calcProductCost, calcMovingAverageCost } from './costing.ts'
import { allocateProportional, formatTWD } from './money.ts'

let pass = 0
let fail = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? '✓' : '✗'} ${label}  got=${JSON.stringify(got)}${ok ? '' : ` want=${JSON.stringify(want)}`}`)
}

const FX = 450 // 匯率 4.5

console.log('── 進貨成本（真實訂單 5127421790026357448，含運費 ¥3）──')
// 刻面隔片 金色 ¥3.07×1（10顆）、銀色 ¥3.06×1（10顆），運費 ¥3.00
const spacer = calcPurchaseCosts(
  [
    { unitPriceCnyCents: 307, quantity: 1, beadsPerUnit: 10 },
    { unitPriceCnyCents: 306, quantity: 1, beadsPerUnit: 10 },
  ],
  300,
  FX,
)
console.log(`   金色：每顆 ${formatTWD(spacer[0].unitCostCents, true)}  運費攤 ¥${(spacer[0].freightShareCnyCents / 100).toFixed(2)}`)
console.log(`   銀色：每顆 ${formatTWD(spacer[1].unitCostCents, true)}  運費攤 ¥${(spacer[1].freightShareCnyCents / 100).toFixed(2)}`)
check('運費攤提加總等於總運費', spacer[0].freightShareCnyCents + spacer[1].freightShareCnyCents, 300)
check('金色總顆數', spacer[0].totalBeads, 10)

console.log('\n── 無運費案例 ──')
// 8A白水晶 ¥26.80 × 2件，每件約60顆
const crystal = calcPurchaseCosts([{ unitPriceCnyCents: 2680, quantity: 2, beadsPerUnit: 60 }], 0, FX)
console.log(`   白水晶：總 ${crystal[0].totalBeads} 顆，每顆 ${formatTWD(crystal[0].unitCostCents, true)}`)
check('白水晶總顆數', crystal[0].totalBeads, 120)
check('白水晶每顆成本(分)', crystal[0].unitCostCents, Math.round((2680 * 2 * 450) / 100 / 120))

// 蜜桃粉玛瑙 ¥14.08 × 1件，3顆
const agate = calcPurchaseCosts([{ unitPriceCnyCents: 1408, quantity: 1, beadsPerUnit: 3 }], 0, FX)
console.log(`   蜜桃粉玛瑙：每顆 ${formatTWD(agate[0].unitCostCents, true)}`)
check('瑪瑙每顆成本(分)', agate[0].unitCostCents, Math.round((1408 * 450) / 100 / 3))

// S925银珠 ¥1.03 × 8件，單顆計價
const silver = calcPurchaseCosts([{ unitPriceCnyCents: 103, quantity: 8, beadsPerUnit: 1 }], 0, FX)
console.log(`   S925銀珠：總 ${silver[0].totalBeads} 顆，每顆 ${formatTWD(silver[0].unitCostCents, true)}`)
check('銀珠總顆數', silver[0].totalBeads, 8)

console.log('\n── 運費攤提邊界（餘數不可遺失）──')
check('3 分攤給 3 項', allocateProportional(3, [100, 100, 100]), [1, 1, 1])
check('10 分攤給 3 項（餘數給最後）', allocateProportional(10, [100, 100, 100]), [3, 3, 4])
check('權重為零時平均分攤', allocateProportional(9, [0, 0, 0]), [3, 3, 3])
check('單一項目拿全部', allocateProportional(300, [500]), [300])

console.log('\n── 手串成本與毛利 ──')
const recipe = [
  { beadId: 1, qty: 6, unitCostCents: 2112 }, // 蜜桃粉瑪瑙 6顆
  { beadId: 2, qty: 12, unitCostCents: 201 }, // 白水晶 12顆
  { beadId: 3, qty: 2, unitCostCents: 463 }, // 銀珠 2顆
]
const cost = calcProductCost(recipe)
console.log(`   材料成本 ${formatTWD(cost, true)}`)
check('材料成本(分)', cost, 6 * 2112 + 12 * 201 + 2 * 463)
const m = calcMargin(98000, cost) // 售價 NT$980
console.log(`   售價 ${formatTWD(m.priceCents)}  毛利 ${formatTWD(m.profitCents)}  毛利率 ${(m.marginRate * 100).toFixed(1)}%`)
check('毛利(分)', m.profitCents, 98000 - cost)

console.log('\n── 可做數量（木桶效應）──')
check('取最小值', calcBuildableQty([{ qty: 6, stockQty: 30 }, { qty: 12, stockQty: 120 }, { qty: 2, stockQty: 5 }]), 2)
check('無配方回傳 0', calcBuildableQty([]), 0)
check('庫存不足回傳 0', calcBuildableQty([{ qty: 6, stockQty: 3 }]), 0)

console.log('\n── 採購缺口 ──')
const short = calcShortages([
  { beadId: 1, requiredQty: 30, stockQty: 12, reorderPoint: 10 },
  { beadId: 2, requiredQty: 5, stockQty: 100, reorderPoint: 0 },
])
check('缺口 = 需求 + 安全庫存 − 庫存', short[0].shortageQty, 28)
check('庫存充足時為 0', short[1].shortageQty, 0)

/* ── 重複進貨：移動加權平均 ── */
console.log('\n── 重複進貨成本 ──')

// 現有 5 顆 @ NT$22.79，新進 5 顆共 NT$150.00（每顆 $30）
check(
  '加權平均 = (5×2279 + 15000) ÷ 10',
  calcMovingAverageCost(5, 2279, 5, 15000),
  2640,
)

// 庫存用完後再進貨，直接採用新成本
check('現有庫存 0 → 用新成本', calcMovingAverageCost(0, 2279, 4, 8000), 2000)

// 同價進貨，成本不該變動
check('同價進貨成本不變', calcMovingAverageCost(10, 500, 10, 5000), 500)

// 進貨 0 顆是無效輸入，保持原成本
check('進貨 0 顆 → 成本不變', calcMovingAverageCost(10, 500, 0, 0), 500)

// 舊批貴、新批便宜，平均應落在兩者之間
const avg = calcMovingAverageCost(3, 5000, 7, 14000)
check('高低價混合落在區間內', avg > 2000 && avg < 5000, true)
check('高低價混合 = (3×5000 + 14000) ÷ 10', avg, 2900)

console.log(`\n總計 ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
