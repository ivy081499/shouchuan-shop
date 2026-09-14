import { redirect } from 'next/navigation'

/** 進貨已併入庫存頁（見 _shell/nav.ts 的變更說明） */
export default function ImportPage() {
  redirect('/admin/inventory')
}
