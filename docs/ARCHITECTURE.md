# 系統架構與設計（ARCHITECTURE）

## 目錄結構（每個檔案的用途）

```
2026-ai-adv-homework-course01-main/
├── app.js                      # Express app 建構：載入 middleware、掛載 routes、404 / error handler；module.exports = app
├── server.js                   # 進入點：檢查 JWT_SECRET、app.listen(PORT)；同時 export app 以利測試
├── generate-openapi.js         # 以 swagger-jsdoc 掃描 src/routes/*.js，輸出 openapi.json
├── swagger-config.js           # swaggerOptions：info、servers、securitySchemes（bearerAuth、sessionId）
├── vitest.config.js            # 測試設定：關閉並行、固定 tests 執行順序、hookTimeout 10s
├── .env.example                # 環境變數樣板
├── database.sqlite             # SQLite 主檔（WAL 模式，會額外產生 -shm / -wal）
├── package.json                # scripts、依賴
│
├── src/
│   ├── database.js             # better-sqlite3 單例；啟用 WAL + foreign_keys；initializeDatabase()：CREATE TABLE IF NOT EXISTS + seedAdminUser + seedProducts；含 orders.payment_no 欄位之 idempotent ALTER
│   ├── middleware/
│   │   ├── authMiddleware.js      # 解析 Authorization: Bearer；jwt.verify → req.user = { userId, email, role }；失敗回 401 統一格式
│   │   ├── adminMiddleware.js     # 要求 req.user.role === 'admin'，否則 403 FORBIDDEN；必須在 authMiddleware 之後
│   │   ├── sessionMiddleware.js   # 讀取 X-Session-Id header → req.sessionId（給訪客購物車使用）；全域掛載
│   │   └── errorHandler.js        # 全域錯誤處理；SAFE_MESSAGES 避免洩露內部錯誤；500 固定訊息
│   ├── services/
│   │   └── ecpayService.js        # 綠界 ECPay 服務：CheckMacValue 產生/驗證、AioCheckOut 參數組合、QueryTradeInfo 主動查詢；env 於呼叫時讀取
│   └── routes/
│       ├── authRoutes.js            # /api/auth：register、login、profile
│       ├── productRoutes.js         # /api/products：list、detail（公開）
│       ├── cartRoutes.js            # /api/cart：GET/POST/PATCH/DELETE，內部 dualAuth（JWT or session）
│       ├── orderRoutes.js           # /api/orders：建立、列表、詳情、ECPay 付款（產生表單 + 查詢結果）、模擬付款；全部 authMiddleware 保護
│       ├── adminProductRoutes.js    # /api/admin/products：CRUD（auth + admin）
│       ├── adminOrderRoutes.js      # /api/admin/orders：list、detail（auth + admin）
│       └── pageRoutes.js            # EJS 頁面路由（前台、後台）
│
├── tests/
│   ├── setup.js                # 輔助：app、request、getAdminToken、registerUser
│   ├── auth.test.js
│   ├── products.test.js
│   ├── cart.test.js
│   ├── orders.test.js
│   ├── adminProducts.test.js
│   ├── adminOrders.test.js
│   └── ecpay.test.js           # ECPay CheckMacValue 官方向量、buildMerchantTradeNo、付款 API 整合測試
│
├── views/
│   ├── layouts/                # front / admin layout（EJS）
│   ├── pages/                  # 前台 index、product-detail、cart、checkout、login、orders、order-detail、404
│   └── partials/               # 共用片段
│
└── public/
    ├── css/                    # input.css / output.css（Tailwind）
    ├── js/                     # 前端頁面腳本（index、cart、checkout、login、orders、order-detail、admin-*）
    └── stylesheets/            # 其他樣式
```

## 啟動流程

`npm start` 的呼叫鏈：

1. `css:build`：Tailwind 壓縮輸出到 `public/css/output.css`。
2. `node server.js`
   1. `require('./app')` — 觸發 app.js
   2. `app.js` 頭段：`dotenv.config()` 載入 `.env`
   3. `require('./src/database')` — 建立連線、`PRAGMA journal_mode = WAL`、`PRAGMA foreign_keys = ON`、執行 `CREATE TABLE IF NOT EXISTS`、seed admin user、seed 8 筆商品
   4. 設定 view engine = ejs、`express.static('public')`
   5. 掛載全域 middleware：`cors({ origin: FRONTEND_URL || 'http://localhost:3001' })`、`express.json()`、`express.urlencoded({ extended: false })`、`sessionMiddleware`
   6. 掛載 API routes（見下表）
   7. 掛載 `'/'` 的頁面 routes
   8. 404 handler：`/api/*` 回 JSON `{ data: null, error: 'NOT_FOUND', message: '找不到該路徑' }`；其他 render `pages/404`
   9. `errorHandler` 全域錯誤處理
3. `server.js` 檢查 `process.env.JWT_SECRET` 存在，否則 `process.exit(1)`
4. `app.listen(PORT || 3001)`

## API 路由總覽表

| 前綴 | 檔案 | 認證 | 說明 |
|------|------|------|------|
| `/api/auth` | `src/routes/authRoutes.js` | 部分（`/profile` 需 JWT） | 註冊、登入、取得個人資料 |
| `/api/products` | `src/routes/productRoutes.js` | 公開 | 商品列表與詳情（含分頁） |
| `/api/cart` | `src/routes/cartRoutes.js` | dualAuth（JWT 或 X-Session-Id） | 購物車 CRUD |
| `/api/orders` | `src/routes/orderRoutes.js` | JWT（`router.use(authMiddleware)`） | 建立訂單、列表、詳情、ECPay 付款（產生表單 / 主動查詢）、模擬付款 |
| `/api/admin/products` | `src/routes/adminProductRoutes.js` | JWT + admin 角色 | 後台商品 CRUD |
| `/api/admin/orders` | `src/routes/adminOrderRoutes.js` | JWT + admin 角色 | 後台訂單列表、詳情 |
| `/` | `src/routes/pageRoutes.js` | 無（前端自理） | EJS SSR 頁面 |

## 統一回應格式

所有 `/api/*` 端點一律以此信封回傳（包含成功與錯誤）：

```json
{
  "data": <任意> | null,
  "error": null | "ERROR_CODE_STRING",
  "message": "人類可讀訊息"
}
```

成功範例：

```json
{ "data": { "products": [...], "pagination": {...} }, "error": null, "message": "成功" }
```

失敗範例：

```json
{ "data": null, "error": "UNAUTHORIZED", "message": "請先登入" }
```

**使用過的 error code**：`VALIDATION_ERROR`、`UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`STOCK_INSUFFICIENT`、`CART_EMPTY`、`INVALID_STATUS`、`ECPAY_ERROR`、`INTERNAL_ERROR`。

全域 `errorHandler`（`src/middleware/errorHandler.js`）：500 一律訊息 `伺服器內部錯誤`（不洩露 err.message）；其他狀態碼若 `err.isOperational === true` 才會使用 `err.message`，否則使用 `SAFE_MESSAGES` 的預設文案（400/401/403/404/409/422/429）。

## 認證與授權機制

### JWT
- 簽發：`jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '7d' })`
- 驗證：`jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })`
- 有效期：7 天
- header 格式：`Authorization: Bearer <token>`

### `authMiddleware` 行為
1. 無 `Authorization` header 或非 `Bearer ` 開頭 → 401 `UNAUTHORIZED` / `請先登入`
2. `jwt.verify` 失敗 → 401 `UNAUTHORIZED` / `Token 無效或已過期`
3. DB 查無該 `userId`（使用者已刪除） → 401 `UNAUTHORIZED` / `使用者不存在，請重新登入`
4. 成功：`req.user = { userId, email, role }` 並 `next()`

### `adminMiddleware` 行為
- 必須在 `authMiddleware` 之後使用。
- `req.user.role !== 'admin'` → 403 `FORBIDDEN` / `權限不足`

### `sessionMiddleware`（全域）
- 讀取 `X-Session-Id` header。
- 若存在：`req.sessionId = sessionId`。若不存在：不做任何事（保持 `undefined`）。
- 不會簽發 session id；由前端自行產生並在每次請求帶上。

### `cartRoutes.js` 內部 `dualAuth`（雙模式）
這是本專案非標準機制，務必理解順序：

```
if Authorization 存在且以 'Bearer ' 開頭:
    嘗試 verify
      成功 → req.user = {...}, next()
      失敗 → 直接回 401 Token 無效或已過期   ← 不會降級到 session
else if req.sessionId 存在:
    next()（訪客模式）
else:
    401 UNAUTHORIZED / 請提供有效的登入 Token 或 X-Session-Id
```

購物車內部以 `getOwnerCondition(req)` 決定使用 `user_id` 或 `session_id` 欄位作為擁有者過濾條件。**訪客模式購物車不會在登入後自動合併**（本專案未實作合併邏輯）。

## 資料庫 schema

SQLite；啟動時以 `CREATE TABLE IF NOT EXISTS` 建立。`PRAGMA foreign_keys = ON` 會啟用外鍵約束。所有 PK 皆為 UUID v4 字串。

### users
| 欄位 | 型別 | 約束 / 預設 |
|------|------|-------------|
| id | TEXT | PRIMARY KEY |
| email | TEXT | UNIQUE NOT NULL |
| password_hash | TEXT | NOT NULL（bcrypt，10 rounds；測試 1） |
| name | TEXT | NOT NULL |
| role | TEXT | NOT NULL DEFAULT 'user'，`CHECK(role IN ('user','admin'))` |
| created_at | TEXT | NOT NULL DEFAULT `datetime('now')` |

Seed：`ADMIN_EMAIL` / `ADMIN_PASSWORD`（預設 `admin@hexschool.com` / `12345678`）。

### products
| 欄位 | 型別 | 約束 / 預設 |
|------|------|-------------|
| id | TEXT | PRIMARY KEY |
| name | TEXT | NOT NULL |
| description | TEXT | — |
| price | INTEGER | NOT NULL, `CHECK(price > 0)` |
| stock | INTEGER | NOT NULL DEFAULT 0, `CHECK(stock >= 0)` |
| image_url | TEXT | — |
| created_at | TEXT | NOT NULL DEFAULT `datetime('now')` |
| updated_at | TEXT | NOT NULL DEFAULT `datetime('now')`（更新時於程式端 `SET updated_at = datetime('now')`） |

Seed：8 筆花卉商品（粉色玫瑰花束、白色百合花禮盒、向日葵花束、紫色鬱金香盆栽、乾燥花圈、多肉組合盆、紅玫瑰花束、季節訂閱）。

### cart_items
| 欄位 | 型別 | 約束 |
|------|------|------|
| id | TEXT | PRIMARY KEY |
| session_id | TEXT | 訪客模式時使用；與 user_id 擇一 |
| user_id | TEXT | 會員模式時使用；FK → users(id) |
| product_id | TEXT | NOT NULL，FK → products(id) |
| quantity | INTEGER | NOT NULL DEFAULT 1，`CHECK(quantity > 0)` |

注意：`session_id` / `user_id` 並無 `NOT NULL`；程式層以 `dualAuth` + `getOwnerCondition` 保證其一有值。

### orders
| 欄位 | 型別 | 約束 |
|------|------|------|
| id | TEXT | PRIMARY KEY |
| order_no | TEXT | UNIQUE NOT NULL，格式 `ORD-YYYYMMDD-XXXXX`（X = UUID 前 5 碼大寫） |
| user_id | TEXT | NOT NULL，FK → users(id) |
| recipient_name | TEXT | NOT NULL |
| recipient_email | TEXT | NOT NULL |
| recipient_address | TEXT | NOT NULL |
| total_amount | INTEGER | NOT NULL（整數元） |
| status | TEXT | NOT NULL DEFAULT 'pending'，`CHECK(status IN ('pending','paid','failed'))` |
| payment_no | INTEGER | NOT NULL DEFAULT 0；ECPay 付款嘗試次數，用於組合唯一 MerchantTradeNo |
| created_at | TEXT | NOT NULL DEFAULT `datetime('now')` |

> `payment_no` 欄位於 `initializeDatabase()` 內以 `ALTER TABLE ADD COLUMN` 新增（try/catch 包裹以確保多次啟動時的 idempotent 性）。舊資料庫檔不需刪除即可自動補上欄位。

### order_items
| 欄位 | 型別 | 約束 |
|------|------|------|
| id | TEXT | PRIMARY KEY |
| order_id | TEXT | NOT NULL，FK → orders(id) |
| product_id | TEXT | NOT NULL（無 FK 限制，為了保留已刪除商品的歷史） |
| product_name | TEXT | NOT NULL（下單時快照） |
| product_price | INTEGER | NOT NULL（下單時快照） |
| quantity | INTEGER | NOT NULL |

## 金流 / 第三方整合流程

已整合綠界 ECPay AIO 金流。因本專案運行於本地端，無法接收綠界 Server Notify，故採用**主動查詢**模式。

### 核心模組

- `src/services/ecpayService.js`：ECPay 服務模組，提供 CheckMacValue 產生/驗證、AioCheckOut 參數組合、QueryTradeInfo 查詢
- 環境變數 `ECPAY_*` 讀自 `.env`（`ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`ECPAY_ENV`）

### 付款流程

1. 前端呼叫 `POST /api/orders/:id/payment` → 後端產生 ECPay AIO 表單參數（含 CheckMacValue）
2. 前端動態建立表單並自動提交至綠界付款頁面（`/Cashier/AioCheckOut/V5`）
3. 使用者於綠界完成付款後，透過 `ClientBackURL` 回導至 `/orders/:id?payment=callback`
4. 前端自動呼叫 `POST /api/orders/:id/payment/query` → 後端向綠界 `QueryTradeInfo/V5` 查詢交易狀態
5. `TradeStatus === '1'` 且金額吻合 → 更新 `status = 'paid'`

### 重複付款處理

- orders 表有 `payment_no` 欄位記錄付款嘗試次數
- 每次產生付款表單時遞增，組合 `MerchantTradeNo = order_no（去除-）+ 兩位序號`
- 確保使用者放棄後重試不會因重複 MerchantTradeNo 被綠界拒絕

### 模擬付款（開發用）

原模擬端點 `PATCH /api/orders/:id/pay` 保留，`ECPAY_ENV=production` 時自動停用（回 403）。測試環境啟用 `SimulatePaid=1` 免真刷卡。

## 資料流（以「下單」為例）

```
Client
  │ 1. POST /api/cart (Bearer or X-Session-Id) → sessionMiddleware 解析 → dualAuth → 寫 cart_items
  │ 2. POST /api/orders { recipientName, recipientEmail, recipientAddress } (Bearer)
  ▼
authMiddleware → orderRoutes
  ├─ SELECT cart_items JOIN products WHERE user_id = ?
  ├─ 檢查空車 / 任何商品 quantity > stock
  ├─ 計算 totalAmount
  └─ db.transaction(() => {
        INSERT orders
        for item: INSERT order_items; UPDATE products SET stock = stock - qty
        DELETE cart_items WHERE user_id = ?
     })
  │ 3a. POST /api/orders/:id/payment（正式付款：產生綠界表單）
  ▼
authMiddleware → orderRoutes
  ├─ SELECT orders WHERE id = ? AND user_id = ?；檢查 status === 'pending'
  ├─ UPDATE orders SET payment_no = payment_no + 1（遞增以確保 MerchantTradeNo 唯一）
  ├─ buildAioCheckOutParams(order, items, newPaymentNo, BASE_URL)
  └─ 回 { action_url: '<staging|production>/Cashier/AioCheckOut/V5', params: {...+CheckMacValue} }
  ▼
瀏覽器以 params 動態送出表單 → 綠界付款頁 → 付款完成 → ClientBackURL 回導 `/orders/:id?payment=callback`
  │ 3b. POST /api/orders/:id/payment/query（主動查詢）
  ▼
authMiddleware → orderRoutes
  ├─ SELECT orders：若非 pending → 冪等直接回傳（避免重複查詢）
  ├─ 若 payment_no === 0 → 400 INVALID_STATUS（尚未發起付款）
  ├─ queryTradeInfo(merchantTradeNo) → POST /Cashier/QueryTradeInfo/V5
  ├─ TradeStatus === '1' 且 TradeAmt === total_amount → UPDATE orders SET status = 'paid'
  ├─ TradeStatus === '10200095' → message 交易尚未完成
  └─ 失敗 → 500 ECPAY_ERROR

  │ 3c. PATCH /api/orders/:id/pay { action: "success" }（模擬付款，僅非正式環境可用）
  ▼
authMiddleware → orderRoutes
  ├─ ECPAY_ENV === 'production' → 403 FORBIDDEN（正式環境停用）
  ├─ SELECT orders WHERE id = ? AND user_id = ?；檢查 status === 'pending'
  └─ UPDATE orders SET status = 'paid' | 'failed'
```
