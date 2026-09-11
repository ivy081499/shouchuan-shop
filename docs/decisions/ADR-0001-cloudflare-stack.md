# ADR-0001 選擇 Cloudflare 全家桶

**狀態**：已採用
**日期**：2026-09-11

## 背景

店主要求：不花任何錢、不能用自己的電腦當伺服器、目前零客戶。

評估三個免費方案：

| 方案 | 問題 |
|---|---|
| Vercel Hobby + Neon | Hobby 條款**禁止商業使用**。這是要賣東西的站，違反條款可能被停權 |
| Cloudflare Pages + Supabase | Supabase 免費版**7 天無流量即暫停專案**。初期沒客戶必定中招 |
| Cloudflare Workers + D1 + R2 | 無商用限制、閒置不停用 |

## 決策

採用 Cloudflare 全家桶：Workers（Next.js via OpenNext）+ D1 + R2 + Access。

## 後果

**好處**
- 唯一同時滿足「零客戶不會被停用」與「無商用限制」的組合
- 資料庫、儲存、身分驗證都在同一家，不必管理多組帳號

**代價**
- 綁定 Cloudflare 生態，日後搬遷有成本
- Next.js 要透過 OpenNext 轉譯到 Workers runtime，偶爾踩相容性問題（部署前必須 `cf:preview` 驗證）
- D1 免費版沒有自動時間點還原，**必須自己排備份**
