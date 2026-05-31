# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述
花卉電商 Demo（backend-project）— Node.js + Express 4 + better-sqlite3 + JWT + EJS + TailwindCSS 的全端電商示範專案。提供 REST API（/api/*）、EJS SSR 前台頁面與後台管理頁面；以 Vitest + Supertest 進行整合測試。

## 常用指令
| 指令 | 說明 |
|------|------|
| `npm start` | 先 build Tailwind CSS，再用 `node server.js` 啟動（預設 port 3001） |
| `npm run dev:server` | 純啟動 server（跳過 CSS build） |
| `npm run dev:css` | Tailwind CSS watch 模式 |
| `npm run css:build` | Tailwind CSS 壓縮輸出 `public/css/output.css` |
| `npm run openapi` | 從 JSDoc 註解產生 `openapi.json` |
| `npm test` | 執行全部 Vitest 整合測試（循序執行） |
| `npx vitest run tests/auth.test.js` | 執行單一測試檔 |

測試使用真實 SQLite DB（非 mock）；`NODE_ENV=test` 會將 bcrypt rounds 降為 1 以加速。新增測試檔後必須把路徑加入 `vitest.config.js` 的 `sequence.files`，否則不會執行。

## 模組系統
全專案使用 CommonJS（`require` / `module.exports`）。例外：`vitest.config.js` 使用 ESM `import`（Vitest 所需）。**新增檔案不可混用 ESM**。

## 關鍵規則

### API 回應格式
所有 `/api/*` 端點一律回傳：`{ data, error, message }`；成功時 `error: null`，失敗時 `data: null`，`error` 為常數字串（`VALIDATION_ERROR`、`UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`STOCK_INSUFFICIENT`、`INVALID_STATUS`、`CART_EMPTY`、`ECPAY_ERROR`、`INTERNAL_ERROR`）。

### 命名慣例（關鍵）
- **Request body / query 參數**：`camelCase`（如 `productId`、`recipientName`）
- **DB 欄位 / API 回應欄位**：`snake_case`（如 `user_id`、`order_no`、`total_amount`）
- 原因：`better-sqlite3` 取回的 row 直接作為回應 `data` 回傳，因此 DB 欄位決定 API 回應格式。

### JWT
使用 HS256、7 天有效；payload 為 `{ userId, email, role }`；`JWT_SECRET` 缺失時 `server.js` 直接 `process.exit(1)`。

### 購物車雙模式認證
有 `Authorization: Bearer` 走 user_id 綁定、僅有 `X-Session-Id` header 走 session_id 綁定；Authorization 有但 token 無效直接回 401，不降級到 session。

### 金額
`price`、`total_amount` 一律以整數（新台幣元）儲存，DB 層有 `CHECK(price > 0)`、`CHECK(stock >= 0)`、`CHECK(quantity > 0)`。

### 訂單交易
使用 `db.transaction()` 包裹：插入 orders、order_items、扣 products.stock、清空 cart_items，失敗整筆 rollback。

### 資料庫重設
刪除 `database.sqlite`、`database.sqlite-shm`、`database.sqlite-wal` 三個檔，下次啟動會重新 seed（seed admin: `admin@hexschool.com` / `12345678`，8 筆花卉商品）。

新增欄位至既有資料表採 idempotent `ALTER TABLE`（try/catch 包裹），參考 `src/database.js` 內 `orders.payment_no` 寫法。

### 新增 API 端點
1. 在 `src/routes/` 加入或修改 router 檔。
2. 在 `app.js` 掛載路由（更具體的前綴必須放在較通用的前面）。
3. 選擇認證模式：公開 / `authMiddleware` / `authMiddleware + adminMiddleware` / 仿 `cartRoutes.js` 的 `dualAuth`。
4. 加 `@openapi` JSDoc，跑 `npm run openapi`。
5. 寫測試，加入 `vitest.config.js` 的 `sequence.files`。

### 計畫歸檔
功能開發使用 `docs/plans/YYYY-MM-DD-<feature>.md` 記錄計畫；完成後移至 `docs/plans/archive/`，並更新 `docs/FEATURES.md` 與 `docs/CHANGELOG.md`。

## 詳細文件
- `docs/ARCHITECTURE.md` — 目錄結構、啟動流程、API 路由表、DB schema、認證機制、ECPay 金流流程
- `docs/DEVELOPMENT.md` — 環境變數表、端點 / middleware / 資料表新增步驟、OpenAPI 註解格式
- `docs/FEATURES.md` — 功能列表與完成狀態
- `docs/TESTING.md` — 測試規範與指南
- `docs/CHANGELOG.md` — 更新日誌
