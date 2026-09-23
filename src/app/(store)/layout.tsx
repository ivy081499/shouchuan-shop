import type { Metadata } from 'next'
import Link from 'next/link'
import { getStoreSettings } from './store.ts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const s = await getStoreSettings()
  return {
    title: s.store_name ?? '平凡生活',
    description: s.store_tagline ?? '手工串珠手串',
  }
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const s = await getStoreSettings()
  const storeName = s.store_name || '平凡生活'
  const bankFilled = Boolean(s.bank_name && s.bank_account)

  return (
    <div className="store flex min-h-dvh flex-col">
      {s.store_notice && (
        <div className="border-b border-hairline bg-sunk px-5 py-2 text-center text-[13px] text-ink-soft">
          {s.store_notice}
        </div>
      )}

      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-[1080px] flex-col items-center gap-1.5 px-5 py-10 sm:py-14">
          <Link href="/" className="font-serif text-[22px] tracking-[0.3em] text-ink sm:text-[26px]">
            {storeName}
          </Link>
          {s.store_name_en && (
            <span className="text-[11px] uppercase tracking-[0.34em] text-ink-soft">
              {s.store_name_en}
            </span>
          )}
          {s.store_tagline && (
            <p className="mt-3 max-w-[30em] text-center text-[13px] leading-[2] text-ink-soft">
              {s.store_tagline}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] flex-1 px-5 py-12 sm:py-20">{children}</main>

      <footer className="border-t border-hairline">
        <div className="mx-auto grid max-w-[1080px] gap-8 px-5 py-12 text-[13px] leading-[2] text-ink-soft sm:grid-cols-2">
          <section>
            <h2 className="mb-2 font-serif tracking-[0.2em] text-ink">怎麼購買</h2>
            <p>
              下單後以銀行轉帳付款，收到款項才出貨。
              每條手串都是手工編成，數量有限，售完就沒有了。
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-serif tracking-[0.2em] text-ink">匯款資訊</h2>
            {bankFilled ? (
              <ul className="not-prose">
                <li>{s.bank_name}{s.bank_code ? `（${s.bank_code}）` : ''}</li>
                <li className="tnum">帳號 {s.bank_account}</li>
                {s.bank_holder && <li>戶名 {s.bank_holder}</li>}
              </ul>
            ) : (
              <p>轉帳資訊會在下單完成後告知。</p>
            )}
          </section>
        </div>

        <div className="border-t border-hairline px-5 py-5 text-center text-[11px] tracking-[0.1em] text-ink-soft">
          © {storeName}
        </div>
      </footer>
    </div>
  )
}
