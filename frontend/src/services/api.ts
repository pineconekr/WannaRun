import { authRequest } from './auth';
import type { SpeedSample } from './tracking';

export type RunRecord = {
  id: string;
  started_at: string;
  ended_at: string;
  distance_m: number;
  duration_s: number;
  path: [number, number][];
  title: string;
  note: string;
  source: 'gps' | 'demo' | 'legacy';
  speed_samples: SpeedSample[];
};
export type NewRunRecord = Omit<RunRecord, 'id' | 'title' | 'note' | 'source' | 'speed_samples'> &
  Partial<Pick<RunRecord, 'id' | 'title' | 'note' | 'source' | 'speed_samples'>>;

export function getRunningRecords(token: string) {
  return authRequest<RunRecord[]>('/runs', {}, token);
}
export function saveRunningRecord(record: NewRunRecord, token: string) {
  return authRequest<RunRecord>('/runs', { method: 'POST', body: JSON.stringify(record) }, token);
}
export function getRunningRecord(id: string, token: string) {
  return authRequest<RunRecord>(`/runs/${encodeURIComponent(id)}`, {}, token);
}
export function updateRunningRecord(id: string, metadata: { title: string; note: string }, token: string) {
  return authRequest<RunRecord>(`/runs/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(metadata) }, token);
}
