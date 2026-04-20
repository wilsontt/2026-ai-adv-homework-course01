# 花卉電商

一個以 Express 4 為核心的電商示範系統，提供會員註冊登入、商品瀏覽、購物車（訪客/會員雙模式）、
訂單建立、綠界 ECPay 金流付款（含模擬付款開發模式），以及後台商品/訂單管理。
API 均以統一回應信封格式輸出，並透過 swagger-jsdoc 的 `@openapi` 註解產生 OpenAPI 3.0.3 規格。

## 技術棧

### Runtime 依賴
| 套件 | 版本 | 用途 |
|------|------|------|
| express | ^4.22.1 | HTTP 框架 |
| better-sqlite3 | ^12.8.0 | 同步 SQLite 驅動（WAL 模式） |
| jsonwebtoken | ^9.0.2 | JWT 簽發與驗證（HS256） |
| bcrypt | ^6.0.0 | 密碼雜湊（10 rounds；測試環境降為 1） |
| uuid | ^11.1.0 | UUID v4 作為所有表的 PK |
| ejs | ^5.0.1 | SSR 樣板引擎 |
| cors | ^2.8.5 | CORS；origin 為 `FRONTEND_URL` |
| dotenv | ^16.4.7 | 載入 .env |
| swagger-jsdoc | ^6.2.8 | 掃描 `src/routes/*.js` 產生 OpenAPI |

### Dev 依賴
| 套件 | 版本 | 用途 |
|------|------|------|
| vitest | ^4.1.4 | 測試框架（`fileParallelism: false`） |
| supertest | ^7.2.2 | HTTP 斷言 |
| tailwindcss / @tailwindcss/cli | ^4.2.2 | 前端樣式 |

### 資料持久化
- 單一 SQLite 檔 `database.sqlite`（專案根目錄），WAL 模式，啟動時自動 `CREATE TABLE IF NOT EXISTS` + seed。

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 建立 .env
cp .env.example .env
# 編輯 .env 至少設定 JWT_SECRET（server.js 會檢查，缺失直接 exit）

# 3. 啟動（會先 build Tailwind）
npm start
# → Server running on port 3001

# 4. 開發模式（雙終端）
npm run dev:css        # 終端 1：Tailwind watch
npm run dev:server     # 終端 2：Node server

# 5. 執行測試
npm test

# 6. 產生 OpenAPI 規格
npm run openapi        # → openapi.json
```

啟動後：
- 前台：http://localhost:3001/
- 後台：http://localhost:3001/admin/products
- API base：http://localhost:3001/api
- Seed admin：`admin@hexschool.com` / `12345678`（可由 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 覆蓋）

### ECPay（綠界）付款設定

`ECPAY_HASH_KEY` / `ECPAY_HASH_IV` 於 `.env` 設定後才能產生合法的 `CheckMacValue`。未設定時付款表單仍會產生但 CheckMacValue 會算出 `undefined` 基底的雜湊，綠界端會驗簽失敗。

- `ECPAY_ENV`：`staging`（預設）或 `production`；影響 `AioCheckOut/V5` / `QueryTradeInfo/V5` 的 endpoint domain
- `ECPAY_MERCHANT_ID`：預設為綠界測試帳號 `3002607`
- `ECPAY_ENV=production` 時，`PATCH /api/orders/:id/pay` 模擬端點會自動回 403 FORBIDDEN

## 常用指令表
| 指令 | 說明 |
|------|------|
| `npm start` | `css:build` → `node server.js` |
| `npm run dev:server` | 純啟動 server |
| `npm run dev:css` | Tailwind watch |
| `npm run css:build` | Tailwind 壓縮 build |
| `npm run openapi` | 匯出 `openapi.json` |
| `npm test` | Vitest run（循序） |

## 文件索引

| 文件 | 內容 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 目錄結構、啟動流程、API 路由總覽、統一回應格式、認證授權機制、資料庫 schema |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 命名規則、模組系統、新增 API/Middleware/DB 的步驟、環境變數、JSDoc / OpenAPI 規範、計畫歸檔流程 |
| [FEATURES.md](./FEATURES.md) | 每個功能區塊的行為描述、查詢參數、body 欄位、業務邏輯、錯誤碼 |
| [TESTING.md](./TESTING.md) | 測試檔案與依賴、輔助函式、撰寫新測試的步驟與陷阱 |
| [CHANGELOG.md](./CHANGELOG.md) | 更新日誌 |
