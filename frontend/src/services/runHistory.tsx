export type RunRecord = {
  id: number;
  startedAt: string;
  endedAt: string;
  distanceMeters: number;
  elapsedSeconds: number;
  averagePace: string;
  pointCount: number;
  territoryCount: number;
  isDemo: boolean;
};

const RUN_HISTORY_STORAGE_KEY = 'wannarun-run-history-v1';
const MAX_SAVED_RUNS = 20;

export function getRunHistory(): RunRecord[] {
  try {
    const value = window.localStorage.getItem(RUN_HISTORY_STORAGE_KEY);
    const records: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(records) ? records as RunRecord[] : [];
  } catch {
    return [];
  }
}

export function saveRunHistory(record: RunRecord): RunRecord[] {
  const records = getRunHistory();
  const nextRecords = [record, ...records.filter((item) => item.id !== record.id)]
    .slice(0, MAX_SAVED_RUNS);
  window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(nextRecords));
  return nextRecords;
}

export function deleteRunHistory(recordId: number): RunRecord[] {
  const nextRecords = getRunHistory().filter((record) => record.id !== recordId);
  window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(nextRecords));
  return nextRecords;
}
