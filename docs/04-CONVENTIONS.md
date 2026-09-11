# 程式慣例

## 基本

- **Server Component 為預設**。只有真的需要互動（表單狀態、購物車）才加 `'use client'`。
- 資料存取一律經 `src/data/**`，**頁面不直接寫 SQL 或 Drizzle 查詢**。
- 表單驗證用 `src/contracts/**` 的 zod schema，前後端共用同一份。
- 後台列表**不要**用客戶端抓資料，直接在 Server Component 查好渲染。

## 檔案命名

```
kebab-case.ts          一般模組
page.tsx / layout.tsx  Next.js 約定
PascalCase.tsx         React 元件
```

## 金額

```ts
// ✅
import { formatTWD, yuanToCents } from '@/lib/money'
const cents = yuanToCents(userInput)
<span>{formatTWD(product.priceCents)}</span>

// ❌ 絕對不可
const price = 980.5
const total = price * 1.05
```

## 成本

```ts
// ✅
import { calcProductCost, calcMargin } from '@/lib/costing'

// ❌ 不可自行加總
const cost = recipe.reduce((s, r) => s + r.cost * r.qty, 0)
```

即使公式看起來一模一樣也不行 —— 公式改動時只有一個地方要改。

## 錯誤處理

伺服器動作回傳統一形狀，不要用 throw 當流程控制：

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }   // error 是要給使用者看的繁中訊息
```

錯誤訊息規則（見 `docs/05-DESIGN-SYSTEM.md`）：
- 說清楚**發生什麼事**和**怎麼解決**
- 不要道歉、不要模糊
- ✅「庫存不足，草莓晶只剩 3 顆，這張訂單需要 12 顆。」
- ❌「很抱歉，發生錯誤，請稍後再試。」

## 日期時間

- 資料庫存 **Unix 秒**（整數）。
- 顯示一律台北時間，格式 `2026-09-11 22:40`。
- 不要存字串日期。

## 中文文案

- 繁體，全形標點，用語照 `docs/01-GLOSSARY.md`。
- 按鈕用動詞：「確認收款」不是「送出」。
- 同一個動作全程同名：按鈕寫「上架」，成功訊息就是「已上架」。

## 空狀態

每個列表都要有空狀態，而且要是**可行動的邀請**，不是「沒有資料」：

- ✅「還沒有珠子。先匯入淘寶訂單，或手動新增第一顆。」＋ 按鈕
- ❌「查無資料」

## 不要做的事

- ❌ 不要為單次使用的程式建抽象層
- ❌ 不要加沒被要求的設定選項
- ❌ 不要為不可能發生的情況寫錯誤處理
- ❌ 不要「順手」重構別人的程式或改格式
- ❌ 寫了 200 行但其實 50 行能解決 → 重寫

## 測試

`src/lib/` 的純函式有測試檔，改動後必須重跑：

```bash
node --experimental-strip-types src/lib/costing.test.ts
node --experimental-strip-types src/lib/bead-spec.test.ts
```

**測試絕對不可拿店主的真實資料當對象。** 要測會刪除／覆寫的功能，自建測試資料，測完清乾淨。
