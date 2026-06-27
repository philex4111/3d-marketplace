/**
 * components/payment/PayPalPayment.jsx
 * PayPal sandbox payment using the PayPal JS SDK.
 * Loads the SDK script dynamically — no npm package needed.
 */
import { useEffect, useRef, useState } from 'react'
import { createPaypalOrder, capturePaypalOrder } from '../../services/paymentApi'

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID

export function PayPalPayment({ asset, onSuccess, onError }) {
  const containerRef  = useRef(null)
  const [loading, setLoading] = useState(true)
  const [sdkError, setSdkError] = useState(null)

  useEffect(() => {
    if (!PAYPAL_CLIENT_ID) {
      setSdkError('PayPal client ID not configured.')
      setLoading(false)
      return
    }

    // Load PayPal JS SDK dynamically
    const existing = document.getElementById('paypal-sdk')
    if (existing) {
      renderButtons()
      return
    }

    const script    = document.createElement('script')
    script.id       = 'paypal-sdk'
    script.src      = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD&intent=capture`
    script.onload   = () => renderButtons()
    script.onerror  = () => { setSdkError('Failed to load PayPal SDK.'); setLoading(false) }
    document.body.appendChild(script)

    return () => {
      // Clear rendered buttons on unmount
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [])

  const renderButtons = () => {
    if (!window.paypal || !containerRef.current) return
    setLoading(false)

    window.paypal.Buttons({
      style: {
        layout:  'vertical',
        color:   'gold',
        shape:   'rect',
        label:   'pay',
        height:  44,
      },

      // Step 1 — create order on our backend
      createOrder: async () => {
        try {
          const { order_id } = await createPaypalOrder(asset.id)
          return order_id
        } catch (e) {
          onError(e.response?.data?.detail || 'Failed to create PayPal order.')
          throw e
        }
      },

      // Step 2 — buyer approved, capture on our backend
      onApprove: async (data) => {
        try {
          const result = await capturePaypalOrder(data.orderID)
          if (result.status === 'completed' || result.status === 'already_completed') {
            onSuccess()
          } else {
            onError(`Unexpected capture status: ${result.status}`)
          }
        } catch (e) {
          onError(e.response?.data?.detail || 'Payment capture failed.')
        }
      },

      onError: (err) => {
        console.error('PayPal error:', err)
        onError('PayPal encountered an error. Please try again.')
      },

      onCancel: () => {
        onError('Payment was cancelled.')
      },

    }).render(containerRef.current)
  }

  if (sdkError) return (
    <div className="font-mono text-xs text-red-400 text-center py-6">{sdkError}</div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-xl bg-white/3 border border-white/8">
        <span className="text-2xl">🅿️</span>
        <div>
          <p className="font-mono text-[11px] text-white/40 uppercase tracking-wider">PayPal Sandbox</p>
          <p className="font-mono text-xs text-white/60 mt-0.5">
            Pay securely with your PayPal account or card
          </p>
        </div>
        <span className="ml-auto font-display text-lg font-bold text-white">
          ${parseFloat(asset.price_usd).toFixed(2)}
        </span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-6 gap-3">
          <div className="w-5 h-5 rounded-full border border-white/20 border-t-white/60 animate-spin" />
          <span className="font-mono text-xs text-white/30">Loading PayPal…</span>
        </div>
      )}

      {/* PayPal injects its buttons here */}
      <div ref={containerRef} className={loading ? 'hidden' : ''} />

      <p className="font-mono text-[10px] text-white/20 text-center">
        Sandbox mode — use PayPal test accounts only
      </p>
    </div>
  )
}