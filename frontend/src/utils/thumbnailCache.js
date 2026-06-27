/**
 * utils/thumbnailCache.js
 * Persistent thumbnail cache using IndexedDB.
 * Thumbnails stored here survive page refreshes and browser restarts.
 * Falls back to in-memory Map if IndexedDB is unavailable.
 *
 * Usage:
 *   await ThumbnailCache.get(url)        → dataUrl | null
 *   await ThumbnailCache.set(url, data)  → void
 *   await ThumbnailCache.has(url)        → bool
 */

const DB_NAME    = 'mesh-thumbs'
const STORE_NAME = 'thumbnails'
const DB_VERSION = 1

// In-memory fallback
const memCache = new Map()

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME, { keyPath: 'url' })
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror   = ()  => reject(req.error)
  })
}

async function withStore(mode, fn) {
  try {
    const db  = await openDB()
    const tx  = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    return await fn(store)
  } catch {
    return null
  }
}

export const ThumbnailCache = {
  async get(url) {
    if (memCache.has(url)) return memCache.get(url)
    return withStore('readonly', (store) =>
      new Promise((res) => {
        const req = store.get(url)
        req.onsuccess = () => {
          const data = req.result?.data || null
          if (data) memCache.set(url, data)
          res(data)
        }
        req.onerror = () => res(null)
      })
    )
  },

  async set(url, data) {
    memCache.set(url, data)
    return withStore('readwrite', (store) =>
      new Promise((res) => {
        const req = store.put({ url, data, ts: Date.now() })
        req.onsuccess = () => res()
        req.onerror   = () => res()
      })
    )
  },

  async has(url) {
    return (await this.get(url)) !== null
  },
}
