# 測試規範與指南（TESTING）

## 測試框架
- **Vitest 4**（`globals: true`，等同全域 `describe` / `it` / `expect` / `beforeAll` 等）。
- **Supertest 7** 直接對 `app`（不監聽 port）打 HTTP request。

## 執行
```bash
npm test        # 等同 vitest run（非 watch）
```

## 關鍵設定（`vitest.config.js`）

| 設定 | 值 | 原因 |
|------|-----|------|
| `fileParallelism` | `false` | 所有測試檔共用同一個 `database.sqlite`，並行會互相污染 |
| `sequence.files` | 指定順序 | 下游測試依賴上游建立的資料（商品、admin user） |
| `hookTimeout` | `10000` | bcrypt 雜湊較慢；`NODE_ENV=test` 時 rounds 降為 1 仍預留緩衝 |

## 測試檔案與執行順序

```
1. tests/auth.test.js            # 註冊、登入、duplicate email、錯誤密碼、profile
2. tests/products.test.js        # 列表、分頁、詳情、不存在 id
3. tests/cart.test.js            # 訪客加入、改數量、移除、會員加入、dualAuth
4. tests/orders.test.js          # 下單（含 transaction）、列表、詳情、模擬付款
5. tests/adminProducts.test.js   # admin 列表、新增、編輯、刪除（含 pending 訂單保護）
6. tests/adminOrders.test.js     # admin 列表（status 過濾）、詳情
7. tests/ecpay.test.js           # CheckMacValue 官方向量、buildMerchantTradeNo、付款 API 整合
```

### 執行依賴關係

| 測試檔 | 依賴 |
|--------|------|
| `auth.test.js` | 獨立 |
| `products.test.js` | 依賴 `database.js` 的 seed 商品（啟動時自動 seed） |
| `cart.test.js` | 需 seed 商品；`beforeAll` 呼叫 `/api/products` 取第一筆 productId |
| `orders.test.js` | 需 seed 商品 + 能 `registerUser`（auth 正常）；`beforeAll` 註冊 + 加購物車 |
| `adminProducts.test.js` | 需 seed admin（`admin@hexschool.com` / `12345678`）；`beforeAll` 呼叫 `getAdminToken` |
| `adminOrders.test.js` | 同上 + 需先能註冊使用者並建立一筆訂單 |
| `ecpay.test.js` | 需 seed 商品（找 `stock > 0` 取第一筆下單）+ 能 `registerUser`；CheckMacValue 單元測試使用官方固定 HashKey / HashIV，不依賴 env |

> 測試**共用** `database.sqlite`，不會在每次測試間清空。若手動執行單檔失敗，先 `npm test` 跑一輪完整流程，或刪除 `database.sqlite*` 讓啟動時重新 seed。

## 輔助函式（`tests/setup.js`）

```js
const { app, request, getAdminToken, registerUser } = require('./setup');
```

| 函式 | 行為 |
|------|------|
| `app` | 從 `../app` 匯出的 Express app（不 `listen`） |
| `request` | `supertest` 本體；用 `request(app).<method>(...)` |
| `getAdminToken()` | 以 seed admin 登入，回傳 JWT string |
| `registerUser({ email?, password?, name? })` | 註冊並回傳 `{ token, user }`；email 未指定時自動產生唯一字串（`test-<timestamp>-<random>@example.com`） |

## 撰寫新測試的步驟

1. 在 `tests/` 新增 `<name>.test.js`。
2. 最上面引入：
   ```js
   const { app, request, getAdminToken, registerUser } = require('./setup');
   ```
3. 用 `describe` 包住 suite；共用資料放 `beforeAll`。
4. **需登入**：
   ```js
   const { token } = await registerUser();
   const res = await request(app)
     .post('/api/xxx')
     .set('Authorization', `Bearer ${token}`)
     .send({ ... });
   ```
5. **需訪客購物車**：`.set('X-Session-Id', 'some-test-id-' + Date.now())`。
6. **需 admin**：`const token = await getAdminToken()`。
7. 斷言統一信封：
   ```js
   expect(res.status).toBe(200);
   expect(res.body).toHaveProperty('data');
   expect(res.body).toHaveProperty('error', null);
   expect(res.body).toHaveProperty('message');
   ```
8. 在 `vitest.config.js` 的 `sequence.files` **加入新檔名**（否則 Vitest 會以預設順序執行，與依賴不符）。

## 範例（標準斷言模式）

```js
it('should reject duplicate email', async () => {
  const email = `dup-${Date.now()}@example.com`;
  await request(app).post('/api/auth/register')
    .send({ email, password: 'password123', name: 'A' });

  const res = await request(app).post('/api/auth/register')
    .send({ email, password: 'password123', name: 'B' });

  expect(res.status).toBe(409);
  expect(res.body.error).toBe('CONFLICT');
  expect(res.body.data).toBeNull();
});
```

## 常見陷阱

1. **測試之間的資料遺留**：因 `fileParallelism: false` 但不清空 DB，每次測試應使用**唯一 email / session id**（帶 `Date.now()` 或 `Math.random()`）。不要寫死 `test@example.com`，第二次跑會 409。
2. **adminProducts 刪除測試**：若商品存在於 `pending` 訂單會被 409 擋下。測試刪除路徑時，請建立一個**不在任何訂單**裡的新商品。
3. **下單後庫存**：orders 測試會真的扣 seed 商品的庫存；多次跑會耗盡庫存。若出現 `STOCK_INSUFFICIENT` 失敗，刪除 `database.sqlite*` 重跑即可。
4. **dualAuth 雙模式**：請分別測「只帶 Bearer」與「只帶 X-Session-Id」；特別注意「帶 Bearer 但 token 壞」**不會**降級到 session，應回 401（已在 `cart.test.js` 預期行為）。
5. **bcrypt 速度**：若 `NODE_ENV` 未設 `test`，註冊會用 10 rounds；一個 `beforeAll` 註冊多個使用者可能碰到預設 5s timeout。執行測試請確保 `NODE_ENV=test`（vitest 預設會設）或調高 `hookTimeout`。
6. **順序敏感**：新增測試檔後記得加入 `vitest.config.js` 的 `sequence.files`；否則不在清單的檔案執行時機不可預期。
7. **別在測試中直接改 `database.js`**：所有 schema 變更要走 `initializeDatabase()` 並刪除舊 sqlite 檔，否則 `CREATE TABLE IF NOT EXISTS` 不會更新欄位。
8. **ECPay 測試不打真實綠界**：`ecpay.test.js` 僅驗證 `/payment` 產表單與 `/payment/query` 的冪等路徑（先 `PATCH /pay` 模擬成功再 query）。真正呼叫綠界 `QueryTradeInfo/V5` 的失敗分支（500 `ECPAY_ERROR`）未覆蓋，若要測試請自行 mock `global.fetch` 或在 `src/services/ecpayService.js` 注入 client。
