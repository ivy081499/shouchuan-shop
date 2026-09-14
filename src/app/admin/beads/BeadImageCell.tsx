'use client'

import { useRef, useState, useTransition } from 'react'
import { uploadBeadImage, clearBeadImage } from './actions.ts'

/**
 * 珠子圖片格：有圖顯示縮圖，沒圖顯示占位方塊。
 * 點一下就能換圖——挑珠子時最需要的是快，不要多一層對話框。
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
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

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
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        title={url ? '換一張圖' : '上傳圖片'}
        className="relative h-11 w-11 shrink-0 overflow-hidden border border-hairline bg-sunk disabled:opacity-50"
      >
        {url ? (
          // 圖片來源有外部網址（淘寶）也有本機路徑，next/image 需要額外設定網域，故用原生 img
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] leading-tight text-ink-soft">
            {pending ? '…' : '＋圖'}
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onPick}
        className="hidden"
      />

      {url && !pending && (
        <button
          type="button"
          onClick={onClear}
          title="移除圖片"
          className="text-[11px] text-ink-soft underline hover:text-alert"
        >
          移除
        </button>
      )}

      {error && <span className="text-[11px] text-alert">{error}</span>}
    </div>
  )
}
