// 땅따먹기: 러닝 경로가 지나간 육각형 칸을 영토로 저장합니다.
// 영토는 이 브라우저에만 저장되며, 표시 여부와 무관하게 지우는 경로는 clearTerritory 하나뿐입니다.
import { useSyncExternalStore } from 'react';

export type Position = [number, number];
export type TerritoryCell = { positions: Position[] };
export type Territory = Record<string, TerritoryCell>;
/** 한 번의 러닝 결과: 이번에 지나간 칸, 그중 새로 차지한 칸(경로 순서), 전체 영토 칸 수. */
/** 한 번의 러닝 결과: 이번에 지나간 칸, 그중 새로 차지한 칸(경로 순서), 전체 영토 칸 수, 기기 저장 성공 여부. */
export type Claim = { cells: Territory; added: string[]; total: number; saved: boolean };

// v3은 칸 키("q:r") 목록만 저장하고 꼭짓점은 불러올 때 다시 계산합니다.
const STORAGE_KEY = 'wannarun-captured-territories-v3';
const V2_STORAGE_KEY = 'wannarun-captured-territories-v2';
const V1_STORAGE_KEY = 'wannarun-captured-territories-v1';
const CHANGE_EVENT = 'wannarun:territory';
const HEX_RADIUS_METERS = 35;
const SAMPLE_DISTANCE_METERS = 10;
const EARTH_RADIUS_METERS = 6_378_137;

function toMercator([latitude, longitude]: Position): [number, number] {
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const latitudeRadians = (clampedLatitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;
  return [
    EARTH_RADIUS_METERS * longitudeRadians,
    EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)),
  ];
}

function fromMercator(x: number, y: number): Position {
  const longitude = (x / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const latitude = (2 * Math.atan(Math.exp(y / EARTH_RADIUS_METERS)) - Math.PI / 2) * (180 / Math.PI);
  return [latitude, longitude];
}

function cubeRound(q: number, r: number): [number, number] {
  const x = q;
  const z = r;
  const y = -x - z;
  let roundedX = Math.round(x);
  let roundedY = Math.round(y);
  let roundedZ = Math.round(z);
  const xDifference = Math.abs(roundedX - x);
  const yDifference = Math.abs(roundedY - y);
  const zDifference = Math.abs(roundedZ - z);

  if (xDifference > yDifference && xDifference > zDifference) roundedX = -roundedY - roundedZ;
  else if (yDifference > zDifference) roundedY = -roundedX - roundedZ;
  else roundedZ = -roundedX - roundedY;

  return [roundedX, roundedZ];
}

function hexCellAt(q: number, r: number): [string, TerritoryCell] {
  const centerX = Math.sqrt(3) * HEX_RADIUS_METERS * (q + r / 2);
  const centerY = 1.5 * HEX_RADIUS_METERS * r;
  const positions: Position[] = Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 30) * Math.PI) / 180;
    return fromMercator(
      centerX + HEX_RADIUS_METERS * Math.cos(angle),
      centerY + HEX_RADIUS_METERS * Math.sin(angle),
    );
  });
  return [`${q}:${r}`, { positions }];
}

function hexKey(position: Position): [number, number] {
  const [x, y] = toMercator(position);
  return cubeRound(
    (Math.sqrt(3) / 3 * x - y / 3) / HEX_RADIUS_METERS,
    (2 / 3 * y) / HEX_RADIUS_METERS,
  );
}

/** 경로가 지나간 칸을 처음 지난 순서대로 돌려줍니다. */
export function cellsAlong(segments: Position[][]): Territory {
  const cells: Territory = {};
  const add = (position: Position) => {
    const [q, r] = hexKey(position);
    const key = `${q}:${r}`;
    // 같은 칸을 여러 번 지나도 꼭짓점은 처음 한 번만 계산합니다.
    if (!(key in cells)) cells[key] = hexCellAt(q, r)[1];
  };

  for (const route of segments) {
    if (route.length === 1) add(route[0]);
    for (let index = 1; index < route.length; index += 1) {
      const start = toMercator(route[index - 1]);
      const end = toMercator(route[index]);
      const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const sampleCount = Math.max(1, Math.ceil(distance / SAMPLE_DISTANCE_METERS));
      for (let sample = 0; sample <= sampleCount; sample += 1) {
        const ratio = sample / sampleCount;
        add(fromMercator(start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio));
      }
    }
  }
  return cells;
}

function fromKeys(keys: Iterable<string>): Territory {
  const parsed: Territory = {};
  for (const key of keys) {
    const match = /^(-?\d+):(-?\d+)$/.exec(key);
    if (match) parsed[key] = hexCellAt(Number(match[1]), Number(match[2]))[1];
  }
  return parsed;
}

function parse(raw: string): Territory {
  const stored: unknown = JSON.parse(raw);
  return Array.isArray(stored) ? fromKeys(stored.filter((key): key is string => typeof key === 'string')) : {};
}

/** v2(칸 키 → 꼭짓점)와 v1(사각 격자 bounds)을 v3 키 목록으로 옮깁니다. */
function migrate(v2: string | null, v1: string | null): string[] {
  const keys = new Set<string>();
  if (v2 !== null) Object.keys(JSON.parse(v2) as Record<string, unknown>).forEach(key => keys.add(key));
  if (v1 !== null) {
    Object.values(JSON.parse(v1) as Record<string, { bounds?: [[number, number], [number, number]] }>).forEach(cell => {
      if (!cell?.bounds) return;
      // v1은 사각 격자였으므로 중심이 속한 육각형으로 옮깁니다.
      const [[south, west], [north, east]] = cell.bounds;
      const [q, r] = hexKey([(south + north) / 2, (west + east) / 2]);
      keys.add(`${q}:${r}`);
    });
  }
  return [...keys];
}

const empty: Territory = {};
let cache: { raw: string | null; value: Territory } = { raw: null, value: empty };
// 저장에 실패한 영토는 저장소의 예전 값보다 우선합니다.
let unsaved = false;

function snapshot(): Territory {
  if (unsaved) return cache.value;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const v2 = window.localStorage.getItem(V2_STORAGE_KEY);
      const v1 = window.localStorage.getItem(V1_STORAGE_KEY);
      if (v2 !== null || v1 !== null) {
        try {
          raw = JSON.stringify(migrate(v2, v1));
        } catch {
          raw = null;
        }
        if (raw !== null) {
          window.localStorage.setItem(STORAGE_KEY, raw);
          window.localStorage.removeItem(V2_STORAGE_KEY);
          window.localStorage.removeItem(V1_STORAGE_KEY);
        }
      }
    }
  } catch {
    // 저장 공간을 읽거나 옮겨 쓸 수 없으면 현재 화면에 남은 영토를 그대로 씁니다.
    if (raw !== null && raw !== cache.raw) {
      try { cache = { raw, value: parse(raw) }; } catch { /* 이전 값 유지 */ }
    }
    return cache.value;
  }
  if (raw === cache.raw) return cache.value;
  try {
    cache = { raw, value: raw === null ? empty : parse(raw) };
  } catch {
    cache = { raw, value: empty };
  }
  return cache.value;
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === STORAGE_KEY) onChange(); };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useTerritory(): Territory {
  return useSyncExternalStore(subscribe, snapshot, () => empty);
}

/** 이번 러닝의 경로를 영토에 더하고, 새로 차지한 칸을 돌려줍니다. */
export function claimTerritory(segments: Position[][]): Claim {
  const current = snapshot();
  const visited = cellsAlong(segments);
  const added = Object.keys(visited).filter(key => !(key in current));
  const next = { ...current, ...visited };
  const raw = JSON.stringify(Object.keys(next));
  let saved = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    unsaved = false;
  } catch {
    // 저장하지 못해도 이번 실행 중에는 지도에 표시합니다.
    unsaved = true;
    saved = false;
  }
  cache = { raw, value: next };
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return { cells: visited, added, total: Object.keys(next).length, saved };
}

export function clearTerritory() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(V2_STORAGE_KEY);
    window.localStorage.removeItem(V1_STORAGE_KEY);
    unsaved = false;
  } catch {
    // 저장 공간을 쓸 수 없어도 화면의 영토는 비웁니다.
    unsaved = true;
  }
  cache = { raw: null, value: empty };
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
