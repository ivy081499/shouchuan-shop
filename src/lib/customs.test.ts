/**
 * 關稅攤提測試
 * 執行：node --experimental-strip-types src/lib/customs.test.ts
 */
import { calcShipmentCosts, type ShipmentLineInput } from './costing.ts'
import { formatTWD } from './money.ts'

let pass = 0, fail = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? '✓' : '✗'} ${label}  got=${JSON.stringify(got)}${ok ? '' : ` want=${JSON.stringify(want)}`}`)
}

const FX = 460

// 兩張訂單，一批清關，關稅 NT$803
const lines: ShipmentLineInput[] = [
  // 訂單 A：運費 ¥3，兩列
  { purchaseItemId: 1, unitPriceCnyCents: 307, quantity: 1, beadsPerUnit: 10, freightCnyCents: 300, fxRateX100: FX },
  { purchaseItemId: 2, unitPriceCnyCents: 306, quantity: 1, beadsPerUnit: 10, freightCnyCents: 300, fxRateX100: FX },
  // 訂單 B：無運費，一列（金額大）
  { purchaseItemId: 3, unitPriceCnyCents: 2680, quantity: 2, beadsPerUnit: 60, freightCnyCents: 0, fxRateX100: FX },
]

const DUTY = 80300 // NT$803
const out = calcShipmentCosts(lines, DUTY)

console.log('── 攤提結果 ──')
out.forEach((c) => {
  console.log(
    `  item${c.purchaseItemId}  關稅攤 ${formatTWD(c.dutyShareTwdCents, true).padStart(10)}` +
    `  總成本 ${formatTWD(c.lineTotalCents, true).padStart(11)}` +
    `  ${String(c.totalBeads).padStart(4)}顆  每顆 ${formatTWD(c.unitCostCents, true)}`
  )
})

console.log('\n── 驗證 ──')
const dutySum = out.reduce((s, c) => s + c.dutyShareTwdCents, 0)
check('關稅攤提加總 = 總關稅（不可少一分）', dutySum, DUTY)

// 金額大的那列應該攤到最多關稅
const maxDuty = Math.max(...out.map((c) => c.dutyShareTwdCents))
check('金額最大的列攤到最多關稅', out[2].dutyShareTwdCents, maxDuty)

// 關稅按「含運費的台幣金額」比例攤，不是按純貨款比例。
// item1/item2 貨款 ¥3.07/¥3.06，但運費各攤 ¥1.50 後台幣基準為 2102/2098，
// 比例被壓縮 —— 這是對的，關稅本來就該跟著到岸價走。
const base1 = out[0].lineTotalCents - out[0].dutyShareTwdCents
const base2 = out[1].lineTotalCents - out[1].dutyShareTwdCents
const dutyRatio = out[0].dutyShareTwdCents / out[1].dutyShareTwdCents
check('關稅比例 = 台幣到岸價比例（誤差 <0.1%）', Math.abs(dutyRatio - base1 / base2) < 0.001, true)

// 關稅為 0 時應與原本邏輯一致
const noDuty = calcShipmentCosts(lines, 0)
check('關稅為 0 時不影響成本', noDuty.every((c) => c.dutyShareTwdCents === 0), true)
check('關稅為 0 時白水晶每顆 = 205 分', noDuty[2].unitCostCents, Math.round((2680 * 2 * FX / 100) / 120))

// 加了關稅後成本必須變高
check('加關稅後單顆成本上升', out[2].unitCostCents > noDuty[2].unitCostCents, true)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
