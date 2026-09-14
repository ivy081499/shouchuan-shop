'use client'

import { useState } from 'react'

/**
 * 庫存頁的分頁籤。
 *
 * 「看庫存」與「進貨入庫」是同一件事的兩面，拆兩頁反而要來回切換。
 * 用 state 而非路由，切換時不重新載入資料。
 */
export default function InventoryTabs({
  list,
  importer,
}: {
  list: React.ReactNode
  importer: React.ReactNode
}) {
  const [tab, setTab] = useState<'list' | 'import'>('list')

  return (
    <>
      <div className="mb-6 flex border-b border-hairline">
        {(
          [
            ['list', '庫存清單'],
            ['import', '匯入進貨'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-current={tab === k ? 'page' : undefined}
            className={`-mb-px border-b-2 px-5 py-2.5 text-[13px] tracking-wider transition ${
              tab === k
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div hidden={tab !== 'list'}>{list}</div>
      <div hidden={tab !== 'import'}>{importer}</div>
    </>
  )
}
