/**
 * 後台共用元件
 *
 * 後台是工具不是展示：資訊密度優先、金額右對齊等寬、警示明確。
 */

import { formatTWD } from '@/lib/money'

/* ── 頁面標題 ── */

export function PageTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-8">
      <h1 className="font-serif text-2xl tracking-[0.08em] text-ink">{children}</h1>
      {note && <p className="mt-1.5 text-[13px] text-ink-soft">{note}</p>}
    </div>
  )
}

/* ── 表格 ── */

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  )
}

export function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode
  align?: 'left' | 'right' | 'center'
}) {
  const a = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <th className={`border-b border-hairline pb-2.5 pr-4 font-normal text-ink-soft ${a}`}>
      {children}
    </th>
  )
}

export function Td({
  children,
  align = 'left',
  numeric = false,
  alert = false,
}: {
  children?: React.ReactNode
  align?: 'left' | 'right' | 'center'
  numeric?: boolean
  alert?: boolean
}) {
  const a = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <td
      className={`border-b border-hairline py-2.5 pr-4 ${a} ${numeric ? 'tnum' : ''} ${
        alert ? 'text-alert font-medium' : ''
      }`}
    >
      {children}
    </td>
  )
}

/** 金額欄位：右對齊、等寬 */
export function Money({ cents, showCents = false }: { cents: number; showCents?: boolean }) {
  return <span className="tnum">{formatTWD(cents, showCents)}</span>
}

/* ── 空狀態：可行動的邀請，不是「查無資料」 ── */

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="border border-dashed border-hairline px-8 py-14 text-center">
      <p className="font-serif text-base tracking-wider text-ink">{title}</p>
      {hint && <p className="mt-2 text-[13px] text-ink-soft">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ── 統計卡 ── */

export function Stat({
  label,
  value,
  hint,
  sub,
  explain,
  alert = false,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  /** 次要數字，例如同一筆金額的另一種幣別 */
  sub?: React.ReactNode
  /** 右上角問號，滑過顯示這個數字怎麼算出來的 */
  explain?: string
  alert?: boolean
}) {
  return (
    <div className="relative border border-hairline px-5 py-4">
      {explain && (
        /*
         * 自繪 tooltip 而非用 title 屬性：原生 tooltip 要停留約一秒才出現，
         * 有時根本不觸發，使用者會以為功能壞了。
         * 純 CSS 的 group-hover／group-focus-within，不需要 client component。
         */
        <span className="group absolute right-2 top-2">
          <span
            tabIndex={0}
            role="button"
            aria-label="說明"
            className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-hairline text-[10px] leading-none text-ink-soft transition group-hover:border-accent group-hover:text-ink focus:outline-none focus-visible:border-accent"
          >
            ?
          </span>
          <span
            role="tooltip"
            className="pointer-events-none invisible absolute right-0 top-6 z-30 w-64 bg-ink px-3 py-2 text-left text-[12px] leading-relaxed font-normal tracking-normal text-paper opacity-0 shadow-lg transition-opacity duration-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
          >
            {explain}
          </span>
        </span>
      )}
      <div className="text-[11px] tracking-[0.15em] text-ink-soft">{label}</div>
      <div className={`mt-1.5 tnum text-2xl ${alert ? 'text-alert' : 'text-ink'}`}>{value}</div>
      {sub && <div className="tnum text-[13px] text-ink-soft">{sub}</div>}
      {hint && <div className="mt-1 text-[12px] text-ink-soft">{hint}</div>}
    </div>
  )
}

/* ── 按鈕 ── */

export function Button({
  children,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const base = 'inline-block px-5 py-2.5 text-[13px] tracking-[0.1em] transition-colors'
  const styles =
    variant === 'primary'
      ? 'bg-ink text-paper hover:bg-accent'
      : 'border border-hairline text-ink hover:border-accent hover:text-accent'
  return (
    <button className={`${base} ${styles}`} {...props}>
      {children}
    </button>
  )
}

/* ── 警示條 ── */

export function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 border-l-2 border-alert bg-alert/5 px-4 py-3 text-[13px] text-ink">
      {children}
    </div>
  )
}
