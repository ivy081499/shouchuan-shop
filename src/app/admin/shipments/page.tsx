import { getDb } from '@/data/db'
import { listShipments, getPurchaseTotals } from '@/data/beads'
import { PageTitle, Money, Empty, Stat } from '@/ui'
import ShipmentList from './ShipmentList.tsx'

export const dynamic = 'force-dynamic'

/**
 * 進貨批次 —— 獨立頁面（店主 2026-10-26 要求，原本擠在庫存頁裡）。
 *
 * 這頁的重點是收貨：哪一批到了、哪幾項還沒到。
 * 貨收到打勾才會進庫存，所以這頁是庫存數字的來源。
 */
export default async function ShipmentsPage() {
  const db = await getDb()
  const [shipments, totals] = await Promise.all([listShipments(db), getPurchaseTotals(db)])

  const pendingItems = shipments.reduce((s, b) => s + (b.itemCount - b.receivedCount), 0)
  const pendingBatches = shipments.filter((b) => b.receivedCount < b.itemCount).length

  return (
    <>
      <PageTitle note="每批貨到了就來這裡打勾。打勾確認收到，顆數才會加進庫存。">
        進貨批次
      </PageTitle>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="批次"
          value={shipments.length}
          hint="累計進貨批數"
          explain="一批＝一次集中叫的貨（可能含多張淘寶訂單），清關時收一次關稅。"
        />
        <Stat
          label="還沒收到"
          value={pendingItems}
          alert={pendingItems > 0}
          hint={pendingBatches > 0 ? `分布在 ${pendingBatches} 批` : '全部到齊'}
          explain="還沒打勾確認收到的品項數。這些顆數還沒加進庫存，因為貨還沒到你手上。"
        />
        <Stat
          label="進貨總額"
          value={<Money cents={totals.totalTwdCents} showCents />}
          hint={`${totals.shipmentCount} 批・${totals.orderCount} 筆訂單`}
          explain="實際花掉的錢＝貨款＋關稅。錢在下單當下就付了，所以貨還沒到也照算。"
        />
        <Stat
          label="關稅"
          value={<Money cents={totals.dutyTwdCents} showCents />}
          hint="海關收的台幣"
          explain="一批貨清關收一次，依各品項金額比例攤到每顆珠的成本裡。"
        />
      </div>

      {shipments.length === 0 ? (
        <Empty
          title="還沒有進貨批次"
          hint="到「庫存」頁的「匯入進貨」上傳淘寶訂單，匯入後這裡就會出現批次。"
        />
      ) : (
        <ShipmentList shipments={shipments} />
      )}
    </>
  )
}
