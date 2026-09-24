/**
 * 後台身分複查（防禦縱深第二層）
 *
 * 正式環境的第一層是 Cloudflare Access：未通過的人連 Next.js 都到不了。
 * 通過的請求，Access 會加上 `Cf-Access-Authenticated-User-Email` 標頭。
 * 這裡再比對一次，萬一 Access 政策被誤改或關掉，後台還擋得住。
 *
 * 見 docs/03-ARCHITECTURE.md「/admin 保護」。
 */

import { headers } from 'next/headers'

/** Cloudflare Access 通過後帶上的身分標頭 */
const ACCESS_EMAIL_HEADER = 'cf-access-authenticated-user-email'

/** 沒設環境變數時的預設店主 email */
const DEFAULT_OWNER_EMAIL = 'ivy081499@gmail.com'

/**
 * 是否為本機開發（沒有 Cloudflare Workers 執行環境）。
 * 判斷式與 src/data/db.ts 一致——那是凍結檔案，不能從那裡 export，只能照抄。
 */
function isLocalDev(): boolean {
  return process.env.NODE_ENV !== 'production' && !process.env.CF_PAGES
}

/** 取得允許進後台的 email（正式環境走 Workers env，本機走 process.env） */
async function getOwnerEmail(): Promise<string> {
  if (isLocalDev()) return process.env.OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL

  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const { env } = await getCloudflareContext({ async: true })
  const fromEnv = (env as unknown as { OWNER_EMAIL?: string }).OWNER_EMAIL
  return fromEnv ?? process.env.OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL
}

/**
 * 這個請求可不可以進後台。
 *
 * 本機開發一律放行——`npm run dev` 不會有 Access 標頭，
 * 擋下去會把店主鎖在自己的後台外面。
 */
export async function isOwnerRequest(): Promise<boolean> {
  if (isLocalDev()) return true

  const email = (await headers()).get(ACCESS_EMAIL_HEADER)
  if (!email) return false

  return email.trim().toLowerCase() === (await getOwnerEmail()).trim().toLowerCase()
}
