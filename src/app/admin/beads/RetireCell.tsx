'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { archiveBead, getBeadUsage } from './actions.ts'

interface Usage {
  productId: number
  productName: string
  qty: number
}

/**
 * 棄用／復原按鈕。
 *
 * 棄用的料不再出現在選料清單、採購需求也不提示補貨，
 * 但庫存價值與歷史成本照算——料還在手上，錢已經花了。
 *
 * 棄用一定先跳確認，並列出這顆料還被哪幾條手串用著，
 * 讓店主自己判斷要不要繼續。復原不問——那是把東西救回來。
 *
 * 確認框自己畫，不用瀏覽器的 confirm()：原生對話框會凍結整個分頁，
 * 也塞不進「哪幾條手串在用」這種說明。
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
  const [asking, setAsking] = useState(false)
  const [usage, setUsage] = useState<Usage[] | null>(null)
  const router = useRouter()

  /** 按下「棄用」：先查用途再跳確認，不直接生效 */
  async function ask() {
    setBusy(true)
    const rows = await getBeadUsage(beadId)
    setUsage(rows)
    setBusy(false)
    setAsking(true)
  }

  async function confirm() {
    setBusy(true)
    await archiveBead(beadId, true)
    setBusy(false)
    setAsking(false)
    router.refresh()
  }

  /** 復原不必確認——這是把料救回來，不是破壞性動作 */
  async function restore() {
    setBusy(true)
    await archiveBead(beadId, false)
    setBusy(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={isArchived ? restore : ask}
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

      {asking && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`棄用 ${beadName}`}
          onClick={() => setAsking(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-paper p-6 text-left"
          >
            <h2 className="font-serif text-lg text-ink">棄用「{beadName}」？</h2>

            <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
              之後<strong className="text-ink">選料清單不會再出現它</strong>，
              採購需求也不再提示補貨。
              <br />
              但<strong className="text-ink">庫存價值與成本仍照算</strong>——料還在你手上。
            </p>

            {usage && usage.length > 0 && (
              <div className="mt-4 border-l-2 border-alert bg-alert/5 px-4 py-3">
                <div className="text-[13px] text-ink">
                  這顆料還在 {usage.length} 條手串的配方裡：
                </div>
                <ul className="mt-2 space-y-1 text-[13px] text-ink-soft">
                  {usage.map((u) => (
                    <li key={u.productId}>
                      ・{u.productName}（用 <span className="tnum">{u.qty}</span> 顆）
                    </li>
                  ))}
                </ul>
                <div className="mt-2.5 text-[12px] text-ink-soft">
                  這些配方不會被更動，成本照算，只會標示「已棄用」提醒你找時間換料。
                </div>
              </div>
            )}

            {usage && usage.length === 0 && (
              <div className="mt-4 text-[13px] text-ink-soft">
                目前沒有任何手串用到它。
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAsking(false)}
                disabled={busy}
                className="border border-hairline px-5 py-2 text-[13px] text-ink hover:border-accent disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="bg-ink px-5 py-2 text-[13px] text-paper hover:bg-alert disabled:opacity-50"
              >
                {busy ? '處理中…' : '確定棄用'}
              </button>
            </div>

            <p className="mt-3 text-right text-[12px] text-ink-soft">
              隨時可以到「已棄用」分頁按復原。
            </p>
          </div>
        </div>
      )}
    </>
  )
}
