/**
 * 淘寶訂單 xlsx 解析
 *
 * 來源：淘寶「我的訂單 → 匯出」下載的 订单数据.xlsx
 * 欄位：訂單號、訂單提交時間、訂單狀態、店鋪名稱、商品名稱、商品連結、
 *       型號款式、商品數量、商品金額、實付金額、運費、物流公司、物流單號
 *
 * ⚠️ 解析結果是【建議值】，必須經店主逐列確認才可寫入（見 ADR-0006）。
 */

import ExcelJS from 'exceljs'
import { parseBeadSpec, type CountConfidence } from './bead-spec.ts'

export interface ParsedPurchaseRow {
  /** 淘寶訂單號；同一訂單的後續列在原檔為空，解析時會往上補 */
  sourceOrderNo: string
  orderedAt: number | null
  supplierName: string
  rawTitle: string
  rawSpec: string
  rawUrl: string
  /** 商品金額（人民幣分） */
  unitPriceCnyCents: number
  quantity: number
  /** 該訂單的運費（人民幣分），同訂單各列相同 */
  freightCnyCents: number

  /* 以下為解析建議值，UI 必須讓店主確認 */
  beadsPerUnit: number | null
  countSource: CountConfidence
  sizeMm: number | null
  parseReason: string
}

/** 「￥14.08」→ 1408（分） */
function parseMoney(v: unknown): number {
  if (v === null || v === undefined) return 0
  const s = String(v).replace(/[￥¥,\s]/g, '')
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** 「2026-09-10 22:40:50」→ Unix 秒 */
function parseDate(v: unknown): number | null {
  if (!v) return null
  if (v instanceof Date) return Math.floor(v.getTime() / 1000)
  const s = String(v).trim()
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const d = new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6]),
  )
  return Math.floor(d.getTime() / 1000)
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    const o = v as { text?: string; hyperlink?: string; result?: unknown }
    if (typeof o.text === 'string') return o.text
    if (typeof o.hyperlink === 'string') return o.hyperlink
    if (o.result !== undefined) return String(o.result)
  }
  return String(v).trim()
}

/**
 * 解析 xlsx。
 *
 * 淘寶的格式特性：一張訂單有多個商品時，只有第一列填訂單號／店鋪／運費，
 * 後續列留空。這裡會往下沿用上一筆的值。
 */
export async function parseTaobaoXlsx(buffer: ArrayBuffer): Promise<ParsedPurchaseRow[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) return []

  // 找標題列（含「商品名稱」的那一列）
  let headerRow = 1
  let headerMap: Record<string, number> = {}
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const row = ws.getRow(r)
    const map: Record<string, number> = {}
    row.eachCell((cell, col) => {
      const t = cellText(cell.value).replace(/\s/g, '')
      if (t) map[t] = col
    })
    if (Object.keys(map).some((k) => k.includes('商品名稱') || k.includes('商品名称'))) {
      headerRow = r
      headerMap = map
      break
    }
  }

  const col = (...names: string[]): number | null => {
    for (const n of names) {
      for (const key of Object.keys(headerMap)) {
        if (key.includes(n)) return headerMap[key]
      }
    }
    return null
  }

  const cOrderNo = col('訂單號', '订单号')
  const cDate = col('訂單提交時間', '订单提交时间')
  const cShop = col('店鋪名稱', '店铺名称')
  const cTitle = col('商品名稱', '商品名称')
  const cUrl = col('商品連結', '商品链接')
  const cSpec = col('型號款式', '型号款式')
  const cQty = col('商品數量', '商品数量')
  const cAmount = col('商品金額', '商品金额')
  const cFreight = col('運費', '运费')

  if (!cTitle) return []

  const out: ParsedPurchaseRow[] = []
  // 淘寶同訂單只有首列有這些值，往下沿用
  let lastOrderNo = ''
  let lastShop = ''
  let lastDate: number | null = null
  let lastFreight = 0

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const title = cTitle ? cellText(row.getCell(cTitle).value) : ''
    if (!title) continue

    const orderNo = cOrderNo ? cellText(row.getCell(cOrderNo).value) : ''
    if (orderNo) lastOrderNo = orderNo
    const shop = cShop ? cellText(row.getCell(cShop).value) : ''
    if (shop) lastShop = shop
    const date = cDate ? parseDate(row.getCell(cDate).value) : null
    if (date) lastDate = date
    if (cFreight) {
      const f = cellText(row.getCell(cFreight).value)
      if (f) lastFreight = parseMoney(f)
    }

    const spec = cSpec ? cellText(row.getCell(cSpec).value) : ''
    const parsed = parseBeadSpec(spec)

    const qtyRaw = cQty ? cellText(row.getCell(cQty).value) : '1'
    const qty = Math.max(1, Number.parseInt(qtyRaw, 10) || 1)

    out.push({
      sourceOrderNo: lastOrderNo,
      orderedAt: lastDate,
      supplierName: lastShop,
      rawTitle: title,
      rawSpec: spec,
      rawUrl: cUrl ? cellText(row.getCell(cUrl).value) : '',
      unitPriceCnyCents: cAmount ? parseMoney(row.getCell(cAmount).value) : 0,
      quantity: qty,
      freightCnyCents: lastFreight,
      beadsPerUnit: parsed.beadsPerUnit,
      countSource: parsed.confidence,
      sizeMm: parsed.sizeMm,
      parseReason: parsed.reason,
    })
  }

  return out
}
