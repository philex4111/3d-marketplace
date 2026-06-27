/**
 * components/shared/Modal.jsx
 * Generic modal overlay. Closes on backdrop click and Escape key.
 *
 * Usage:
 *   <Modal open={open} onClose={() => setOpen(false)} title="Confirm">
 *     <p>Content here</p>
 *   </Modal>
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-md' }) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`relative w-full ${maxWidth} mesh-card p-6 z-10`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          {title && (
            <h2 className="font-display font-600 text-base">{title}</h2>
          )}
          <button
            onClick={onClose}
            className="ml-auto text-white/30 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>,
    document.body
  )
}
