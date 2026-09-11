/**
 * 金額工具 — 唯一的金錢運算來源
 *
 * 【鐵律】金額一律為整數「新台幣分」。禁止浮點數存錢、禁止在別處自行四捨五入。
 *   NT$1,280.50 → 128050 分
 *
 * 所有工作流必須 import 此檔，不得自行實作。
 */

/** 新台幣分 */
export type Cents = number

/** 人民幣分 */
export type CnyCents = number

/**
 * 格式化為顯示字串，例：128050 → "NT$1,280"（預設不顯示小數）
 * 手串售價通常為整數元，故預設 0 位小數；需要分時傳 showCents。
 */
export function formatTWD(cents: Cents, showCents = false): string {
  const yuan = cents / 100
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(yuan)
}

/** 格式化人民幣，例：1408 → "¥14.08" */
export function formatCNY(cnyCents: CnyCents): string {
  return `¥${(cnyCents / 100).toFixed(2)}`
}

/** 元 → 分。使用者輸入「1280.5」→ 128050。四捨五入到分。 */
export function yuanToCents(yuan: number | string): Cents {
  const n = typeof yuan === 'string' ? Number.parseFloat(yuan) : yuan
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** 分 → 元（僅供顯示或表單預填，勿用於計算） */
export function centsToYuan(cents: Cents): number {
  return cents / 100
}

/**
 * 人民幣分 → 新台幣分
 * @param fxRateX100 匯率放大 100 倍的整數，例：4.5 → 450
 */
export function cnyToTwd(cnyCents: CnyCents, fxRateX100: number): Cents {
  return Math.round((cnyCents * fxRateX100) / 100)
}

/**
 * 依比例分攤（用於運費攤提）。
 * 保證各項分攤加總 === 總額，餘數給最後一項，避免「分不完」或「多分一分」。
 *
 * @param total   要分攤的總額
 * @param weights 各項權重（通常為各品項金額）
 */
export function allocateProportional(total: number, weights: number[]): number[] {
    const sum = weights.reduce((a, b) => a + b, 0)
    if (sum <= 0 || weights.length === 0) {
      // 權重全為零時平均分攤
      const each = weights.length ? Math.floor(total / weights.length) : 0
      const out = weights.map(() => each)
      if (out.length) out[out.length - 1] += total - each * out.length
      return out
    }
    const out = weights.map((w) => Math.floor((total * w) / sum))
    const allocated = out.reduce((a, b) => a + b, 0)
    out[out.length - 1] += total - allocated
    return out
}
