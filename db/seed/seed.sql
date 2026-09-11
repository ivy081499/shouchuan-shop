-- 種子資料：系統預設參數
--
-- 執行：npm run db:seed:local
--
-- 這裡只放「店主之後可以自己在後台改」的參數，不放假的商品或珠子。
-- 金額一律整數新台幣分；匯率為放大 100 倍的整數。

INSERT OR REPLACE INTO settings (key, value, label, updated_at) VALUES
  -- ── 品牌 ──
  ('store_name',      '平凡生活',      '店名（中文）',        unixepoch()),
  ('store_name_en',   'Ordinary Days', '店名（英文）',        unixepoch()),
  ('store_tagline',   '一顆一顆挑的天然石手串，戴在平常的日子裡。', '品牌一句話', unixepoch()),
  ('store_notice',    '',              '結帳頁提醒文字',      unixepoch()),

  -- ── 轉帳收款資訊（請店主自行填寫，系統不預設任何帳號）──
  ('bank_name',       '',              '銀行名稱',            unixepoch()),
  ('bank_code',       '',              '銀行代碼（三碼）',    unixepoch()),
  ('bank_account',    '',              '轉帳帳號',            unixepoch()),
  ('bank_holder',     '',              '戶名',                unixepoch()),

  -- ── 運費 ──
  ('shipping_fee_cents',            '6000',  '運費（分）；6000 = NT$60',          unixepoch()),
  ('free_shipping_threshold_cents', '100000','免運門檻（分）；100000 = NT$1000',  unixepoch()),

  -- ── 進貨 ──
  ('default_fx_rate_x100', '450', '預設匯率（放大100倍）；450 = 4.5 TWD/CNY', unixepoch());
