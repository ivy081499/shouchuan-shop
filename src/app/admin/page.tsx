import Link from 'next/link'
import { getDb } from '@/data/db'
import { listBeads } from '@/data/beads'
import { getPurchasingReport, getInventoryReport } from '@/data/reports'
import { countOrdersByStatus } from '@/data/orders'
import { PageTitle, Stat, Money, Empty } from '@/ui'
import { ORDER_STATUS_LABEL, type OrderStatusValue } from '@/contracts/order'

export const dynamic = 'force-dynamic'

export default async function AdminHome() {
  const db = await getDb()
  const [beads, purchasing, inventory, orderCounts] = await Promise.all([
    listBeads(db),
    getPurchasingReport(db, false),
    getInventoryReport(db),
    countOrdersByStatus(db),
  ])

  const pendingConfirm = orderCounts.find((o) => o.status === 'payment_reported')?.count ?? 0
  const toShip = orderCounts.find((o) => o.status === 'paid')?.count ?? 0
  const shortageItems = purchasing.groups.reduce((s, g) => s + g.lines.length, 0)

  const isEmpty = beads.length === 0

  return (
    <>
      <PageTitle note="今天要處理的事。">總覽</PageTitle>

      {isEmpty ? (
        <Empty
          title="系統是空的"
          hint="先匯入淘寶訂單建立珠子成本，再建手串的配方，報表就會自己算出來。"
          action={
            <Link
              href="/admin/import"
              className="inline-block bg-ink px-5 py-2.5 text-[13px] tracking-[0.1em] text-paper hover:bg-accent"
            >
              從匯入淘寶訂單開始
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="待確認收款"
              value={pendingConfirm}
              alert={pendingConfirm > 0}
              hint={pendingConfirm > 0 ? '客戶已回報轉帳' : '沒有待處理'}
            />
            <Stat label="待出貨" value={toShip} hint={toShip > 0 ? '已收款' : '沒有待處理'} />
            <Stat
              label="要叫貨品項"
              value={shortageItems}
              alert={shortageItems > 0}
              hint={shortageItems > 0 ? '看採購需求' : '庫存足夠'}
            />
            <Stat
              label="庫存總值"
              value={<Money cents={inventory.totalStockValueCents} />}
              hint={`${beads.length} 種珠子`}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Link
              href="/admin/reports/purchasing"
              className="border border-hairline p-5 hover:border-accent"
            >
              <div className="font-serif text-base tracking-wider text-ink">採購需求</div>
              <p className="mt-1.5 text-[13px] text-ink-soft">
                {shortageItems > 0
                  ? `${shortageItems} 項要叫貨，預估 ${'NT$' + Math.round(purchasing.totalEstimatedCostCents / 100).toLocaleString()}`
                  : '目前庫存足夠應付未出貨訂單'}
              </p>
            </Link>

            <Link href="/admin/beads" className="border border-hairline p-5 hover:border-accent">
              <div className="font-serif text-base tracking-wider text-ink">珠子</div>
              <p className="mt-1.5 text-[13px] text-ink-soft">
                {inventory.lowStockCount > 0
                  ? `${inventory.lowStockCount} 種低於安全庫存`
                  : `${beads.length} 種，庫存充足`}
              </p>
            </Link>
          </div>
        </>
      )}
    </>
  )
}
