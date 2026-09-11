import { getDb } from '@/data/db'
import { getPurchasingReport } from '@/data/reports'
import { PageTitle, Table, Th, Td, Money, Empty, Stat } from '@/ui'

export const dynamic = 'force-dynamic'

/**
 * 採購需求表 — 店主最重要的報表
 *
 * 「依目前客戶下單的手串，我應該要有多少珠、還要叫多少貨、店家是誰」
 * 依店鋪分組，可以照著一家一家下單。
 */
export default async function PurchasingPage({
  searchParams,
}: {
  searchParams: Promise<{ unpaid?: string }>
}) {
  const params = await searchParams
  const includeUnpaid = params.unpaid === '1'

  const db = await getDb()
  const report = await getPurchasingReport(db, includeUnpaid)

  const totalBeads = report.groups.reduce(
    (s, g) => s + g.lines.reduce((ls, l) => ls + l.shortageQty, 0),
    0,
  )

  return (
    <>
      <PageTitle note="依未出貨訂單展開配方，扣掉現有庫存，算出還要跟哪家店叫多少貨。">
        採購需求
      </PageTitle>

      <div className="mb-6 flex flex-wrap items-center gap-4 text-[13px]">
        <a
          href={includeUnpaid ? '?' : '?unpaid=1'}
          className="border border-hairline px-4 py-2 text-ink-soft hover:border-accent hover:text-accent"
        >
          {includeUnpaid ? '✓ 已納入未付款訂單' : '納入未付款訂單'}
        </a>
        <span className="text-ink-soft">
          目前計入 {report.orderCount} 張未出貨訂單
          {includeUnpaid ? '（含尚未轉帳的）' : '（不含尚未轉帳的）'}
        </span>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="要叫貨的品項" value={report.groups.reduce((s, g) => s + g.lines.length, 0)} />
        <Stat label="總顆數" value={totalBeads} />
        <Stat
          label="預估花費"
          value={<Money cents={report.totalEstimatedCostCents} />}
          hint="以目前單顆成本估算"
        />
      </div>

      {report.groups.length === 0 ? (
        <Empty
          title="目前不需要叫貨"
          hint={
            report.orderCount === 0
              ? '還沒有未出貨的訂單。等訂單進來後，這裡會列出該補的珠子。'
              : '現有庫存足夠完成所有未出貨訂單。'
          }
        />
      ) : (
        <div className="space-y-12">
          {report.groups.map((g) => (
            <section key={g.supplierId ?? 'none'}>
              <div className="mb-3 flex items-baseline justify-between border-b border-hairline pb-2">
                <h2 className="font-serif text-lg tracking-wider text-ink">{g.supplierName}</h2>
                <span className="text-[13px] text-ink-soft">
                  小計 <Money cents={g.subtotalCostCents} />
                </span>
              </div>

              <Table>
                <thead>
                  <tr>
                    <Th>珠子</Th>
                    <Th align="right">尺寸</Th>
                    <Th align="right">訂單需求</Th>
                    <Th align="right">現有庫存</Th>
                    <Th align="right">要叫</Th>
                    <Th align="right">預估金額</Th>
                    <Th>淘寶規格</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={l.beadId}>
                      <Td>{l.beadName}</Td>
                      <Td align="right" numeric>
                        {l.sizeMm ? `${l.sizeMm}mm` : '—'}
                      </Td>
                      <Td align="right" numeric>
                        {l.requiredQty}
                      </Td>
                      <Td align="right" numeric>
                        {l.stockQty}
                      </Td>
                      <Td align="right" numeric alert>
                        {l.shortageQty}
                      </Td>
                      <Td align="right" numeric>
                        <Money cents={l.estimatedCostCents} />
                      </Td>
                      <Td>
                        <span className="text-ink-soft">{l.sourceSpec ?? '—'}</span>
                      </Td>
                      <Td>
                        {l.sourceUrl && (
                          <a
                            href={l.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent underline underline-offset-2"
                          >
                            去買
                          </a>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
