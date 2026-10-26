/**
 * 後台導覽列 — Phase 0 預先登記所有項目
 * ⚠️ 凍結檔案，不可修改。
 *
 * 各工作流新增頁面時不需要改這個檔案，項目已經全部登記好。
 *
 * 2026-10-26 例外變更（店主當面要求）：新增「進貨批次」。
 * 收貨確認從庫存頁搬出來獨立成一頁，因為收貨是獨立的日常動作，
 * 且「貨到才入庫」之後，這頁是庫存數字的來源。
 *
 * 2026-09-14 例外變更（主控 session）：原「珠子」「進貨」合併為「庫存」。
 * 兩者管的是同一件事——看庫存與補庫存，拆兩頁要來回切換。
 * 舊路徑 /admin/beads 與 /admin/import 轉址到 /admin/inventory。
 */

export interface NavItem {
  href: string
  label: string
  /** 給店主看的一句話說明 */
  hint: string
}

export const NAV: NavItem[] = [
  { href: '/admin', label: '總覽', hint: '今天要處理什麼' },
  { href: '/admin/inventory', label: '庫存', hint: '珠子成本、庫存與進貨' },
  { href: '/admin/shipments', label: '進貨批次', hint: '貨到了沒、打勾入庫' },
  { href: '/admin/products', label: '手串', hint: '商品與配方' },
  { href: '/admin/reports/purchasing', label: '採購需求', hint: '還要叫多少貨' },
  { href: '/admin/reports/margin', label: '毛利', hint: '賺多少' },
  { href: '/admin/orders', label: '訂單', hint: '收款與出貨' },
]
