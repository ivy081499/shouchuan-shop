import { getDb } from '@/data/db'
import { listOrders } from '@/data/orders'
import { PageTitle, Table, Th, Td, Money, Empty } from '@/ui'
import { ORDER_STATUS_LABEL, type OrderStatusValue } from '@/contracts/order'

export const dynamic = 'force-dynamic'

function formatDate(unixSec: number): string {
  const d = new Date(unixSec * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default async function OrdersPage() {
  const db = await getDb()
  const orders = await listOrders(db)

  return (
    <>
      <PageTitle note="客戶訂單與收款狀態。目前前台在 FreeStore，訂單需從那邊匯入。">
        訂單
      </PageTitle>

      {orders.length === 0 ? (
        <Empty
          title="還沒有訂單"
          hint="前台開在 FreeStore（ordinarydays.freestore.tw）。訂單匯入功能待 FreeStore 匯出格式確認後補上。"
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
              <tr key={o.id}>
                <Td>{o.orderNo}</Td>
                <Td>{o.customerName}</Td>
                <Td>{ORDER_STATUS_LABEL[o.status as OrderStatusValue]}</Td>
                <Td align="right" numeric>
                  <Money cents={o.totalCents} />
                </Td>
                <Td numeric>{o.transferLast5 ?? '—'}</Td>
                <Td>{formatDate(o.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}
