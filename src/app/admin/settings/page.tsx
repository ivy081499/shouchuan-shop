import { PageTitle, Alert } from '@/ui'
import { getSettingsMap } from './actions.ts'
import SettingsForm from './SettingsForm.tsx'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const values = await getSettingsMap()
  const bankMissing = !values.bank_name || !values.bank_account

  return (
    <>
      <PageTitle note="店名、匯款帳號、聯絡方式、運費都在這裡改。改完按最下面的「儲存」，前台會立刻跟著變。">
        設定
      </PageTitle>

      {/*
        匯款帳號沒填是會直接被客人看到的問題：
        下單成功頁與確認信都會變成「匯款帳號會另外通知您」，等於每一單都要人工補。
      */}
      {bankMissing && (
        <Alert>
          <strong>匯款帳號還沒填。</strong>
          客人下單後看不到要把錢匯去哪，你得自己一筆一筆通知。開賣前請先把下面的「匯款資訊」填完。
        </Alert>
      )}

      <SettingsForm values={values} />
    </>
  )
}
