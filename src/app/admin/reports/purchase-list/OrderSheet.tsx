'use client'

import { useState } from 'react'
import { Button, Money } from '@/ui'
import type { OrderSheetGroup } from '@/data/purchase-lists'
import { formatTWD } from '@/lib/money'

/**
 * 下單清單：依店鋪分組的純文字，可一鍵複製。
 * 淘寶要一家一家下單，跨店分開才能照著買。
 */
export default function OrderSheet({ groups }: { groups: OrderSheetGroup[] }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (groups.length === 0) return null

  const text = buildText(groups)
  const total = groups.reduce((s, g) => s + g.subtotalCents, 0)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 剪貼簿被拒時至少把文字選起來讓店主手動複製
      setCopied(false)
    }
  }

  return (
    <section className="mt-12 border-t border-hairline pt-8">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Button variant={open ? 'ghost' : 'primary'} onClick={() => setOpen(!open)}>
          {open ? '收起下單清單' : '產生下單清單'}
        </Button>

        {open && (
          <>
            <Button variant="ghost" onClick={copy}>
              {copied ? '已複製' : '複製全部'}
            </Button>
            <span className="text-[13px] text-ink-soft">
              {groups.length} 家店鋪　總計 <Money cents={total} />
            </span>
          </>
        )}
      </div>

      {open && (
        <>
          <div className="space-y-8">
            {groups.map((g) => (
              <div key={g.supplierId ?? 'none'}>
                <div className="mb-2 flex items-baseline justify-between border-b border-hairline pb-1.5">
                  <h3 className="font-serif text-base tracking-wider text-ink">{g.supplierName}</h3>
                  <span className="text-[13px] text-ink-soft">
                    小計 <Money cents={g.subtotalCents} />
                  </span>
                </div>

                <ul className="space-y-1.5 text-[13px]">
                  {g.lines.map((l, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-ink">{l.name}</span>
                      <span className="tnum text-ink">{l.qty} 顆</span>
                      {l.sourceSpec && <span className="text-ink-soft">{l.sourceSpec}</span>}
                      {l.sourceUrl && (
                        <a
                          href={l.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent underline underline-offset-2"
                        >
                          去買
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <details className="mt-8">
            <summary className="cursor-pointer text-[13px] text-ink-soft hover:text-accent">
              純文字版（貼到記事本或手機）
            </summary>
            <textarea
              readOnly
              value={text}
              rows={Math.min(30, text.split('\n').length + 1)}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-3 w-full border border-hairline bg-transparent p-3 font-mono text-[12px] leading-relaxed text-ink focus:border-accent focus:outline-none"
            />
          </details>
        </>
      )}
    </section>
  )
}

function buildText(groups: OrderSheetGroup[]): string {
  const out: string[] = []
  let total = 0

  for (const g of groups) {
    out.push(`───── ${g.supplierName} ─────`)
    for (const l of g.lines) {
      const parts = [l.name, `${l.qty} 顆`]
      if (l.sourceSpec) parts.push(l.sourceSpec)
      if (l.sourceUrl) parts.push(l.sourceUrl)
      out.push(parts.join('　'))
    }
    out.push(`小計 約 ${formatTWD(g.subtotalCents)}`)
    out.push('')
    total += g.subtotalCents
  }

  out.push(`總計 約 ${formatTWD(total)}`)
  return out.join('\n')
}
