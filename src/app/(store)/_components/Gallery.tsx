'use client'

import { useState } from 'react'

/** 商品照片，多張時下方可切換 */
export default function Gallery({
  images,
  productName,
}: {
  images: Array<{ url: string; alt: string | null }>
  productName: string
}) {
  const [index, setIndex] = useState(0)

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center bg-sunk text-[11px] tracking-[0.2em] text-ink-soft">
        準備中
      </div>
    )
  }

  const current = images[Math.min(index, images.length - 1)]

  return (
    <div>
      <div className="aspect-square overflow-hidden bg-sunk">
        <img
          src={current.url}
          alt={current.alt ?? productName}
          className="h-full w-full object-cover"
        />
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`看第 ${i + 1} 張照片`}
              aria-current={i === index}
              className={`h-14 w-14 overflow-hidden border ${
                i === index ? 'border-accent' : 'border-hairline'
              }`}
            >
              <img
                src={img.url}
                alt=""
                loading="lazy"
                className={`h-full w-full object-cover ${i === index ? '' : 'opacity-60'}`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
