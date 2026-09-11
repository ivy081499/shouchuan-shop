import Link from 'next/link'
import { getDb } from '@/data/db'
import { listBeads } from '@/data/beads'
import { PageTitle, Table, Th, Td, Money, Empty, Stat } from '@/ui'

export const dynamic = 'force-dynamic'

export default async function BeadsPage() {
  const db = await getDb()
  const beads = await listBeads(db)

  const totalValue = beads.reduce((s, b) => s + b.stockQty * b.unitCostCents, 0)
  const lowStock = beads.filter((b) => b.reorderPoint > 0 && b.stockQty <= b.reorderPoint)

  return (
    <>
      <PageTitle note="每一顆珠的成本與庫存。成本由進貨自動計算，不必手動維護。">珠子</PageTitle>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="品項" value={beads.length} hint="不含已封存" />
        <Stat label="庫存總值" value={<Money cents={totalValue} />} hint="庫存顆數 × 單顆成本" />
        <Stat
          label="低於安全庫存"
          value={lowStock.length}
          alert={lowStock.length > 0}
          hint={lowStock.length > 0 ? '看採購需求表' : '目前充足'}
        />
      </div>

      {beads.length === 0 ? (
        <Empty
          title="還沒有珠子"
          hint="從淘寶訂單匯入，系統會自動算出每顆的成本。"
          action={
            <Link
              href="/admin/import"
              className="inline-block bg-ink px-5 py-2.5 text-[13px] tracking-[0.1em] text-paper hover:bg-accent"
            >
              匯入淘寶訂單
            </Link>
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>名稱</Th>
              <Th>分類</Th>
              <Th align="right">尺寸</Th>
              <Th align="right">單顆成本</Th>
              <Th align="right">庫存</Th>
              <Th align="right">安全庫存</Th>
              <Th align="right">庫存值</Th>
              <Th>供應商</Th>
            </tr>
          </thead>
          <tbody>
            {beads.map((b) => {
              const isLow = b.reorderPoint > 0 && b.stockQty <= b.reorderPoint
              return (
                <tr key={b.id}>
                  <Td>{b.name}</Td>
                  <Td>{b.category ?? '—'}</Td>
                  <Td align="right" numeric>
                    {b.sizeMm ? `${b.sizeMm}mm` : '—'}
                  </Td>
                  <Td align="right" numeric>
                    <Money cents={b.unitCostCents} showCents />
                  </Td>
                  <Td align="right" numeric alert={isLow}>
                    {b.stockQty}
                  </Td>
                  <Td align="right" numeric>
                    {b.reorderPoint || '—'}
                  </Td>
                  <Td align="right" numeric>
                    <Money cents={b.stockQty * b.unitCostCents} />
                  </Td>
                  <Td>{b.supplierName ?? '—'}</Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </>
  )
}
