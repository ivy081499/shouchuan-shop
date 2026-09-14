'use client'

import { useEffect, useRef, useState } from 'react'
import { updateBeadFields, type BeadPatch } from './actions.ts'

type Field = 'name' | 'category' | 'sizeMm' | 'reorderPoint'

/**
 * 行內可編輯格。
 *
 * 點一下變輸入框，Enter 或失焦儲存，Esc 取消。
 * 挑珠子時常要順手改名或改分類，跳頁編輯會打斷流程。
 */
export default function EditableCell({
  beadId,
  field,
  value,
  options,
  placeholder = '—',
  align = 'left',
}: {
  beadId: number
  field: Field
  value: string | number | null
  /** 給定則渲染為下拉選單（分類用），可自行輸入新值 */
  options?: string[]
  placeholder?: string
  align?: 'left' | 'right'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const [shown, setShown] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setShown(value)
    setDraft(String(value ?? ''))
  }, [value])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function save() {
    const raw = draft.trim()
    // 沒改就直接收起來，不打 server
    if (raw === String(shown ?? '')) {
      setEditing(false)
      return
    }

    const patch: BeadPatch = {}
    if (field === 'name') {
      if (!raw) {
        setError('名稱不可空白')
        return
      }
      patch.name = raw
    } else if (field === 'category') {
      patch.category = raw
    } else if (field === 'sizeMm') {
      // 線材類沒有直徑，允許清空
      patch.sizeMm = raw === '' ? null : Number.parseFloat(raw)
      if (patch.sizeMm !== null && !Number.isFinite(patch.sizeMm)) {
        setError('尺寸要填數字')
        return
      }
    } else {
      const n = raw === '' ? 0 : Number.parseInt(raw, 10)
      if (!Number.isFinite(n)) {
        setError('安全庫存要填整數')
        return
      }
      patch.reorderPoint = n
    }

    setSaving(true)
    setError(null)
    const res = await updateBeadFields(beadId, patch)
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setShown(
      field === 'sizeMm'
        ? (patch.sizeMm ?? null)
        : field === 'reorderPoint'
          ? (patch.reorderPoint ?? 0)
          : raw,
    )
    setEditing(false)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void save()
    } else if (e.key === 'Escape') {
      setDraft(String(shown ?? ''))
      setError(null)
      setEditing(false)
    }
  }

  const alignCls = align === 'right' ? 'text-right' : 'text-left'

  if (!editing) {
    const display =
      shown === null || shown === '' ? placeholder : field === 'sizeMm' ? `${shown}mm` : String(shown)
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="點一下可修改"
        className={`w-full ${alignCls} ${
          shown === null || shown === '' ? 'text-ink-soft' : 'text-ink'
        } underline decoration-hairline decoration-dotted underline-offset-4 hover:decoration-accent`}
      >
        {display}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        list={options ? `cat-${beadId}` : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={onKey}
        disabled={saving}
        inputMode={field === 'sizeMm' || field === 'reorderPoint' ? 'decimal' : undefined}
        className={`w-full border-b border-accent bg-transparent py-0.5 ${alignCls} focus:outline-none disabled:opacity-50`}
      />
      {options && (
        <datalist id={`cat-${beadId}`}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
      {error && <span className="text-[11px] text-alert">{error}</span>}
    </div>
  )
}
