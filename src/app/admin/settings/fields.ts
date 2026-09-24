/**
 * 設定頁的欄位定義
 *
 * `settings` 是 key-value 表，**新增 key 不需要改 schema**（凍結規則不受影響）。
 * 這裡是唯一一份「後台設定頁有哪些欄位」的清單，表單與儲存都讀它。
 *
 * 文案寫給非工程背景的店主看：說「這個填了會出現在哪裡」，
 * 不要說「這是 settings 表的 bank_account 欄位」。
 */

export interface SettingField {
  key: string
  label: string
  /** 給店主看的一句話：填了會怎樣、不填會怎樣 */
  hint?: string
  /**
   * text   一般文字
   * money  店主填「元」，資料庫存「分」
   * digits 只能數字（銀行代碼）
   * area   多行
   */
  kind: 'text' | 'money' | 'digits' | 'area'
  placeholder?: string
}

export interface SettingGroup {
  title: string
  /** 這一組為什麼重要 */
  note?: string
  fields: SettingField[]
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    title: '匯款資訊',
    note: '客人下單後會看到這些資訊，確認信裡也有。沒填的話客人不知道錢要匯去哪，每一單都要你自己再通知一次。',
    fields: [
      { key: 'bank_name', label: '銀行名稱', kind: 'text', placeholder: '第一銀行' },
      { key: 'bank_code', label: '銀行代碼', kind: 'digits', hint: '三碼數字，例如 007。', placeholder: '007' },
      { key: 'bank_account', label: '轉帳帳號', kind: 'text', placeholder: '00000000000' },
      { key: 'bank_holder', label: '戶名', kind: 'text', placeholder: '林○○' },
    ],
  },
  {
    title: '聯絡方式',
    note: '會顯示在前台每一頁的最下面。三個都不填就整區不顯示，不會留一塊空白。',
    fields: [
      { key: 'contact_email', label: 'Email', kind: 'text', placeholder: 'hello@example.com' },
      { key: 'contact_line', label: 'LINE ID', kind: 'text' },
      {
        key: 'contact_instagram',
        label: 'Instagram',
        kind: 'text',
        hint: '填帳號就好，前面的 @ 可有可無。',
        placeholder: 'ordinarydays',
      },
    ],
  },
  {
    title: '運費',
    fields: [
      {
        key: 'shipping_fee_cents',
        label: '運費',
        kind: 'money',
        hint: '單位是元，只能填整數。填 0 就是一律免運。',
      },
      {
        key: 'free_shipping_threshold_cents',
        label: '免運門檻',
        kind: 'money',
        hint: '單位是元，只能填整數。買滿這個金額就不收運費；填 0 代表一律免運。',
      },
    ],
  },
  {
    title: '店鋪',
    fields: [
      { key: 'store_name', label: '店名', kind: 'text' },
      { key: 'store_name_en', label: '英文店名', kind: 'text', hint: '顯示在店名下方的小字，可以不填。' },
      { key: 'store_tagline', label: '品牌一句話', kind: 'area', hint: '顯示在首頁店名下方。' },
      {
        key: 'store_notice',
        label: '公告',
        kind: 'area',
        hint: '填了會出現在前台最上方與結帳頁，例如「出國中，10/5 後才出貨」。不填就不顯示。',
      },
    ],
  },
  {
    title: '進貨',
    fields: [
      {
        key: 'default_fx_rate_x100',
        label: '預設匯率',
        kind: 'digits',
        hint: '放大 100 倍填，例如匯率 4.5 就填 450。匯入淘寶訂單時用來換算台幣。',
      },
    ],
  },
]

export const SETTING_FIELDS: SettingField[] = SETTING_GROUPS.flatMap((g) => g.fields)

export const SETTING_KEYS = SETTING_FIELDS.map((f) => f.key)

export type SettingKey = string
