/**
 * components/auth/AuthModal.jsx
 * Native email/password authentication modal.
 * Supports Sign In and Sign Up in one component.
 * Uses existing Modal, Input, Spinner shared components.
 * On success, AppProviders.jsx auth listener catches the session automatically.
 */
import { useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Modal } from '../shared/Modal'
import { Input } from '../shared/Input'
import { Spinner } from '../shared/Spinner'

export function AuthModal({ open, onClose }) {
  const [isSignUp, setIsSignUp]   = useState(false)
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [success, setSuccess]     = useState(null)

  const reset = () => {
    setEmail(''); setPassword(''); setError(null); setSuccess(null)
  }

  const switchMode = () => {
    setIsSignUp((v) => !v)
    setError(null); setSuccess(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      let result

      if (isSignUp) {
        result = await supabase.auth.signUp({ email, password })
        if (result.error) throw result.error
        // Supabase may require email confirmation depending on your settings
        if (result.data?.user && !result.data.session) {
          setSuccess('Check your email to confirm your account, then sign in.')
          setLoading(false)
          return
        }
      } else {
        result = await supabase.auth.signInWithPassword({ email, password })
        if (result.error) throw result.error
      }

      // AppProviders.jsx onAuthStateChange fires and updates Zustand store
      reset()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose() }}
      title={isSignUp ? 'Create Account' : 'Welcome Back'}
      maxWidth="max-w-sm"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Logo mark */}
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 rounded bg-emerald-500 flex items-center justify-center shrink-0">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1L11 4V8L6 11L1 8V4L6 1Z" fill="black" />
            </svg>
          </span>
          <span className="font-mono text-[11px] text-white/30 tracking-widest uppercase">
            {isSignUp ? 'Join MESH' : 'Sign in to MESH'}
          </span>
        </div>

        <Input
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />

        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          hint={isSignUp ? 'Minimum 6 characters' : undefined}
          required
        />

        {/* Error */}
        {error && (
          <p className="font-mono text-[11px] text-red-400 bg-red-400/8 border border-red-400/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Success (email confirmation) */}
        {success && (
          <p className="font-mono text-[11px] text-emerald-400 bg-emerald-400/8 border border-emerald-400/20 rounded-lg px-3 py-2">
            {success}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-semibold py-2.5 rounded-lg transition-all mt-1 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
        >
          {loading
            ? <Spinner size="sm" />
            : (isSignUp ? 'Create Account' : 'Sign In')
          }
        </button>

        {/* Toggle */}
        <p className="text-center font-mono text-[11px] text-white/30 mt-1">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button
            type="button"
            onClick={switchMode}
            className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>

        <p className="text-center font-mono text-[10px] text-white/15 -mt-1">
          Your data is never sold or shared.
        </p>
      </form>
    </Modal>
  )
}
