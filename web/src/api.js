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
  importPersons(file) {
    const fd = new FormData();
    fd.append('file', file);
    return request('/api/persons/import', { method: 'POST', body: fd });
  },
  listDirectory: (params) => request(`/api/directory${buildQuery(params ?? {})}`),
  listDirectoryDepartments: () => request('/api/directory/departments'),
  listDirectoryRooms: (dept) => request(`/api/directory/rooms${buildQuery({ dept })}`),
  createDirectory: (d) =>
    request('/api/directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    }),
  updateDirectory: (id, d) =>
    request(`/api/directory/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    }),
  deleteDirectory: (id) => request(`/api/directory/${id}`, { method: 'DELETE' }),
  getProject: (code) => request(`/api/projects/${encodeURIComponent(code)}`),
  updateProject: (code, body) =>
    request(`/api/projects/${encodeURIComponent(code)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  searchProjects: (keyword) => request(`/api/reports${buildQuery({ keyword })}`),
  pinProject: (code) =>
    request(`/api/projects/${encodeURIComponent(code)}/pin`, { method: 'PUT' }),
  unpinProject: (code) =>
    request(`/api/projects/${encodeURIComponent(code)}/pin`, { method: 'DELETE' }),
  movePin: (code, direction) =>
    request(`/api/projects/${encodeURIComponent(code)}/pin/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    }),
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
  listContacts: (projectCode) =>
    request(`/api/contacts${buildQuery({ project_code: projectCode })}`),
  getContactOptions: () => request('/api/contacts/options'),
  createContact: (c) =>
    request('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    }),
  updateContact: (id, c) =>
    request(`/api/contacts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    }),
  deleteContact: (id) => request(`/api/contacts/${id}`, { method: 'DELETE' }),
  importContacts(file) {
    const fd = new FormData();
    fd.append('file', file);
    return request('/api/contacts/import', { method: 'POST', body: fd });
  },
  getEmailConfig: () => request('/api/email-config'),
  saveEmailConfig: (c) =>
    request('/api/email-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    }),
  testEmailConfig: (to) =>
    request('/api/email-config/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    }),
  getMailTemplate: () => request('/api/bulk-mail/template'),
  saveMailTemplate: (t) =>
    request('/api/bulk-mail/template', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    }),
  getMailProjects: () => request('/api/bulk-mail/projects'),
  previewMail: (code) => request(`/api/bulk-mail/preview/${encodeURIComponent(code)}`),
  sendMail: (code) =>
    request('/api/bulk-mail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectCode: code }),
    }),
  getMailLogs: () => request('/api/bulk-mail/logs'),
  listVipRecipients: (templateId) => request(`/api/vip-recipients${buildQuery({ template_id: templateId })}`),
  createVipRecipient: (templateId, r) =>
    request(`/api/vip-recipients${buildQuery({ template_id: templateId })}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
    }),
  updateVipRecipient: (templateId, id, r) =>
    request(`/api/vip-recipients/${id}${buildQuery({ template_id: templateId })}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
    }),
  deleteVipRecipient: (templateId, id) =>
    request(`/api/vip-recipients/${id}${buildQuery({ template_id: templateId })}`, { method: 'DELETE' }),
  saveVipOrder: (templateId, ids) =>
    request(`/api/vip-recipients/order${buildQuery({ template_id: templateId })}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }),
  importVipRecipients(templateId, file) {
    const fd = new FormData();
    fd.append('file', file);
    return request(`/api/vip-recipients/import${buildQuery({ template_id: templateId })}`, { method: 'POST', body: fd });
  },
  sendWeeklyMail: (body) =>
    request('/api/weekly-mail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  getWeeklyMailLogs: (templateId) => request(`/api/weekly-mail/logs${buildQuery({ template_id: templateId })}`),  getMailCcList: () => request('/api/bulk-mail/cc-list'),
  saveMailCcList: (list) =>
    request('/api/bulk-mail/cc-list', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list }),
    }),
  getReportTemplates: () => request('/api/report-templates'),
  createReportTemplate: (name, content, periodType = '周报', withAttachment = false, mailTitle = '', mailSubtitle = '', mailSubject = '', mailSignature = '') =>
    request('/api/report-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content, periodType, withAttachment, mailTitle, mailSubtitle, mailSubject, mailSignature }),
    }),
  updateReportTemplate: (id, name, content, periodType = '周报', withAttachment = false, mailTitle = '', mailSubtitle = '', mailSubject = '', mailSignature = '') =>
    request(`/api/report-templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content, periodType, withAttachment, mailTitle, mailSubtitle, mailSubject, mailSignature }),
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
  previewPms(file) {
    const fd = new FormData();
    fd.append('file', file);
    return request('/api/import-pms/preview', { method: 'POST', body: fd });
  },
  applyPms(body) {
    return request('/api/import-pms/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
};
