# ECPay Server Notify 路由與測試自動化補強

## User Story

身為開發者，我希望本地端整合測試能完整走完「下單 → 產生付款表單 → 模擬綠界回調 → 確認訂單付款成功」的全流程，不依賴真實刷卡，也不依賴模擬付款端點；同時提供正式部署可用的 `/api/ecpay/notify` 端點，供綠界 Server 端回調使用。

## Spec

### 新增端點

| Method | Path | 說明 |
|--------|------|------|
| POST | `/api/ecpay/notify` | 接收綠界 ReturnURL Server Notify；驗簽、更新訂單狀態、回傳 `1\|OK` |

### 業務邏輯

1. 以 `verifyCheckMacValue` 驗證 CheckMacValue；失敗 → `0|CheckMacValue Error`（400）
2. `RtnCode !== '1'` → 接收但不更新（直接回 `1|OK`，避免 ECPay 重試）
3. 以 `MerchantTradeNo` 定位訂單：
   - `MerchantTradeNo[:16]` = `REPLACE(order_no, '-', '')`
   - `parseInt(MerchantTradeNo[16:])` = `payment_no`
4. 訂單不存在 → `1|OK`（冪等）
5. 訂單已非 pending → `1|OK`（冪等）
6. `TradeAmt !== order.total_amount` → `0|Amount Mismatch`（400）
7. 成功：`UPDATE orders SET status = 'paid'`；回 `1|OK`

### 測試策略

原 `/payment/query` 測試先用 `PATCH /pay` 模擬付款，無法驗證 CheckMacValue 驗簽流程。補強後：
- Notify 測試使用官方測試向量 HashKey/HashIV，自行產生合法 CheckMacValue
- 以 `POST /api/ecpay/notify` 取代真實 ECPay callback，完整走「付款表單產生 → Server Notify → 訂單變 paid」
- `/payment/query` 補一個測試：先 notify 付款，再 query → 應走冪等路徑回傳 paid

### 錯誤情境

| 情境 | HTTP | 回應 |
|------|------|------|
| CheckMacValue 不符 | 400 | `0\|CheckMacValue Error` |
| 金額不符 | 400 | `0\|Amount Mismatch` |
| RtnCode 非 1 | 200 | `1\|OK` |
| 訂單不存在 / 非 pending | 200 | `1\|OK` |
| 成功 | 200 | `1\|OK` |

## Tasks

- [x] 建立 `src/routes/ecpayRoutes.js`（notify 路由）
- [x] 更新 `app.js`（掛載 `/api/ecpay`）
- [x] 新增 `.claude/settings.json`（專案 Claude Code 設定）
- [x] 更新 `tests/ecpay.test.js`（Notify 整合測試 + query 路徑補強）
- [x] 更新 `docs/FEATURES.md`、`docs/ARCHITECTURE.md`、`docs/CHANGELOG.md`、`docs/TESTING.md`
