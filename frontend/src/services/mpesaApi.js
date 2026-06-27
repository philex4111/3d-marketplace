/**
 * services/mpesaApi.js
 * M-Pesa payment flow — initiate STK Push and poll for completion.
 */
import { api } from './api'

/**
 * Triggers an STK Push prompt on the buyer's phone.
 * @param {string} assetId
 * @param {string} phoneNumber  format: 2547XXXXXXXX
 * @returns {{ checkout_request_id: string, message: string }}
 */
export async function initiateMpesaPayment(assetId, phoneNumber) {
  const { data } = await api.post('/api/payments/mpesa/initiate', {
    asset_id: assetId,
    phone_number: phoneNumber,
  })
  return data
}

/**
 * Polls transaction status after STK Push. Call every 3s.
 * @param {string} checkoutRequestId
 * @returns {{ status: 'pending'|'completed'|'failed' }}
 */
export async function pollMpesaStatus(checkoutRequestId) {
  const { data } = await api.get(`/api/payments/mpesa/status/${checkoutRequestId}`)
  return data
}
