'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { uploadBeadImage, clearBeadImage } from './actions.ts'

/**
 * 珠子圖片格。
 *
 * 有圖：點縮圖開燈箱看大圖，換圖與移除都在燈箱裡——
 *       列表上的縮圖太小，看不出珠子長相，放大才是主要需求。
 * 沒圖：直接點開檔案選擇，少一次點擊。
 */
export default function BeadImageCell({
  beadId,
  name,
  initialUrl,
}: {
  beadId: number
  name: string
  initialUrl: string | null
}) {
  const [url, setUrl] = useState(initialUrl)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  // Esc 關燈箱；開啟時鎖住背景捲動
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  function pick() {
    inputRef.current?.click()
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const fd = new FormData()
    fd.set('file', file)
    startTransition(async () => {
      const res = await uploadBeadImage(beadId, fd)
      if (res.ok) setUrl(res.url)
      else setError(res.error)
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  function onClear() {
    setError(null)
    startTransition(async () => {
      await clearBeadImage(beadId)
      setUrl(null)
      setOpen(false)
    })
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (url ? setOpen(true) : pick())}
          disabled={pending}
          title={url ? '點開看大圖' : '上傳圖片'}
          className="h-11 w-11 shrink-0 overflow-hidden border border-hairline bg-sunk transition hover:border-accent disabled:opacity-50"
        >
          {url ? (
            // 圖片來源含外部網址（淘寶），next/image 需設定網域，故用原生 img
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={name} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] leading-tight text-ink-soft">
              {pending ? '…' : '＋圖'}
            </span>
          )}
        </button>
        {error && <span className="text-[11px] text-alert">{error}</span>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onPick}
        className="hidden"
      />

      {open && url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${name} 的圖片`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6"
        >
          {/* 內層吃掉點擊，才不會一碰到圖就關掉 */}
          <div onClick={(e) => e.stopPropagation()} className="max-h-full w-full max-w-2xl bg-paper p-5">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2 className="font-serif text-lg text-ink">{name}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[13px] text-ink-soft hover:text-ink"
              >
                關閉 ✕
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={name}
              className="max-h-[65vh] w-full bg-sunk object-contain"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={pick}
                disabled={pending}
                className="border border-hairline px-4 py-2 text-[13px] text-ink hover:border-accent disabled:opacity-50"
              >
                {pending ? '上傳中…' : '換一張圖'}
              </button>
              <button
                type="button"
                onClick={onClear}
                disabled={pending}
                className="text-[13px] text-ink-soft underline hover:text-alert disabled:opacity-50"
              >
                移除圖片
              </button>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-[12px] text-ink-soft underline hover:text-ink"
              >
                原圖另開
              </a>
            </div>

            {error && <p className="mt-3 text-[13px] text-alert">{error}</p>}
          </div>
        </div>
      )}
    </>
  )
}
