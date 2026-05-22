import fs from 'node:fs';
import path from 'node:path';

export function readJobState(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { jobs: {} };
  }
}

export function writeJobState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

export function upsertJob(state, jobPatch, now = new Date().toISOString()) {
  const jobs = state.jobs ?? {};
  const existing = jobs[jobPatch.jobId] ?? {};
  const next = {
    ...existing,
    ...jobPatch,
    jobId: jobPatch.jobId,
    createdAt: existing.createdAt ?? now,
    updatedAt: now,
  };
  return {
    ...state,
    jobs: {
      ...jobs,
      [jobPatch.jobId]: next,
    },
  };
}

export function getJob(state, jobId) {
  return state.jobs?.[jobId] ?? null;
}
