import { redirect } from 'next/navigation'

/** 珠子已併入庫存頁（見 _shell/nav.ts 的變更說明） */
export default function BeadsPage() {
  redirect('/admin/inventory')
}
