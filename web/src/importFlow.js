import { api } from './api.js';

export async function importWithConfirm(file, reportDate, confirmFn) {
  try {
    return await api.importReport(file, reportDate, false);
  } catch (e) {
    if (e.status === 409) {
      if (await confirmFn(e.message)) {
        return api.importReport(file, reportDate, true);
      }
      return null;
    }
    throw e;
  }
}
