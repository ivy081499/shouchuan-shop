import { getDb } from '@/data/db'
import { settings } from '@db/schema'
import { eq } from 'drizzle-orm'
import { PageTitle } from '@/ui'
import ImportClient from './ImportClient.tsx'

export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const db = await getDb()
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'default_fx_rate_x100'))
    .limit(1)
  const fx = Number.parseInt(rows[0]?.value ?? '450', 10)

  return (
    <>
      <PageTitle note="上傳淘寶訂單，確認每件幾顆後寫入庫存，系統自動算出每顆成本。">
        進貨
      </PageTitle>
      <ImportClient defaultFxRateX100={fx} />
    </>
  )
}
