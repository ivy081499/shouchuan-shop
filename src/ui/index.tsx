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
  alert = false,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  alert?: boolean
}) {
  return (
    <div className="border border-hairline px-5 py-4">
      <div className="text-[11px] tracking-[0.15em] text-ink-soft">{label}</div>
      <div className={`mt-1.5 tnum text-2xl ${alert ? 'text-alert' : 'text-ink'}`}>{value}</div>
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
