import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RunningSession, createRoutePlayer, distanceBetween } from '../src/services/tracking.ts';

const started = Date.parse('2026-11-07T00:00:00Z');
const fix = (seconds: number, longitude: number, speed: number | null = null) => ({
  position: [35, longitude] as [number, number], accuracy: 4,
  timestamp: started + seconds * 1000, speed, simulated: false,
});

test('speed uses GPS timestamps, not delayed callback/timer frequency', () => {
  const run = new RunningSession('gps', started);
  run.ingest(fix(1, 129));
  run.ingest(fix(11, 129.0005));
  const meters = distanceBetween([35, 129], [35, 129.0005]);
  assert.ok(Math.abs(run.distance - meters) < 0.001);
  assert.ok(Math.abs(run.speed - meters / 10) < 0.001);
  const result = run.finish(started + 12000);
  assert.equal(result.durationSeconds, 12);
  assert.equal(result.speedSamples[0].elapsed_s, 11);
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
  assert.equal(result.durationSeconds, 20);
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
