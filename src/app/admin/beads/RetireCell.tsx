'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { archiveBead } from './actions.ts'

/**
 * 棄用／復原按鈕。
 *
 * 棄用的料不再出現在選料清單、採購需求也不提示補貨，
 * 但庫存價值與歷史成本照算——料還在手上，錢已經花了。
 *
 * 不做二次確認對話框：這個動作隨時可以按「復原」救回來，
 * 加一層確認只會讓每次操作都多點一下。
 */
export default function RetireCell({
  beadId,
  beadName,
  isArchived,
}: {
  beadId: number
  beadName: string
  isArchived: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [warn, setWarn] = useState(false)
  const router = useRouter()

  async function toggle() {
    setBusy(true)
    setWarn(false)
    const r = await archiveBead(beadId, !isArchived)
    setBusy(false)
    if (r.ok && r.inUse) setWarn(true)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        title={
          isArchived
            ? `讓「${beadName}」重新出現在選料清單`
            : `不再用「${beadName}」做新手串。庫存價值仍會算進報表，隨時可以復原。`
        }
        className={`border px-2 py-0.5 text-[12px] transition disabled:opacity-40 ${
          isArchived
            ? 'border-accent text-accent hover:bg-accent hover:text-paper'
            : 'border-hairline text-ink-soft hover:border-alert hover:text-alert'
        }`}
      >
        {busy ? '…' : isArchived ? '復原' : '棄用'}
      </button>
      {warn && (
        <span title="這顆珠還在某些手串的配方裡。配方不受影響，但建議找時間換料。" className="text-[12px] text-alert">
          配方使用中
        </span>
      )}
    </div>
  )
}
