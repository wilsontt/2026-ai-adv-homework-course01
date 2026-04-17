# CLAUDE.md

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
| `npm test` | 執行 Vitest 整合測試（循序執行） |

## 關鍵規則
- 所有 API 一律回傳統一信封格式：`{ data, error, message }`；成功時 `error: null`，失敗時 `data: null`，`error` 為常數字串（例 `VALIDATION_ERROR`、`UNAUTHORIZED`、`NOT_FOUND`、`CONFLICT`、`STOCK_INSUFFICIENT`、`INVALID_STATUS`、`CART_EMPTY`、`INTERNAL_ERROR`）。
- JWT 使用 HS256、7 天有效；payload 為 `{ userId, email, role }`；`JWT_SECRET` 缺失時 server.js 直接 `process.exit(1)`。
- 購物車支援「雙模式認證」：有 `Authorization: Bearer` 走 user_id 綁定、僅有 `X-Session-Id` header 走 session_id 綁定；Authorization 有但 token 無效直接回 401，不降級到 session。
- 金額（price、total_amount）一律以整數（新台幣元）儲存，DB 層有 `CHECK(price > 0)`、`CHECK(stock >= 0)`、`CHECK(quantity > 0)`。
- 訂單建立使用 `db.transaction()` 包裹：插入 orders、order_items、扣 products.stock、清空 cart_items，失敗會整筆 rollback。
- 功能開發使用 docs/plans/ 記錄計畫；完成後移至 docs/plans/archive/。

## 詳細文件
- ./docs/README.md — 項目介紹與快速開始
- ./docs/ARCHITECTURE.md — 架構、目錄結構、資料流
- ./docs/DEVELOPMENT.md — 開發規範、命名規則
- ./docs/FEATURES.md — 功能列表與完成狀態
- ./docs/TESTING.md — 測試規範與指南
- ./docs/CHANGELOG.md — 更新日誌
