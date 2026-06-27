/**
 * services/uploadApi.js
 * Dual-file upload pipeline and secure download link request.
 *
 * Upload flow:
 *   1. POST /api/uploads/prepare  → get two pre-signed PUT URLs from FastAPI
 *   2. PUT .glb  directly to R2 public bucket  (with progress)
 *   3. PUT .zip  directly to R2 private vault  (with progress)
 *   4. POST /api/assets/create    → record asset in Supabase via FastAPI
 *
 * Download flow:
 *   POST /api/downloads/:assetId  → get 15-min pre-signed GET URL
 */
import axios from 'axios'
import { api } from './api'

function makeProgressState() {
  return {
    glb: 0,
    zip: 0,
    speedBps: 0,
    uploadedBytes: 0,
    totalBytes: 0,
    phase: 'starting',
  }
}

/**
 * @param {Object}   params
 * @param {File}     params.glbFile      Draco-compressed .glb display file
 * @param {File}     params.zipFile      Source archive (.zip)
 * @param {Object}   params.metadata     Asset fields (title, price_usd, tags, etc.)
 * @param {Function} params.onProgress   progress callback
 */
export async function uploadAsset({ glbFile, zipFile, metadata, onProgress }) {
  // Step 1 — request pre-signed PUT URLs
  const progress = makeProgressState()
  progress.totalBytes = glbFile.size + zipFile.size
  const notify = () => onProgress?.({ ...progress })
  notify()

  const { data: urls } = await api.post('/api/uploads/prepare', {
    glb_filename: glbFile.name,
    zip_filename: zipFile.name,
  })

  let displayFile = urls.display_file
  let sourceFile = urls.source_file

  try {
    progress.phase = 'uploading_display'
    notify()

    let glbLastLoaded = 0
    let glbLastTs = Date.now()
    // Step 2 — PUT display .glb to public R2
    await axios.put(urls.display_file.upload_url, glbFile, {
      headers: { 'Content-Type': 'model/gltf-binary' },
      onUploadProgress: (e) => {
        if (!e.total) return
        progress.glb = Math.round((e.loaded / e.total) * 100)
        progress.uploadedBytes = e.loaded + Math.round((progress.zip / 100) * zipFile.size)
        const now = Date.now()
        const dt = Math.max((now - glbLastTs) / 1000, 0.001)
        const dLoaded = Math.max(e.loaded - glbLastLoaded, 0)
        progress.speedBps = dLoaded / dt
        glbLastLoaded = e.loaded
        glbLastTs = now
        notify()
      },
    })
    progress.glb = 100
    progress.uploadedBytes = glbFile.size + Math.round((progress.zip / 100) * zipFile.size)
    notify()

    progress.phase = 'uploading_source'
    notify()

    let zipLastLoaded = 0
    let zipLastTs = Date.now()
    // Step 3 — PUT source .zip to private vault
    await axios.put(urls.source_file.upload_url, zipFile, {
      headers: { 'Content-Type': 'application/zip' },
      onUploadProgress: (e) => {
        if (!e.total) return
        progress.zip = Math.round((e.loaded / e.total) * 100)
        progress.uploadedBytes = glbFile.size + e.loaded
        const now = Date.now()
        const dt = Math.max((now - zipLastTs) / 1000, 0.001)
        const dLoaded = Math.max(e.loaded - zipLastLoaded, 0)
        progress.speedBps = dLoaded / dt
        zipLastLoaded = e.loaded
        zipLastTs = now
        notify()
      },
    })
    progress.zip = 100
    progress.uploadedBytes = progress.totalBytes
    notify()
  } catch (err) {
    // Browser-to-R2 uploads can fail on bucket CORS; fallback to backend relay.
    progress.phase = 'uploading_via_server'
    progress.glb = 0
    progress.zip = 0
    progress.speedBps = 0
    progress.uploadedBytes = 0
    notify()

    const form = new FormData()
    form.append('glb_file', glbFile)
    form.append('zip_file', zipFile)

    let proxyLastLoaded = 0
    let proxyLastTs = Date.now()
    const { data } = await api.post('/api/uploads/proxy', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      onUploadProgress: (e) => {
        if (!e.total) return
        const pct = Math.max(1, Math.min(100, Math.round((e.loaded / e.total) * 100)))
        progress.glb = pct
        progress.zip = pct
        progress.uploadedBytes = Math.min(e.loaded, progress.totalBytes)
        const now = Date.now()
        const dt = Math.max((now - proxyLastTs) / 1000, 0.001)
        const dLoaded = Math.max(e.loaded - proxyLastLoaded, 0)
        progress.speedBps = dLoaded / dt
        proxyLastLoaded = e.loaded
        proxyLastTs = now
        notify()
      },
    })
    displayFile = data.display_file
    sourceFile = data.source_file
    progress.glb = 100
    progress.zip = 100
    progress.uploadedBytes = progress.totalBytes
    notify()
  }

  // Step 4 — create asset record in Supabase via FastAPI
  progress.phase = 'finalizing_asset'
  progress.speedBps = 0
  notify()
  const { data: asset } = await api.post('/api/assets/create', {
    ...metadata,
    display_glb_url:     displayFile.public_url,
    source_zip_key:      sourceFile.object_key,
    display_glb_size_kb: Math.round(glbFile.size / 1024),
    source_zip_size_mb:  parseFloat((zipFile.size / 1024 / 1024).toFixed(2)),
  }, {
    timeout: 180000,
  })

  progress.phase = 'done'
  notify()
  return asset
}

/**
 * Requests a 15-minute pre-signed GET URL for a purchased asset.
 * Returns: { download_url, filename, expires_at, expires_in_seconds }
 */
export async function requestDownload(assetId) {
  const { data } = await api.post(`/api/downloads/${assetId}`)
  return data
}
