const express = require('express');
const db = require('../database');
const { verifyCheckMacValue, getConfig } = require('../services/ecpayService');

const router = express.Router();

/**
 * @openapi
 * /api/ecpay/notify:
 *   post:
 *     summary: 接收綠界 Server Notify（ReturnURL）
 *     description: >
 *       綠界付款完成後以 POST application/x-www-form-urlencoded 呼叫此端點。
 *       驗簽通過且 RtnCode=1 時將訂單更新為 paid，並回傳 `1|OK`。
 *       本端點不需要 JWT 認證（由 CheckMacValue 驗簽取代）。
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: [MerchantID, MerchantTradeNo, RtnCode, TradeAmt, CheckMacValue]
 *             properties:
 *               MerchantID: { type: string }
 *               MerchantTradeNo: { type: string }
 *               RtnCode: { type: string, description: "'1' = 成功" }
 *               RtnMsg: { type: string }
 *               TradeNo: { type: string }
 *               TradeAmt: { type: string }
 *               PaymentDate: { type: string }
 *               PaymentType: { type: string }
 *               CheckMacValue: { type: string }
 *     responses:
 *       200:
 *         description: 回傳 1|OK（綠界要求格式）
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: 1|OK
 *       400:
 *         description: 驗簽失敗或金額不符
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.post('/notify', (req, res) => {
  const params = req.body;
  const config = getConfig();

  if (!verifyCheckMacValue(params, config.hashKey, config.hashIV)) {
    return res.status(400).send('0|CheckMacValue Error');
  }

  const { MerchantTradeNo, RtnCode, TradeAmt } = params;

  // 非成功通知（例如付款失敗）：仍回 1|OK 避免 ECPay 無限重試
  if (RtnCode !== '1') {
    return res.send('1|OK');
  }

  // MerchantTradeNo 格式：REPLACE(order_no, '-', '')[16 碼] + payment_no[2 碼]
  // order_no 去除 '-' 後固定 16 碼（ORD + 8 位日期 + 5 位 UUID 前綴）
  const orderNoBase = MerchantTradeNo.slice(0, 16);
  const paymentNo = parseInt(MerchantTradeNo.slice(16), 10);

  const order = db.prepare(
    `SELECT * FROM orders WHERE REPLACE(order_no, '-', '') = ? AND payment_no = ?`
  ).get(orderNoBase, paymentNo);

  // 找不到或已處理完畢：冪等回 1|OK
  if (!order || order.status !== 'pending') {
    return res.send('1|OK');
  }

  if (String(order.total_amount) !== String(TradeAmt)) {
    return res.status(400).send('0|Amount Mismatch');
  }

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', order.id);

  res.send('1|OK');
});

module.exports = router;
