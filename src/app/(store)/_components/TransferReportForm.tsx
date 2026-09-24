'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reportTransferAction } from '../actions.ts'

/**
 * 客人匯款後回報末五碼。
 *
 * 只問末五碼與日期：店主對帳時看的是銀行明細，
 * 有這兩個就對得起來，問全帳號只是多蒐集個資。
 */
export default function TransferReportForm({ orderNo }: { orderNo: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await reportTransferAction(formData)
      if (result.ok) router.refresh()
      else setError(result.error)
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="orderNo" value={orderNo} />

      {error && (
        <p role="alert" className="border border-alert px-4 py-3 text-[13px] text-alert">
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-ink">轉帳帳號末五碼</span>
        <input
          name="transferLast5"
          inputMode="numeric"
          maxLength={5}
          required
          placeholder="12345"
          className="tnum w-40 border border-hairline bg-paper px-3 py-2 text-[14px] text-ink"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-ink">轉帳日期</span>
        <input
          name="transferredAt"
          type="date"
          required
          className="tnum w-48 border border-hairline bg-paper px-3 py-2 text-[14px] text-ink"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="self-start border border-ink px-8 py-2.5 text-[13px] tracking-[0.2em] text-ink hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {pending ? '送出中' : '我匯款了'}
      </button>
    </form>
  )
}
