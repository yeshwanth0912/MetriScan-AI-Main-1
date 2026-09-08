const TOKEN_KEY = 'metriscan.token'

export const token = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (v) => sessionStorage.setItem(TOKEN_KEY, v),
  clear: () => sessionStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {}
  const jwt = token.get()
  if (jwt) headers.Authorization = `Bearer ${jwt}`
  if (body && !isForm) headers['Content-Type'] = 'application/json'

  const res = await fetch(path, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined
  })

  if (res.status === 204) return null
  const text = await res.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) }
    catch { data = { detail: text } }
  }

  if (!res.ok) {
    const detail = data?.detail
    const message = typeof detail === 'string' ? detail
      : detail?.message || `Request failed (${res.status})`
    if (res.status === 401) token.clear()
    throw new ApiError(message, res.status, detail)
  }
  return data
}

export const api = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/api/auth/me'),

  createInspection: (body) => request('/api/inspections', { method: 'POST', body }),
  listInspections: (params = {}) =>
    request('/api/inspections?' + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null))),
  getInspection: (id) => request(`/api/inspections/${id}`),
  updateInspection: (id, body) => request(`/api/inspections/${id}`, { method: 'PATCH', body }),
  saveInspection: (id, body = {}) => request(`/api/inspections/${id}/save`, { method: 'POST', body }),
  uploadImage: (id, file, imageType) => {
    const form = new FormData()
    form.append('file', file)
    form.append('image_type', imageType)
    return request(`/api/inspections/${id}/images`, { method: 'POST', body: form, isForm: true })
  },
  deleteImage: (id, imageId) => request(`/api/inspections/${id}/images/${imageId}`, { method: 'DELETE' }),

  analyze: (id) => request(`/api/analysis/inspections/${id}/analyze`, { method: 'POST' }),
  results: (id) => request(`/api/analysis/inspections/${id}/results`),
  evidence: (id, field) => request(`/api/analysis/inspections/${id}/evidence/${field}`),

  correctField: (id, field, corrected_value, note = '') =>
    request(`/api/review/inspections/${id}/fields/${field}`,
      { method: 'PATCH', body: { corrected_value, note } }),
  decideResult: (id, resultId, body) =>
    request(`/api/review/inspections/${id}/results/${resultId}/decide`, { method: 'POST', body }),
  finalize: (id) => request(`/api/review/inspections/${id}/finalize`, { method: 'POST' }),
  reopen: (id) => request(`/api/review/inspections/${id}/reopen`, { method: 'POST' }),

  generateReport: (id) => request(`/api/reports/inspections/${id}/generate`, { method: 'POST' }),
  listReports: (id) => request(`/api/reports/inspections/${id}`),

  rules: () => request('/api/rules'),
  verifyVersion: (versionId, ref) =>
    request(`/api/rules/versions/${versionId}/verify?source_reference=${encodeURIComponent(ref)}`,
      { method: 'POST' }),

  summary: () => request('/api/dashboard/summary'),
  topViolations: () => request('/api/dashboard/violations'),
  trends: (days = 30) => request(`/api/dashboard/trends?days=${days}`),
  reviewQueue: () => request('/api/dashboard/review-queue')
}

/** Download a protected file through fetch so the bearer token travels with it. */
export async function downloadFile(url, filename) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.get()}` } })
  if (!res.ok) throw new ApiError('That file could not be downloaded.', res.status)
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}
