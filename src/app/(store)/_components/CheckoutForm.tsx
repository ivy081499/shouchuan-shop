'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { placeOrderAction } from '../actions.ts'

/**
 * 結帳表單。
 *
 * **不強迫註冊**（ADR-0012 店主定案）：填完這幾欄就能送出，
 * 要不要加入會員留到下單成功頁再問。
 */
export default function CheckoutForm({ notice }: { notice: string | null }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await placeOrderAction(formData)
      if (result.ok) {
        router.push(`/order/${result.data.orderNo}?new=1`)
      } else {
        setError(result.error)
        /* 錯誤訊息在畫面最上方，手機上不捲回去會看不到 */
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="border border-alert px-4 py-3 text-[13px] text-alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="border border-hairline bg-sunk px-4 py-3 text-[13px] text-ink-soft">
          {notice}
        </p>
      )}

      <Field label="收件人姓名" name="customerName" required autoComplete="name" />
      <Field
        label="手機號碼"
        name="customerPhone"
        required
        inputMode="numeric"
        autoComplete="tel"
        placeholder="0912345678"
        hint="出貨與對帳用得到。"
      />
      <Field
        label="Email"
        name="customerEmail"
        type="email"
        autoComplete="email"
        hint="填了就會收到訂單確認信，裡面有匯款帳號。"
      />
      <Field
        label="收件地址"
        name="shippingAddress"
        required
        autoComplete="street-address"
        hint="請填完整地址，包含郵遞區號。"
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-ink">備註</span>
        <textarea
          name="customerNote"
          rows={3}
          maxLength={500}
          className="w-full border border-hairline bg-paper px-3 py-2 text-[14px] text-ink"
        />
        <span className="text-[12px] text-ink-soft">想換手圍、要包裝成禮物，都可以寫在這裡。</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="border border-ink bg-ink py-3 text-[13px] tracking-[0.2em] text-paper hover:border-accent hover:bg-accent disabled:opacity-50"
      >
        {pending ? '送出中' : '送出訂單'}
      </button>

      <p className="text-center text-[12px] leading-[1.9] text-ink-soft">
        送出訂單不會立刻扣款。下一頁會告訴你匯款帳號，
        <br />
        我收到款項後才會出貨。
      </p>
    </form>
  )
}

function Field({
  label,
  name,
  hint,
  type = 'text',
  ...rest
}: {
  label: string
  name: string
  hint?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink">
        {label}
        {rest.required && <span className="ml-1 text-ink-soft">必填</span>}
      </span>
      <input
        name={name}
        type={type}
        {...rest}
        className="w-full border border-hairline bg-paper px-3 py-2 text-[14px] text-ink"
      />
      {hint && <span className="text-[12px] text-ink-soft">{hint}</span>}
    </label>
  )
}
