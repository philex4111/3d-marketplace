/**
 * Admin access helpers — normalizes VITE_ADMIN_EMAIL from .env
 * (strips accidental quotes and compares case-insensitively).
 */
export function getAdminEmail() {
  const raw = import.meta.env.VITE_ADMIN_EMAIL || ''
  return raw.replace(/^["']|["']$/g, '').trim().toLowerCase()
}

export function isAdminUser(user) {
  const adminEmail = getAdminEmail()
  if (!adminEmail || !user?.email) return false
  return user.email.trim().toLowerCase() === adminEmail
}
