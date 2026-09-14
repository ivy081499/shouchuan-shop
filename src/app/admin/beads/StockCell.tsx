'use client'

import { useState } from 'react'
import { adjustBeadStock } from './actions.ts'

/**
 * 庫存格。
 *
 * 庫存不能直接改數字——每次異動都必須留流水帳（資料模型不變量），
 * 所以這裡填的是「增減多少」，不是「改成多少」。
 */
export default function StockCell({
  beadId,
  stockQty,
  isLow,
}: {
  beadId: number
  stockQty: number
  isLow: boolean
}) {
  const [open, setOpen] = useState(false)
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [qty, setQty] = useState(stockQty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const n = Number.parseInt(delta, 10)
    if (!Number.isFinite(n) || n === 0) {
      setError('請填不為 0 的整數，例：-3 或 12')
      return
    }
    if (qty + n < 0) {
      setError(`庫存不能變成負數（現有 ${qty}）`)
      return
    }
    setBusy(true)
    setError(null)
    const res = await adjustBeadStock(beadId, n, note)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setQty(qty + n)
    setDelta('')
    setNote('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="點一下可調整庫存"
        className={`w-full text-right tnum underline decoration-hairline decoration-dotted underline-offset-4 hover:decoration-accent ${
          isLow ? 'text-alert' : 'text-ink'
        }`}
      >
        {qty}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 border border-hairline bg-paper p-3 shadow-sm">
          <p className="mb-2 text-[12px] text-ink-soft">
            填增減數量，不是填總數。例：進貨 +12、打碎 -3
          </p>
          <input
            autoFocus
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="+12 或 -3"
            className="w-full border-b border-hairline bg-transparent py-1 text-right tnum focus:border-accent focus:outline-none"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="原因（可略）"
            className="mt-2 w-full border-b border-hairline bg-transparent py-1 text-[12px] focus:border-accent focus:outline-none"
          />
          {error && <p className="mt-2 text-[11px] text-alert">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="bg-ink px-3 py-1.5 text-[12px] text-paper hover:bg-accent disabled:opacity-50"
            >
              {busy ? '調整中…' : '確定'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setError(null)
                setDelta('')
              }}
              className="px-2 text-[12px] text-ink-soft hover:text-ink"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
