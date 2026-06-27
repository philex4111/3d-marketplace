/**
 * services/api.js
 * Base Axios instance. Auto-attaches the Supabase JWT to every request.
 * All backend calls go through this — never use fetch() directly.
 */
import axios from 'axios'
import { supabase } from './supabaseClient'

const configuredBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8000'

const fallbackBaseUrl = configuredBaseUrl.includes(':8000')
  ? configuredBaseUrl.replace(':8000', ':800')
  : configuredBaseUrl.includes(':800')
    ? configuredBaseUrl.replace(':800', ':8000')
    : null

export const api = axios.create({
  baseURL: configuredBaseUrl,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT before every request
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

// Global 401 handler — sign out and redirect to home
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (
      err.code === 'ERR_NETWORK' &&
      fallbackBaseUrl &&
      err.config &&
      !err.config.__baseUrlRetried
    ) {
      err.config.__baseUrlRetried = true
      err.config.baseURL = fallbackBaseUrl
      return api.request(err.config)
    }

    if (err.response?.status === 401) {
      console.error("BACKEND REJECTED TOKEN:", err.response)
      // Temporarily disabled so you don't lose form data!
      // await supabase.auth.signOut()
      // window.location.href = '/'
    }
    return Promise.reject(err)
  }
)
