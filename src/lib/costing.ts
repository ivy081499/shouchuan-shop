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

/**
 * 重複進貨時的新單顆成本（移動加權平均）。
 *
 * 公式：(現有庫存 × 現有成本 + 本次進貨總額) ÷ (現有庫存 + 本次顆數)
 *
 * 為什麼不直接覆蓋成最新價：覆蓋會讓庫存值偏離實際花費。
 * 例：現有 5 顆 @ $22.79，新進 5 顆 @ $30.00。
 *   覆蓋 → 10 顆全算 $30.00，庫存值 $300.00
 *   平均 → 10 顆算 $26.39，庫存值 $263.95 ＝ 實際花費
 *
 * 現有庫存為 0 時（全部用完後再進貨）直接採用新成本。
 */
export function calcMovingAverageCost(
  currentQty: number,
  currentUnitCostCents: Cents,
  incomingQty: number,
  incomingLineTotalCents: Cents,
): Cents {
  if (incomingQty <= 0) return currentUnitCostCents
  if (currentQty <= 0) return Math.round(incomingLineTotalCents / incomingQty)
  const totalValue = currentQty * currentUnitCostCents + incomingLineTotalCents
  return Math.round(totalValue / (currentQty + incomingQty))
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
