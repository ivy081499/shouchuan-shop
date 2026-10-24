# 進貨 SOP（匯入貨款 + 關稅）

> **接手的 AI 注意：這份是硬規則，照做，不要自己發明流程。**
> 店主明確要求過：**進貨作業一定要隔離，資料庫一定要兩份。**
> 弄髒店主的正式資料等於毀掉他的成本帳，他要重新對一次 50+ 筆進貨。

---

## 🔴 最重要的一條：資料庫必須兩份

| | 路徑 | 誰能寫 |
|---|---|---|
| **正式資料庫** | `~/Desktop/手串/.data/local.sqlite` | **只有店主確認後才能寫** |
| **作業資料庫** | `<worktree>/.data/local.sqlite` | 你在這裡隨便改 |

**絕對禁止**：在還沒驗證完成前，直接對正式資料庫執行 INSERT / UPDATE / DELETE / ALTER。

驗證方式（每次開工都要跑一次，確認自己在對的地方）：

```bash
pwd                                    # 必須在 .claude/worktrees/<批次名>/ 底下
ls -la .data/local.sqlite              # 必須存在，且是你自己複製的那份
```

不確定自己在哪 → 停手問店主，不要猜。

---

## 開工步驟（照順序，不要跳）

### 1. 備份正式資料庫（合併前）

```bash
cp ~/Desktop/手串/.data/local.sqlite \
   ~/Desktop/手串/backups/before-<批次名>-$(date +%Y%m%d-%H%M).sqlite
```

**這步不能省。** 出事了這是唯一的退路。

> 🔴 **【硬規則】每批進貨要留兩份備份：合併前一份、合併後一份。**
> 店主 2026-10-24 明確要求「以後每次進貨我都要有 DB 備份」。
> 合併前那份是出事時的退路；合併後那份是「這批確認無誤的狀態」，
> 下一批出問題時可以退回這裡，不必從上上批重跑。
> 合併後的備份見「合併」章節第 3 步，**兩份都做完這批才算結束**。

### 2. 開隔離工作區

```bash
cd ~/Desktop/手串
git worktree add .claude/worktrees/<批次名> -b <批次名>
cd .claude/worktrees/<批次名>
npm install
```

### 3. 複製資料庫與圖檔

```bash
mkdir -p .data && cp ../../../.data/local.sqlite .data/local.sqlite
mkdir -p public/uploads/beads && cp ../../../public/uploads/beads/*.png public/uploads/beads/
```

**圖檔一定要複製**：`.gitignore` 排除了 `public/uploads/`，不複製的話珠子縮圖全部不見，
會誤判成「圖片遺失」（實際上還在主資料夾，虛驚一場）。

### 4. 確認自己在隔離環境

```bash
pwd && ls .data/local.sqlite
```

---

## 匯入貨款

1. 開 `/admin/inventory` → 「匯入進貨」分頁
2. 上傳淘寶匯出的 `订单数据.xlsx`
3. **逐列確認每件顆數** —— 這步不可略過（見 ADR-0006）
   - `parsed` 有把握、`estimated` 賣家寫「約」需實際數過、`manual` 完全解析不出要手填
   - 不是珠子的品項（彈力線按米賣、包裝盒、贈品）勾「略過」
4. 填匯率（該批進貨當時的匯率）
5. 按「確認並寫入庫存」

---

## 加關稅

**關稅是一批貨清關收一次，不是每張淘寶訂單各收一次。**
6 張訂單集運併單 → 海關只收一筆 → 掛在 `shipments` 這一層。

店主會口頭告訴你關稅金額（台幣）。

```bash
node --experimental-strip-types scripts/backfill-duty.ts .data/local.sqlite <關稅台幣元> --dry-run
```

**先跑 `--dry-run` 看試算**，確認：
- 關稅攤提加總 = 店主講的金額（分毫不差，腳本會自己擋）
- 單顆成本變化合理

沒問題才拿掉 `--dry-run` 實際寫入。

### 關稅怎麼攤

```
單顆成本 = (貨款 + 攤得運費) × 匯率 + 攤得關稅 ÷ 總顆數
```

兩層，順序不可對調：
1. **運費**：各張淘寶訂單內部，按該單各列貨款比例攤
2. **關稅**：整批跨訂單，按各列「**含運費的台幣金額**」比例攤

⚠️ **關稅基準是台幣不是人民幣**。海關收台幣，且各訂單匯率可能不同，
用人民幣當基準比例會失真。

⚠️ 重複進貨同一種珠子時用**移動加權平均**（`calcMovingAverageCost`），
不要覆蓋成最新價，否則庫存值會偏離實際花費。

---

## 驗證（全部通過才能合併）

```bash
npx tsc --noEmit                                              # 零錯誤
node --experimental-strip-types src/lib/costing.test.ts       # 全通過
node --experimental-strip-types src/lib/customs.test.ts       # 全通過
npm run build                                                 # 建置成功
```

資料面：

```bash
# 關稅攤提加總要等於店主給的金額
sqlite3 .data/local.sqlite "SELECT SUM(duty_share_twd_cents)/100.0 FROM purchase_items;"

# 正式資料庫必須還沒被動到
sqlite3 ~/Desktop/手串/.data/local.sqlite "SELECT COUNT(*) FROM shipments;"   # 應報錯或 0
```

再開 server 讓**店主親眼看過**成本數字，他確認才進下一步。

---

## 合併（店主說可以才做）

### 1. 合併程式碼

```bash
cd ~/Desktop/手串
git merge <批次名>
npx drizzle-kit generate          # 若改過 schema
```

### 2. 正式資料庫套用這批進貨

**正式資料庫要另外處理** —— git 不管資料庫檔案：

```bash
# 對正式資料庫跑 migration
sqlite3 .data/local.sqlite < db/migrations/<新的>.sql

# 再跑一次回補（這次對正式資料庫）
node --experimental-strip-types scripts/backfill-duty.ts .data/local.sqlite <關稅> --dry-run
node --experimental-strip-types scripts/backfill-duty.ts .data/local.sqlite <關稅>
```

**不要把作業資料庫直接覆蓋過去** —— 那份可能含有測試殘留。
一律「在正式庫重跑一次」，讓結果可重現。

> **例外：這批沒有關稅時**（店主回報關稅 0），
> `backfill-duty.ts` 無事可做，跳過即可，不要硬跑一個 0 進去。
> 匯入本身已由 `/admin/inventory` 的確認流程寫入，顆數與成本都已確認過。

### 3. 🔴 備份合併後的正式資料庫（不可省略）

```bash
cp ~/Desktop/手串/.data/local.sqlite \
   ~/Desktop/手串/backups/after-<批次名>-$(date +%Y%m%d-%H%M).sqlite
```

**這份是「這批確認無誤」的存檔點。** 下一批進貨出問題時退回這裡，
不必從更早的備份重跑一次全部批次。

驗收：`ls ~/Desktop/手串/backups/` 應該看得到這批的 `before-` 與 `after-` 各一份。

### 備份命名與保留

| 檔名 | 時機 | 內容 |
|---|---|---|
| `before-<批次名>-<時間>.sqlite` | 開工第 1 步 | 這批匯入前的狀態 |
| `after-<批次名>-<時間>.sqlite` | 合併第 3 步 | 這批確認無誤的狀態 |

- **不要刪舊備份。** SQLite 檔約 200KB，留著幾十批也只有幾 MB。
- `backups/` 已在 `.gitignore` 內，不進 git（資料庫不該進版控）。
  這代表**備份只存在本機**，換機或重灌前要自己複製走。

---

## 收工

```bash
git worktree remove .claude/worktrees/<批次名>     # 確定不用了才刪
```

更新 `docs/tasks/SESSION-LOG.md`，寫下這批貨的關稅金額與批次名稱。

---

## 常見錯誤

| 症狀 | 原因 | 處理 |
|---|---|---|
| 珠子縮圖全部不見 | 忘記複製 `public/uploads/beads/` | 複製過去，圖沒丟 |
| 成本比預期高很多 | 關稅被算兩次 | 從備份還原，重跑一次 |
| 關稅加總對不上 | 有明細 `beads_per_unit` 是 null 被排除 | 先補齊顆數再攤提 |
| 「6 批進貨」之類的數字怪怪的 | 批次數與訂單數搞混 | 一批貨可含多張淘寶訂單 |
