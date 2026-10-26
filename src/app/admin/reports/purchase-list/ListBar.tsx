'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Alert } from '@/ui'
import {
  createListAction,
  renameListAction,
  markOrderedAction,
  reopenListAction,
  deleteListAction,
  fillShortagesAction,
} from './actions'
import type { PurchaseListStatus } from '@db/schema'

interface ListRow {
  id: number
  name: string
  status: PurchaseListStatus
  itemCount: number
  totalQty: number
}

interface Props {
  lists: ListRow[]
  currentId: number
  currentName: string
  currentStatus: PurchaseListStatus
  shortage: { count: number; basis: 'reorder' | 'thin' }
}

const STATUS_LABEL: Record<PurchaseListStatus, string> = {
  draft: '編輯中',
  ordered: '已下單',
  closed: '已結案',
}

export default function ListBar({
  lists,
  currentId,
  currentName,
  currentStatus,
  shortage,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  function run(fn: () => Promise<{ ok: boolean; error?: string; filled?: number }>) {
    startTransition(async () => {
      const r = await fn()
      if (!r.ok) {
        setMsg(r.error ?? '操作失敗')
        return
      }
      setMsg(r.filled != null ? `帶入 ${r.filled} 項缺貨` : null)
      router.refresh()
    })
  }

  return (
    <div className="mb-6 space-y-4">
      {msg && <Alert>{msg}</Alert>}

      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <select
          value={currentId}
          onChange={(e) => router.push(`?list=${e.target.value}`)}
          aria-label="選擇清單"
          className="border border-hairline bg-transparent px-3 py-2 text-ink focus:border-accent focus:outline-none"
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}（{l.itemCount} 項 / {l.totalQty} 顆）
              {l.status !== 'draft' ? ` · ${STATUS_LABEL[l.status]}` : ''}
            </option>
          ))}
        </select>

        <span className="text-ink-soft">{STATUS_LABEL[currentStatus]}</span>

        <Button variant="ghost" onClick={() => setCreating(!creating)} disabled={pending}>
          新建清單
        </Button>

        <Button variant="ghost" onClick={() => setRenaming(!renaming)} disabled={pending}>
          改名
        </Button>

        {currentStatus === 'draft' ? (
          <Button
            variant="ghost"
            onClick={() => run(() => markOrderedAction(currentId))}
            disabled={pending}
          >
            標記已下單
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => run(() => reopenListAction(currentId))}
            disabled={pending}
          >
            改回編輯中
          </Button>
        )}

        {lists.length > 1 && (
          <Button
            variant="ghost"
            onClick={() => {
              if (!confirm(`刪除「${currentName}」？清單內容會一起消失。`)) return
              run(async () => {
                const r = await deleteListAction(currentId)
                router.push('?')
                return r
              })
            }}
            disabled={pending}
          >
            刪除清單
          </Button>
        )}
      </div>

      {creating && (
        <div className="flex flex-wrap items-center gap-3 border border-hairline px-4 py-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="清單名稱，例：2026-11 擺攤補貨"
            autoFocus
            className="min-w-[14rem] flex-1 border border-hairline bg-transparent px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
          />
          <Button
            onClick={() =>
              run(async () => {
                const r = await createListAction(newName)
                if (r.ok) {
                  setCreating(false)
                  setNewName('')
                  router.push(`?list=${r.listId}`)
                }
                return r
              })
            }
            disabled={pending}
          >
            建立
          </Button>
        </div>
      )}

      {renaming && (
        <div className="flex flex-wrap items-center gap-3 border border-hairline px-4 py-3">
          <input
            type="text"
            defaultValue={currentName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            className="min-w-[14rem] flex-1 border border-hairline bg-transparent px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
          />
          <Button
            onClick={() =>
              run(async () => {
                const r = await renameListAction(currentId, newName || currentName)
                if (r.ok) setRenaming(false)
                return r
              })
            }
            disabled={pending}
          >
            儲存
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => run(() => fillShortagesAction(currentId))}
          disabled={pending || shortage.count === 0}
        >
          一鍵帶入缺貨品項
        </Button>
        <span className="text-[13px] text-ink-soft">
          {shortage.count === 0
            ? '目前沒有需要補的品項'
            : shortage.basis === 'reorder'
              ? `目前 ${shortage.count} 項低於安全庫存，建議補到安全庫存的兩倍`
              : `還沒設安全庫存，改用「主石不足 8 顆」判斷：${shortage.count} 項太薄，建議各補到 20 顆`}
        </span>
      </div>
    </div>
  )
}
