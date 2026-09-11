'use client'

import { useState, useTransition } from 'react'
import { parseUpload, confirmImport, type ConfirmRow } from './actions.ts'
import type { ParsedPurchaseRow } from '@/lib/xlsx-import'
import { formatTWD, formatCNY } from '@/lib/money'
import { calcPurchaseCosts } from '@/lib/costing'

const CONFIDENCE_LABEL: Record<string, string> = {
  parsed: '已解析',
  estimated: '約數',
  manual: '要填',
}

export default function ImportClient({ defaultFxRateX100 }: { defaultFxRateX100: number }) {
  const [rows, setRows] = useState<ParsedPurchaseRow[] | null>(null)
  const [confirms, setConfirms] = useState<ConfirmRow[]>([])
  const [fxRate, setFxRate] = useState(String(defaultFxRateX100 / 100))
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ createdBeads: number; updatedBeads: number; totalQty: number; orders: number } | null>(null)
  const [pending, startTransition] = useTransition()

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

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="border-b border-hairline pb-2.5 pr-3 text-left font-normal text-ink-soft">商品（淘寶原文）</th>
                  <th className="border-b border-hairline pb-2.5 pr-3 text-left font-normal text-ink-soft">規格</th>
                  <th className="border-b border-hairline pb-2.5 pr-3 text-right font-normal text-ink-soft">金額</th>
                  <th className="border-b border-hairline pb-2.5 pr-3 text-right font-normal text-ink-soft">件數</th>
                  <th className="border-b border-hairline pb-2.5 pr-3 text-right font-normal text-ink-soft">每件顆數</th>
                  <th className="border-b border-hairline pb-2.5 pr-3 text-left font-normal text-ink-soft">狀態</th>
                  <th className="border-b border-hairline pb-2.5 pr-3 text-right font-normal text-ink-soft">單顆成本</th>
                  <th className="border-b border-hairline pb-2.5 pr-3 text-left font-normal text-ink-soft">珠子名稱（繁體）</th>
                  <th className="border-b border-hairline pb-2.5 text-center font-normal text-ink-soft">略過</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const c = confirms.find((x) => x.index === i)!
                  const cost = previewCost(i)
                  const needsInput = r.countSource === 'manual'
                  return (
                    <tr key={i} className={c.skip ? 'opacity-40' : ''}>
                      <td className="border-b border-hairline py-2 pr-3">
                        <span className="block max-w-[240px] truncate" title={r.rawTitle}>
                          {r.rawTitle}
                        </span>
                        <span className="text-[11px] text-ink-soft">{r.supplierName}</span>
                      </td>
                      <td className="border-b border-hairline py-2 pr-3">
                        <span className="block max-w-[180px] truncate" title={r.rawSpec}>
                          {r.rawSpec || '—'}
                        </span>
                      </td>
                      <td className="border-b border-hairline py-2 pr-3 text-right tnum">
                        {formatCNY(r.unitPriceCnyCents)}
                      </td>
                      <td className="border-b border-hairline py-2 pr-3 text-right tnum">{r.quantity}</td>
                      <td className="border-b border-hairline py-2 pr-3 text-right">
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
                          className={`w-20 border-b bg-transparent py-1 text-right tnum focus:outline-none ${
                            needsInput && !c.beadsPerUnit
                              ? 'border-alert'
                              : 'border-hairline focus:border-accent'
                          }`}
                        />
                      </td>
                      <td className="border-b border-hairline py-2 pr-3">
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
                      </td>
                      <td className="border-b border-hairline py-2 pr-3 text-right tnum">
                        {cost !== null ? formatTWD(cost, true) : '—'}
                      </td>
                      <td className="border-b border-hairline py-2 pr-3">
                        <input
                          type="text"
                          placeholder="留空用淘寶原名"
                          value={c.beadName}
                          disabled={c.skip}
                          onChange={(e) => update(i, { beadName: e.target.value })}
                          className="w-40 border-b border-hairline bg-transparent py-1 focus:border-accent focus:outline-none"
                        />
                      </td>
                      <td className="border-b border-hairline py-2 text-center">
                        <input
                          type="checkbox"
                          checked={c.skip}
                          onChange={(e) => update(i, { skip: e.target.checked })}
                        />
                      </td>
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
