import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RunningSession, createRoutePlayer, distanceBetween } from '../src/services/tracking.ts';

const started = Date.parse('2026-11-07T00:00:00Z');
const fix = (seconds: number, longitude: number, speed: number | null = null) => ({
  position: [35, longitude] as [number, number], accuracy: 4,
  timestamp: started + seconds * 1000, speed, simulated: false,
});

test('GPS clock starts at the first accepted fix, not at the tap', () => {
  const run = new RunningSession('gps', started);
  assert.equal(run.waiting, true);
  assert.equal(run.elapsed(started + 8000), 0);
  assert.equal(run.ingest({ ...fix(6, 129), accuracy: 80 }), false);
  assert.equal(run.elapsed(started + 8000), 0);
  run.ingest(fix(8, 129));
  assert.equal(run.waiting, false);
  assert.equal(run.elapsed(started + 18000), 10);
  const result = run.finish(started + 20000);
  assert.equal(result.startedAt, new Date(started + 8000).toISOString());
  assert.equal(result.durationSeconds, 12);
});

test('pausing before the first fix does not shorten the run', () => {
  const run = new RunningSession('gps', started);
  run.pause(started + 2000);
  run.resume(started + 5000);
  run.ingest(fix(7, 129));
  assert.equal(run.finish(started + 17000).durationSeconds, 10);
});

test('demo sessions keep their given start time', () => {
  const run = new RunningSession('demo', started);
  assert.equal(run.waiting, false);
  run.ingest(fix(3, 129));
  assert.equal(run.finish(started + 10000).durationSeconds, 10);
});

test('speed uses GPS timestamps, not delayed callback/timer frequency', () => {
  const run = new RunningSession('gps', started);
  run.ingest(fix(1, 129));
  run.ingest(fix(11, 129.0005));
  const meters = distanceBetween([35, 129], [35, 129.0005]);
  assert.ok(Math.abs(run.distance - meters) < 0.001);
  assert.ok(Math.abs(run.speed - meters / 10) < 0.001);
  const result = run.finish(started + 12000);
  assert.equal(result.durationSeconds, 11);
  assert.equal(result.speedSamples[0].elapsed_s, 10);
  assert.equal(run.finish(started + 90000).endedAt, result.endedAt);
});

test('pause excludes duration and does not connect movement during pause', () => {
  const run = new RunningSession('gps', started);
  run.ingest(fix(1, 129));
  run.ingest(fix(5, 129.0001, 2));
  const before = run.distance;
  run.pause(started + 10000);
  assert.equal(run.ingest(fix(20, 130)), false);
  run.resume(started + 30000);
  run.ingest(fix(31, 130));
  assert.equal(run.distance, before);
  run.ingest(fix(35, 130.0001, 2));
  const result = run.finish(started + 40000);
  assert.equal(result.durationSeconds, 19);
  assert.ok(result.distanceMeters < 25);
  assert.ok(result.speedSamples.every(s => s.elapsed_s <= result.durationSeconds));
});

test('slow movement accumulates instead of disappearing below 3m per fix', () => {
  const run = new RunningSession('gps', started);
  for (let i = 1; i <= 12; i++) run.ingest(fix(i, 129 + i * 0.00001));
  assert.ok(run.distance > 6);
  assert.ok(run.distance < 15);
});

test('stale and inaccurate fixes do not alter distance, samples or path', () => {
  const run = new RunningSession('gps', started);
  run.ingest(fix(1, 129));
  assert.equal(run.ingest(fix(1, 130)), false);
  assert.equal(run.ingest({ ...fix(2, 130), accuracy: 100 }), false);
  assert.equal(run.distance, 0);
  assert.equal(run.path.length, 1);
  assert.equal(run.samples.length, 0);
});

test('impossible jumps start a new segment without distance or samples', () => {
  const run = new RunningSession('gps', started);
  run.ingest(fix(1, 129));
  run.ingest(fix(5, 129.0001));
  const before = run.distance;
  // 4초에 약 900m: 초속 10m를 훌쩍 넘는 튄 위치
  assert.equal(run.ingest(fix(9, 129.01)), true);
  assert.equal(run.distance, before);
  assert.equal(run.samples.length, 1);
  assert.equal(run.speed, 0);
  assert.equal(run.pathSegments.length, 2);
  run.ingest(fix(13, 129.0101));
  assert.ok(run.distance - before > 5 && run.distance - before < 15);
  assert.equal(run.pathSegments.length, 2);
});

test('a long gap between fixes starts a new segment without distance', () => {
  const run = new RunningSession('gps', started);
  run.ingest(fix(1, 129));
  // 60초 뒤 약 90m: 속도는 그럴듯하지만 그사이 경로를 알 수 없음
  run.ingest(fix(61, 129.001));
  assert.equal(run.distance, 0);
  assert.equal(run.samples.length, 0);
  assert.equal(run.pathSegments.length, 2);
});

test('demo route player walks every leg in bounded steps and ends at the last waypoint', () => {
  const route: [number, number][] = [[35, 129], [35, 129.001], [35.0005, 129.001]];
  const next = createRoutePlayer(route, 15);
  const points: [number, number][] = [];
  for (let point = next(); point; point = next()) points.push(point);
  assert.deepEqual(points[0], route[0]);
  assert.deepEqual(points.at(-1), route[2]);
  assert.ok(points.some(point => point[0] === route[1][0] && Math.abs(point[1] - route[1][1]) < 1e-12));
  for (let i = 1; i < points.length; i++) assert.ok(distanceBetween(points[i - 1], points[i]) <= 15.0001);
  assert.equal(next(), null);
});
