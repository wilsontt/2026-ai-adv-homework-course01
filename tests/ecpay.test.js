const { app, request, registerUser } = require('./setup');
const {
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  buildMerchantTradeNo,
  buildAioCheckOutParams
} = require('../src/services/ecpayService');

// ── CheckMacValue 單元測試（官方測試向量） ──

describe('ECPay CheckMacValue', () => {
  const hashKey = 'pwFHCqoQZGmho4w6';
  const hashIV = 'EkRm7iFT261dpevs';

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

describe('ECPay Payment API', () => {
  let userToken;
  let orderId;

  beforeAll(async () => {
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

  describe('POST /api/orders/:id/payment/query', () => {
    let pendingOrderId;

    beforeAll(async () => {
      // 建立一筆新的 pending 訂單（找有庫存的商品）
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
          recipientEmail: 'query-test@example.com',
          recipientAddress: '台北市查詢路 789 號'
        });

      pendingOrderId = orderRes.body.data.id;
    });

    it('不存在的訂單應回 404', async () => {
      const res = await request(app)
        .post('/api/orders/non-existent-id/payment/query')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('已付款訂單應直接回傳（冪等）', async () => {
      // 先把訂單改成 paid
      await request(app)
        .patch(`/api/orders/${pendingOrderId}/pay`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ action: 'success' });

      const res = await request(app)
        .post(`/api/orders/${pendingOrderId}/payment/query`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('paid');
    });
  });
});
