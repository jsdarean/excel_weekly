export function buildQuery(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function request(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `请求失败（${res.status}）`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getReports: (params) => request(`/api/reports${buildQuery(params)}`),
  getReportDates: () => request('/api/report-dates'),
  getFilters: () => request('/api/filters'),
  getStats: () => request('/api/stats'),
  importReport(file, reportDate, overwrite) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('report_date', reportDate);
    fd.append('overwrite', overwrite ? 'true' : 'false');
    return request('/api/import', { method: 'POST', body: fd });
  },
  listPersons: () => request('/api/persons'),
  createPerson: (p) =>
    request('/api/persons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    }),
  updatePerson: (id, p) =>
    request(`/api/persons/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    }),
  deletePerson: (id) => request(`/api/persons/${id}`, { method: 'DELETE' }),
  getProject: (code) => request(`/api/projects/${encodeURIComponent(code)}`),
  updateProject: (code, body) =>
    request(`/api/projects/${encodeURIComponent(code)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  searchProjects: (keyword) => request(`/api/reports${buildQuery({ keyword })}`),
  getWatched: () => request('/api/watched'),
  addWatched: (code) =>
    request('/api/watched', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
  removeWatched: (code) =>
    request(`/api/watched/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  addWatchProgress: (code, body) =>
    request(`/api/watched/${encodeURIComponent(code)}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateWatchProgress: (id, body) =>
    request(`/api/watched/progress/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteWatchProgress: (id) =>
    request(`/api/watched/progress/${id}`, { method: 'DELETE' }),
  getReportTemplates: () => request('/api/report-templates'),
  createReportTemplate: (name, content) =>
    request('/api/report-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    }),
  updateReportTemplate: (id, name, content) =>
    request(`/api/report-templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    }),
  deleteReportTemplate: (id) =>
    request(`/api/report-templates/${id}`, { method: 'DELETE' }),
  getReportPreview: (templateId) =>
    request(`/api/report-preview${templateId ? `?template_id=${templateId}` : ''}`),
  importPms(file) {
    const fd = new FormData();
    fd.append('file', file);
    return request('/api/import-pms', { method: 'POST', body: fd });
  },
};
