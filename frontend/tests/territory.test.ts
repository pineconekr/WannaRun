import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { claimTerritory, clearTerritory } from '../src/services/territory.ts';

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

const eastward: [number, number][] = [[35.1688, 129.1258], [35.1688, 129.1300]];
const extended: [number, number][] = [[35.1688, 129.1258], [35.1688, 129.1340]];

beforeEach(() => { full = false; clearTerritory(); store.clear(); });

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
  assert.deepEqual(Object.keys(repeat.cells).sort(), [...first.added].sort());
});

test('territory persists and is removed only by clearTerritory', () => {
  const { total } = claimTerritory([eastward]);
  // v3은 칸 키 목록만 저장합니다.
  const stored = JSON.parse(store.get('wannarun-captured-territories-v3')!);
  assert.ok(Array.isArray(stored) && stored.every(key => typeof key === 'string'));
  assert.equal(stored.length, total);

  clearTerritory();
  assert.equal(store.has('wannarun-captured-territories-v3'), false);
  assert.equal(claimTerritory([]).total, 0);
});

test('legacy square cells migrate to hex territory instead of being dropped', () => {
  store.set('wannarun-captured-territories-v1', JSON.stringify({
    a: { bounds: [[35.1687, 129.1257], [35.1689, 129.1259]] },
  }));
  assert.equal(claimTerritory([]).total, 1);
});

test('v2 cell objects migrate to v3 key lists with the same cells', () => {
  const first = claimTerritory([eastward]);
  const keys: string[] = JSON.parse(store.get('wannarun-captured-territories-v3')!);
  clearTerritory();
  store.clear();
  store.set('wannarun-captured-territories-v2', JSON.stringify(Object.fromEntries(keys.map(key => [key, { positions: [] }]))));

  const repeat = claimTerritory([eastward]);
  assert.deepEqual(repeat.added, []);
  assert.equal(repeat.total, first.total);
  assert.equal(store.has('wannarun-captured-territories-v2'), false);
  assert.deepEqual([...JSON.parse(store.get('wannarun-captured-territories-v3')!)].sort(), [...keys].sort());
  // 다시 계산한 꼭짓점은 육각형입니다.
  assert.ok(Object.values(repeat.cells).every(cell => cell.positions.length === 6));
});

test('a failed write reports saved=false but keeps the claim for this session', () => {
  assert.equal(claimTerritory([eastward]).saved, true);
  full = true;
  const second = claimTerritory([extended]);
  assert.equal(second.saved, false);
  assert.ok(second.added.length > 0);
  assert.equal(claimTerritory([]).total, second.total);
});
