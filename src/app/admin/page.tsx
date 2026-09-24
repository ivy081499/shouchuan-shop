import Link from 'next/link'
import { getDb } from '@/data/db'
import { listBeads } from '@/data/beads'
import { getInventoryReport } from '@/data/reports'
import { getPurchasingReportFixed } from './reports/purchasing/purchasing.ts'
import { countOrdersByStatus } from '@/data/orders'
import { PageTitle, Stat, Money, Empty } from '@/ui'
import { ORDER_STATUS_LABEL, type OrderStatusValue } from '@/contracts/order'

export const dynamic = 'force-dynamic'

export default async function AdminHome() {
  const db = await getDb()
  const [beads, purchasing, inventory, orderCounts] = await Promise.all([
    listBeads(db),
    /*
     * 用修正版（見 reports/purchasing/purchasing.ts）：
     * 凍結層會把已扣過料的訂單重複算進需求，數字會多一倍。
     *
     * 第二個參數是「未付款訂單也算進來」。店主 2026-09-24 指示
     * 庫存不足不擋下單之後，新訂單絕大多數都還沒轉帳，傳 false 的話
     * 這裡會顯示「庫存足夠」，實際上料早就不夠了。
     * 採購需求頁的預設也一致，否則兩邊數字對不起來。
     */
    getPurchasingReportFixed(db, true),
    getInventoryReport(db),
    countOrdersByStatus(db),
  ])

  const pendingConfirm = orderCounts.find((o) => o.status === 'payment_reported')?.count ?? 0
  const toShip = orderCounts.find((o) => o.status === 'paid')?.count ?? 0
  const shortageItems = purchasing.groups.reduce((s, g) => s + g.lines.length, 0)

  /*
   * 欠料＝庫存已經是負的，代表賣出去的量超過手上的料。
   * `getInventoryReport()` 的 isLow 只看安全庫存（那是凍結檔，不能改），
   * 沒設安全庫存的珠子就算欠到負的也不會被標記，所以這裡自己算一次。
   */
  const owedCount = beads.filter((b) => !b.isArchived && b.stockQty < 0).length

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
              href="/admin/inventory"
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
              hint={
                owedCount > 0
                  ? `其中 ${owedCount} 種已經欠料`
                  : shortageItems > 0
                    ? '看採購需求'
                    : '庫存足夠'
              }
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

            <Link href="/admin/inventory" className="border border-hairline p-5 hover:border-accent">
              <div className="font-serif text-base tracking-wider text-ink">珠子</div>
              <p className="mt-1.5 text-[13px] text-ink-soft">
                {owedCount > 0
                  ? `${owedCount} 種已經欠料，要盡快補`
                  : inventory.lowStockCount > 0
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
