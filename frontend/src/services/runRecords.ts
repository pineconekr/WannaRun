import type { RunResult } from '../screens/MapScreen';
export type SavedRun = RunResult & { title: string; note: string };
// Browser records are separated by account; they are never presented as server records.
export function recordKey(userId?: string) { return `wannarun.records.v1.${userId ?? 'guest'}`; }
export function readRecords(key: string): SavedRun[] {
  const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
  if (!Array.isArray(raw) || !raw.every(value => value && typeof value.id === 'string' &&
    typeof value.title === 'string' && typeof value.note === 'string' &&
    Number.isFinite(value.durationSeconds) && value.durationSeconds >= 0 &&
    Number.isFinite(value.distanceMeters) && value.distanceMeters >= 0 &&
    Number.isFinite(value.points) && ['gps', 'demo'].includes(value.source) &&
    typeof value.startedAt === 'string' && Number.isFinite(Date.parse(value.startedAt)) &&
    typeof value.endedAt === 'string' && Number.isFinite(Date.parse(value.endedAt)))) {
    throw new Error('저장된 기록을 읽을 수 없어요. 기존 데이터를 보존했어요.');
  }
  return raw;
}
export function saveRecord(key: string, record: SavedRun) {
  const records = readRecords(key);
  localStorage.setItem(key, JSON.stringify([record, ...records.filter(item => item.id !== record.id)]));
  window.dispatchEvent(new Event('wannarun:records'));
}
export function duration(seconds: number) {
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), Math.floor(seconds % 60)]
    .map(value => String(value).padStart(2, '0')).join(':');
}
export function pace(record: RunResult) {
  if (record.distanceMeters <= 0 || record.durationSeconds <= 0) return '—';
  const seconds = Math.round(record.durationSeconds / (record.distanceMeters / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
