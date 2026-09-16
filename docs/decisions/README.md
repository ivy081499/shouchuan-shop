# 決策紀錄（ADR）

**這裡記錄「已經決定好、不要再討論」的事。**

看到某個設計覺得奇怪時，先來這裡查有沒有紀錄。有紀錄代表已經權衡過了，不要自行改掉。

## 格式

一個決策一個檔案，`ADR-NNNN-短標題.md`，內容四段：

```markdown
# ADR-0001 標題

**狀態**：已採用 | 已取代（被 ADR-XXXX 取代）
**日期**：YYYY-MM-DD

## 背景
為什麼要做這個決定

## 決策
決定了什麼

## 後果
好處、代價、以及要注意什麼
```

## 規則

- **只新增，不修改。** 決策改變了就寫新的 ADR，把舊的標為「已取代」。
- 重大技術選擇、業務規則取捨都該留一筆。

## 索引

| 編號 | 標題 | 狀態 |
|---|---|---|
| [0001](ADR-0001-cloudflare-stack.md) | 選擇 Cloudflare 全家桶 | 已採用 |
| [0002](ADR-0002-no-payment-gateway.md) | 不串金流，人工確認轉帳 | 已採用 |
| [0003](ADR-0003-money-as-integer-cents.md) | 金額一律整數新台幣分 | 已採用 |
| [0004](ADR-0004-stock-deduct-on-payment.md) | 付款確認才扣庫存（接受超賣風險） | 已採用 |
| [0005](ADR-0005-schema-freeze.md) | Schema 凍結與解凍程序 | 已採用 |
| [0006](ADR-0006-import-requires-confirmation.md) | 匯入必須人工逐列確認 | 已採用 |
| [0007](ADR-0007-no-customer-login.md) | 前台訪客結帳，不做客戶登入 | 前台部分被 0008 取代 |
| [0008](ADR-0008-freestore-for-storefront.md) | **前台改用 FreeStore，本系統專注後台** | 已採用 |
| [0009](ADR-0009-brand-name.md) | 品牌名稱：平凡生活 / Ordinary Days | 已採用 |
| [0010](ADR-0010-recipe-bead-picker.md) | 配方編輯器選珠：搜尋、分類、庫存0可選、縮圖 | 已採用 |
| [0011](ADR-0011-customs-duty.md) | **關稅攤提與進貨隔離流程** | 已採用 |
