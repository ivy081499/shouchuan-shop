'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { updateBeadFields, type BeadPatch } from './actions.ts'

type Field = 'name' | 'category' | 'sizeMm' | 'reorderPoint'

/**
 * 行內可編輯格。
 *
 * 點一下變輸入框，Enter 或失焦儲存，Esc 取消。
 * 挑珠子時常要順手改名或改分類，跳頁編輯會打斷流程。
 *
 * 給定 options 時渲染成可搜尋的下拉（分類用）：
 * 清單裡有的直接點選，沒有的直接打字就是新分類。
 * 不用原生 <datalist>——各家瀏覽器的觸發方式不一致，
 * 常常點了沒反應，看起來像壞掉。
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
  /** 給定則渲染為可搜尋下拉，同時允許輸入清單外的新值 */
  options?: string[]
  placeholder?: string
  align?: 'left' | 'right'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const [shown, setShown] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)
  /** 使用者是否動過輸入框——剛點開時顯示全部選項，不要被現值過濾掉 */
  const [touched, setTouched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  /** 點選項時會先觸發 blur，用這個旗標避免 blur 搶先關閉 */
  const pickingRef = useRef(false)

  useEffect(() => {
    setShown(value)
    setDraft(String(value ?? ''))
  }, [value])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  /** 依輸入即時過濾；空字串顯示全部 */
  const matches = useMemo(() => {
    if (!options) return []
    const q = touched ? draft.trim().toLowerCase() : ''
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options
    return list.slice(0, 8)
  }, [options, draft, touched])

  const isNewValue =
    !!options && touched && draft.trim() !== '' && !options.some((o) => o === draft.trim())

  useEffect(() => {
    setHighlight(0)
  }, [draft])

  async function commit(raw: string) {
    const v = raw.trim()
    if (v === String(shown ?? '')) {
      setEditing(false)
      return
    }

    const patch: BeadPatch = {}
    if (field === 'name') {
      if (!v) {
        setError('名稱不可空白')
        return
      }
      patch.name = v
    } else if (field === 'category') {
      // 空字串代表清除分類，server action 會存成 null
      patch.category = v
    } else if (field === 'sizeMm') {
      patch.sizeMm = v === '' ? null : Number.parseFloat(v)
      if (patch.sizeMm !== null && !Number.isFinite(patch.sizeMm)) {
        setError('尺寸要填數字')
        return
      }
    } else {
      const n = v === '' ? 0 : Number.parseInt(v, 10)
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
          : v,
    )
    setEditing(false)
  }

  function pick(v: string) {
    pickingRef.current = true
    setDraft(v)
    void commit(v)
  }

  function onKey(e: React.KeyboardEvent) {
    if (options && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const max = matches.length - 1
      setHighlight((h) => (e.key === 'ArrowDown' ? Math.min(h + 1, max) : Math.max(h - 1, 0)))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      // 有反白的選項就用它，否則用目前輸入的文字（＝新分類）
      const hit = options && !isNewValue ? matches[highlight] : undefined
      void commit(hit ?? draft)
    } else if (e.key === 'Escape') {
      setDraft(String(shown ?? ''))
      setError(null)
      setEditing(false)
    }
  }

  function onBlur() {
    // 點選項時 blur 會先發生，讓 pick 自己完成
    if (pickingRef.current) {
      pickingRef.current = false
      return
    }
    void commit(draft)
  }

  const alignCls = align === 'right' ? 'text-right' : 'text-left'

  if (!editing) {
    const display =
      shown === null || shown === '' ? placeholder : field === 'sizeMm' ? `${shown}mm` : String(shown)
    return (
      <button
        type="button"
        onClick={() => {
          setTouched(false)
          setEditing(true)
        }}
        title={`${display}　（點一下可修改）`}
        className={`block w-full truncate ${alignCls} ${
          shown === null || shown === '' ? 'text-ink-soft' : 'text-ink'
        } underline decoration-hairline decoration-dotted underline-offset-4 hover:decoration-accent`}
      >
        {display}
      </button>
    )
  }

  return (
    <div ref={boxRef} className="relative flex flex-col gap-1">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setTouched(true)
        }}
        onBlur={onBlur}
        onKeyDown={onKey}
        disabled={saving}
        placeholder={options ? '選一個或直接打新的' : undefined}
        inputMode={field === 'sizeMm' || field === 'reorderPoint' ? 'decimal' : undefined}
        className={`w-full border-b border-accent bg-transparent py-0.5 ${alignCls} focus:outline-none disabled:opacity-50`}
      />

      {options && !saving && (
        <div className="absolute left-0 top-7 z-30 min-w-[10rem] border border-hairline bg-paper py-1 shadow-sm">
          {matches.map((o, i) => (
            <button
              key={o}
              type="button"
              // 用 mouseDown 而非 click——click 在 blur 之後才發生，會來不及
              onMouseDown={() => pick(o)}
              onMouseEnter={() => setHighlight(i)}
              className={`block w-full px-3 py-1 text-left text-[13px] ${
                i === highlight ? 'bg-sunk text-ink' : 'text-ink-soft'
              }`}
            >
              {o}
            </button>
          ))}

          {isNewValue && (
            <button
              type="button"
              onMouseDown={() => pick(draft.trim())}
              className="block w-full border-t border-hairline px-3 py-1 text-left text-[13px] text-accent"
            >
              新增「{draft.trim()}」
            </button>
          )}

          {matches.length === 0 && !isNewValue && (
            <p className="px-3 py-1 text-[12px] text-ink-soft">清空分類</p>
          )}
        </div>
      )}

      {error && <span className="text-[11px] text-alert">{error}</span>}
    </div>
  )
}
