import type { RunResult } from './tracking';
export type SavedRun = RunResult & { title: string; note: string };
// Browser records are separated by account; they are never presented as server records.
export function recordKey(userId?: string) { return `wannarun.records.v1.${userId ?? 'guest'}`; }
export function readRecords(key: string): SavedRun[] {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(key) ?? '[]');
  } catch {
    raw = null;
  }
  if (!Array.isArray(raw) || !raw.every(value => value && typeof value.id === 'string' &&
    typeof value.title === 'string' && typeof value.note === 'string' &&
    Number.isFinite(value.durationSeconds) && value.durationSeconds >= 0 &&
    Number.isFinite(value.distanceMeters) && value.distanceMeters >= 0 &&
    Number.isFinite(value.points) && ['gps', 'demo'].includes(value.source) &&
    typeof value.startedAt === 'string' && Number.isFinite(Date.parse(value.startedAt)) &&
    typeof value.endedAt === 'string' && Number.isFinite(Date.parse(value.endedAt)))) {
    throw new Error('이 기기의 기존 기록을 읽지 못해 새 기록을 더하지 않았어요. 기존 기록은 지우지 않았어요.');
  }
  return raw.map(value => ({
    ...value,
    path: Array.isArray(value.path) ? value.path : [],
    speedSamples: Array.isArray(value.speedSamples) ? value.speedSamples : [],
  }));
}
export function saveRecord(key: string, record: SavedRun) {
  const records = readRecords(key);
  try {
    localStorage.setItem(key, JSON.stringify([record, ...records.filter(item => item.id !== record.id)]));
  } catch {
    throw new Error('기기 저장 공간이 부족해 기록을 저장하지 못했어요. 결과는 화면에 그대로 있어요. 공간을 비운 뒤 다시 저장해 주세요.');
  }
  window.dispatchEvent(new Event('wannarun:records'));
}
/** 이 기기 기록에서 주어진 id들을 지웁니다(예: 계정으로 옮긴 게스트 기록). */
export function removeRecords(key: string, ids: string[]) {
  const remove = new Set(ids);
  localStorage.setItem(key, JSON.stringify(readRecords(key).filter(item => !remove.has(item.id))));
  window.dispatchEvent(new Event('wannarun:records'));
}
/** 1시간 미만은 m:ss, 이상은 h:mm:ss. 좁은 실시간 계기판용. */
export function clock(seconds: number) {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole % 3600 / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return whole < 3600 ? `${minutes}:${rest}` : `${Math.floor(whole / 3600)}:${String(minutes).padStart(2, '0')}:${rest}`;
}
export function pace(record: Pick<RunResult, 'distanceMeters' | 'durationSeconds'>) {
  if (record.distanceMeters <= 0 || record.durationSeconds <= 0) return '—';
  const seconds = Math.round(record.durationSeconds / (record.distanceMeters / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
