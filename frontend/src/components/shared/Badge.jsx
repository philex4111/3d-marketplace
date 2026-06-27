/**
 * components/shared/Badge.jsx
 * Small status / label pill.
 *
 * Variants: default | success | warning | danger | pro
 */
export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-white/5 text-white/40 border-white/8',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    danger:  'bg-red-500/10 text-red-400 border-red-500/20',
    pro:     'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  }

  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] px-2 py-0.5 rounded-full border capitalize tracking-wide ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
