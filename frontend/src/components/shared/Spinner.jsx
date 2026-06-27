/**
 * components/shared/Spinner.jsx
 * Loading spinner and full-page loader.
 */
export function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-3 h-3', md: 'w-6 h-6', lg: 'w-10 h-10' }
  return (
    <span
      className={`inline-block rounded-full border-2 border-white/10 border-t-emerald-400 animate-spin ${sizes[size]} ${className}`}
    />
  )
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
      <Spinner size="lg" />
      <p className="font-mono text-xs text-white/20 tracking-widest animate-pulse uppercase">
        {label}
      </p>
    </div>
  )
}
