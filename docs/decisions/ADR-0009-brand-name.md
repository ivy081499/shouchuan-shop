# ADR-0009 品牌名稱：平凡生活 / Ordinary Days

**狀態**：已採用
**日期**：2026-09-11

## 背景

店主需要品牌名稱以在 FreeStore 開店。方向：天然石散珠手串、一顆一顆挑、單人工作室。
刻意避開「水晶能量、招財開運」的療癒系語彙——市場飽和，且會模糊「材料真實」的訴求。

## 決策

**中文：平凡生活　英文：Ordinary Days**

品牌一句話：一顆一顆挑的天然石手串，戴在平常的日子裡。

商店網址：`https://ordinarydays.freestore.tw`

## 查證結果（2026-09-11）

| 項目 | 結果 |
|---|---|
| 國外飾品品牌同名 | 無（僅語意相近者：Ordinary Kids、Every Day Collective） |
| 台灣手作圈同名 | 無（最接近為「Everyday is a Gift 手作工作室」，業態不同） |
| `ordinarydays.com` | 已註冊（2001） |
| `ordinary-days.com` | 已註冊（2024/12） |
| `ordinarydays.co` | 已註冊 |
| `ordinarydays.tw` | **未註冊** |

## 為什麼不用 "In the Moment"（曾評估）

- **已有同業使用**：In The Moment Boutique（美國精品店，有飾品線）
- Etsy 上大量「Live in the Moment」刻字天然石手鍊，語意已被用濫
- 該名字暗示「正念／活在當下」功效，會把品牌歸入療癒系，
  與「材料真實、一顆一顆挑」的訴求相衝突

「平凡生活」講的是**使用情境**（戴在平常日子裡），不是**功效暗示**，對商品較誠實。

## 後果

- `.com` 已被佔用。現階段不需自有網域（FreeStore 提供 `ordinarydays.freestore.tw`），
  符合零成本原則。日後若要買，`ordinarydays.tw` 仍可註冊（約 NT$800/年）。
- **店主仍需自行確認 Instagram 帳號 `ordinarydays` 與「平凡生活」是否已被佔用**——
  IG 帳號比網域更重要，且需登入才能查，本次未能代查。

## 實作

已寫入 `db/seed/seed.sql` 的 `settings` 表：
`store_name` = 平凡生活、`store_name_en` = Ordinary Days、`store_tagline` = 品牌一句話。
店主日後可在後台設定頁自行修改，程式不得寫死店名。
