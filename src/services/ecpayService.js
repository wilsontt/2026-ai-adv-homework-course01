const crypto = require('crypto');

const ECPAY_URLS = {
  staging: 'https://payment-stage.ecpay.com.tw',
  production: 'https://payment.ecpay.com.tw'
};

function getConfig() {
  return {
    merchantId: process.env.ECPAY_MERCHANT_ID,
    hashKey: process.env.ECPAY_HASH_KEY,
    hashIV: process.env.ECPAY_HASH_IV,
    env: process.env.ECPAY_ENV || 'staging'
  };
}

function getBaseUrl() {
  const config = getConfig();
  return ECPAY_URLS[config.env] || ECPAY_URLS.staging;
}

/**
 * ECPay 專用 URL 編碼（模擬 .NET Server.UrlEncode 行為）
 * 1. encodeURIComponent
 * 2. %20 → +, ~ → %7e, ' → %27
 * 3. 全部轉小寫
 * 4. .NET 字元還原：%2d→- %5f→_ %2e→. %21→! %2a→* %28→( %29→)
 */
function ecpayUrlEncode(source) {
  let encoded = encodeURIComponent(source)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27');

  encoded = encoded.toLowerCase();

  const replacements = {
    '%2d': '-', '%5f': '_', '%2e': '.', '%21': '!',
    '%2a': '*', '%28': '(', '%29': ')'
  };
  for (const [old, char] of Object.entries(replacements)) {
    encoded = encoded.split(old).join(char);
  }

  return encoded;
}

/**
 * 產生 CheckMacValue（SHA256）
 * @param {Object} params - 所有參數（不含 CheckMacValue）
 * @param {string} hashKey
 * @param {string} hashIV
 * @returns {string} 大寫 hex SHA256
 */
function generateCheckMacValue(params, hashKey, hashIV) {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== 'CheckMacValue')
  );

  const sorted = Object.keys(filtered)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const paramStr = sorted.map(k => `${k}=${filtered[k]}`).join('&');
  const raw = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIV}`;
  const encoded = ecpayUrlEncode(raw);

  return crypto.createHash('sha256').update(encoded, 'utf8').digest('hex').toUpperCase();
}

/**
 * 驗證 CheckMacValue（timing-safe）
 */
function verifyCheckMacValue(params, hashKey, hashIV) {
  const received = params.CheckMacValue || '';
  const calculated = generateCheckMacValue(params, hashKey, hashIV);

  const bufA = Buffer.from(received.toUpperCase());
  const bufB = Buffer.from(calculated);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 產生 MerchantTradeNo
 * 格式：order_no 去除 '-' + 兩位付款序號，不超過 20 字元
 * 例：ORD20260417ABCDE01
 */
function buildMerchantTradeNo(orderNo, paymentNo) {
  const base = orderNo.replace(/-/g, '');
  const suffix = String(paymentNo).padStart(2, '0');
  return (base + suffix).slice(0, 20);
}

/**
 * 組合 AioCheckOut/V5 所需參數
 */
function buildAioCheckOutParams(order, items, paymentNo, baseUrl) {
  const config = getConfig();
  const merchantTradeNo = buildMerchantTradeNo(order.order_no, paymentNo);

  const now = new Date();
  const tradeDate = [
    now.getFullYear(),
    '/',
    String(now.getMonth() + 1).padStart(2, '0'),
    '/',
    String(now.getDate()).padStart(2, '0'),
    ' ',
    String(now.getHours()).padStart(2, '0'),
    ':',
    String(now.getMinutes()).padStart(2, '0'),
    ':',
    String(now.getSeconds()).padStart(2, '0')
  ].join('');

  let itemName = items
    .map(i => `${i.product_name} x${i.quantity}`)
    .join('#');
  if (itemName.length > 200) {
    itemName = itemName.slice(0, 197) + '...';
  }

  const params = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: tradeDate,
    PaymentType: 'aio',
    TotalAmount: String(order.total_amount),
    TradeDesc: '花卉電商訂單',
    ItemName: itemName,
    ReturnURL: (baseUrl || 'http://localhost:3001') + '/api/ecpay/notify',
    ClientBackURL: (baseUrl || 'http://localhost:3001') + '/orders/' + order.id + '?payment=callback',
    ChoosePayment: 'ALL',
    EncryptType: '1',
    NeedExtraPaidInfo: 'Y'
  };

  params.CheckMacValue = generateCheckMacValue(params, config.hashKey, config.hashIV);

  return {
    actionUrl: getBaseUrl() + '/Cashier/AioCheckOut/V5',
    params
  };
}

/**
 * 查詢綠界交易資訊
 * @returns {{ tradeStatus: string, tradeNo: string, tradeAmt: string, paymentDate: string, raw: Object }}
 */
async function queryTradeInfo(merchantTradeNo) {
  const config = getConfig();
  const timeStamp = String(Math.floor(Date.now() / 1000));

  const queryParams = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: timeStamp
  };

  queryParams.CheckMacValue = generateCheckMacValue(queryParams, config.hashKey, config.hashIV);

  const body = Object.entries(queryParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const url = getBaseUrl() + '/Cashier/QueryTradeInfo/V5';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const text = await response.text();

  const result = {};
  text.split('&').forEach(pair => {
    const [key, ...rest] = pair.split('=');
    if (key) result[key] = rest.join('=');
  });

  return {
    tradeStatus: result.TradeStatus,
    tradeNo: result.TradeNo,
    tradeAmt: result.TradeAmt,
    paymentDate: result.PaymentDate,
    raw: result
  };
}

module.exports = {
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  buildMerchantTradeNo,
  buildAioCheckOutParams,
  queryTradeInfo,
  getConfig,
  getBaseUrl
};
