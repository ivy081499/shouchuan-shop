import Link from 'next/link'
import { NAV } from './_shell/nav.ts'

/**
 * 後台外殼
 *
 * 正式環境由 Cloudflare Access 擋在最外層（請求進不到這裡）。
 * 這裡再驗一次 Access 的身分標頭，作為第二層防護——
 * 萬一 Access 政策被誤改，這層還擋得住。
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline">
        <div className="mx-auto max-w-[1280px] px-6 py-4 flex items-baseline gap-8">
          <Link href="/admin" className="font-serif text-lg tracking-[0.18em] text-ink">
            平凡生活
          </Link>
          <span className="text-xs text-ink-soft tracking-widest">後台</span>
        </div>
      </header>

      <nav className="border-b border-hairline bg-sunk/40">
        <div className="mx-auto max-w-[1280px] px-6">
          <ul className="flex flex-wrap gap-x-7 gap-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-block py-3 text-[13px] tracking-wider text-ink-soft hover:text-ink"
                  title={item.hint}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <main className="mx-auto max-w-[1280px] px-6 py-10">{children}</main>
    </div>
  )
}
