/**
 * components/shared/Input.jsx
 * Styled input and textarea with label + error support.
 *
 * Usage:
 *   <Input label="Title" value={val} onChange={setVal} />
 *   <Input as="textarea" rows={4} label="Bio" ... />
 */
export function Input({
  label,
  error,
  hint,
  as = 'input',
  className = '',
  rows = 3,
  ...props
}) {
  const base =
    'w-full bg-canvas border rounded-lg px-3 py-2.5 font-mono text-sm text-white/80 ' +
    'placeholder-white/15 focus:outline-none transition-colors ' +
    (error
      ? 'border-red-500/40 focus:border-red-500/60'
      : 'border-border focus:border-white/25')

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="font-mono text-[11px] text-white/35 uppercase tracking-wider">
          {label}
        </label>
      )}

      {as === 'textarea' ? (
        <textarea rows={rows} className={`${base} resize-none`} {...props} />
      ) : (
        <input className={base} {...props} />
      )}

      {error && (
        <p className="font-mono text-[10px] text-red-400">{error}</p>
      )}
      {hint && !error && (
        <p className="font-mono text-[10px] text-white/20">{hint}</p>
      )}
    </div>
  )
}
