/**
 * components/payment/PaymentModal.jsx
 * Payment method selector — wraps M-Pesa, PayPal, Crypto in one modal.
 */
import { useState } from 'react'
import { Modal } from '../shared/Modal'
import { MpesaPayment } from './MpesaPayment'
import { PayPalPayment } from './PayPalPayment'
import { CryptoPayment } from './CryptoPayment'

const METHODS = [
  { id: 'mpesa',  label: 'M-Pesa',  icon: '📱', sub: 'Safaricom · KES'  },
  { id: 'paypal', label: 'PayPal',  icon: '🅿️', sub: 'Card or PayPal'  },
  { id: 'crypto', label: 'USDT',    icon: '🔗', sub: 'TRC-20 or ERC-20' },
]

export function PaymentModal({ open, onClose, asset, onSuccess }) {
  const [method, setMethod]   = useState(null)
  const [done, setDone]       = useState(false)
  const [errMsg, setErrMsg]   = useState('')

  const handleSuccess = () => {
    setDone(true)
    setTimeout(() => {
      onSuccess()
      onClose()
    }, 2000)
  }

  const handleError = (msg) => setErrMsg(msg)

  const handleClose = () => {
    setMethod(null)
    setDone(false)
    setErrMsg('')
    onClose()
  }

  const title = done
    ? 'Payment Complete!'
    : method
    ? METHODS.find((m) => m.id === method)?.label
    : 'Choose Payment Method'

  return (
    <Modal open={open} onClose={handleClose} title={title} maxWidth="max-w-md">

      {/* Global error */}
      {errMsg && (
        <div className="mb-4 font-mono text-[11px] text-red-400 bg-red-400/8
                        border border-red-400/20 rounded-lg px-3 py-2">
          {errMsg}
          <button onClick={() => setErrMsg('')} className="ml-2 text-red-300 hover:text-red-200">×</button>
        </div>
      )}

      {/* Done state */}
      {done ? (
        <div className="text-center py-6 space-y-3">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40
                          flex items-center justify-center mx-auto">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p className="font-display font-semibold text-lg text-white">You're all set!</p>
          <p className="font-mono text-xs text-white/40">
            Your download link will appear shortly.
          </p>
        </div>

      ) : !method ? (
        /* Method selector */
        <div className="space-y-3">
          <p className="font-mono text-[11px] text-white/30 mb-4">
            {asset.title} · <span className="text-white/60">${parseFloat(asset.price_usd).toFixed(2)}</span>
          </p>

          {METHODS.map((m) => (
            <button
              key={m.id}
              onClick={() => { setMethod(m.id); setErrMsg('') }}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border
                         hover:border-emerald-500/30 hover:bg-emerald-500/5
                         bg-white/2 transition-all duration-150 text-left"
            >
              <span className="text-2xl">{m.icon}</span>
              <div className="flex-1">
                <p className="font-display font-semibold text-sm text-white">{m.label}</p>
                <p className="font-mono text-[10px] text-white/30 mt-0.5">{m.sub}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="rgba(255,255,255,0.2)" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          ))}
        </div>

      ) : (
        /* Active payment method */
        <div>
          {/* Back button */}
          <button
            onClick={() => { setMethod(null); setErrMsg('') }}
            className="flex items-center gap-1.5 font-mono text-[11px] text-white/30
                       hover:text-white/60 mb-5 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Back
          </button>

          {method === 'mpesa'  && <MpesaPayment  asset={asset} onSuccess={handleSuccess} onError={handleError} />}
          {method === 'paypal' && <PayPalPayment asset={asset} onSuccess={handleSuccess} onError={handleError} />}
          {method === 'crypto' && <CryptoPayment asset={asset} onSuccess={handleSuccess} onError={handleError} />}
        </div>
      )}
    </Modal>
  )
}