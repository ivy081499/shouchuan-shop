# 系統架構

## 拓撲

```
訪客 ─→ Cloudflare Workers（Next.js via OpenNext）
                │
                ├─→ D1（SQLite）        商品、訂單、珠子、配方
                ├─→ R2（物件儲存）      商品圖，公開 bucket 直出
                └─→ Cloudflare Access   只保護 /admin
```

## 為什麼是這個組合

店主要求零成本、不能用自己電腦當 server。三個候選中只有 Cloudflare 全部滿足：

| 方案 | 致命問題 |
|---|---|
| Vercel Hobby + Neon | Hobby 條款**禁止商業使用**，這是要賣東西的站 |
| Cloudflare Pages + Supabase | Supabase 免費版**7 天無流量就暫停專案**，初期沒客戶必中 |
| **Cloudflare 全家桶** ✅ | 無商用限制、閒置不停用 |

決策細節見 `docs/decisions/ADR-0001`。

## 免費額度與守則

| 資源 | 免費額度 | 守則 |
|---|---|---|
| Workers 請求 | 10 萬次／日 | 前台列表頁用靜態產生 + 定期重新驗證，別每次都打 DB |
| D1 列讀取 | 500 萬列／日 | **禁止 N+1 查詢**。列表頁一次 join 取完，不要迴圈內查詢 |
| D1 儲存 | 5GB | 這規模用不完 |
| R2 儲存 | 10GB | 圖片上傳前壓縮為 webp，長邊上限 1600px |
| R2 Class A 操作 | 100 萬／月 | **圖片用公開 bucket 網址直出，不要經過 Worker 轉發** |
| Access 席次 | 50 | 只有店主一人 |

**中文字型是最大的額度風險**：完整 Noto Serif TC 超過 10MB。必須子集化，只打包實際用到的字。

## 環境變數與繫結

`wrangler.jsonc` 內：

| 繫結名 | 類型 | 用途 |
|---|---|---|
| `DB` | D1 | 資料庫 |
| `IMAGES` | R2 | 商品圖 |
| `R2_PUBLIC_URL` | 變數 | R2 公開網域，組圖片完整網址用 |

本機開發放 `.dev.vars`（已在 `.gitignore`）。**任何密鑰都不可進 git。**

## /admin 保護

雙層：

1. **Cloudflare Access**（主要）：Zero Trust 政策限定店主 email，未登入者連 Next.js 都到不了。
2. **伺服器端複查**（防禦縱深）：`src/app/admin/layout.tsx` 檢查 `Cf-Access-Authenticated-User-Email` 標頭，不符就 403。

不要只靠其中一層。Access 設定若被誤改，第二層還能擋。

## 渲染策略

| 頁面 | 策略 | 理由 |
|---|---|---|
| 前台商品列表／詳情 | 靜態 + 重新驗證 | 省 Workers 請求與 D1 讀取 |
| 購物車 | 客戶端（cookie） | 不進資料庫，零成本 |
| 結帳、訂單查詢 | 動態 | 需即時資料 |
| 全部後台 | 動態、不快取 | 店主要看到當下真實狀態 |

## 部署

```bash
npm run cf:build     # OpenNext 轉譯
npm run cf:preview   # 本機模擬 Workers 環境
npm run cf:deploy    # 上線
```

**部署前務必先 `cf:preview` 跑一次。** Next.js 在 Node 環境能跑，不代表在 Workers runtime 能跑（沒有 `fs`、部分 Node API 不可用）。

## 備份

D1 免費版**沒有自動時間點還原**。必須自己備份：

```bash
npm run db:backup    # 匯出到 backups/
```

上線後建議每週跑一次，並把檔案存到 Google Drive。
