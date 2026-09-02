import api, { postFormData } from "./api.js";

/**
 * Analyze a PDF resume against a job description.
 *
 * Sends multipart/form-data to POST /api/analysis with the resume file and the
 * job-description text, then unwraps the `{ success, message, data }` envelope to
 * return the validated analysis object.
 *
 * @param {File} resumeFile - A PDF resume file (≤ 5 MB).
 * @param {string} jobDescription - The job-description text.
 */
export async function analyzeResume(resumeFile, jobDescription) {
  const formData = new FormData();
  formData.append("resume", resumeFile);
  formData.append("jobDescription", jobDescription);

  const data = await postFormData("/analysis", formData);
  return data.data;
}

/**
 * Fetch the authenticated user's saved analyses (newest first, paginated).
 * @param {{ page?: number, limit?: number }} [params]
 * @returns {Promise<{ items: Array, page: number, limit: number, total: number, totalPages: number }>}
 */
export async function fetchAnalysisHistory({ page = 1, limit = 10 } = {}) {
  const { data } = await api.get("/analysis/history", {
    params: { page, limit },
  });
  return data.data;
}

/**
 * Fetch one saved analysis by id. The backend only ever returns it when it
 * belongs to the authenticated user (otherwise 404).
 */
export async function fetchAnalysisById(id) {
  const { data } = await api.get(`/analysis/${id}`);
  return data.data;
}

/** Delete a saved analysis (owner-only, enforced server-side). */
export async function deleteAnalysis(id) {
  await api.delete(`/analysis/${id}`);
}
