import Link from 'next/link'
import { getDb } from '@/data/db'
import { listAdminProducts } from '@/data/products'
import { listBeads } from '@/data/beads'
import { PageTitle, Table, Th, Td, Money, Empty } from '@/ui'
import { PRODUCT_STATUS_LABEL, type ProductStatusValue } from '@/contracts/product'
import { calcMargin } from '@/lib/costing'
import NewProductForm from './NewProductForm.tsx'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const db = await getDb()
  const [products, beads] = await Promise.all([listAdminProducts(db), listBeads(db)])

  return (
    <>
      <PageTitle note="每條手串的售價、成本與配方。成本由配方自動算出。">手串</PageTitle>

      {beads.length === 0 && (
        <div className="mb-6 border-l-2 border-accent bg-sunk/50 px-4 py-3 text-[13px]">
          還沒有珠子，配方會沒東西可選。建議先
          <Link href="/admin/import" className="mx-1 text-accent underline underline-offset-2">
            匯入淘寶訂單
          </Link>
          建立珠子成本。
        </div>
      )}

      <div className="mb-10">
        <NewProductForm />
      </div>

      {products.length === 0 ? (
        <Empty title="還沒有手串" hint="用上面的表單建立第一條，再進去設定它用了哪些珠。" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>名稱</Th>
              <Th>狀態</Th>
              <Th align="right">售價</Th>
              <Th align="right">材料成本</Th>
              <Th align="right">毛利</Th>
              <Th align="right">毛利率</Th>
              <Th align="right">可做</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const m = calcMargin(p.priceCents, p.costCents)
              const noRecipe = p.costCents === 0
              return (
                <tr key={p.id}>
                  <Td>{p.name}</Td>
                  <Td>{PRODUCT_STATUS_LABEL[p.status as ProductStatusValue]}</Td>
                  <Td align="right" numeric>
                    <Money cents={p.priceCents} />
                  </Td>
                  <Td align="right" numeric>
                    {noRecipe ? <span className="text-ink-soft">未設配方</span> : <Money cents={p.costCents} />}
                  </Td>
                  <Td align="right" numeric>
                    {noRecipe ? '—' : <Money cents={m.profitCents} />}
                  </Td>
                  <Td align="right" numeric alert={!noRecipe && m.marginRate < 0.3}>
                    {noRecipe ? '—' : `${Math.round(m.marginRate * 100)}%`}
                  </Td>
                  <Td align="right" numeric alert={p.availableQty === 0}>
                    {p.availableQty}
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="text-accent underline underline-offset-2"
                    >
                      設定配方
                    </Link>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </>
  )
}
