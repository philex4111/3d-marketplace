/**
 * components/payment/CryptoPayment.jsx
 * USDT crypto payment — network selector, wallet display, tx hash submit.
 */
import { useState } from 'react'
import { initiateCryptoPayment, verifyCryptoPayment } from '../../services/paymentApi'

const NETWORKS = [
  { id: 'usdt_tron', label: 'Tron (TRC-20)', icon: '🔴', note: 'Fast & low fees — recommended' },
  { id: 'usdt_eth',  label: 'Ethereum (ERC-20)', icon: '🔷', note: 'Higher gas fees' },
]

export function CryptoPayment({ asset, onSuccess, onError }) {
  const [network, setNetwork]         = useState('usdt_tron')
  const [step, setStep]               = useState('select')   // select | send | verify | done
  const [paymentInfo, setPaymentInfo] = useState(null)
  const [txHash, setTxHash]           = useState('')
  const [verifying, setVerifying]     = useState(false)
  const [error, setError]             = useState('')
  const [copied, setCopied]           = useState(false)

  const handleInitiate = async () => {
    setError('')
    try {
      const info = await initiateCryptoPayment(asset.id, network)
      setPaymentInfo(info)
      setStep('send')
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to initiate crypto payment.')
    }
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(paymentInfo.wallet_address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleVerify = async () => {
    if (!txHash.trim()) { setError('Enter your transaction hash.'); return }
    setError('')
    setVerifying(true)
    try {
      await verifyCryptoPayment(paymentInfo.transaction_id, txHash.trim())
      setStep('done')
      onSuccess()
    } catch (e) {
      setError(e.response?.data?.detail || 'Verification failed. Check your tx hash and try again.')
    } finally {
      setVerifying(false)
    }
  }

  if (step === 'select') return (
    <div className="space-y-4">
      <p className="font-mono text-[11px] text-white/35 uppercase tracking-wider">Select Network</p>

      {NETWORKS.map((n) => (
        <button
          key={n.id}
          onClick={() => setNetwork(n.id)}
          className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
            network === n.id
              ? 'border-emerald-500/40 bg-emerald-500/8'
              : 'border-border hover:border-white/15 bg-white/2'
          }`}
        >
          <span className="text-xl">{n.icon}</span>
          <div className="flex-1">
            <p className="font-mono text-sm text-white">{n.label}</p>
            <p className="font-mono text-[10px] text-white/30 mt-0.5">{n.note}</p>
          </div>
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
            network === n.id ? 'border-emerald-400' : 'border-white/20'
          }`}>
            {network === n.id && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
          </div>
        </button>
      ))}

      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="font-mono text-[10px] text-white/25">Amount</p>
          <p className="font-display text-xl font-bold text-white">
            {parseFloat(asset.price_usd).toFixed(2)} USDT
          </p>
        </div>
        <button onClick={handleInitiate} className="btn-primary px-6">Continue</button>
      </div>

      {error && (
        <p className="font-mono text-[11px] text-red-400">{error}</p>
      )}
    </div>
  )

  if (step === 'send') return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-white/3 border border-white/8 space-y-3">
        <p className="font-mono text-[11px] text-white/35 uppercase tracking-wider">
          Send exactly
        </p>
        <p className="font-display text-2xl font-bold text-emerald-400">
          {paymentInfo.amount_usdt.toFixed(2)} USDT
        </p>
        <p className="font-mono text-[10px] text-white/30">
          Network: {paymentInfo.network}
        </p>
      </div>

      <div>
        <p className="font-mono text-[11px] text-white/35 mb-1.5 uppercase tracking-wider">
          To wallet address
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-[11px] text-white/70 bg-canvas border border-border
                           rounded-lg px-3 py-2.5 break-all">
            {paymentInfo.wallet_address}
          </code>
          <button
            onClick={copyAddress}
            className="shrink-0 px-3 py-2.5 rounded-lg border border-border hover:border-white/20
                       font-mono text-[10px] text-white/40 hover:text-white transition-colors"
          >
            {copied ? '✓' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-yellow-400/8 border border-yellow-400/20">
        <p className="font-mono text-[10px] text-yellow-400">
          ⚠ Send the exact amount. Incorrect amounts may not be verified automatically.
        </p>
      </div>

      <button onClick={() => setStep('verify')} className="btn-primary w-full">
        I've Sent the Payment →
      </button>
    </div>
  )

  if (step === 'verify') return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-white/3 border border-white/8">
        <p className="font-mono text-[11px] text-white/40">
          After sending, paste your transaction hash below so we can verify it on-chain.
        </p>
      </div>

      <div>
        <label className="block font-mono text-[11px] text-white/35 mb-1.5 uppercase tracking-wider">
          Transaction Hash (tx hash)
        </label>
        <input
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder="0x... or T..."
          className="w-full bg-canvas border border-border rounded-lg px-3 py-2.5
                     font-mono text-xs text-white placeholder-white/20
                     focus:outline-none focus:border-white/25"
        />
      </div>

      {error && (
        <p className="font-mono text-[11px] text-red-400 bg-red-400/8 border border-red-400/20
                      rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button onClick={handleVerify} disabled={verifying} className="btn-primary w-full">
        {verifying ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 rounded-full border border-black/30 border-t-black animate-spin" />
            Verifying on-chain…
          </span>
        ) : 'Verify Payment'}
      </button>

      <button onClick={() => setStep('send')} className="btn-ghost w-full text-xs">
        ← Back
      </button>
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
      <p className="font-display font-semibold text-white">Payment Verified!</p>
      <p className="font-mono text-[11px] text-white/30">Transaction confirmed on-chain.</p>
    </div>
  )
}