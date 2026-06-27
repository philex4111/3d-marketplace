/**
 * components/payment/MpesaPayment.jsx
 * M-Pesa STK Push UI — phone input → spinner → success/fail.
 */
import { useState, useEffect, useRef } from 'react'
import { initiateMpesaPayment, pollMpesaStatus } from '../../services/paymentApi'

export function MpesaPayment({ asset, onSuccess, onError }) {
  const [phone, setPhone]   = useState('')
  const [step, setStep]     = useState('input')  // input | pending | done | failed
  const [error, setError]   = useState('')
  const [receipt, setReceipt] = useState('')
  const pollRef             = useRef(null)

  // Cleanup polling on unmount
  useEffect(() => () => clearInterval(pollRef.current), [])

  const handleSubmit = async () => {
    const cleaned = phone.trim().replace(/\s+/g, '')
    if (!cleaned.match(/^(07|2547)\d{8}$/)) {
      setError('Enter a valid Safaricom number: 07XXXXXXXX or 2547XXXXXXXX')
      return
    }
    setError('')
    setStep('pending')

    try {
      const { checkout_request_id } = await initiateMpesaPayment(asset.id, cleaned)

      // Poll every 3 seconds for up to 2 minutes
      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        if (attempts > 40) {
          clearInterval(pollRef.current)
          setStep('failed')
          onError('Payment timed out. Please try again.')
          return
        }
        try {
          const res = await pollMpesaStatus(checkout_request_id)
          if (res.status === 'completed') {
            clearInterval(pollRef.current)
            setReceipt(res.payment_ref || '')
            setStep('done')
            onSuccess()
          } else if (res.status === 'failed') {
            clearInterval(pollRef.current)
            setStep('failed')
            onError('M-Pesa payment was declined or cancelled.')
          }
        } catch { /* keep polling */ }
      }, 3000)

    } catch (e) {
      setStep('failed')
      setError(e.response?.data?.detail || 'Failed to send STK Push. Try again.')
    }
  }

  if (step === 'input') return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-xl bg-white/3 border border-white/8">
        <span className="text-2xl">📱</span>
        <div>
          <p className="font-mono text-[11px] text-white/40 uppercase tracking-wider">M-Pesa STK Push</p>
          <p className="font-mono text-xs text-white/60 mt-0.5">
            You'll receive a prompt on your phone to enter your PIN
          </p>
        </div>
      </div>

      <div>
        <label className="block font-mono text-[11px] text-white/35 mb-1.5 uppercase tracking-wider">
          Safaricom Number
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="07XXXXXXXX"
          maxLength={12}
          className="w-full bg-canvas border border-border rounded-lg px-3 py-2.5
                     font-mono text-sm text-white placeholder-white/20
                     focus:outline-none focus:border-white/25"
        />
      </div>

      {error && (
        <p className="font-mono text-[11px] text-red-400 bg-red-400/8 border border-red-400/20
                      rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="font-mono text-[10px] text-white/25">Amount</p>
          <p className="font-display text-xl font-bold text-white">
            KES {asset.price_kes
              ? Number(asset.price_kes).toLocaleString()
              : `~${Math.round(asset.price_usd * 130).toLocaleString()}`
            }
          </p>
        </div>
        <button onClick={handleSubmit} className="btn-primary px-6">
          Send STK Push
        </button>
      </div>
    </div>
  )

  if (step === 'pending') return (
    <div className="text-center py-8 space-y-4">
      <div className="w-14 h-14 rounded-full border-2 border-emerald-400/20 border-t-emerald-400
                      animate-spin mx-auto" />
      <div>
        <p className="font-display font-semibold text-white">Check your phone</p>
        <p className="font-mono text-xs text-white/40 mt-1">
          Enter your M-Pesa PIN on the prompt sent to {phone}
        </p>
      </div>
      <p className="font-mono text-[10px] text-white/20 animate-pulse">Waiting for confirmation…</p>
    </div>
  )

  if (step === 'done') return (
    <div className="text-center py-8 space-y-3">
      <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40
                      flex items-center justify-center mx-auto">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <p className="font-display font-semibold text-white">Payment Confirmed!</p>
      {receipt && (
        <p className="font-mono text-[11px] text-white/30">Receipt: {receipt}</p>
      )}
    </div>
  )

  if (step === 'failed') return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <p className="font-mono text-sm text-red-400 mb-1">Payment failed</p>
        <p className="font-mono text-[11px] text-white/30">{error || 'The payment was not completed.'}</p>
      </div>
      <button onClick={() => { setStep('input'); setError('') }} className="btn-ghost w-full">
        Try Again
      </button>
    </div>
  )
}