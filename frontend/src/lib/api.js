const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const TOKEN_KEY = 'ibotix_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', body, timeout = 15000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${path} timed out after ${timeout / 1000}s. Is the API server running on ${BASE}?`)
    }
    throw new Error(`Cannot reach the API at ${BASE}. Start the server with "npm run dev" in the server folder. (${err.message})`)
  }
  clearTimeout(timer)

  let data = null
  const text = await res.text()
  if (text) {
    try { data = JSON.parse(text) } catch { data = { error: text } }
  }

  if (!res.ok) {
    const message = data?.error || `${res.status} ${res.statusText}`
    const error = new Error(message)
    error.status = res.status
    throw error
  }
  return data
}

// Multipart upload — deliberately bypasses `request()` above since that
// always JSON-encodes the body and sets Content-Type: application/json.
// The browser sets the correct multipart Content-Type (with boundary)
// automatically when given a FormData body, as long as we don't set our
// own Content-Type header.
async function uploadRequest(path, formData, { timeout = 30000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  let res
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: formData,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      throw new Error(`Upload to ${path} timed out after ${timeout / 1000}s.`)
    }
    throw new Error(`Cannot reach the API at ${BASE}. (${err.message})`)
  }
  clearTimeout(timer)

  let data = null
  const text = await res.text()
  if (text) {
    try { data = JSON.parse(text) } catch { data = { error: text } }
  }
  if (!res.ok) {
    const message = data?.error || `${res.status} ${res.statusText}`
    const error = new Error(message)
    error.status = res.status
    throw error
  }
  return data
}

export const api = {
  get:  (path)        => request(path),
  post: (path, body)  => request(path, { method: 'POST', body }),
  put:  (path, body)  => request(path, { method: 'PUT', body }),
  patch:(path, body)  => request(path, { method: 'PATCH', body }),
  del:  (path)        => request(path, { method: 'DELETE' }),
  upload: (path, formData) => uploadRequest(path, formData),
}

export { BASE as API_BASE }
