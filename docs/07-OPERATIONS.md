# 操作指令

## 本機開發

```bash
npm run dev              # http://localhost:3000
npm run typecheck        # 型別檢查
npm run cf:preview       # 在 Workers 環境模擬（部署前必跑）
```

## 測試

```bash
node --experimental-strip-types src/lib/costing.test.ts
node --experimental-strip-types src/lib/bead-spec.test.ts
```

改過 `src/lib/` 一定要重跑。

## 資料庫

```bash
npm run db:generate          # ⚠️ 只有主控 session 能跑
npm run db:migrate:local     # 套用到本機 D1
npm run db:migrate:remote    # 套用到線上 D1
npm run db:seed:local        # 灌種子資料（僅本機）
```

**migration 只增不改。** 寫錯了就新增一個修正的，不要改舊檔。

合併分支前檢查有沒有撞號：
```bash
ls db/migrations | sort
```
看到兩個 `0003_` 開頭就是撞號，必須先處理。

## 部署

```bash
npm run cf:build
npm run cf:preview       # 先在本機用 Workers runtime 驗證
npm run cf:deploy        # 確認沒問題才上線
```

**不要跳過 preview。** 程式在 `npm run dev`（Node 環境）能跑，不代表在 Workers runtime 能跑——
Workers 沒有 `fs`、部分 Node API 不可用，這類錯誤只有 preview 抓得到。

## 備份（重要）

D1 免費版**沒有自動時間點還原**。

```bash
npm run db:backup        # 匯出到 backups/
```

上線後每週跑一次，把檔案另存到 Google Drive。`backups/` 已在 `.gitignore`，不會進 git。

## Cloudflare 資源

初次建立（只做一次）：

```bash
npx wrangler login
npx wrangler d1 create shouchuan-db
npx wrangler r2 bucket create shouchuan-images
```

建立後把回傳的 `database_id` 填進 `wrangler.jsonc`。

**Cloudflare Access** 在 Zero Trust 儀表板設定，不是 CLI：
1. Zero Trust → Access → Applications → Add an application
2. Self-hosted，路徑填 `你的網域/admin*`
3. 政策：Emails → `ivy081499@gmail.com`

驗證方式：**開無痕視窗連 `/admin`，應該看到 Cloudflare 登入頁**。
直接進得去代表設定沒生效，必須修好才能上線。

## 合併前檢查清單

1. `npm run typecheck` 通過
2. `node --experimental-strip-types src/lib/*.test.ts` 全通過
3. `ls db/migrations` 無撞號
4. `git status --short` 的每個檔案都在你工作流的可寫路徑內
5. `npm run cf:preview` 能起得來

## GitHub

```bash
gh auth login --hostname github.com --git-protocol https --web   # 店主自己跑
gh repo create 手串-shop --private --source=. --remote=origin
git push -u origin main
```
