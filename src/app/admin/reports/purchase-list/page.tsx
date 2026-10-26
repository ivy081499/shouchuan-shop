import { getDb } from '@/data/db'
import {
  listPurchaseLists,
  ensureDefaultList,
  getPurchaseList,
  listBeadsForPicker,
  getListTotals,
  getOrderSheet,
  getFilterOptions,
  countShortages,
  type SortKey,
} from '@/data/purchase-lists'
import { PageTitle, Stat, Money } from '@/ui'
import PickerTable from './PickerTable'
import OrderSheet from './OrderSheet'
import Filters from './Filters'
import ListBar from './ListBar'

export const dynamic = 'force-dynamic'

const SORT_KEYS: SortKey[] = [
  'name',
  'category',
  'size',
  'stock',
  'reorder',
  'cost',
  'qty',
  'subtotal',
  'supplier',
]

/**
 * 採購清單 — 店主主動挑貨
 *
 * 與「採購需求」的分工：
 *   採購需求 = 訂單要我叫什麼（訂單驅動，零客戶時空白）
 *   採購清單 = 我想補什麼（店主主動挑，跨 session 留存）
 */
export default async function PurchaseListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const db = await getDb()

  // 清單：網址沒指定就用最近編輯的草稿，沒有草稿就建一張
  const lists = await listPurchaseLists(db)
  const wantedId = num(sp.list)
  const current =
    (wantedId != null ? await getPurchaseList(db, wantedId) : null) ??
    (lists[0] ? await getPurchaseList(db, lists[0].id) : null) ??
    (await ensureDefaultList(db))

  const filter = {
    keyword: str(sp.q),
    categories: arr(sp.cat),
    supplierIds: arr(sp.sup)
      .map((v) => parseInt(v, 10))
      .filter((n) => !Number.isNaN(n)),
    onlyShortage: sp.shortage === '1',
    onlySelected: sp.selected === '1',
    onlyWithUrl: sp.hasurl === '1',
    sizeMin: num(sp.sizeMin),
    sizeMax: num(sp.sizeMax),
    sort: sortKey(sp.sort),
    dir: sp.dir === 'desc' ? ('desc' as const) : ('asc' as const),
  }

  const [rows, totals, orderSheet, options, shortage] = await Promise.all([
    listBeadsForPicker(db, current.id, filter),
    getListTotals(db, current.id),
    getOrderSheet(db, current.id),
    getFilterOptions(db),
    countShortages(db),
  ])

  // 目前條件（不含 sort/dir），交給表格組排序連結。
  // 傳字串而非函式——函式無法跨 server/client 邊界。
  const base = new URLSearchParams()
  if (sp.list) base.set('list', String(sp.list))
  if (filter.keyword) base.set('q', filter.keyword)
  for (const c of filter.categories) base.append('cat', c)
  for (const s of filter.supplierIds) base.append('sup', String(s))
  if (filter.onlyShortage) base.set('shortage', '1')
  if (filter.onlySelected) base.set('selected', '1')
  if (filter.onlyWithUrl) base.set('hasurl', '1')
  if (filter.sizeMin != null) base.set('sizeMin', String(filter.sizeMin))
  if (filter.sizeMax != null) base.set('sizeMax', String(filter.sizeMax))

  return (
    <>
      <PageTitle note="自己挑要補哪些珠子，存起來，照著一家一家下單。訂單驅動的缺貨請看「採購需求」。">
        採購清單
      </PageTitle>

      <ListBar
        lists={lists}
        currentId={current.id}
        currentName={current.name}
        currentStatus={current.status}
        shortage={shortage}
      />

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="已選品項" value={totals.itemCount} />
        <Stat label="總顆數" value={totals.totalQty} />
        <Stat
          label="預估花費"
          value={<Money cents={totals.totalCents} />}
          hint="以目前單顆成本估算，不含運費與關稅"
        />
      </div>

      <Filters
        categories={options.categories}
        suppliers={options.suppliers}
        current={{
          keyword: filter.keyword,
          categories: filter.categories,
          supplierIds: filter.supplierIds,
          onlyShortage: filter.onlyShortage,
          onlySelected: filter.onlySelected,
          onlyWithUrl: filter.onlyWithUrl,
          sizeMin: filter.sizeMin,
          sizeMax: filter.sizeMax,
        }}
      />

      <PickerTable
        listId={current.id}
        rows={rows}
        sort={filter.sort}
        dir={filter.dir}
        baseQuery={base.toString()}
      />

      <OrderSheet groups={orderSheet} />
    </>
  )
}

/* ── searchParams 解析 ── */

function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s?.trim() || undefined
}

function num(v: string | string[] | undefined): number | undefined {
  const s = str(v)
  if (s == null) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function arr(v: string | string[] | undefined): string[] {
  if (v == null) return []
  return (Array.isArray(v) ? v : [v]).filter(Boolean)
}

function sortKey(v: string | string[] | undefined): SortKey {
  const s = str(v)
  return SORT_KEYS.includes(s as SortKey) ? (s as SortKey) : 'name'
}
