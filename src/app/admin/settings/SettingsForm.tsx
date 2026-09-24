'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SETTING_GROUPS, type SettingField } from './fields.ts'
import { saveSettingsAction } from './actions.ts'

/**
 * 設定表單。
 *
 * 整份一起存，不做逐欄即時儲存——店主通常是「坐下來把該填的填一填」，
 * 每改一個字就打一次資料庫只會讓人不安心。
 */
export default function SettingsForm({ values }: { values: Record<string, string> }) {
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setMessage(null)
    startTransition(async () => {
      const result = await saveSettingsAction(formData)
      if (result.ok) {
        setFailed(false)
        setMessage('存好了。前台已經同步更新。')
        router.refresh()
      } else {
        setFailed(true)
        setMessage(result.error)
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="max-w-[640px]">
      {message && (
        <p
          role="status"
          className={`mb-6 border-l-2 px-4 py-3 text-[13px] ${
            failed ? 'border-alert bg-alert/5 text-ink' : 'border-accent bg-sunk text-ink'
          }`}
        >
          {message}
        </p>
      )}

      <div className="space-y-10">
        {SETTING_GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="font-serif text-[15px] tracking-[0.1em] text-ink">{group.title}</h2>
            {group.note && (
              <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">{group.note}</p>
            )}

            <div className="mt-4 space-y-4">
              {group.fields.map((field) => (
                <Field key={field.key} field={field} value={values[field.key] ?? ''} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-10 flex items-center gap-4 border-t border-hairline pt-6">
        <button
          type="submit"
          disabled={pending}
          className="bg-ink px-6 py-2.5 text-[13px] tracking-[0.1em] text-paper hover:bg-accent disabled:opacity-50"
        >
          {pending ? '儲存中' : '儲存'}
        </button>
        <span className="text-[12px] text-ink-soft">改完要按這個才會生效。</span>
      </div>
    </form>
  )
}

function Field({ field, value }: { field: SettingField; value: string }) {
  /*
   * 資料庫存「分」，給店主看的是「元」。
   * 金額一律整數元，所以除完直接取整——舊資料若留有非整數元的值，
   * 顯示成整數比顯示 60.5 讓人困惑要好（存檔時也會被擋下）。
   */
  const shown =
    field.kind === 'money'
      ? value === ''
        ? ''
        : String(Math.round(Number(value) / 100))
      : value

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink">{field.label}</span>

      {field.kind === 'area' ? (
        <textarea
          name={field.key}
          defaultValue={shown}
          rows={2}
          className="w-full border border-hairline bg-paper px-3 py-2 text-[13px] text-ink"
        />
      ) : (
        <input
          name={field.key}
          defaultValue={shown}
          placeholder={field.placeholder}
          inputMode={field.kind === 'money' || field.kind === 'digits' ? 'numeric' : undefined}
          /* 金額與代碼都只收數字，從輸入端就擋掉小數點與符號 */
          pattern={field.kind === 'money' || field.kind === 'digits' ? '[0-9]*' : undefined}
          className={`w-full border border-hairline bg-paper px-3 py-2 text-[13px] text-ink ${
            field.kind === 'money' || field.kind === 'digits' ? 'tnum' : ''
          }`}
        />
      )}

      {field.hint && <span className="text-[12px] text-ink-soft">{field.hint}</span>}
    </label>
  )
}
