// 땅따먹기: 러닝 경로가 지나간 H3 칸(해상도 11, 변 약 29m)을 영토로 보여줍니다.
// 로그인하면 서버(GET /users/me/territory)가 정본이고, 로그인 없이 둘러보는 동안만 이 브라우저에 저장합니다.
// 달리는 동안의 실시간 표시와 결과 화면은 서버(backend/territory.py)와 같은 알고리즘으로 미리 계산합니다.
import { useSyncExternalStore } from 'react';
import { cellToBoundary, greatCircleDistance, gridPathCells, isValidCell, latLngToCell } from 'h3-js';
// 서버와 주고받는 코드는 territorySync.ts에 있습니다.

export type Position = [number, number];
export type TerritoryCell = { positions: Position[] };
/** H3 칸 ID → 꼭짓점. */
export type Territory = Record<string, TerritoryCell>;
/** 한 번의 러닝 결과: 이번에 지나간 칸, 그중 새로 차지한 칸(경로 순서), 전체 영토 칸 수, 저장 성공 여부. */
export type Claim = { cells: Territory; added: string[]; total: number; saved: boolean };

/** 서버의 H3_RESOLUTION, MAX_GAP_METERS와 같아야 합니다. */
export const H3_RESOLUTION = 11;
const MAX_GAP_METERS = 1000;
const GUEST_STORAGE_KEY = 'wannarun-guest-territory-h3-v1';

const boundaries = new Map<string, TerritoryCell>();

function cellAt(id: string): TerritoryCell {
  let cell = boundaries.get(id);
  if (!cell) {
    cell = { positions: cellToBoundary(id) as Position[] };
    boundaries.set(id, cell);
  }
  return cell;
}

function fromIds(ids: Iterable<string>): Territory {
  const territory: Territory = {};
  for (const id of ids) territory[id] = cellAt(id);
  return territory;
}

/** 경로가 지나간 칸을 처음 지난 순서대로 돌려줍니다. 서버의 cells_along과 같은 규칙입니다. */
export function cellsAlong(segments: Position[][]): Territory {
  const ids = new Set<string>();
  for (const route of segments) {
    let previous: string | null = null;
    let previousPoint: Position | null = null;
    for (const point of route) {
      const current = latLngToCell(point[0], point[1], H3_RESOLUTION);
      if (previous === null || previous === current) {
        ids.add(current);
      } else {
        ids.add(previous);
        let between = [current];
        // 두 점이 너무 멀면 GPS 튐으로 보고 중간 칸을 채우지 않습니다.
        if (greatCircleDistance(previousPoint!, point, 'm') <= MAX_GAP_METERS) {
          try { between = gridPathCells(previous, current); } catch { /* 양 끝 칸만 남깁니다. */ }
        }
        for (const id of between) ids.add(id);
      }
      previous = current;
      previousPoint = point;
    }
  }
  return fromIds(ids);
}

// --- 저장소: 계정이면 서버에서 받은 값을 메모리에, 게스트면 localStorage에 둡니다. ---
const empty: Territory = {};
const listeners = new Set<() => void>();
let mode: 'guest' | 'account' = 'guest';
let guestLoaded = false;
let current: Territory = empty;

function emit() { listeners.forEach(listener => listener()); }

function loadGuest() {
  guestLoaded = true;
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    const stored: unknown = raw === null ? [] : JSON.parse(raw);
    current = Array.isArray(stored)
      ? fromIds(stored.filter((id): id is string => typeof id === 'string' && isValidCell(id)))
      : empty;
  } catch {
    current = empty;
  }
}

function saveGuest(territory: Territory): boolean {
  try {
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(Object.keys(territory)));
    return true;
  } catch {
    return false;
  }
}

function snapshot(): Territory {
  if (mode === 'guest' && !guestLoaded) loadGuest();
  return current;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

export function useTerritory(): Territory {
  return useSyncExternalStore(subscribe, snapshot, () => empty);
}

/** 게스트 영토(이 브라우저에 저장한 것)를 보여줍니다. */
export function enterGuestMode() {
  mode = 'guest';
  guestLoaded = false;
  current = empty;
  emit();
}

/** 계정 화면으로 바꿉니다. 서버 값이 올 때까지는 비워 둬서 게스트 영토가 계정에 비치지 않게 합니다. */
export function enterAccountMode() {
  if (mode === 'account') return;
  mode = 'account';
  current = empty;
  emit();
}

/** 서버가 확정한 내 영토로 화면을 바꿉니다. */
export function setAccountCells(ids: string[]) {
  mode = 'account';
  current = fromIds(ids);
  emit();
}

/** 이번 러닝의 경로를 화면의 영토에 더하고, 새로 차지한 칸을 돌려줍니다. 계정 영토는 러닝을 저장할 때 서버가 확정합니다. */
export function claimTerritory(segments: Position[][]): Claim {
  const before = snapshot();
  const visited = cellsAlong(segments);
  const added = Object.keys(visited).filter(id => !(id in before));
  const next = { ...before, ...visited };
  const saved = mode === 'account' ? true : saveGuest(next);
  current = next;
  emit();
  return { cells: visited, added, total: Object.keys(next).length, saved };
}

/** 화면의 영토를 비웁니다. 게스트면 이 브라우저에 저장한 것도 지웁니다. 서버의 영토는 건드리지 않습니다. */
export function clearLocalTerritory() {
  if (mode === 'guest') {
    try { window.localStorage.removeItem(GUEST_STORAGE_KEY); } catch { /* 화면의 영토는 아래에서 비웁니다. */ }
  }
  current = empty;
  emit();
}
