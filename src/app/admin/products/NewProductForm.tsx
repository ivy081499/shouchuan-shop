'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createProductAction } from './actions.ts'
import { yuanToCents } from '@/lib/money'

/** 中文名稱轉網址代稱；純中文時用時間戳，店主可再改 */
function toSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  return ascii || `item-${Date.now().toString(36)}`
}

export default function NewProductForm() {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [wrist, setWrist] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createProductAction({
        slug: toSlug(name),
        name: name.trim(),
        // 留空＝還沒定價，存 0；上架前會擋下未定價的商品
        priceCents: price.trim() ? yuanToCents(price) : 0,
        wristSizeCm: wrist ? Number.parseFloat(wrist) : null,
        status: 'draft',
        sortOrder: 0,
      })
      if (!res.ok) setError(res.error)
      else {
        setName('')
        setPrice('')
        setWrist('')
        router.push(`/admin/products/${res.id}`)
      }
    })
  }

  return (
    <form onSubmit={submit} className="border border-hairline p-5">
      <div className="flex flex-wrap items-end gap-5">
        <label className="text-[13px]">
          <span className="block text-ink-soft">手串名稱</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：草莓晶 × 月光石"
            className="mt-1.5 w-56 border-b border-hairline bg-transparent py-1.5 focus:border-accent focus:outline-none"
          />
        </label>
        <label className="text-[13px]">
          <span className="block text-ink-soft">售價（可留空）</span>
          <input
            type="number"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="選完材料再填"
            className="mt-1.5 w-24 border-b border-hairline bg-transparent py-1.5 tnum focus:border-accent focus:outline-none"
          />
        </label>
        <label className="text-[13px]">
          <span className="block text-ink-soft">手圍 cm（可略）</span>
          <input
            type="number"
            step="0.5"
            value={wrist}
            onChange={(e) => setWrist(e.target.value)}
            placeholder="16.5"
            className="mt-1.5 w-24 border-b border-hairline bg-transparent py-1.5 tnum focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bg-ink px-5 py-2.5 text-[13px] tracking-wider text-paper hover:bg-accent disabled:opacity-50"
        >
          {pending ? '建立中…' : '新增手串'}
        </button>
      </div>
      {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
    </form>
  )
}
