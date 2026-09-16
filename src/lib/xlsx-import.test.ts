/**
 * 匯入解析測試
 *
 * 用實際 订单数据.xlsx 的欄位結構與資料造測試檔，驗證：
 *   - 淘寶「同訂單只有首列有訂單號／店鋪／運費」的格式能正確往下沿用
 *   - 金額字串「￥14.08」正確轉為分
 *   - 顆數解析的三種信心等級都有正確標記
 *
 * 執行：node --experimental-strip-types src/lib/xlsx-import.test.ts
 */
import ExcelJS from 'exceljs'
import { parseTaobaoXlsx } from './xlsx-import.ts'
import { calcPurchaseCosts } from './costing.ts'
import { formatTWD } from './money.ts'

const HEADER = [
  '订单号', '订单提交时间', '订单状态', '店铺名称', '商品名称', '商品链接',
  '型号款式', '商品数量', '商品金额', '实付金额', '运费', '物流公司', '物流单号',
]

// 取自實際檔案的資料
const ROWS = [
  ['5127421790026175046', '2026-09-10 22:40:50', '卖家已发货', '八祥梦旗舰店',
   '天然玛瑙散珠手工diy串珠手链官方正品盐源玛瑙散珠圆珠单珠手串',
   'https://item.taobao.com/item.htm?id=977709162763',
   '蜜桃粉玛瑙 约4.2mm*3颗', 1, '￥14.08', '￥143.10', '￥0.00', '中通快递', '79032115490515'],
  // 同訂單後續列：訂單號／店鋪／運費留空
  ['', '', '', '', '紫兔毛散珠正品天然紫水晶diy珠子串珠饰品配件单珠手链生日礼物',
   'https://item.taobao.com/item.htm?id=987023502266',
   '紫兔毛款 约8-8.5mm*3颗', 1, '￥27.30', '', '', '中通快递', '79032115490515'],
  ['', '', '', '', '和田玉散珠官方正品天然串珠手串旗舰店珠子碧玉diy单珠玉石配件',
   'https://item.taobao.com/item.htm?id=743999875667',
   '【甄选收藏级和田玉】珠径6mm奶白晴款 5颗装', 1, '￥24.31', '', '', '中通快递', '79032115490515'],
  // 另一張訂單，有運費
  ['5127421790026357448', '2026-09-10 22:40:50', '卖家已发货', '兰馨石韵饰品配件批发',
   '14k包金镀金保色方块切角珠隔珠配珠diy手工串珠饰品配件材料配饰',
   'https://item.taobao.com/item.htm?id=630659688398',
   '刻面隔片 14k金色5*3mm10颗', 1, '￥3.07', '￥9.13', '￥3.00', '中通快递', '79032117877696'],
  ['', '', '', '', '14k包金镀金保色方块切角珠隔珠配珠diy手工串珠饰品配件材料配饰',
   'https://item.taobao.com/item.htm?id=630659688398',
   '刻面隔片 银色5*3mm10颗', 1, '￥3.06', '', '', '中通快递', '79032117877696'],
  // 整包估算
  ['5127421790026339802', '2026-09-10 22:40:50', '卖家已发货', '斜阳余晖',
   '白水晶白色透明散珠半成品珠子DIY串珠佛珠圆珠手链项链饰品',
   'https://item.taobao.com/item.htm?id=723651854299',
   '8A白水晶 6mm【约60颗左右】】', 2, '￥26.80', '￥53.59', '￥0.00', '圆通速递', 'YT7643645303927'],
  // 無顆數資訊
  ['5127422654014001826', '2026-09-10 22:01:45', '卖家已发货', '城歆旗舰店',
   '古法沙金铜镀金桶珠diy手链手串竹节隔珠手绳金色保色配珠配件',
   'https://item.taobao.com/item.htm?id=740552229637',
   '24款', 4, '￥5.35', '￥280.24', '￥3.00', '中通快递', '79032122953142'],
]

async function buildFixture(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('订单数据')
  ws.addRow(HEADER)
  for (const r of ROWS) ws.addRow(r)
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

let pass = 0, fail = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? '✓' : '✗'} ${label}  got=${JSON.stringify(got)}${ok ? '' : ` want=${JSON.stringify(want)}`}`)
}

const rows = await parseTaobaoXlsx(await buildFixture())

console.log('── 解析結果 ──')
for (const r of rows) {
  console.log(
    `  ${r.supplierName.padEnd(12)} ${String(r.beadsPerUnit ?? '?').padStart(3)}顆 ` +
    `[${r.countSource.padEnd(9)}] ￥${(r.unitPriceCnyCents/100).toFixed(2).padStart(6)} ×${r.quantity} ` +
    `運費￥${(r.freightCnyCents/100).toFixed(2)}  ${r.rawSpec.slice(0,26)}`
  )
}

console.log('\n── 驗證 ──')
check('解析出 7 列', rows.length, 7)
check('第2列沿用上一筆訂單號', rows[1].sourceOrderNo, '5127421790026175046')
check('第2列沿用店鋪名稱', rows[1].supplierName, '八祥梦旗舰店')
check('第3列沿用訂單號', rows[2].sourceOrderNo, '5127421790026175046')
check('金額 ￥14.08 → 1408 分', rows[0].unitPriceCnyCents, 1408)
check('運費 ￥3.00 → 300 分', rows[3].freightCnyCents, 300)
check('第5列沿用同訂單運費', rows[4].freightCnyCents, 300)
check('無運費訂單為 0', rows[0].freightCnyCents, 0)
check('約數標記為 estimated', rows[5].countSource, 'estimated')
check('白水晶解析 60 顆', rows[5].beadsPerUnit, 60)
check('件數 2 正確', rows[5].quantity, 2)
check('「24款」判讀不出 → 預設 1', rows[6].beadsPerUnit, 1)
check('「24款」標記為 manual', rows[6].countSource, 'manual')
check('和田玉「5颗装」解析為 5', rows[2].beadsPerUnit, 5)

console.log('\n── 成本試算（匯率 4.5，隔片訂單含運費￥3）──')
const spacers = rows.filter(r => r.sourceOrderNo === '5127421790026357448')
const costs = calcPurchaseCosts(
  spacers.map(r => ({
    unitPriceCnyCents: r.unitPriceCnyCents,
    quantity: r.quantity,
    beadsPerUnit: r.beadsPerUnit as number,
  })),
  spacers[0].freightCnyCents,
  450,
)
costs.forEach((c, i) => {
  console.log(`  ${spacers[i].rawSpec.slice(0,20).padEnd(22)} 每顆 ${formatTWD(c.unitCostCents, true)}  運費攤 ￥${(c.freightShareCnyCents/100).toFixed(2)}`)
})
check('運費攤提加總 = 總運費', costs.reduce((s,c)=>s+c.freightShareCnyCents,0), 300)
check('金色隔片每顆 NT$2.06', costs[0].unitCostCents, 206)

// 白水晶：￥26.80 × 2 件 × 60 顆
const crystal = calcPurchaseCosts(
  [{ unitPriceCnyCents: rows[5].unitPriceCnyCents, quantity: rows[5].quantity, beadsPerUnit: 60 }],
  0, 450,
)
console.log(`  白水晶 總 ${crystal[0].totalBeads} 顆        每顆 ${formatTWD(crystal[0].unitCostCents, true)}`)
check('白水晶總顆數 120', crystal[0].totalBeads, 120)
check('白水晶每顆 NT$2.01', crystal[0].unitCostCents, 201)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
