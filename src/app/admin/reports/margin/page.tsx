import { getDb } from '@/data/db'
import { getMarginReport, getBuildableReport } from '@/data/reports'
import { PageTitle, Table, Th, Td, Money, Empty, Stat } from '@/ui'

export const dynamic = 'force-dynamic'

export default async function MarginPage() {
  const db = await getDb()
  const [report, buildable] = await Promise.all([getMarginReport(db), getBuildableReport(db)])

  return (
    <>
      <PageTitle note="已收款訂單的實際毛利。成本用下單當時的快照，不隨日後珠價變動。">
        毛利
      </PageTitle>

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="營收" value={<Money cents={report.totalRevenueCents} />} hint={`${report.orderCount} 張訂單`} />
        <Stat label="材料成本" value={<Money cents={report.totalCostCents} />} />
        <Stat label="毛利" value={<Money cents={report.totalProfitCents} />} />
        <Stat
          label="毛利率"
          value={`${Math.round(report.overallMarginRate * 100)}%`}
          alert={report.overallMarginRate < 0.3 && report.orderCount > 0}
        />
      </div>

      {report.lines.length === 0 ? (
        <Empty
          title="還沒有已收款的訂單"
          hint="確認收款後的訂單會出現在這裡，並算出每條手串實際賺多少。"
        />
      ) : (
        <div className="mb-12">
          <h2 className="mb-3 font-serif text-lg tracking-wider text-ink">各商品毛利</h2>
          <Table>
            <thead>
              <tr>
                <Th>手串</Th>
                <Th align="right">售出</Th>
                <Th align="right">營收</Th>
                <Th align="right">成本</Th>
                <Th align="right">毛利</Th>
                <Th align="right">毛利率</Th>
              </tr>
            </thead>
            <tbody>
              {report.lines.map((l) => (
                <tr key={`${l.productId}-${l.productName}`}>
                  <Td>{l.productName}</Td>
                  <Td align="right" numeric>{l.soldQty}</Td>
                  <Td align="right" numeric><Money cents={l.revenueCents} /></Td>
                  <Td align="right" numeric><Money cents={l.costCents} /></Td>
                  <Td align="right" numeric><Money cents={l.profitCents} /></Td>
                  <Td align="right" numeric alert={l.marginRate < 0.3}>
                    {Math.round(l.marginRate * 100)}%
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {buildable.length > 0 && (
        <div>
          <h2 className="mb-3 font-serif text-lg tracking-wider text-ink">還能做幾條</h2>
          <p className="mb-3 text-[13px] text-ink-soft">
            依現有庫存計算。「卡住的珠子」是最先用完的那一種。
          </p>
          <Table>
            <thead>
              <tr>
                <Th>手串</Th>
                <Th align="right">可做</Th>
                <Th>卡住的珠子</Th>
              </tr>
            </thead>
            <tbody>
              {buildable.map((b) => (
                <tr key={b.productId}>
                  <Td>{b.productName}</Td>
                  <Td align="right" numeric alert={b.buildableQty === 0}>
                    {b.buildableQty}
                  </Td>
                  <Td>{b.limitingBeadName ?? '未設配方'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </>
  )
}
