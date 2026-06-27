/**
 * services/paymentApi.js
 * All payment API calls — M-Pesa, PayPal, Crypto.
 */
import { api } from './api'

// ── M-Pesa ────────────────────────────────────────────────────────────────────
export async function initiateMpesaPayment(assetId, phoneNumber) {
  const { data } = await api.post('/api/payments/mpesa/initiate', {
    asset_id: assetId,
    phone_number: phoneNumber,
  })
  return data  // { checkout_request_id, message }
}

export async function pollMpesaStatus(checkoutRequestId) {
  const { data } = await api.get(`/api/payments/mpesa/status/${checkoutRequestId}`)
  return data  // { status: 'pending'|'completed'|'failed' }
}

// ── PayPal ────────────────────────────────────────────────────────────────────
export async function createPaypalOrder(assetId) {
  const { data } = await api.post('/api/payments/paypal/create-order', {
    asset_id: assetId,
  })
  return data  // { order_id, transaction_id, amount_usd }
}

export async function capturePaypalOrder(orderId) {
  const { data } = await api.post('/api/payments/paypal/capture', {
    order_id: orderId,
  })
  return data  // { status, transaction_id, capture_id, amount_usd }
}

// ── Crypto ────────────────────────────────────────────────────────────────────
export async function initiateCryptoPayment(assetId, currency) {
  const { data } = await api.post('/api/payments/crypto/initiate', {
    asset_id: assetId,
    currency,
  })
  return data  // { transaction_id, wallet_address, amount_usdt, network }
}

export async function verifyCryptoPayment(transactionId, txHash) {
  const { data } = await api.post('/api/payments/crypto/verify', {
    transaction_id: transactionId,
    tx_hash: txHash,
  })
  return data  // { status, transaction_id, tx_hash }
}