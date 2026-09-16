'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setBeadStock } from './actions.ts'

/**
 * 庫存格：點一下直接填現在實際有幾顆。
 *
 * 填的是總數不是增減量——盤點時數完珠子直接填數字，不必心算差額。
 * 差額由 server action 算出後寫入 stock_ledger，帳仍然完整。
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
  const [editing, setEditing] = useState(false)
  const [qty, setQty] = useState(stockQty)
  const [draft, setDraft] = useState(String(stockQty))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  async function save() {
    const raw = draft.trim()
    if (raw === String(qty)) {
      setEditing(false)
      return
    }
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 0) {
      setError('填 0 或正整數')
      return
    }

    setBusy(true)
    setError(null)
    const res = await setBeadStock(beadId, n)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setQty(res.stockQty)
    setEditing(false)
    // 同列的「庫存值」與上方統計卡是 server 端算的，要重繪才會跟著變
    router.refresh()
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void save()
    } else if (e.key === 'Escape') {
      setDraft(String(qty))
      setError(null)
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(String(qty))
          setEditing(true)
        }}
        title="點一下可直接填現在有幾顆"
        className={`w-full text-right tnum underline decoration-hairline decoration-dotted underline-offset-4 hover:decoration-accent ${
          isLow ? 'text-alert' : 'text-ink'
        }`}
      >
        {qty}
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={onKey}
        disabled={busy}
        inputMode="numeric"
        className="w-16 border-b border-accent bg-transparent py-0.5 text-right tnum focus:outline-none disabled:opacity-50"
      />
      {error && <span className="text-[11px] text-alert">{error}</span>}
    </div>
  )
}
