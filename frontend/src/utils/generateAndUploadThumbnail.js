/**
 * utils/generateAndUploadThumbnail.js
 *
 * Called during asset upload in Dashboard.jsx BEFORE creating the asset record.
 * Renders the GLB → gets a JPEG dataUrl → converts to Blob → PUTs to R2 via
 * a pre-signed URL → returns the public thumbnail URL.
 *
 * After this, assets.thumbnail_url is a plain JPEG in R2.
 * The Marketplace renders it as a simple <img> tag — zero Three.js needed.
 *
 * Flow:
 *   1. generateGlbThumbnail(glbUrl) → dataUrl (offscreen canvas)
 *   2. POST /api/uploads/thumbnail-url → { upload_url, public_url }
 *   3. PUT dataUrl blob → R2
 *   4. Return public_url → stored in assets.thumbnail_url
 */
import { generateGlbThumbnail } from './glbThumbnail'
import { api } from '../services/api'

/**
 * @param {string} glbPublicUrl   The public R2 URL of the uploaded .glb
 * @param {string} assetSlug      Used to name the thumbnail file
 * @returns {string|null}         Public JPEG URL or null on failure
 */
export async function generateAndUploadThumbnail(glbPublicUrl, assetSlug) {
  try {
    // Step 1 — Render the GLB to a JPEG data URL
    const dataUrl = await generateGlbThumbnail(glbPublicUrl, 640, 480)
    if (!dataUrl) return null

    // Step 2 — Convert data URL to Blob
    const res  = await fetch(dataUrl)
    const blob = await res.blob()

    // Step 3 — Get a pre-signed PUT URL for the thumbnail
    const { data: urlData } = await api.post('/api/uploads/thumbnail-url', {
      filename: `${assetSlug}-thumb.jpg`,
    })

    // Step 4 — PUT the JPEG blob directly to R2
    await fetch(urlData.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    })

    return urlData.public_url

  } catch (err) {
    console.warn('Thumbnail upload failed (non-critical):', err)
    return null  // Non-fatal — asset creation continues without thumbnail
  }
}
