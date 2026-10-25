import Link from 'next/link'
import { getDb, getPublicImageBase } from '@/data/db'
import { listAdminProducts, listDeletedProducts } from '@/data/products'
import { listBeads } from '@/data/beads'
import { productImages } from '@db/schema'
import { PageTitle, Table, Th, Td, Money, Empty } from '@/ui'
import { PRODUCT_STATUS_LABEL, type ProductStatusValue } from '@/contracts/product'
import { calcMargin } from '@/lib/costing'
import NewProductForm from './NewProductForm.tsx'
import DeleteProductButton from './DeleteProductButton.tsx'
import DeletedProducts from './DeletedProducts.tsx'
import { isNull } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const db = await getDb()
  const [products, beads, imageRows, deleted, imageBase] = await Promise.all([
    listAdminProducts(db),
    listBeads(db),
    // 一次取回所有商品的照片，避免逐筆查詢（見 03-ARCHITECTURE 的 N+1 守則）
    db
      .select({
        productId: productImages.productId,
        r2Key: productImages.r2Key,
        audience: productImages.audience,
        sortOrder: productImages.sortOrder,
      })
      .from(productImages)
      .where(isNull(productImages.deletedAt)),
    listDeletedProducts(db),
    getPublicImageBase(),
  ])

  /** 本機沒有 R2 公開網址時，檔案實際在 public/uploads/ 底下 */
  const toUrl = (r2Key: string) =>
    imageBase ? `${imageBase.replace(/\/$/, '')}/${r2Key}` : `/uploads/${r2Key}`

  const photoCount = new Map<number, number>()
  for (const r of imageRows) {
    photoCount.set(r.productId, (photoCount.get(r.productId) ?? 0) + 1)
  }

  /*
   * 列表縮圖優先用「自己看」的工作照——店主要的是認出這條是哪一款，
   * 工作照通常拍得比上架成品照更直白。沒有工作照才退回成品照。
   */
  const sorted = [...imageRows].sort((a, b) => a.sortOrder - b.sortOrder)
  const thumb = new Map<number, string>()
  for (const r of sorted) {
    if (r.audience === 'internal' && !thumb.has(r.productId)) thumb.set(r.productId, r.r2Key)
  }
  // 沒有工作照的才退回成品照
  for (const r of sorted) {
    if (!thumb.has(r.productId)) thumb.set(r.productId, r.r2Key)
  }

  return (
    <>
      <PageTitle note="每條手串的售價、成本與配方。成本由配方自動算出。">手串</PageTitle>

      {beads.length === 0 && (
        <div className="mb-6 border-l-2 border-accent bg-sunk/50 px-4 py-3 text-[13px]">
          還沒有珠子，配方會沒東西可選。建議先
          <Link href="/admin/inventory" className="mx-1 text-accent underline underline-offset-2">
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
              <Th>圖</Th>
              <Th>名稱</Th>
              <Th>狀態</Th>
              <Th align="right">售價</Th>
              <Th align="right">材料成本</Th>
              <Th align="right">毛利</Th>
              <Th align="right">毛利率</Th>
              <Th align="right">可做</Th>
              <Th>還缺什麼</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const m = calcMargin(p.priceCents, p.costCents)
              const noRecipe = p.costCents === 0

              /** 上架前該備齊的東西，缺的列出來讓店主一眼看到 */
              const missing: string[] = []
              if ((photoCount.get(p.id) ?? 0) === 0) missing.push('照片')
              if (noRecipe) missing.push('配方')
              if (p.priceCents <= 0) missing.push('售價')
              // 故事不影響上架，但前台會空一塊，另外標示
              const noStory = !p.description || p.description.trim() === ''

              return (
                <tr key={p.id}>
                  <Td>
                    {thumb.get(p.id) ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={toUrl(thumb.get(p.id) as string)}
                        alt={p.name}
                        className="h-12 w-12 border border-hairline object-cover"
                      />
                    ) : (
                      <span className="block h-12 w-12 border border-dashed border-hairline bg-sunk" />
                    )}
                  </Td>
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
                    {missing.length > 0 ? (
                      <span className="text-alert" title="這些備齊才能上架">
                        缺 {missing.join('、')}
                      </span>
                    ) : noStory ? (
                      <span className="text-ink-soft" title="不影響上架，但前台會少一段介紹">
                        可上架（沒故事）
                      </span>
                    ) : (
                      <span className="text-ink-soft">齊全</span>
                    )}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-3">
                      <Link
                        href={`/admin/products/${p.id}`}
                        className="text-accent underline underline-offset-2"
                      >
                        設定配方
                      </Link>
                      <DeleteProductButton id={p.id} name={p.name} />
                    </span>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}

      <DeletedProducts rows={deleted} />
    </>
  )
}
