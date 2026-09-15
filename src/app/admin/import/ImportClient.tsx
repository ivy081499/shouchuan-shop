'use client'

import { useState, useTransition } from 'react'
import { parseUpload, confirmImport, type ConfirmRow } from './actions.ts'
import type { ParsedPurchaseRow } from '@/lib/xlsx-import'
import { formatTWD, formatCNY } from '@/lib/money'
import { calcPurchaseCosts } from '@/lib/costing'
import { useColumnWidths, useColumnVisibility, ColumnResizer, ColumnToggles, type Column } from '@/ui/ResizableTable'

const CONFIDENCE_LABEL: Record<string, string> = {
  parsed: '已解析',
  estimated: '約數',
  manual: '要填',
}

/** 欄位定義。寬度可拖曳調整，會記在瀏覽器 */
const COLUMNS: Column[] = [
  { key: 'title', label: '商品（淘寶原文）', width: 260 },
  { key: 'spec', label: '規格', width: 200 },
  { key: 'amount', label: '金額', width: 90, align: 'right' },
  { key: 'qty', label: '件數', width: 60, align: 'right' },
  { key: 'beads', label: '每件顆數', width: 100, align: 'right', required: true },
  { key: 'state', label: '狀態', width: 80 },
  { key: 'cost', label: '單顆成本', width: 100, align: 'right' },
  { key: 'name', label: '珠子名稱（繁體）', width: 180 },
  { key: 'link', label: '淘寶連結', width: 80, align: 'center' },
  { key: 'skip', label: '略過', width: 60, align: 'center', required: true },
]

export default function ImportClient({ defaultFxRateX100 }: { defaultFxRateX100: number }) {
  const [rows, setRows] = useState<ParsedPurchaseRow[] | null>(null)
  const [confirms, setConfirms] = useState<ConfirmRow[]>([])
  const [fxRate, setFxRate] = useState(String(defaultFxRateX100 / 100))
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ createdBeads: number; updatedBeads: number; totalQty: number; orders: number } | null>(null)
  const [pending, startTransition] = useTransition()

  const { widths, persist, reset } = useColumnWidths('import', COLUMNS)
  const { hidden, toggle, visible } = useColumnVisibility('import', COLUMNS)

  const fxX100 = Math.round((Number.parseFloat(fxRate) || 0) * 100)

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const res = await parseUpload(fd)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setRows(res.rows)
    setConfirms(
      res.rows.map((r, i) => ({
        index: i,
        beadsPerUnit: r.beadsPerUnit,
        beadName: '',
        skip: false,
      })),
    )
  }

  function update(i: number, patch: Partial<ConfirmRow>) {
    setConfirms((cs) => cs.map((c) => (c.index === i ? { ...c, ...patch } : c)))
  }

  function onConfirm() {
    if (!rows) return
    setError(null)
    startTransition(async () => {
      const res = await confirmImport(rows, confirms, fxX100)
      if (!res.ok) setError(res.error)
      else {
        setDone(res)
        setRows(null)
      }
    })
  }

  /* 即時試算單顆成本，讓店主確認前就看得到數字 */
  function previewCost(i: number): number | null {
    if (!rows) return null
    const c = confirms.find((x) => x.index === i)
    if (!c?.beadsPerUnit || c.beadsPerUnit <= 0) return null
    const r = rows[i]
    const [cost] = calcPurchaseCosts(
      [{ unitPriceCnyCents: r.unitPriceCnyCents, quantity: r.quantity, beadsPerUnit: c.beadsPerUnit }],
      0,
      fxX100,
    )
    return cost.unitCostCents
  }

  if (done) {
    return (
      <div className="border border-hairline p-6">
        <p className="font-serif text-lg text-ink">匯入完成</p>
        <ul className="mt-3 space-y-1 text-[13px] text-ink-soft">
          <li>{done.orders} 張淘寶訂單</li>
          <li>新建 {done.createdBeads} 種珠子，更新 {done.updatedBeads} 種的成本</li>
          <li>入庫共 {done.totalQty} 顆</li>
        </ul>
        <div className="mt-5 flex gap-3">
          <a href="/admin/beads" className="bg-ink px-5 py-2.5 text-[13px] tracking-wider text-paper hover:bg-accent">
            看珠子成本
          </a>
          <button
            onClick={() => setDone(null)}
            className="border border-hairline px-5 py-2.5 text-[13px] tracking-wider text-ink hover:border-accent"
          >
            再匯入一份
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="mb-6 border-l-2 border-alert bg-alert/5 px-4 py-3 text-[13px]">{error}</div>
      )}

      {!rows && (
        <form onSubmit={onUpload} className="border border-hairline p-6">
          <label className="block text-[13px] text-ink-soft">
            淘寶訂單檔（.xlsx）
            <input
              type="file"
              name="file"
              accept=".xlsx"
              required
              className="mt-2 block w-full text-[13px] file:mr-4 file:border file:border-hairline file:bg-transparent file:px-4 file:py-2 file:text-[13px] file:text-ink"
            />
          </label>
          <p className="mt-3 text-[12px] text-ink-soft">
            淘寶網頁版 →「我的訂單」→ 匯出，下載回來的 订单数据.xlsx。
          </p>
          <button
            type="submit"
            className="mt-5 bg-ink px-5 py-2.5 text-[13px] tracking-wider text-paper hover:bg-accent"
          >
            讀取檔案
          </button>
        </form>
      )}

      {rows && (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-6 border border-hairline p-5">
            <label className="text-[13px]">
              <span className="block text-ink-soft">匯率（1 人民幣 = ? 台幣）</span>
              <input
                type="number"
                step="0.01"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                className="mt-1.5 w-28 border-b border-hairline bg-transparent py-1.5 tnum focus:border-accent focus:outline-none"
              />
            </label>
            <p className="text-[12px] text-ink-soft">
              改匯率下方成本會即時重算。運費已按各訂單金額比例攤提。
            </p>
          </div>

          <p className="mb-3 text-[13px] text-ink-soft">
            共 {rows.length} 列。<strong className="text-ink">請逐列確認「每件顆數」</strong>
            ——標「要填」的解析不出來，標「約數」的是賣家估計值，建議收到貨實際數過。
          </p>

          <div className="mb-3 flex flex-wrap items-center gap-3">
            <ColumnToggles columns={COLUMNS} hidden={hidden} onToggle={toggle} />
            <span className="text-[12px] text-ink-soft">
              欄寬可拖曳調整（雙擊邊界還原）。「略過」用於彈力線、包裝盒這類不是珠子的品項。
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="border-collapse text-[13px]" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                {visible.map((c) => (
                  <col key={c.key} style={{ width: widths[c.key] }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {visible.map((c) => (
                    <th
                      key={c.key}
                      className={`relative border-b border-hairline pb-2.5 pr-3 font-normal text-ink-soft ${
                        c.align === 'right'
                          ? 'text-right'
                          : c.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                      }`}
                    >
                      <span className="block truncate">{c.label}</span>
                      <ColumnResizer
                        onDrag={(dx) =>
                          persist({
                            ...widths,
                            [c.key]: Math.max(c.minWidth ?? 60, widths[c.key] + dx),
                          })
                        }
                        onReset={() => reset(c.key)}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const c = confirms.find((x) => x.index === i)!
                  const cost = previewCost(i)
                  const needsInput = r.countSource === 'manual'
                  const cells: Record<string, React.ReactNode> = {
                    title: (
                      <>
                        <span className="block truncate" title={r.rawTitle}>
                          {r.rawTitle}
                        </span>
                        <span className="block truncate text-[11px] text-ink-soft">
                          {r.supplierName}
                        </span>
                      </>
                    ),
                    spec: (
                      <span className="block truncate" title={r.rawSpec}>
                        {r.rawSpec || '—'}
                      </span>
                    ),
                    amount: formatCNY(r.unitPriceCnyCents),
                    qty: r.quantity,
                    beads: (
                      <input
                        type="number"
                        min={1}
                        value={c.beadsPerUnit ?? ''}
                        disabled={c.skip}
                        onChange={(e) =>
                          update(i, {
                            beadsPerUnit: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                          })
                        }
                        className={`w-full border-b bg-transparent py-1 text-right tnum focus:outline-none ${
                          needsInput && !c.beadsPerUnit
                            ? 'border-alert'
                            : 'border-hairline focus:border-accent'
                        }`}
                      />
                    ),
                    state: (
                      <span
                        className={
                          r.countSource === 'manual'
                            ? 'text-alert'
                            : r.countSource === 'estimated'
                              ? 'text-accent'
                              : 'text-ink-soft'
                        }
                        title={r.parseReason}
                      >
                        {CONFIDENCE_LABEL[r.countSource]}
                      </span>
                    ),
                    cost: cost !== null ? formatTWD(cost, true) : '—',
                    name: (
                      <input
                        type="text"
                        placeholder="留空用淘寶原名"
                        value={c.beadName}
                        disabled={c.skip}
                        onChange={(e) => update(i, { beadName: e.target.value })}
                        className="w-full border-b border-hairline bg-transparent py-1 focus:border-accent focus:outline-none"
                      />
                    ),
                    link: r.rawUrl ? (
                      <a
                        href={r.rawUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline underline-offset-2"
                        title={r.rawUrl}
                      >
                        看商品
                      </a>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    ),
                    skip: (
                      <input
                        type="checkbox"
                        checked={c.skip}
                        onChange={(e) => update(i, { skip: e.target.checked })}
                      />
                    ),
                  }

                  return (
                    <tr key={i} className={c.skip ? 'opacity-40' : ''}>
                      {visible.map((col) => (
                        <td
                          key={col.key}
                          className={`border-b border-hairline py-2 pr-3 ${
                            col.align === 'right'
                              ? 'text-right tnum'
                              : col.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                          }`}
                        >
                          {cells[col.key]}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={onConfirm}
              disabled={pending}
              className="bg-ink px-6 py-2.5 text-[13px] tracking-wider text-paper hover:bg-accent disabled:opacity-50"
            >
              {pending ? '寫入中…' : '確認並寫入庫存'}
            </button>
            <button
              onClick={() => setRows(null)}
              className="border border-hairline px-5 py-2.5 text-[13px] tracking-wider text-ink hover:border-accent"
            >
              取消
            </button>
            <span className="text-[12px] text-ink-soft">
              將匯入 {confirms.filter((c) => !c.skip && c.beadsPerUnit).length} 列
            </span>
          </div>
        </>
      )}
    </>
  )
}
