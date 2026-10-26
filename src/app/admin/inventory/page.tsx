import { getDb } from '@/data/db'
import { listBeads, listCategories, getPurchaseTotals } from '@/data/beads'
import { getInventoryReport } from '@/data/reports'
import { settings } from '@db/schema'
import { eq } from 'drizzle-orm'
import { PageTitle, Money, Empty, Stat } from '@/ui'
import { formatCNY } from '@/lib/money'
import BeadsTable from '../beads/BeadsTable.tsx'
import ImportClient from '../import/ImportClient.tsx'
import InventoryTabs from './InventoryTabs.tsx'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const db = await getDb()
  const [beads, categories, fxRows, totals, inventory] = await Promise.all([
    // 連棄用的一起撈，由表格的「已棄用」篩選決定顯示哪些
    listBeads(db, { includeArchived: true }),
    listCategories(db),
    db.select().from(settings).where(eq(settings.key, 'default_fx_rate_x100')).limit(1),
    getPurchaseTotals(db),
    getInventoryReport(db),
  ])
  const fx = Number.parseInt(fxRows[0]?.value ?? '450', 10)

  /** 上方統計只看還在用的料；棄用的不列入品項數與補貨提醒 */
  const active = beads.filter((b) => !b.isArchived)
  const totalQty = active.reduce((s, b) => s + b.stockQty, 0)
  // 安全庫存為 0 代表不提醒，要排除
  const lowStock = active.filter((b) => b.reorderPoint > 0 && b.stockQty <= b.reorderPoint)
  const hasReorderPoint = active.some((b) => b.reorderPoint > 0)

  /*
   * 低庫存裡有幾種「其實已經叫貨了、只是還沒到」。
   * 2026-10-26 起貨到才入庫，不標示的話會重複下單（稽核漏洞 C）。
   */
  const inTransitByBead = new Map(inventory.lines.map((l) => [l.beadId, l.inTransitQty]))
  const lowButOrdered = lowStock.filter((b) => (inTransitByBead.get(b.id) ?? 0) > 0).length
  const totalInTransit = inventory.lines.reduce((s, l) => s + l.inTransitQty, 0)

  const list =
    beads.length === 0 ? (
      <Empty
        title="還沒有珠子"
        hint="切到「匯入進貨」上傳淘寶訂單，系統會自動算出每顆的成本。"
      />
    ) : (
      <BeadsTable
        categories={categories}
        beads={beads.map((b) => ({
          id: b.id,
          name: b.name,
          category: b.category,
          sizeMm: b.sizeMm,
          imageUrl: b.imageUrl,
          unitCostCents: b.unitCostCents,
          stockQty: b.stockQty,
          reorderPoint: b.reorderPoint,
          supplierName: b.supplierName,
          colorFamily: b.colorFamily,
          sourceTitle: b.sourceTitle,
          sourceSpec: b.sourceSpec,
          sourceUrl: b.sourceUrl,
          isArchived: b.isArchived,
        }))}
      />
    )

  return (
    <>
      <PageTitle note="珠子的成本、庫存與進貨，都在這裡。成本由進貨自動計算，不必手動維護。">
        庫存
      </PageTitle>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="品項"
          value={active.length}
          hint="不含已封存"
          explain="目前有幾種不同的珠子。同一種珠子不論進貨幾次都只算一種。"
        />
        <Stat
          label="總顆數"
          value={totalQty}
          sub={
            totalInTransit > 0 ? (
              <span className="text-accent">另有 {totalInTransit} 顆在路上</span>
            ) : undefined
          }
          hint="所有珠子加總"
          explain="所有珠子現有庫存顆數相加。做手串會扣，收貨確認會加。已經下單但還沒收到的貨不算在裡面——要等你在「進貨批次」打勾確認收到才會加進來。"
        />
        <Stat
          label="進貨總額"
          value={<Money cents={totals.totalTwdCents} showCents />}
          sub={
            <>
              貨款 <Money cents={totals.twdCents} showCents />
              <span className="text-ink-soft">（{formatCNY(totals.cnyCents)}）</span>
              <br />
              關稅 <Money cents={totals.dutyTwdCents} showCents />
            </>
          }
          hint={`${totals.shipmentCount} 批進貨・${totals.orderCount} 筆訂單`}
          explain="實際花費總額＝貨款＋關稅。貨款是已確認進貨單的金額加總（含運費），人民幣直接相加、台幣用每批當時匯率各自換算；關稅是海關收的台幣，不經匯率換算，一批貨清關收一次。這是「總共花了多少錢叫貨」，不會因為珠子用掉而減少。"
        />
        <Stat
          label="低於安全庫存"
          value={lowStock.length}
          alert={lowStock.length > 0}
          sub={
            lowButOrdered > 0 ? (
              <span className="text-accent">其中 {lowButOrdered} 種已經叫貨了，還沒到</span>
            ) : undefined
          }
          hint={
            !hasReorderPoint
              ? '尚未設定任何門檻'
              : lowStock.length > 0
                ? '到採購需求看要叫多少'
                : '目前充足'
          }
          explain="安全庫存是你自己設的補貨提醒線：設 10 就代表剩 10 顆以下要補貨。在下方清單的「安全庫存」欄點一下即可設定，留 0 表示不提醒。目前還沒設定任何門檻時，這個數字永遠是 0。注意：已經下單但還沒收到的貨不算庫存，所以可能會看到「已經叫貨了」的提示——那表示不用再買一次。"
        />
      </div>

      <InventoryTabs list={list} importer={<ImportClient defaultFxRateX100={fx} />} />
    </>
  )
}
