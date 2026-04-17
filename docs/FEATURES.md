# 專案功能清單（FEATURES）

所有核心功能均已實作並以 Vitest 覆蓋。狀態：✅ 完成。

## 功能狀態總覽

| # | 功能 | 狀態 | 測試檔 |
|---|------|------|--------|
| 1 | 使用者認證（Auth） | ✅ | `tests/auth.test.js` |
| 2 | 商品瀏覽（Products） | ✅ | `tests/products.test.js` |
| 3 | 購物車（Cart，雙模式認證） | ✅ | `tests/cart.test.js` |
| 4 | 訂單（Orders） | ✅ | `tests/orders.test.js` |
| 5 | 後台商品管理（Admin Products） | ✅ | `tests/adminProducts.test.js` |
| 6 | 後台訂單管理（Admin Orders） | ✅ | `tests/adminOrders.test.js` |
| 7 | EJS 前台 / 後台頁面 | ✅ | —（手動驗證） |
| 8 | OpenAPI / Swagger 文件 | ✅ | —（`npm run openapi`） |
| 9 | 綠界 ECPay 金流整合 | ✅ | `tests/ecpay.test.js` |

---

## 1. 使用者認證（Auth） ✅

**行為描述**：提供 email + 密碼註冊、登入，並以 JWT（HS256、7 天）維持狀態。JWT payload 為 `{ userId, email, role }`；前端需放入 `Authorization: Bearer <token>` header。註冊成功會直接簽發 token 免再登入一次。密碼以 bcrypt 10 rounds 雜湊（測試環境降為 1 rounds 加速）。

### `POST /api/auth/register` — 註冊
- body（必填）：`email`、`password`、`name`
- 驗證：
  - 缺欄位 → 400 `VALIDATION_ERROR` / `email、password、name 為必填欄位`
  - email 不符 `^[^\s@]+@[^\s@]+\.[^\s@]+$` → 400 `VALIDATION_ERROR` / `Email 格式不正確`
  - `password.length < 6` → 400 `VALIDATION_ERROR` / `密碼至少需要 6 個字元`
  - email 已存在 → 409 `CONFLICT` / `Email 已被註冊`
- 成功：201，回 `{ user: { id, email, name, role }, token }`；`role` 預設 `'user'`

### `POST /api/auth/login` — 登入
- body（必填）：`email`、`password`
- 錯誤：
  - 缺欄位 → 400 `VALIDATION_ERROR`
  - 帳號不存在 **或** 密碼錯誤 → 均回 401 `UNAUTHORIZED` / `Email 或密碼錯誤`（避免帳號列舉）
- 成功：200，回 `{ user, token }`

### `GET /api/auth/profile` — 個人資料
- 需 Bearer JWT。
- 401 情境（三種，見 ARCHITECTURE.md authMiddleware）。
- 使用者被刪除（DB 查不到對應 id）→ 路由內再保險地回 404 `NOT_FOUND` / `使用者不存在`。
- 成功：200，回 `{ id, email, name, role, created_at }`。

---

## 2. 商品瀏覽（Products） ✅

**行為描述**：公開端點，不需認證。列表支援分頁，預設 `page=1, limit=10`；`limit` 被 clamp 在 `[1, 100]`，`page` 最小為 1。排序固定 `created_at DESC`。

### `GET /api/products?page=&limit=`
- query：
  - `page`：整數，預設 `1`，小於 1 會被提升至 1
  - `limit`：整數，預設 `10`，範圍 `[1, 100]`
- 成功：`{ products: Product[], pagination: { total, page, limit, totalPages } }`
- `totalPages = Math.ceil(total / limit)`

### `GET /api/products/:id`
- 找不到 → 404 `NOT_FOUND` / `商品不存在`
- 成功：單一 product 物件（含 `id, name, description, price, stock, image_url, created_at, updated_at`）

---

## 3. 購物車（Cart） ✅ — 雙模式認證

**行為描述**：支援「會員模式」與「訪客模式」二擇一。會員帶 `Authorization: Bearer`，以 `user_id` 綁定；訪客帶 `X-Session-Id` header（任意字串，前端自行產生），以 `session_id` 綁定。加入已存在之商品會**累加**數量而非新增一筆；累加後 / 新增時均檢查 `quantity > product.stock`。

**關鍵行為**：若請求帶了 `Authorization` 但 token 無效，直接回 401，**不會**降級到訪客模式。會員登入後訪客購物車**不會自動合併**。

### `GET /api/cart` — 查看購物車
- 認證：dualAuth（JWT 或 X-Session-Id）
- 成功：`{ items: [{ id, product_id, quantity, product: { name, price, stock, image_url } }], total }`
- `total = Σ product.price * quantity`

### `POST /api/cart` — 加入購物車
- body：`{ productId, quantity = 1 }`
- 驗證：
  - 缺 `productId` → 400 `VALIDATION_ERROR`
  - `quantity` 非正整數 → 400 `VALIDATION_ERROR`
  - 商品不存在 → 404 `NOT_FOUND`
  - 存在同商品時，累加後 `newQty > product.stock` → 400 `STOCK_INSUFFICIENT`
  - 新增時 `qty > product.stock` → 400 `STOCK_INSUFFICIENT`
- 成功：200（**不是 201**），回 `{ id, product_id, quantity }`

### `PATCH /api/cart/:itemId` — 修改數量
- body：`{ quantity }`（必須正整數）
- 只能修改自己（依擁有者條件 user_id 或 session_id）
- 項目不存在 / 非自己的 → 404 `NOT_FOUND` / `購物車項目不存在`
- `qty > product.stock` → 400 `STOCK_INSUFFICIENT`

### `DELETE /api/cart/:itemId` — 移除項目
- 同上擁有者檢查。
- 成功：200，`data: null`，`message: 已從購物車移除`

---

## 4. 訂單（Orders） ✅

**行為描述**：所有端點需會員 JWT（`router.use(authMiddleware)`）。下單會以 **單一 transaction** 執行：建立 orders、建立 order_items、扣除 products.stock、清空該使用者的 cart_items；任何一步失敗則整體 rollback。訂單號格式 `ORD-YYYYMMDD-XXXXX`（X 為 UUID 前 5 碼大寫）。下單時會把商品名稱與單價**快照**寫入 order_items，之後商品價格變動不影響歷史訂單。

**付款路徑**：正式付款走 ECPay（見第 9 節）。原 `PATCH /api/orders/:id/pay` 模擬端點保留給開發測試用，會在 `ECPAY_ENV=production` 時回 403 FORBIDDEN 自動停用。

### `POST /api/orders` — 從購物車建立訂單
- body（必填）：`recipientName`、`recipientEmail`、`recipientAddress`
- 流程：
  1. 檢查收件欄位 → 缺 400 `VALIDATION_ERROR`
  2. email 格式 → 400 `VALIDATION_ERROR`
  3. 讀取該 user 的 cart_items（JOIN products）
  4. 空車 → 400 `CART_EMPTY` / `購物車為空`
  5. 任一 `quantity > product.stock` → 400 `STOCK_INSUFFICIENT`，`message` 含所有不足商品名
  6. 計算 `totalAmount`
  7. Transaction：INSERT orders → for each item: INSERT order_items + `UPDATE products SET stock = stock - ?` → DELETE cart_items WHERE user_id
- 成功：201，回 `{ id, order_no, total_amount, status: 'pending', items: [{ product_name, product_price, quantity }], created_at }`

### `GET /api/orders` — 自己的訂單列表
- 僅回自己的訂單（`WHERE user_id = ?`），`ORDER BY created_at DESC`。
- 精簡欄位：`{ id, order_no, total_amount, status, created_at }`（不含 items 與收件資訊）。

### `GET /api/orders/:id` — 訂單詳情
- 僅能看自己的（`WHERE id = ? AND user_id = ?`）；他人訂單或不存在 → 404 `NOT_FOUND` / `訂單不存在`
- 回完整 order 物件 + `items: order_items[]`（含 `id, product_id, product_name, product_price, quantity`）

### `PATCH /api/orders/:id/pay` — 模擬付款（開發測試用）
- body：`{ action: "success" | "fail" }`
- 驗證：
  - `ECPAY_ENV === 'production'` → 403 `FORBIDDEN` / `正式環境不允許模擬付款`（正式環境自動停用）
  - action 非 `success`/`fail` → 400 `VALIDATION_ERROR` / `action 必須為 success 或 fail`
  - 訂單不存在或非自己的 → 404 `NOT_FOUND`
  - `order.status !== 'pending'` → 400 `INVALID_STATUS` / `訂單狀態不是 pending，無法付款`
- 成功：將 status 更新為 `paid` / `failed`，回完整 order + items
- **注意**：付款失敗不會還原庫存（庫存在下單當下已扣）。若需還原，需新增補償邏輯。

---

## 5. 後台商品管理（Admin Products） ✅

**行為描述**：`router.use(authMiddleware, adminMiddleware)`；非 admin 會被 403 FORBIDDEN 擋下。刪除商品時若該商品存在於 `pending` 狀態的訂單，會 409 CONFLICT 拒絕，以保護歷史訂單（order_items.product_id 無 FK 強制，但程式層設下防線）。

### `GET /api/admin/products?page=&limit=`
- 同 `/api/products`，但要求 admin。

### `POST /api/admin/products`
- body（必填）：`name`、`price`（正整數）、`stock`（非負整數）；`description`、`image_url` 選填
- 驗證：
  - 缺 `name` → 400
  - `price` 非正整數 → 400
  - `stock` 非非負整數 → 400
- 成功：201，回新建 product

### `PUT /api/admin/products/:id`
- 局部更新（未提供的欄位保留原值）；但提供 `name === ''` 或無效 `price` / `stock` 會 400
- 商品不存在 → 404
- 會更新 `updated_at = datetime('now')`

### `DELETE /api/admin/products/:id`
- 不存在 → 404
- 若有任何 `orders.status = 'pending'` 的訂單仍引用此商品 → 409 `CONFLICT` / `此商品存在未完成的訂單，無法刪除`
- 成功：`data: null`、`message: 商品刪除成功`

---

## 6. 後台訂單管理（Admin Orders） ✅

### `GET /api/admin/orders?page=&limit=&status=`
- query：
  - 分頁同上
  - `status`：可選，僅接受 `pending` / `paid` / `failed`，其他值會被忽略（視為不過濾）
- 成功：`{ orders: Order[], pagination }`；每筆 order 為完整欄位（含 `user_id`、`recipient_*`、`total_amount`、`status`）。

### `GET /api/admin/orders/:id`
- 任一使用者的訂單皆可查（admin 權限）
- 不存在 → 404
- 成功：`{ ...order, items: order_items[], user: { name, email } | null }`（user 為該訂單擁有者，非 admin 自己）

---

## 7. EJS 前台 / 後台頁面 ✅

| 路徑 | 樣板 | 說明 |
|------|------|------|
| `GET /` | `pages/index` | 首頁（商品列表） |
| `GET /products/:id` | `pages/product-detail` | 商品詳情；locals 帶 `productId` |
| `GET /cart` | `pages/cart` | 購物車 |
| `GET /checkout` | `pages/checkout` | 結帳表單 |
| `GET /login` | `pages/login` | 登入 / 註冊 |
| `GET /orders` | `pages/orders` | 我的訂單 |
| `GET /orders/:id` | `pages/order-detail` | 訂單詳情；locals 帶 `orderId`、`paymentResult`（來自 `?payment=`） |
| `GET /admin/products` | `pages/admin/products`（admin layout） | 商品管理 |
| `GET /admin/orders` | `pages/admin/orders`（admin layout） | 訂單管理 |

渲染流程：route 先 render `pages/<name>` 成 `body` 字串，再 render 對應 `layouts/front` 或 `layouts/admin` 並把 `body` 傳入（兩段式渲染，見 `pageRoutes.js` 的 `renderFront` / `renderAdmin`）。每頁以 locals 帶 `pageScript`，layout 依此載入 `/js/<pageScript>.js`。

登入狀態由前端 JS（localStorage）判斷，**頁面路由本身不做認證**；API 才是授權邊界。

---

## 8. OpenAPI / Swagger 文件 ✅

- 每個 route handler 前以 `@openapi` JSDoc 描述規格
- `swagger-config.js` 定義 `securitySchemes.bearerAuth`、`securitySchemes.sessionId`
- `npm run openapi` 產生 `openapi.json`（掃描 `./src/routes/*.js`）

---

## 9. 綠界 ECPay 金流整合 ✅

**行為描述**：使用綠界 AIO 全方位金流（Credit / ATM / WebATM / CVS / Barcode / ApplePay 等）。本專案運行於本地端，無法接收綠界 Server 端 ReturnURL 通知，因此採用**前端主動查詢**模式取代 webhook：付款完成後綠界透過 `ClientBackURL` 將瀏覽器導回 `/orders/:id?payment=callback`，前端再呼叫 `/payment/query` 向綠界查詢交易狀態並更新本地訂單。

**核心機制**：

- **CheckMacValue**：SHA256 簽章，採用綠界 .NET 風格的 URL 編碼（`encodeURIComponent` → `%20` 轉 `+`、`~` 轉 `%7e`、`'` 轉 `%27` → 全小寫 → 還原 `.NET` 不編碼字元 `- _ . ! * ( )`）。參數依 key 不分大小寫排序，前後夾 `HashKey=...` 與 `&HashIV=...`，SHA256 後轉大寫 hex。實作在 `src/services/ecpayService.js:generateCheckMacValue`，通過官方 5 組測試向量驗證。
- **MerchantTradeNo**：格式 `order_no（去除 '-'）+ 兩位 payment_no`，最多 20 字元（例：`ORD20260417ABCDE01`）。每次產生付款表單會遞增 `orders.payment_no`，確保使用者放棄付款後重試時不會因為 MerchantTradeNo 重複被綠界拒絕。
- **環境切換**：`ECPAY_ENV=staging`（預設）使用 `https://payment-stage.ecpay.com.tw`；`production` 使用 `https://payment.ecpay.com.tw`。所有 env 於呼叫時以 `getConfig()` 讀取，不在模組載入時快取，便於測試切換。
- **ItemName 處理**：以 `商品名 xN` 用 `#` 串接所有 order_items；若總長超過 200 字元會截短並加 `...`。
- **測試環境免刷卡**：綠界 staging 環境啟用 `SimulatePaid=1` 可模擬付款（本服務未主動帶，由綠界頁面內選擇）。

### `POST /api/orders/:id/payment` — 產生 ECPay 付款表單參數

- 需 Bearer JWT。
- 訂單不存在或非自己的 → 404 `NOT_FOUND` / `訂單不存在`
- `order.status !== 'pending'` → 400 `INVALID_STATUS` / `訂單狀態不是 pending，無法付款`
- 流程：
  1. 讀取 order 及其 order_items
  2. `UPDATE orders SET payment_no = payment_no + 1`
  3. `buildAioCheckOutParams()` 組合所有必要參數與 `CheckMacValue`
- 成功：200，回 `{ action_url: '<base>/Cashier/AioCheckOut/V5', params: { MerchantID, MerchantTradeNo, MerchantTradeDate, PaymentType, TotalAmount, TradeDesc, ItemName, ReturnURL, ClientBackURL, ChoosePayment, EncryptType, NeedExtraPaidInfo, CheckMacValue } }`
- 前端收到後以 `action_url` 為 `<form action>`、`params` 逐一作為 `<input hidden>` 動態建立並 submit，即自動跳轉至綠界付款頁。

### `POST /api/orders/:id/payment/query` — 查詢綠界付款結果

- 需 Bearer JWT。
- 訂單不存在或非自己的 → 404 `NOT_FOUND`
- **冪等保護**：若 `order.status !== 'pending'` 直接回傳現有訂單與 items（避免重複向綠界查詢已完成訂單）。
- `order.payment_no === 0` → 400 `INVALID_STATUS` / `尚未發起付款`
- 流程：
  1. 以 `buildMerchantTradeNo(order_no, payment_no)` 計算 MerchantTradeNo
  2. 呼叫 `queryTradeInfo()` → POST `/Cashier/QueryTradeInfo/V5`
  3. 依 `TradeStatus` 判讀：
     - `'1'` 且 `TradeAmt === order.total_amount` → `UPDATE orders SET status = 'paid'`，`message: 付款成功`
     - `'10200095'` → 訊息 `交易尚未完成，請稍後再查詢`（保持 pending）
     - `'0'` → 訊息 `尚未付款`（保持 pending）
     - 其他狀態 → 保持 pending，`message: 付款查詢完成`
- 綠界 HTTP 請求失敗 / JSON 解析異常 → 500 `ECPAY_ERROR` / `綠界查詢失敗：<原因>`
- 成功：200，回 `{ ...order, items }`

### 前端整合點（`public/js/order-detail.js`）

1. 訂單為 `pending` 時顯示「前往付款」按鈕 → 呼叫 `/payment` → 以回傳的 `action_url` / `params` 動態建表單 submit。
2. 頁面掛載時檢查 query string `?payment=callback` → 自動呼叫 `/payment/query` → 依 `data.status` 更新 UI。
3. 查詢結果為「尚未完成」時提示使用者稍後再查。

---

## 未完成 / 佔位（⚠️）

- **訪客購物車合併**：登入後 `session_id` 綁定的 cart_items 不會自動遷移到 `user_id`。
- **訂單付款失敗不回滾庫存**：設計上將失敗單視為保留庫存，若要回滾需新增補償 transaction。
- **綠界 Server Notify（ReturnURL）**：目前未實作 webhook 驗證端點（本地端無法接收）。若要部署至公網，應新增 `POST /api/ecpay/notify` 並以 `verifyCheckMacValue()` 驗簽、回傳 `1|OK`。
