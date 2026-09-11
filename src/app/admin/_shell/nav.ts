/**
 * 後台導覽列 — Phase 0 預先登記所有項目
 * ⚠️ 凍結檔案，不可修改。
 *
 * 各工作流新增頁面時不需要改這個檔案，項目已經全部登記好。
 */

export interface NavItem {
  href: string
  label: string
  /** 給店主看的一句話說明 */
  hint: string
}

export const NAV: NavItem[] = [
  { href: '/admin', label: '總覽', hint: '今天要處理什麼' },
  { href: '/admin/beads', label: '珠子', hint: '成本與庫存' },
  { href: '/admin/products', label: '手串', hint: '商品與配方' },
  { href: '/admin/import', label: '進貨', hint: '匯入淘寶訂單' },
  { href: '/admin/reports/purchasing', label: '採購需求', hint: '還要叫多少貨' },
  { href: '/admin/reports/margin', label: '毛利', hint: '賺多少' },
  { href: '/admin/orders', label: '訂單', hint: '收款與出貨' },
]
