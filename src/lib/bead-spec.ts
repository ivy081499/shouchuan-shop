/**
 * 淘寶規格字串解析 — 從「型號款式」欄推測每件包含幾顆珠
 *
 * ⚠️【重要】此解析器的輸出是【建議值】，不是權威值。
 * 淘寶規格欄由賣家自由填寫，格式極不一致，必定有無法判讀的情況。
 *
 * 判讀不出顆數時一律回傳 beadsPerUnit: 1、confidence: 'manual'（ADR-0006 修訂 2026-09-14）。
 * 這個 1 是讓流程不卡住的預設值，**不是**確認過的數字——
 * 顆數的人工確認在雲端試算表完成，交給系統匯入的必須是已確認過的版本。
 * confidence 為 'manual' 即代表該數字未經確認，成本可能高估數倍。
 *
 * 以下規則由實際檔案（订单数据.xlsx）樣本歸納而來。
 */

export type CountConfidence = 'parsed' | 'estimated' | 'manual'

export interface ParsedSpec {
  /** 每件包含幾顆。解析不出時為 1（預設值，未經確認，見檔頭說明） */
  beadsPerUnit: number
  /** parsed = 有把握；estimated = 約數需你確認；manual = 無法解析，顆數為預設值 1 */
  confidence: CountConfidence
  /** 解析出的直徑（mm），供建檔時預填 */
  sizeMm: number | null
  /** 給使用者看的說明，UI 直接顯示 */
  reason: string
}

/** 全形數字與符號正規化 */
function normalize(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/＊/g, '*')
    .replace(/／/g, '/')
    .toLowerCase()
}

/**
 * 解析直徑。支援：
 *   约4.2mm / 6-6.8MM / 珠径6mm / 直径约7.5mm / 5*3mm（取較大值為主徑）
 * 注意：線材的「粗约0.8mm」不是珠徑，由呼叫端依 category 判斷。
 */
function parseSize(s: string): number | null {
  // 區間取平均：6-6.8mm
  const range = s.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mm/)
  if (range) {
    const a = Number.parseFloat(range[1])
    const b = Number.parseFloat(range[2])
    return Math.round(((a + b) / 2) * 10) / 10
  }
  // 方形配件 5*3mm → 取 5
  const rect = s.match(/(\d+(?:\.\d+)?)\s*\*\s*(\d+(?:\.\d+)?)\s*mm/)
  if (rect) return Number.parseFloat(rect[1])

  const single = s.match(/(\d+(?:\.\d+)?)\s*mm/)
  return single ? Number.parseFloat(single[1]) : null
}

/**
 * 解析每件顆數。
 *
 * 實測樣本與預期結果：
 *   「蜜桃粉玛瑙 约4.2mm*3颗」      → 3   parsed
 *   「紫兔毛款 约8-8.5mm*3颗」      → 3   parsed
 *   「偏粉冰种 约6-6.8MM 5颗[...]」  → 5   parsed
 *   「珠径6mm奶白晴款 5颗装」        → 5   parsed
 *   「【3A入门级】...约6mm/10颗」    → 10  parsed
 *   「刻面隔片 14k金色5*3mm10颗」    → 10  parsed
 *   「4mm/1颗」                     → 1   parsed
 *   「8A白水晶 6mm【约60颗左右】」   → 60  estimated（實收可能不同）
 *   「素银01款 3.5mm/颗(孔径约1.5mm)」→ 1   parsed（單顆計價）
 *   「大号直径约7.5mm」              → 1 manual（無顆數資訊，預設 1）
 *   「24款」「56亮天蓝」             → 1 manual（純款式編號，預設 1）
 *   「日本扁丝盒装...长约45米...」    → 1 manual（線材按米計，預設 1）
 */
export function parseBeadSpec(rawSpec: string | null | undefined): ParsedSpec {
  const empty: ParsedSpec = {
    beadsPerUnit: 1,
    confidence: 'manual',
    sizeMm: null,
    reason: '規格欄為空，顆數預設 1，請在試算表確認',
  }
  if (!rawSpec || !rawSpec.trim()) return empty

  const s = normalize(rawSpec)
  const sizeMm = parseSize(s)

  // 線材類：按長度計價，不是珠子
  if (/\d+\s*米|长约\d+/.test(s)) {
    return {
      beadsPerUnit: 1,
      confidence: 'manual',
      sizeMm: null,
      reason: '這是線材（按長度計價），非珠子。顆數預設 1，請在試算表確認計量方式',
    }
  }

  // 約數：【约60颗左右】「约100颗」——賣家自己說是估計值
  const approx = s.match(/约\s*(\d+)\s*颗(?:左右)?/)
  if (approx && /左右|大约|约\s*\d+\s*颗左右/.test(s)) {
    return {
      beadsPerUnit: Number.parseInt(approx[1], 10),
      confidence: 'estimated',
      sizeMm,
      reason: `賣家標示「約 ${approx[1]} 顆」為估計值，建議收到貨後實際數過再修正`,
    }
  }

  // 標準顆數：*3颗 / 5颗装 / /10颗 / 10颗 / 3颗
  const exact = s.match(/(\d+)\s*颗/)
  if (exact) {
    const n = Number.parseInt(exact[1], 10)
    // 「约60颗」沒有「左右」也視為估計（數量大通常是整包估重）
    const isApprox = /约\s*\d+\s*颗/.test(s) && n >= 20
    return {
      beadsPerUnit: n,
      confidence: isApprox ? 'estimated' : 'parsed',
      sizeMm,
      reason: isApprox
        ? `賣家標示約 ${n} 顆（整包估算），建議實際數過再修正`
        : `解析為每件 ${n} 顆`,
    }
  }

  // 單顆計價：3.5mm/颗、/颗
  if (/\/\s*颗/.test(s)) {
    return {
      beadsPerUnit: 1,
      confidence: 'parsed',
      sizeMm,
      reason: '單顆計價，購買件數即為顆數',
    }
  }

  // 只有尺寸沒顆數：大号直径约7.5mm
  if (sizeMm !== null) {
    return {
      beadsPerUnit: 1,
      confidence: 'manual',
      sizeMm,
      reason: `只解析到直徑 ${sizeMm}mm，未標示顆數，顆數預設 1，請在試算表確認`,
    }
  }

  // 純款式編號：24款、56亮天蓝
  return {
    beadsPerUnit: 1,
    confidence: 'manual',
    sizeMm: null,
    reason: '規格僅為款式／顏色編號，未含顆數，顆數預設 1，請在試算表確認',
  }
}

/* ────────────────────────────────────────────────────────────
   材質分類
   ──────────────────────────────────────────────────────────── */

/**
 * 從淘寶商品名推導材質分類，供後台選珠時分組與篩選。
 *
 * 分類只有四種，刻意不細分——選珠時要的是快速縮小範圍，
 * 分太細反而每組只有一兩顆，失去分組意義。
 *
 * 判斷順序有意義：線材與金屬配件的商品名常含石材字樣
 * （例：「沙金隔珠diy手链水晶配件」），必須先於水晶／玉石判斷。
 */
export function inferCategory(rawTitle: string, rawSpec?: string | null): string {
  const t = `${rawTitle} ${rawSpec ?? ''}`.toLowerCase()

  // 金屬配件：沙金、銀、包金、隔片、花托、轉運珠
  // 必須先於線材判斷——這類商品名常含「编织绳」「手绳」等字樣
  // （例：「古法沙金转运珠…diy手工编织绳配饰挂件」是珠子，不是繩子）
  if (/沙金|925银|s925|银珠|包金|镀金|隔片|花托|转运珠|桶珠|水泡珠/.test(t)) return '金屬配件'

  // 線材：按長度計價，不是珠子
  if (/弹力线|扁丝|手串绳|线圈|绳项链/.test(t)) return '線材'

  // 玉石類：玉髓、瑪瑙、和田玉、曜石
  if (/玛瑙|玉髓|和田玉|碧玉|玉石|曜石|耀石/.test(t)) return '玉石'

  // 水晶類
  if (/水晶|晶|月光石|海蓝宝|珍珠|贝珠|石榴石|草莓|兔毛|塔晶/.test(t)) return '水晶'

  return '其他'
}
