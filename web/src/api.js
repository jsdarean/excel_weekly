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
};
