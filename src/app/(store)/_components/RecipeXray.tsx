'use client'

import { useState } from 'react'
import type { RecipeBeadView } from '@/contracts/product'

/**
 * 配方透視 — 本站的 signature 元素（見 docs/05-DESIGN-SYSTEM.md）
 *
 * 把這條手串用到的每顆珠按「實際比例」畫成一排圓點，像一張設計圖。
 * 它不是裝飾：它揭露商品的真實構成，一般電商做不到，因為他們沒有配方資料。
 *
 * 圓點直徑對應真實 mm 數（6mm 的珠就是比 8mm 的小）。
 */

/**
 * 圓點直徑：以 6mm 畫成 24px 為基準。
 *
 * 不用直線比例。直線比例要嘛大珠爆版，要嘛小珠全部擠在下限——
 * 店主的料從 2.5mm 到 8.3mm 都有，2.5／3／3.5／4mm 會變成一樣大，
 * 「按實際大小畫」就不成立了。改成隨 mm 的 0.75 次方變化：
 * 小的那端分得出來，大的那端不會失控。
 */
const BASE_MM = 6
const BASE_PX = 24
const EXPONENT = 0.75
/** 看得見的最小直徑，與不讓單顆珠撐破版面的上限 */
const MIN_PX = 11
const MAX_PX = 52
/** 沒填尺寸時當成基準大小，才不會畫成一個點 */
const FALLBACK_MM = 6

function dotSize(sizeMm: number | null): number {
  const mm = sizeMm ?? FALLBACK_MM
  if (mm <= 0) return MIN_PX
  const px = BASE_PX * Math.pow(mm / BASE_MM, EXPONENT)
  return Math.round(Math.min(MAX_PX, Math.max(MIN_PX, px)))
}

/**
 * 珠名常常已經寫了尺寸（「月光石 6mm 藍月光」），再印一次會變成
 * 「月光石 6mm 藍月光 6mm」。名稱裡有了就不重複印。
 *
 * 必須是精確比對：單純用 includes 的話，珠名「白水晶 16mm」會被
 * sizeMm=6 誤判成「已經寫了」，尺寸就整個不見了。
 * 所以前面要求非數字、後面允許空格與大小寫。
 */
function sizeLabel(name: string, sizeMm: number | null): string {
  if (sizeMm === null) return ''
  const mm = String(sizeMm).replace(/\.0$/, '')
  // 名稱可能寫「6mm」也可能寫「6.0mm」，兩種都算已經寫了
  const escaped = `${mm.replace('.', '\\.')}(\\.0)?`
  const written = new RegExp(`(^|[^\\d.])${escaped}\\s*mm`, 'i').test(name)
  return written ? '' : `${mm}mm `
}

export default function RecipeXray({ recipe }: { recipe: RecipeBeadView[] }) {
  const [activeId, setActiveId] = useState<number | null>(null)

  if (recipe.length === 0) return null

  const active = recipe.find((b) => b.beadId === activeId) ?? null
  const totalBeads = recipe.reduce((sum, b) => sum + b.qty, 0)

  return (
    <section>
      <h2 className="mb-1 font-serif text-[15px] tracking-[0.2em] text-ink">配方透視</h2>
      <p className="mb-5 text-[12px] text-ink-soft">
        這條手串用了 {recipe.length} 種珠、共 {totalBeads} 顆，依實際大小畫出。點一顆看它是什麼。
      </p>

      {/* 珠子多時在自己的容器內橫向捲動，頁面本身不可橫向捲動 */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-h-[40px] items-center gap-[3px]">
          {recipe.flatMap((bead) =>
            Array.from({ length: bead.qty }, (_, i) => {
              const size = dotSize(bead.sizeMm)
              const isActive = bead.beadId === activeId
              return (
                <button
                  key={`${bead.beadId}-${i}`}
                  type="button"
                  onClick={() => setActiveId(isActive ? null : bead.beadId)}
                  aria-label={`${bead.name} 第 ${i + 1} 顆`}
                  aria-pressed={isActive}
                  className="shrink-0 rounded-full border border-hairline transition-opacity"
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    background: bead.colorHex ?? 'var(--color-sunk)',
                    opacity: activeId === null || isActive ? 1 : 0.3,
                  }}
                />
              )
            }),
          )}
        </div>
      </div>

      {/* 高度固定，點選時不會把下面的內容推走 */}
      <div className="mt-3 min-h-[3.4em] border-t border-hairline pt-3 text-[13px]">
        {active ? (
          <p>
            <span className="text-ink">{active.name}</span>
            <span className="tnum ml-2 text-ink-soft">
              {sizeLabel(active.name, active.sizeMm)}×{active.qty} 顆
            </span>
            {active.category && <span className="ml-2 text-ink-soft">{active.category}</span>}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-ink-soft">
            {recipe.map((b) => (
              <li key={b.beadId}>
                {b.name}
                <span className="tnum ml-1.5">
                  {sizeLabel(b.name, b.sizeMm)}×{b.qty}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
