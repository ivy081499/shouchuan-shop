/**
 * 成本計算 — 唯一來源
 *
 * 所有工作流必須呼叫此檔的函式，不得自行實作成本公式。
 * 這是防止「S3 以為成本按克算、S5 以為按顆算」這類整合漂移的主要機制。
 */

import { allocateProportional, cnyToTwd, type Cents, type CnyCents } from './money.ts'

/* ────────────────────────────────────────────────────────────
   進貨成本
   ──────────────────────────────────────────────────────────── */

export interface PurchaseLineInput {
  /** 商品金額（人民幣分），單件價 */
  unitPriceCnyCents: CnyCents
  /** 購買件數 */
  quantity: number
  /** 每件顆數（必須已經你確認過） */
  beadsPerUnit: number
}

export interface PurchaseLineCost {
  /** 攤得運費（人民幣分） */
  freightShareCnyCents: CnyCents
  /** 本列總顆數 = 件數 × 每件顆數 */
  totalBeads: number
  /** 單顆成本（新台幣分） */
  unitCostCents: Cents
  /** 本列總成本（新台幣分），含攤得運費 */
  lineTotalCents: Cents
}

/**
 * 計算一張進貨單中每一列的單顆成本。
 *
 * 公式：
 *   單顆成本 = (商品金額 × 件數 + 攤得運費) × 匯率 ÷ (件數 × 每件顆數)
 *
 * 運費依各列商品金額比例攤提，並保證加總等於總運費（餘數給最後一列）。
 *
 * @param lines      進貨明細
 * @param freightCnyCents 該筆訂單總運費（人民幣分）
 * @param fxRateX100 匯率放大 100 倍，例：4.5 → 450
 */
export function calcPurchaseCosts(
  lines: PurchaseLineInput[],
  freightCnyCents: CnyCents,
  fxRateX100: number,
): PurchaseLineCost[] {
  if (lines.length === 0) return []

  // 依各列商品總額（單價 × 件數）比例攤運費
  const weights = lines.map((l) => l.unitPriceCnyCents * l.quantity)
  const freightShares = allocateProportional(freightCnyCents, weights)

  return lines.map((l, i) => {
    const goodsCny = l.unitPriceCnyCents * l.quantity
    const freightShare = freightShares[i]
    const totalCny = goodsCny + freightShare
    const lineTotalCents = cnyToTwd(totalCny, fxRateX100)

    const totalBeads = l.quantity * l.beadsPerUnit
    const unitCostCents = totalBeads > 0 ? Math.round(lineTotalCents / totalBeads) : 0

    return {
      freightShareCnyCents: freightShare,
      totalBeads,
      unitCostCents,
      lineTotalCents,
    }
  })
}

/* ────────────────────────────────────────────────────────────
   關稅攤提（整批）

   關稅是「一批貨清關一次」收的，不是每張淘寶訂單各收一次。
   所以不能在 calcPurchaseCosts（單張訂單）裡算，必須跨訂單處理。
   ──────────────────────────────────────────────────────────── */

export interface ShipmentLineInput extends PurchaseLineInput {
  /** 這一列屬於哪張進貨單，用來把結果寫回去 */
  purchaseItemId: number
  /** 該張進貨單的運費（人民幣分），同單各列相同 */
  freightCnyCents: CnyCents
  /** 該張進貨單的匯率 */
  fxRateX100: number
}

export interface ShipmentLineCost extends PurchaseLineCost {
  purchaseItemId: number
  /** 本列攤得的關稅（新台幣分） */
  dutyShareTwdCents: Cents
}

/**
 * 整批到貨的成本計算（含關稅）。
 *
 * 兩層攤提：
 *   1. 運費：各張淘寶訂單內部，按該單各列金額比例攤（同 calcPurchaseCosts）
 *   2. 關稅：整批跨訂單，按各列「貨款換算台幣後」的金額比例攤
 *
 * 關稅用台幣計價（海關收台幣），所以攤提基準要先把貨款換成台幣，
 * 否則不同匯率的訂單之間比例會失真。
 *
 * 單顆成本 = (貨款 + 攤得運費) × 匯率 + 攤得關稅 ÷ 總顆數
 */
export function calcShipmentCosts(
  lines: ShipmentLineInput[],
  dutyTwdCents: Cents,
): ShipmentLineCost[] {
  if (lines.length === 0) return []

  // 1. 先按訂單分組算運費攤提
  //    依 (freight, fx) 相同者視為同一張訂單
  const groups = new Map<string, ShipmentLineInput[]>()
  for (const l of lines) {
    const k = `${l.freightCnyCents}|${l.fxRateX100}`
    const arr = groups.get(k) ?? []
    arr.push(l)
    groups.set(k, arr)
  }

  // 每組內部攤運費，得出未含關稅的台幣金額
  const interim = new Map<number, { line: ShipmentLineInput; freightShare: number; twdBeforeDuty: Cents }>()
  for (const group of groups.values()) {
    const weights = group.map((l) => l.unitPriceCnyCents * l.quantity)
    const shares = allocateProportional(group[0].freightCnyCents, weights)
    group.forEach((l, i) => {
      const goodsCny = l.unitPriceCnyCents * l.quantity
      const twd = cnyToTwd(goodsCny + shares[i], l.fxRateX100)
      interim.set(l.purchaseItemId, { line: l, freightShare: shares[i], twdBeforeDuty: twd })
    })
  }

  // 2. 關稅按「台幣貨款」比例跨訂單攤提
  const ordered = lines.map((l) => interim.get(l.purchaseItemId)!)
  const dutyWeights = ordered.map((x) => x.twdBeforeDuty)
  const dutyShares = allocateProportional(dutyTwdCents, dutyWeights)

  return ordered.map((x, i) => {
    const totalBeads = x.line.quantity * x.line.beadsPerUnit
    const lineTotalCents = x.twdBeforeDuty + dutyShares[i]
    return {
      purchaseItemId: x.line.purchaseItemId,
      freightShareCnyCents: x.freightShare,
      dutyShareTwdCents: dutyShares[i],
      totalBeads,
      unitCostCents: totalBeads > 0 ? Math.round(lineTotalCents / totalBeads) : 0,
      lineTotalCents,
    }
  })
}

/* ────────────────────────────────────────────────────────────
   手串成本與毛利
   ──────────────────────────────────────────────────────────── */

export interface RecipeLine {
  beadId: number
  /** 這條手串用掉幾顆 */
  qty: number
  /** 該珠目前單顆成本（新台幣分） */
  unitCostCents: Cents
}

/** 一條手串的材料成本 = Σ(每顆成本 × 用量) */
export function calcProductCost(recipe: RecipeLine[]): Cents {
  return recipe.reduce((sum, r) => sum + r.unitCostCents * r.qty, 0)
}

export interface Margin {
  /** 售價（新台幣分） */
  priceCents: Cents
  /** 材料成本（新台幣分） */
  costCents: Cents
  /** 毛利（新台幣分） */
  profitCents: Cents
  /** 毛利率 0–1；售價為 0 時回傳 0 */
  marginRate: number
}

export function calcMargin(priceCents: Cents, costCents: Cents): Margin {
  const profitCents = priceCents - costCents
  return {
    priceCents,
    costCents,
    profitCents,
    marginRate: priceCents > 0 ? profitCents / priceCents : 0,
  }
}

/* ────────────────────────────────────────────────────────────
   庫存可售量
   ──────────────────────────────────────────────────────────── */

/**
 * 依配方與現有庫存，算出這條手串最多還能做幾條。
 * 取各珠「庫存 ÷ 用量」的最小值（木桶效應）。
 *
 * @returns 可做數量；配方為空時回傳 0（沒設配方不該當作無限量）
 */
export function calcBuildableQty(recipe: Array<{ qty: number; stockQty: number }>): number {
  if (recipe.length === 0) return 0
  return recipe.reduce((min, r) => {
    if (r.qty <= 0) return min
    return Math.min(min, Math.floor(r.stockQty / r.qty))
  }, Number.POSITIVE_INFINITY) as number
}

/* ────────────────────────────────────────────────────────────
   採購需求
   ──────────────────────────────────────────────────────────── */

export interface DemandLine {
  beadId: number
  /** 未出貨訂單所需總顆數 */
  requiredQty: number
  /** 現有庫存 */
  stockQty: number
  /** 安全庫存 */
  reorderPoint: number
}

export interface ShortageLine extends DemandLine {
  /** 待採購顆數 = 需求 + 安全庫存 − 現有庫存，最小為 0 */
  shortageQty: number
}

/**
 * 算出每顆珠還要叫多少貨。
 * 需求來自未出貨訂單展開配方；再加上安全庫存作為緩衝。
 */
export function calcShortages(demand: DemandLine[]): ShortageLine[] {
  return demand.map((d) => ({
    ...d,
    shortageQty: Math.max(0, d.requiredQty + d.reorderPoint - d.stockQty),
  }))
}
