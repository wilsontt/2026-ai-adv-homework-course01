# 開發規範與指南（DEVELOPMENT）

## 模組系統
- 全專案使用 CommonJS（`require` / `module.exports`）。
- 例外：`vitest.config.js` 為 ESM `import`，因 Vitest 需要。
- 不要在新增檔案時混用 ESM `import/export`，會與現有 require 衝突。

## 命名規則對照表

| 對象 | 規則 | 範例 |
|------|------|------|
| 檔名（routes / middleware） | camelCase + 描述性後綴 | `authRoutes.js`、`adminMiddleware.js`、`errorHandler.js` |
| 檔名（測試） | camelCase + `.test.js` | `adminProducts.test.js` |
| 檔名（EJS 頁面） | kebab-case | `product-detail.ejs`、`order-detail.ejs` |
| 檔名（前端 JS） | kebab-case | `public/js/admin-products.js`、`public/js/product-detail.js` |
| JS 變數 / 函式 | camelCase | `orderId`、`generateOrderNo` |
| Request body / query 欄位 | camelCase | `productId`、`recipientName`、`recipientEmail` |
| DB 欄位 / API 回應欄位 | snake_case | `user_id`、`order_no`、`total_amount`、`image_url`、`created_at` |
| 錯誤碼（`error` 欄位） | UPPER_SNAKE_CASE | `VALIDATION_ERROR`、`STOCK_INSUFFICIENT` |
| 常數 | UPPER_SNAKE_CASE | `SAFE_MESSAGES` |
| 角色 / 狀態列舉值 | lower-case 字串 | `'user'`、`'admin'`、`'pending'`、`'paid'`、`'failed'` |

**關鍵慣例**：request 用 camelCase、DB 與 response 用 snake_case（因直接把 `better-sqlite3` 取回的 row 當 response `data` 回傳）。新增欄位請沿用此約定。

## 統一回應格式

所有新端點必須回：

```js
{ data, error, message }
```

成功：`error: null`，`data` 為具體內容。  
失敗：`data: null`，`error` 為錯誤碼字串，`message` 為繁中說明。

可用的既有錯誤碼：`VALIDATION_ERROR`、`UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`STOCK_INSUFFICIENT`、`CART_EMPTY`、`INVALID_STATUS`、`ECPAY_ERROR`、`INTERNAL_ERROR`。新增一律走 UPPER_SNAKE_CASE。

## 環境變數表

| 變數 | 用途 | 必要性 | 預設 | 備註 |
|------|------|--------|------|------|
| `JWT_SECRET` | JWT 簽章密鑰 | ✅ 必填 | — | `server.js` 缺失時 `process.exit(1)` |
| `PORT` | Server 埠號 | 選填 | `3001` | |
| `BASE_URL` | 自我 URL（目前僅供前端模板引用） | 選填 | — | |
| `FRONTEND_URL` | CORS origin | 選填 | `http://localhost:3001` | |
| `ADMIN_EMAIL` | 預設 admin 帳號 | 選填 | `admin@hexschool.com` | 僅在 DB 尚無該 email 時 seed |
| `ADMIN_PASSWORD` | 預設 admin 密碼 | 選填 | `12345678` | seed 時以 bcrypt 10 rounds 雜湊（`NODE_ENV=test` 時為 1） |
| `NODE_ENV` | 環境 | 選填 | — | `test` 時 bcrypt 降為 1 round 加速測試 |
| `ECPAY_MERCHANT_ID` | 綠界商店代號 | 選填 | `3002607` | 測試環境預設值 |
| `ECPAY_HASH_KEY` | 綠界 HashKey | 選填 | — | 用於 CheckMacValue 計算 |
| `ECPAY_HASH_IV` | 綠界 HashIV | 選填 | — | 用於 CheckMacValue 計算 |
| `ECPAY_ENV` | 綠界環境 | 選填 | `staging` | `staging` 或 `production` |

## 新增一個 API 端點的步驟

1. **挑對 router 檔**：依資源放入 `src/routes/`。若為新資源建立新檔（e.g. `src/routes/couponRoutes.js`）。
2. **在 app.js 掛載**：
   ```js
   app.use('/api/coupons', require('./src/routes/couponRoutes'));
   ```
   順序重要：更具體的前綴要先於較通用的（`/api/admin/orders` 須放在 `/api/orders` 之前，否則會被先匹配）。
3. **決定認證模式**：
   - 公開：不加 middleware。
   - 需登入：`router.use(authMiddleware)` 或在單一 route `router.get('/x', authMiddleware, handler)`。
   - 需管理員：`router.use(authMiddleware, adminMiddleware)`（順序不可反）。
   - 會員/訪客雙模式：參考 `cartRoutes.js` 的 `dualAuth` 函式。
4. **撰寫 handler**：
   - body 驗證 → 失敗 `400 VALIDATION_ERROR`
   - 資源查詢 → 找不到 `404 NOT_FOUND`
   - 業務檢查 → 衝突 `409 CONFLICT`、狀態不符 `400 INVALID_STATUS` 等
   - 成功 `200`（或建立類 `201`），統一信封
5. **加 `@openapi` JSDoc 註解**（見下節）。
6. **寫測試**（`tests/<name>.test.js`）並把檔名加入 `vitest.config.js` 的 `sequence.files`。
7. **跑一次** `npm test` + `npm run openapi` 確認沒破壞。

## 新增一個 Middleware 的步驟

1. 在 `src/middleware/` 建立 `<name>Middleware.js`。
2. 簽名：`function xxxMiddleware(req, res, next) { ... }`；失敗以統一信封回傳，成功呼叫 `next()`。
3. 需讀取 `req.user` 者，必須掛在 `authMiddleware` 之後。
4. 全域 middleware 在 `app.js` 的「Global middleware」區塊註冊；route 專屬則在該 router 內 `router.use(...)`。

## 新增一張 DB 資料表 / 欄位的步驟

本專案無 migration 工具，直接修改 `src/database.js` 的 `initializeDatabase()`：

1. **加新表**：在 `db.exec` 樣板字串中加入 `CREATE TABLE IF NOT EXISTS <name> (...)`。使用 UUID 字串 PK；時間欄 `TEXT NOT NULL DEFAULT (datetime('now'))`。
2. **改既有表（加欄位）**：`CREATE TABLE IF NOT EXISTS` 對已存在的表不會新增欄位。本專案採 idempotent `ALTER TABLE` 模式（try/catch 包裹，欄位已存在時吞掉例外），可參考 `src/database.js` 內 `orders.payment_no` 的寫法；舊資料庫檔不需刪除即可自動補欄位。正式環境請改走 migration 工具。
3. **重設資料庫**：刪除 `database.sqlite`、`database.sqlite-shm`、`database.sqlite-wal` 三個檔，下次啟動會重新 seed。

## JSDoc / OpenAPI 註解格式

每個 route handler 之前以 `@openapi` JSDoc 撰寫 OpenAPI 3.0.3 片段，`swagger-jsdoc` 會掃描合併：

```js
/**
 * @openapi
 * /api/<path>:
 *   <method>:
 *     summary: 一句話中文摘要
 *     tags: [<TagGroup>]
 *     security:
 *       - bearerAuth: []     # 需登入時加
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [field1]
 *             properties:
 *               field1: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { ... }
 *                 error: { type: string, nullable: true }
 *                 message: { type: string }
 *       400: { description: 參數錯誤 }
 */
router.get('/x', (req, res) => { ... });
```

- `tags` 沿用現有：`Auth`、`Products`、`Cart`、`Orders`、`Admin Products`、`Admin Orders`。
- `securitySchemes` 在 `swagger-config.js` 已定義 `bearerAuth`（JWT）與 `sessionId`（X-Session-Id header）。
- `npm run openapi` 會從 `src/routes/*.js` 產生 `openapi.json`。

## 計畫歸檔流程

新功能、重構或大幅修改行為時：

1. **計畫檔案命名格式**：`docs/plans/YYYY-MM-DD-<feature-name>.md`（kebab-case）。
2. **計畫文件結構**：
   ```markdown
   # <功能名稱>

   ## User Story
   作為 <角色>，我希望 <行為>，以便 <價值>。

   ## Spec
   - 端點 / 資料模型 / 回應格式
   - 錯誤情境
   - 非功能需求（效能、相容性）

   ## Tasks
   - [ ] 1. ...
   - [ ] 2. ...
   ```
3. **功能完成後**：
   - 將檔案移至 `docs/plans/archive/`。
   - 更新 `docs/FEATURES.md`（功能狀態、行為描述）。
   - 更新 `docs/CHANGELOG.md`（於最新版本節新增條目）。
