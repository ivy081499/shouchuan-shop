import { getDb } from '@/data/db'
import { listOrders, expandOrderToBeadDemand, getOrderItems } from '@/data/orders'
import { beads } from '@db/schema'
import { inArray } from 'drizzle-orm'
import { PageTitle, Table, Th, Td, Money, Empty } from '@/ui'
import { ORDER_STATUS_LABEL, type OrderStatusValue } from '@/contracts/order'
import OrderRow from './OrderRow.tsx'

export const dynamic = 'force-dynamic'

function formatDate(unixSec: number): string {
  const d = new Date(unixSec * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 超賣檢查：這張訂單現在的庫存還做得出來嗎？
 *
 * 店主 2026-09-24 指示前台「庫存不足完全不擋」，客人想買幾條就買幾條。
 * 安全網因此全部落在這裡——缺料的訂單要讓店主一眼看到，才知道要補做。
 *
 * 只檢查還沒扣庫存的訂單：已扣過的料已經拿走了，再比一次沒有意義。
 */
async function findOversold(
  db: Awaited<ReturnType<typeof getDb>>,
  orders: Array<{ id: number; stockDeducted: boolean | number }>,
): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>()

  for (const o of orders) {
    if (o.stockDeducted) continue

    const items = await getOrderItems(db, o.id)
    const demand = await expandOrderToBeadDemand(
      db,
      items.map((i) => ({ productId: i.productId, qty: i.qty })),
    )
    if (demand.size === 0) continue

    const rows = await db
      .select({ id: beads.id, name: beads.name, stockQty: beads.stockQty })
      .from(beads)
      .where(inArray(beads.id, [...demand.keys()]))

    const short = rows
      .filter((b) => b.stockQty < (demand.get(b.id) ?? 0))
      .map((b) => `${b.name}（要 ${demand.get(b.id)} 顆，剩 ${b.stockQty}）`)

    if (short.length > 0) result.set(o.id, short)
  }

  return result
}

export default async function OrdersPage() {
  const db = await getDb()
  const orders = await listOrders(db)
  const oversold = await findOversold(db, orders)

  return (
    <>
      <PageTitle note="客戶訂單與收款狀態。點一下任一筆訂單，可以看到當時用了哪些料、成本多少。">
        訂單
      </PageTitle>

      {orders.length === 0 ? (
        <Empty
          title="還沒有訂單"
          hint="客人在自建前台下單後，訂單會直接出現在這裡。點開任一筆可以確認收款、填物流單號。"
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>訂單編號</Th>
              <Th>客戶</Th>
              <Th>狀態</Th>
              <Th align="right">金額</Th>
              <Th>轉帳末五碼</Th>
              <Th>下單時間</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <OrderRow
                key={o.id}
                orderId={o.id}
                orderNo={o.orderNo}
                status={o.status as OrderStatusValue}
                stockDeducted={Boolean(o.stockDeducted)}
                shippingAddress={o.shippingAddress}
                customerPhone={o.customerPhone}
                customerNote={o.customerNote}
                trackingNo={o.trackingNo}
                colSpan={6}
              >
                <Td>{o.orderNo}</Td>
                <Td>{o.customerName}</Td>
                <Td>
                  {ORDER_STATUS_LABEL[o.status as OrderStatusValue]}
                  {/* 缺料的訂單標紅：前台不擋超賣，全靠這裡讓店主看見 */}
                  {oversold.has(o.id) && (
                    <span
                      title={`料不夠：${oversold.get(o.id)!.join('、')}`}
                      className="ml-2 text-alert"
                    >
                      料不夠
                    </span>
                  )}
                </Td>
                <Td align="right" numeric>
                  <Money cents={o.totalCents} />
                </Td>
                <Td numeric>{o.transferLast5 ?? '—'}</Td>
                <Td>{formatDate(o.createdAt)}</Td>
              </OrderRow>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}
