'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteProductAction } from './actions.ts'

/**
 * 刪除手串，含二次確認。
 *
 * 不用 window.confirm——原生對話框樣式不受控，且會擋住整個分頁。
 * 這裡改成按鈕原地展開確認列，誤觸時按「取消」就好。
 *
 * 防呆的判斷在 server action（已上架、有訂單都不給刪），
 * 這裡只負責問一次並把錯誤訊息顯示出來。
 */
export default function DeleteProductButton({ id, name }: { id: number; name: string }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function remove() {
    setError(null)
    startTransition(async () => {
      const res = await deleteProductAction(id)
      if (!res.ok) {
        setError(res.error)
        setConfirming(false)
      } else {
        router.refresh()
      }
    })
  }

  if (error) {
    return (
      <div className="text-[12px] leading-relaxed">
        <p className="text-alert">{error}</p>
        <button
          type="button"
          onClick={() => setError(null)}
          className="mt-1 text-ink-soft underline underline-offset-2 hover:text-ink"
        >
          知道了
        </button>
      </div>
    )
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 text-[12px]">
        <span className="text-ink-soft">確定刪除？</span>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="bg-alert px-2 py-1 text-paper disabled:opacity-50"
        >
          {pending ? '刪除中…' : '確定刪除'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-ink-soft underline underline-offset-2 hover:text-ink"
        >
          取消
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title={`刪除「${name}」`}
      className="text-[12px] text-ink-soft underline underline-offset-2 hover:text-alert"
    >
      刪除
    </button>
  )
}
