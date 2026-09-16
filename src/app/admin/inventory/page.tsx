import { getDb } from '@/data/db'
import { listBeads, listCategories, getPurchaseTotals } from '@/data/beads'
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
  const [beads, categories, fxRows, totals] = await Promise.all([
    listBeads(db),
    listCategories(db),
    db.select().from(settings).where(eq(settings.key, 'default_fx_rate_x100')).limit(1),
    getPurchaseTotals(db),
  ])
  const fx = Number.parseInt(fxRows[0]?.value ?? '450', 10)

  const totalQty = beads.reduce((s, b) => s + b.stockQty, 0)
  // 安全庫存為 0 代表不提醒，要排除
  const lowStock = beads.filter((b) => b.reorderPoint > 0 && b.stockQty <= b.reorderPoint)
  const hasReorderPoint = beads.some((b) => b.reorderPoint > 0)

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
          sourceTitle: b.sourceTitle,
          sourceSpec: b.sourceSpec,
          sourceUrl: b.sourceUrl,
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
          value={beads.length}
          hint="不含已封存"
          explain="目前有幾種不同的珠子。同一種珠子不論進貨幾次都只算一種。"
        />
        <Stat
          label="總顆數"
          value={totalQty}
          hint="所有珠子加總"
          explain="所有珠子現有庫存顆數相加。做手串會扣，進貨會加。"
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
          hint={`${totals.batches} 批進貨`}
          explain="實際花費總額＝貨款＋關稅。貨款是已確認進貨單的金額加總（含運費），人民幣直接相加、台幣用每批當時匯率各自換算；關稅是海關收的台幣，不經匯率換算，一批貨清關收一次。這是「總共花了多少錢叫貨」，不會因為珠子用掉而減少。"
        />
        <Stat
          label="低於安全庫存"
          value={lowStock.length}
          alert={lowStock.length > 0}
          hint={
            !hasReorderPoint
              ? '尚未設定任何門檻'
              : lowStock.length > 0
                ? '到採購需求看要叫多少'
                : '目前充足'
          }
          explain="安全庫存是你自己設的補貨提醒線：設 10 就代表剩 10 顆以下要補貨。在下方清單的「安全庫存」欄點一下即可設定，留 0 表示不提醒。目前還沒設定任何門檻時，這個數字永遠是 0。"
        />
      </div>

      <InventoryTabs list={list} importer={<ImportClient defaultFxRateX100={fx} />} />
    </>
  )
}
