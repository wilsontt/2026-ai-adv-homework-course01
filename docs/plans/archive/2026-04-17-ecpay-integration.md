# 綠界 ECPay 金流整合

## User Story

身為消費者，我希望在訂單頁面點擊「前往付款」後能跳轉至綠界付款頁面完成實際付款，付款後自動回到訂單頁面並查詢到正確的付款狀態。

## Spec

### 端點

| Method | Path | 說明 |
|--------|------|------|
| POST | `/api/orders/:id/payment` | 產生 ECPay AioCheckOut 表單參數 |
| POST | `/api/orders/:id/payment/query` | 向綠界 QueryTradeInfo 查詢付款結果 |
| PATCH | `/api/orders/:id/pay` | 模擬付款（開發用，正式環境停用） |

### 架構決策

- **無 Server Notify**：本專案僅運行於本地端，無法接收綠界 ReturnURL callback，改為前端主動呼叫查詢 API
- **CheckMacValue 自行實作**：未使用第三方 npm 套件，依據官方 ECPay-API-Skill 規格實作（SHA256）
- **MerchantTradeNo 唯一性**：`order_no` 去除 `-` + 兩位 `payment_no` 序號，確保每次嘗試唯一
- **測試環境**：`SimulatePaid=1` 免真刷卡

### 錯誤情境

| 情境 | HTTP | error |
|------|------|-------|
| 訂單不存在 | 404 | NOT_FOUND |
| 訂單非 pending | 400 | INVALID_STATUS |
| 綠界查詢失敗 | 500 | ECPAY_ERROR |
| 正式環境模擬付款 | 403 | FORBIDDEN |

## Tasks

- [x] 新增 `src/services/ecpayService.js`
- [x] 修改 `src/database.js`（payment_no 欄位）
- [x] 新增 `POST /:id/payment` 端點
- [x] 新增 `POST /:id/payment/query` 端點
- [x] 模擬端點加入正式環境 guard
- [x] 前端 order-detail.js 串接 ECPay 流程
- [x] 前端 order-detail.ejs 更新付款按鈕
- [x] 新增 `tests/ecpay.test.js`（16 tests）
- [x] 更新 vitest.config.js
- [x] 更新文件（FEATURES、ARCHITECTURE、DEVELOPMENT、CHANGELOG）
