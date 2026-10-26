// 담당: 설지환
// 러닝 기록 저장·조회 API 연동
import { authRequest } from './auth';

export type RunRecord = {
  id: string;
  started_at: string;
  ended_at: string;
  distance_m: number;
  duration_s: number;
  path: [number, number][];
};

export type NewRunRecord = Omit<RunRecord, 'id'>;

// 러닝 기록 목록 조회 (최신순)
export function getRunningRecords(token: string) {
  return authRequest<RunRecord[]>('/runs', {}, token);
}

// 러닝 기록 저장
export function saveRunningRecord(record: NewRunRecord, token: string) {
  return authRequest<RunRecord>('/runs', { method: 'POST', body: JSON.stringify(record) }, token);
}

// 특정 러닝 기록 조회
export function getRunningRecord(id: string, token: string) {
  return authRequest<RunRecord>(`/runs/${encodeURIComponent(id)}`, {}, token);
}
