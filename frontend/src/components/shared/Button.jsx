/**
 * components/shared/Button.jsx
 * Reusable button with variant support.
 *
 * Variants: primary | ghost | danger
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  className = '',
  ...props
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-mono rounded-lg transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary: 'bg-emerald-500 hover:bg-emerald-400 text-black font-600',
    ghost:   'border border-border hover:border-white/25 text-white/60 hover:text-white',
    danger:  'border border-red-500/30 hover:border-red-500/60 text-red-400 hover:text-red-300',
  }

  const sizes = {
    sm: 'text-[11px] px-3 py-1.5',
    md: 'text-xs px-5 py-2.5',
    lg: 'text-sm px-7 py-3',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
}
