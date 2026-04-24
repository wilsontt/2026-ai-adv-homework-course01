const { app, request, registerUser } = require('./setup');
const {
  generateCheckMacValue,
  verifyCheckMacValue,
  buildMerchantTradeNo,
} = require('../src/services/ecpayService');

// 測試用 ECPay 金鑰（綠界官方測試向量）
const TEST_HASH_KEY = 'pwFHCqoQZGmho4w6';
const TEST_HASH_IV = 'EkRm7iFT261dpevs';
const TEST_MERCHANT_ID = '3002607';

// ── CheckMacValue 單元測試（官方測試向量） ──

describe('ECPay CheckMacValue', () => {
  const hashKey = TEST_HASH_KEY;
  const hashIV = TEST_HASH_IV;

  it('SHA256 基本測試（AIO 金流）', () => {
    const params = {
      MerchantID: '3002607',
      MerchantTradeNo: 'Test1234567890',
      MerchantTradeDate: '2025/01/01 12:00:00',
      PaymentType: 'aio',
      TotalAmount: '100',
      TradeDesc: '測試',
      ItemName: '測試商品',
      ReturnURL: 'https://example.com/notify',
      ChoosePayment: 'ALL',
      EncryptType: '1'
    };

    const result = generateCheckMacValue(params, hashKey, hashIV);
    expect(result).toBe('291CBA324D31FB5A4BBBFDF2CFE5D32598524753AFD4959C3BF590C5B2F57FB2');
  });

  it("特殊字元 ' 測試", () => {
    const params = {
      MerchantID: '3002607',
      ItemName: "Tom's Shop",
      TotalAmount: '100'
    };

    const result = generateCheckMacValue(params, hashKey, hashIV);
    expect(result).toBe('CF0A3D4901D99459D8641516EC57210700E8A5C9AB26B1D021301E9CB93EF78D');
  });

  it('特殊字元 ~ 測試', () => {
    const params = {
      MerchantID: '3002607',
      ItemName: 'Test~Product',
      TotalAmount: '200'
    };

    const result = generateCheckMacValue(params, hashKey, hashIV);
    expect(result).toBe('CEEAE01D2F9A8E74D4AC0DCE7735B046D73F35A5EC99558A31A2EE03159DA1C9');
  });

  it('空格處理測試（%20 vs + 陷阱）', () => {
    const params = {
      MerchantID: '3002607',
      ItemName: 'My Test Product',
      TotalAmount: '300'
    };

    const result = generateCheckMacValue(params, hashKey, hashIV);
    expect(result).toBe('7712A5E6EDC3B57086063C88568084C66CE882A21D40E74DE5ACA3B478C6F316');
  });

  it('Callback 驗證測試', () => {
    const params = {
      MerchantID: '3002607',
      MerchantTradeNo: 'Test1234567890',
      RtnCode: '1',
      RtnMsg: 'Succeeded',
      TradeNo: '2301011234567890',
      TradeAmt: '100',
      PaymentDate: '2025/01/01 12:05:00',
      PaymentType: 'Credit_CreditCard',
      TradeDate: '2025/01/01 12:00:00',
      SimulatePaid: '0'
    };

    const result = generateCheckMacValue(params, hashKey, hashIV);
    expect(result).toBe('2AB536D86AFF8E1086744D59175040A32538C96B1C28C4135B551BD728E913B8');
  });

  it('verifyCheckMacValue 應驗證正確的 CMV', () => {
    const params = {
      MerchantID: '3002607',
      ItemName: "Tom's Shop",
      TotalAmount: '100',
      CheckMacValue: 'CF0A3D4901D99459D8641516EC57210700E8A5C9AB26B1D021301E9CB93EF78D'
    };

    expect(verifyCheckMacValue(params, hashKey, hashIV)).toBe(true);
  });

  it('verifyCheckMacValue 應拒絕錯誤的 CMV', () => {
    const params = {
      MerchantID: '3002607',
      ItemName: "Tom's Shop",
      TotalAmount: '100',
      CheckMacValue: 'WRONG_VALUE_1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678'
    };

    expect(verifyCheckMacValue(params, hashKey, hashIV)).toBe(false);
  });
});

// ── buildMerchantTradeNo ──

describe('buildMerchantTradeNo', () => {
  it('應將 order_no 去除 - 並加上兩位序號', () => {
    const result = buildMerchantTradeNo('ORD-20260417-ABCDE', 1);
    expect(result).toBe('ORD20260417ABCDE01');
  });

  it('不應超過 20 字元', () => {
    const result = buildMerchantTradeNo('ORD-20260417-ABCDE', 99);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it('payment_no 為 0 時序號為 00', () => {
    const result = buildMerchantTradeNo('ORD-20260417-ABCDE', 0);
    expect(result).toBe('ORD20260417ABCDE00');
  });
});

// ── 付款 API 整合測試 ──
// notify、payment/query 均需要使用付款表單產生 MerchantTradeNo，故全部置於同一 describe 共用 userToken

describe('ECPay Payment API', () => {
  let userToken;
  let orderId;

  beforeAll(async () => {
    // 設定測試用 ECPay 憑證，ecpayService.getConfig() 於呼叫時讀取 env，可即時生效
    process.env.ECPAY_HASH_KEY = TEST_HASH_KEY;
    process.env.ECPAY_HASH_IV = TEST_HASH_IV;
    process.env.ECPAY_MERCHANT_ID = TEST_MERCHANT_ID;

    const { token } = await registerUser();
    userToken = token;

    const prodRes = await request(app).get('/api/products');
    const productId = prodRes.body.data.products[0].id;

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity: 1 });

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'ecpay-test@example.com',
        recipientAddress: '台北市測試路 456 號'
      });

    orderId = orderRes.body.data.id;
  });

  // ── /payment ──

  describe('POST /api/orders/:id/payment', () => {
    it('應產生 ECPay 付款表單參數', async () => {
      const res = await request(app)
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.error).toBeNull();
      expect(res.body.data).toHaveProperty('action_url');
      expect(res.body.data).toHaveProperty('params');
      expect(res.body.data.action_url).toContain('AioCheckOut');

      const params = res.body.data.params;
      expect(params).toHaveProperty('MerchantID');
      expect(params).toHaveProperty('MerchantTradeNo');
      expect(params).toHaveProperty('CheckMacValue');
      expect(params).toHaveProperty('TotalAmount');
      expect(params.MerchantTradeNo.length).toBeLessThanOrEqual(20);
    });

    it('每次呼叫應產生不同的 MerchantTradeNo', async () => {
      const res1 = await request(app)
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${userToken}`);

      const res2 = await request(app)
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res1.body.data.params.MerchantTradeNo)
        .not.toBe(res2.body.data.params.MerchantTradeNo);
    });

    it('非 pending 訂單應回 400', async () => {
      // 用模擬端點先將訂單改為 paid
      await request(app)
        .patch(`/api/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ action: 'success' });

      const res = await request(app)
        .post(`/api/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_STATUS');
    });

    it('不存在的訂單應回 404', async () => {
      const res = await request(app)
        .post('/api/orders/non-existent-id/payment')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });

  // ── /payment/query ──

  describe('POST /api/orders/:id/payment/query', () => {
    let pendingOrderId;
    let pendingTotalAmount;

    beforeAll(async () => {
      const prodRes = await request(app).get('/api/products');
      const availableProduct = prodRes.body.data.products.find(p => p.stock > 0);
      if (!availableProduct) throw new Error('No product with stock available for test');

      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: availableProduct.id, quantity: 1 });

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          recipientName: '查詢測試',
          recipientEmail: `query-${Date.now()}@example.com`,
          recipientAddress: '台北市查詢路 789 號'
        });

      pendingOrderId = orderRes.body.data.id;
      pendingTotalAmount = orderRes.body.data.total_amount;
    });

    it('不存在的訂單應回 404', async () => {
      const res = await request(app)
        .post('/api/orders/non-existent-id/payment/query')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('尚未發起付款（payment_no=0）應回 400 INVALID_STATUS', async () => {
      // 此時 pendingOrderId 尚未呼叫過 /payment，payment_no = 0
      const res = await request(app)
        .post(`/api/orders/${pendingOrderId}/payment/query`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_STATUS');
    });

    it('已付款訂單應直接回傳（冪等）— 透過 notify 完成付款', async () => {
      // 1. 產生付款表單（payment_no 遞增）
      const payRes = await request(app)
        .post(`/api/orders/${pendingOrderId}/payment`)
        .set('Authorization', `Bearer ${userToken}`);

      const pendingMerchantTradeNo = payRes.body.data.params.MerchantTradeNo;

      // 2. 模擬綠界 Server Notify（不需真實刷卡）
      const notifyParams = {
        MerchantID: TEST_MERCHANT_ID,
        MerchantTradeNo: pendingMerchantTradeNo,
        RtnCode: '1',
        RtnMsg: 'Succeeded',
        TradeNo: '2026042499990000',
        TradeAmt: String(pendingTotalAmount),
        PaymentDate: '2026/04/24 12:00:00',
        PaymentType: 'Credit_CreditCard',
        TradeDate: '2026/04/24 11:59:00',
        SimulatePaid: '0'
      };
      notifyParams.CheckMacValue = generateCheckMacValue(
        notifyParams, TEST_HASH_KEY, TEST_HASH_IV
      );

      const notifyRes = await request(app)
        .post('/api/ecpay/notify')
        .type('form')
        .send(notifyParams);

      expect(notifyRes.status).toBe(200);
      expect(notifyRes.text).toBe('1|OK');

      // 3. Query → 訂單已 paid，走冪等路徑直接回傳
      const queryRes = await request(app)
        .post(`/api/orders/${pendingOrderId}/payment/query`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(queryRes.status).toBe(200);
      expect(queryRes.body.data.status).toBe('paid');
      expect(queryRes.body.error).toBeNull();
    });
  });

  // ── Server Notify（/api/ecpay/notify）──
  // 與 /payment、/payment/query 共用 userToken；各測試需要的訂單在 beforeAll 中建立

  describe('POST /api/ecpay/notify', () => {
    let notifyOrderId;
    let notifyTotalAmount;
    let merchantTradeNo;

    function buildNotifyParams(extraFields = {}) {
      const base = {
        MerchantID: TEST_MERCHANT_ID,
        MerchantTradeNo: merchantTradeNo,
        RtnCode: '1',
        RtnMsg: 'Succeeded',
        TradeNo: '2026042400001234',
        TradeAmt: String(notifyTotalAmount),
        PaymentDate: '2026/04/24 12:00:00',
        PaymentType: 'Credit_CreditCard',
        TradeDate: '2026/04/24 11:59:00',
        SimulatePaid: '0',
        ...extraFields
      };
      // CheckMacValue：若呼叫端已自行帶入（測試壞簽名），直接使用；否則自動計算
      if (!extraFields.CheckMacValue) {
        base.CheckMacValue = generateCheckMacValue(base, TEST_HASH_KEY, TEST_HASH_IV);
      }
      return base;
    }

    beforeAll(async () => {
      // 建立專屬於 notify 測試的 pending 訂單
      const prodRes = await request(app).get('/api/products');
      const product = prodRes.body.data.products.find(p => p.stock > 0);
      if (!product) throw new Error('No product with stock for notify test');

      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: product.id, quantity: 1 });

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          recipientName: '通知測試',
          recipientEmail: `notify-${Date.now()}@example.com`,
          recipientAddress: '台北市通知路 123 號'
        });

      notifyOrderId = orderRes.body.data.id;
      notifyTotalAmount = orderRes.body.data.total_amount;

      // 產生付款表單（payment_no 遞增為 1），取得 MerchantTradeNo
      const paymentRes = await request(app)
        .post(`/api/orders/${notifyOrderId}/payment`)
        .set('Authorization', `Bearer ${userToken}`);

      merchantTradeNo = paymentRes.body.data.params.MerchantTradeNo;
    });

    it('有效 CheckMacValue + RtnCode=1 應將訂單改為 paid 並回 1|OK', async () => {
      const res = await request(app)
        .post('/api/ecpay/notify')
        .type('form')
        .send(buildNotifyParams());

      expect(res.status).toBe(200);
      expect(res.text).toBe('1|OK');

      // 確認訂單狀態已更新
      const orderRes = await request(app)
        .get(`/api/orders/${notifyOrderId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(orderRes.body.data.status).toBe('paid');
    });

    it('同一訂單重複 notify 應冪等回 1|OK', async () => {
      // 訂單已 paid，再次 notify 不應出錯
      const res = await request(app)
        .post('/api/ecpay/notify')
        .type('form')
        .send(buildNotifyParams());

      expect(res.status).toBe(200);
      expect(res.text).toBe('1|OK');
    });

    it('CheckMacValue 錯誤應回 400', async () => {
      const res = await request(app)
        .post('/api/ecpay/notify')
        .type('form')
        .send(buildNotifyParams({
          CheckMacValue: 'WRONG_VALUE_1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678'
        }));

      expect(res.status).toBe(400);
      expect(res.text).toContain('CheckMacValue Error');
    });

    it('RtnCode 非 1 應接受並回 1|OK（訂單狀態不更新）', async () => {
      // 建立全新 pending 訂單
      const prodRes = await request(app).get('/api/products');
      const product = prodRes.body.data.products.find(p => p.stock > 0);

      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: product.id, quantity: 1 });

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          recipientName: '失敗通知測試',
          recipientEmail: `rtnfail-${Date.now()}@example.com`,
          recipientAddress: '台北市失敗路 999 號'
        });

      const failOrderId = orderRes.body.data.id;
      const failAmount = orderRes.body.data.total_amount;

      const payRes = await request(app)
        .post(`/api/orders/${failOrderId}/payment`)
        .set('Authorization', `Bearer ${userToken}`);

      const failMerchantTradeNo = payRes.body.data.params.MerchantTradeNo;

      const notifyBase = {
        MerchantID: TEST_MERCHANT_ID,
        MerchantTradeNo: failMerchantTradeNo,
        RtnCode: '0',
        RtnMsg: 'Failed',
        TradeAmt: String(failAmount),
        TradeDate: '2026/04/24 12:00:00',
        SimulatePaid: '0'
      };
      notifyBase.CheckMacValue = generateCheckMacValue(notifyBase, TEST_HASH_KEY, TEST_HASH_IV);

      const res = await request(app)
        .post('/api/ecpay/notify')
        .type('form')
        .send(notifyBase);

      expect(res.status).toBe(200);
      expect(res.text).toBe('1|OK');

      // 確認訂單仍為 pending（付款失敗 notify 不改狀態）
      const checkRes = await request(app)
        .get(`/api/orders/${failOrderId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(checkRes.body.data.status).toBe('pending');
    });
  });
});
