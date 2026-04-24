# 更新日誌（CHANGELOG）

本專案採 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 格式；版本採 [SemVer](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### Added
- 綠界 ECPay AIO 金流整合：`POST /api/orders/:id/payment`（產生付款表單）、`POST /api/orders/:id/payment/query`（主動查詢付款結果）
- ECPay Server Notify：`POST /api/ecpay/notify`（接收綠界 ReturnURL 回呼，驗 CheckMacValue 更新訂單狀態；同時作為整合測試的 callback 模擬端點）
- ECPay 服務模組 `src/services/ecpayService.js`：CheckMacValue 產生/驗證、AioCheckOut 參數組合、QueryTradeInfo 查詢
- orders 表新增 `payment_no` 欄位，支援重複付款嘗試（每次產生唯一 MerchantTradeNo）
- ECPay 測試 `tests/ecpay.test.js`（21 tests）：官方 CheckMacValue 向量驗證、notify 整合測試（以測試向量 HashKey/HashIV 模擬綠界回調，無需真實刷卡）
- 前端訂單詳情頁「前往付款」→ 綠界付款 → 回導後自動查詢結果
- 模擬付款端點加入正式環境 guard（`ECPAY_ENV=production` 時回 403）
- 專案 Claude Code 設定 `.claude/settings.json`（Bash / WebFetch 權限規則）

### Changed
- 初版 `docs/` 文件集（README、ARCHITECTURE、DEVELOPMENT、FEATURES、TESTING、CHANGELOG）
- 建立 `docs/plans/` 與 `docs/plans/archive/` 目錄
- 專案根目錄新增 `CLAUDE.md`

## [1.0.0] - 2026-04-15

### Added
- 使用者系統：`POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/profile`；JWT HS256 / 7 天
- 商品瀏覽：`GET /api/products`（分頁）、`GET /api/products/:id`
- 購物車（雙模式：JWT 或 X-Session-Id）：`GET/POST/PATCH/DELETE /api/cart[/:itemId]`
- 訂單：`POST /api/orders`（transaction 扣庫存 + 清空購物車）、`GET /api/orders`、`GET /api/orders/:id`、`PATCH /api/orders/:id/pay`（模擬）
- 後台商品 CRUD：`/api/admin/products`（含 pending 訂單保護之刪除防線）
- 後台訂單：`GET /api/admin/orders`（狀態過濾）、`GET /api/admin/orders/:id`
- EJS SSR 前台頁面與後台管理頁面（`views/`）
- TailwindCSS 樣式 pipeline
- OpenAPI 3.0.3 規格產生（`npm run openapi`）
- Vitest + Supertest 整合測試（6 組）

### 資料庫 schema
- `users`、`products`、`cart_items`、`orders`、`order_items`（UUID PK、SQLite WAL、外鍵啟用）
- 啟動時 seed：admin 帳號 + 8 筆花卉商品
