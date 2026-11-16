import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cellsAlong, claimTerritory, clearLocalTerritory, enterAccountMode, enterGuestMode, setAccountCells,
  type Position,
} from '../src/services/territory.ts';

// territory.ts touches window only when called, so the shim can follow the import.
const store = new Map<string, string>();
let full = false;
const localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (full) throw new DOMException('quota', 'QuotaExceededError');
    store.set(key, value);
  },
  removeItem: (key: string) => { store.delete(key); },
};
Object.assign(globalThis, { window: Object.assign(new EventTarget(), { localStorage }) });

const GUEST_KEY = 'wannarun-guest-territory-h3-v1';
const eastward: Position[] = [[35.1688, 129.1258], [35.1688, 129.1300]];
const extended: Position[] = [[35.1688, 129.1258], [35.1688, 129.1340]];

beforeEach(() => { full = false; enterGuestMode(); clearLocalTerritory(); store.clear(); });

// backend/territory.py의 cells_along이 만든 기준값입니다(backend/tests/test_territory.py도 같은 파일을 검사).
// 서버나 프론트의 칸 선택 규칙을 바꾸면 양쪽을 함께 고치고 이 파일을 다시 만들어야 합니다.
const golden: Record<string, { path: Position[]; cells: string[] }> =
  JSON.parse(readFileSync(new URL('./territory-golden.json', import.meta.url), 'utf8'));

test('cellsAlong matches the server cell-for-cell, in the same order', () => {
  for (const [name, { path, cells }] of Object.entries(golden)) {
    assert.deepEqual(Object.keys(cellsAlong([path])), cells, name);
  }
});

test('a GPS jump over 1 km keeps only the two end cells', () => {
  assert.equal(Object.keys(cellsAlong([golden.jump.path])).length, 2);
});

test('cells are hexagons with [lat, lng] vertices', () => {
  const cells = Object.values(cellsAlong([eastward]));
  assert.ok(cells.length > 5);
  assert.ok(cells.every(cell => cell.positions.length === 6 && cell.positions.every(([lat, lng]) => lat > 35 && lat < 36 && lng > 129 && lng < 130)));
});

test('a later run keeps earlier territory and reports only cells it newly claims', () => {
  const first = claimTerritory([eastward]);
  assert.ok(first.added.length > 0);
  assert.equal(first.total, first.added.length);

  const second = claimTerritory([extended]);
  assert.ok(second.added.length > 0);
  assert.ok(second.added.every(key => !first.added.includes(key)));
  assert.equal(second.total, first.total + second.added.length);

  const repeat = claimTerritory([eastward]);
  assert.deepEqual(repeat.added, []);
  assert.equal(repeat.total, second.total);
  // 결과 화면은 누적 영토가 아니라 이번 러닝이 지나간 칸만 보여줍니다.
  assert.deepEqual(Object.keys(repeat.cells), Object.keys(cellsAlong([eastward])));
});

test('guest territory persists as a list of H3 ids and is removed only by clearLocalTerritory', () => {
  const { total } = claimTerritory([eastward]);
  const stored = JSON.parse(store.get(GUEST_KEY)!);
  assert.ok(Array.isArray(stored) && stored.every(id => typeof id === 'string'));
  assert.equal(stored.length, total);

  clearLocalTerritory();
  assert.equal(store.has(GUEST_KEY), false);
  assert.equal(claimTerritory([]).total, 0);
});

test('guest territory is restored from storage after a reload', () => {
  const { total } = claimTerritory([eastward]);
  enterGuestMode(); // 새로 불러오는 것과 같습니다.
  assert.equal(claimTerritory([]).total, total);
});

test('a failed write reports saved=false but keeps the claim for this session', () => {
  assert.equal(claimTerritory([eastward]).saved, true);
  full = true;
  const second = claimTerritory([extended]);
  assert.equal(second.saved, false);
  assert.ok(second.added.length > 0);
  assert.equal(claimTerritory([]).total, second.total);
});

test('account mode hides guest territory, shows the server cells and never touches guest storage', () => {
  claimTerritory([eastward]);
  const guestStored = store.get(GUEST_KEY);

  enterAccountMode();
  assert.equal(claimTerritory([]).total, 0);

  const serverCells = Object.keys(cellsAlong([eastward]));
  setAccountCells(serverCells);
  const claim = claimTerritory([extended]);
  assert.equal(claim.saved, true);
  assert.ok(claim.added.every(id => !serverCells.includes(id)));
  assert.equal(claim.total, serverCells.length + claim.added.length);
  assert.equal(store.get(GUEST_KEY), guestStored);

  // 로그아웃하면 게스트 영토로 돌아옵니다.
  enterGuestMode();
  assert.equal(claimTerritory([]).total, JSON.parse(guestStored!).length);
});
