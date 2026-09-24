/**
 * 訂單確認信
 *
 * 【為什麼是手寫 fetch，不是裝 SDK】
 * Cloudflare Workers 沒有 SMTP，只能打 HTTP API 寄信（ADR-0012）。
 * Resend 的寄信 API 就是一個 POST，用 `fetch` 六行寫完，
 * 裝 SDK 只是多一個相依、多一份要更新的東西。`docs/tasks/BOARD.md`
 * 的「套件需求」因此不必執行——這裡沒有裝任何套件。
 *
 * 【沒設定就不寄，而且不報錯】
 * 店主還沒申請 Resend 帳號、還沒驗證寄件網域之前，環境變數是空的。
 * 這種情況下寄信直接跳過，訂單照樣成立。等店主填好 RESEND_API_KEY
 * 與 MAIL_FROM，信就會自動開始寄，不需要改任何程式。
 *
 * 【寄信失敗絕不可以讓下單失敗】
 * 這是 `docs/10-前台與上架計畫.md` C-3 寫明的規則：訂單先存好，
 * 寄信只是附加動作。所以這裡所有錯誤都被吞掉，只回報結果。
 */

import { formatTWD } from '@/lib/money'
import type { StoreSettings } from './store.ts'

export interface OrderMailLine {
  name: string
  qty: number
  lineTotalCents: number
}

export interface OrderMailInput {
  orderNo: string
  customerName: string
  customerEmail: string
  lines: OrderMailLine[]
  subtotalCents: number
  shippingFeeCents: number
  totalCents: number
  settings: StoreSettings
  /** 下單成功頁的完整網址，信裡給客人一個回得去的連結 */
  orderUrl: string
}

export type MailResult =
  | { sent: true }
  | { sent: false; reason: 'not_configured' | 'no_address' | 'failed'; detail?: string }

/**
 * Workers 上環境變數來自 Cloudflare 繫結，本機開發則是 process.env。
 * 讀不到就回 undefined，交給呼叫端當「沒設定」處理。
 */
async function readEnv(key: string): Promise<string | undefined> {
  const local = process.env[key]
  if (local) return local

  if (process.env.NODE_ENV !== 'production') return undefined

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    const value = (env as unknown as Record<string, string | undefined>)[key]
    return value || undefined
  } catch {
    return undefined
  }
}

export async function sendOrderConfirmation(input: OrderMailInput): Promise<MailResult> {
  if (!input.customerEmail) return { sent: false, reason: 'no_address' }

  const [apiKey, from] = await Promise.all([readEnv('RESEND_API_KEY'), readEnv('MAIL_FROM')])
  if (!apiKey || !from) return { sent: false, reason: 'not_configured' }

  const storeName = input.settings.store_name || '平凡生活'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.customerEmail],
        subject: `${storeName}　訂單 ${input.orderNo} 已成立`,
        text: buildOrderMailText(input),
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { sent: false, reason: 'failed', detail: `${res.status} ${detail}`.trim() }
    }
    return { sent: true }
  } catch (e) {
    return { sent: false, reason: 'failed', detail: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 純文字信。
 *
 * 不做 HTML 版：手工作品的確認信本來就該像一封信，
 * 而純文字在所有信箱都顯示得一樣，也不會被擋圖。
 *
 * 匯款資訊一律讀 `settings`（C-3 明文要求不可寫死）。店主還沒填帳號時
 * 改成請客人聯絡本人，總比印一行空白的「帳號：」強。
 */
export function buildOrderMailText(input: OrderMailInput): string {
  const s = input.settings
  const storeName = s.store_name || '平凡生活'

  const itemLines = input.lines
    .map((l) => `　・${l.name}　${l.qty} 條　${formatTWD(l.lineTotalCents)}`)
    .join('\n')

  const bankFilled = Boolean(s.bank_name && s.bank_account)
  const bankBlock = bankFilled
    ? [
        `　銀行　${s.bank_name}${s.bank_code ? `（${s.bank_code}）` : ''}`,
        `　帳號　${s.bank_account}`,
        s.bank_holder ? `　戶名　${s.bank_holder}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : '　匯款帳號會另外通知您，或請直接與我聯絡。'

  const contact = [
    s.contact_email ? `　Email　${s.contact_email}` : null,
    s.contact_line ? `　LINE　${s.contact_line}` : null,
    s.contact_instagram ? `　Instagram　${s.contact_instagram}` : null,
  ].filter(Boolean)

  return [
    `${input.customerName} 您好，`,
    '',
    '謝謝您的訂購，這張訂單已經成立了。',
    '',
    `訂單編號　${input.orderNo}`,
    '',
    '── 訂購內容 ──',
    itemLines,
    '',
    `　小計　${formatTWD(input.subtotalCents)}`,
    `　運費　${input.shippingFeeCents === 0 ? '免運' : formatTWD(input.shippingFeeCents)}`,
    `　合計　${formatTWD(input.totalCents)}`,
    '',
    '── 匯款資訊 ──',
    bankBlock,
    '',
    `請於轉帳時在備註欄填上訂單編號 ${input.orderNo}，`,
    '匯款完成後回到下面的頁面填寫轉帳帳號末五碼，我核對入帳後就會為您出貨。',
    '',
    input.orderUrl,
    '',
    ...(contact.length > 0 ? ['── 有問題可以找我 ──', ...contact, ''] : []),
    storeName,
  ].join('\n')
}
