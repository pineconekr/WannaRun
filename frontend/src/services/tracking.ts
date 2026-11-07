import type { LocationUpdate, LocationPosition } from './location';

export type SpeedSample = { elapsed_s: number; mps: number };
export type RunResult = {
  id: string; startedAt: string; endedAt: string; durationSeconds: number;
  distanceMeters: number; source: 'gps' | 'demo'; points: number;
  path: LocationPosition[]; speedSamples: SpeedSample[]; serverId?: string;
};
export type RunPhase = 'ready' | 'running' | 'paused' | 'finished';

export function distanceBetween(a: LocationPosition, b: LocationPosition): number {
  const rad = Math.PI / 180;
  const x = Math.sin((b[0] - a[0]) * rad / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin((b[1] - a[1]) * rad / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

// 데모 경로를 약 stepMeters 간격으로 필요할 때마다 생성. 긴 경로도 전체 점 배열을 미리 만들지 않음.
export function createRoutePlayer(route: LocationPosition[], stepMeters = 15): () => LocationPosition | null {
  let started = false;
  let leg = 1;
  let step = 0;
  let steps = 0;
  return () => {
    if (!started) { started = true; return route[0] ?? null; }
    if (leg >= route.length) return null;
    const from = route[leg - 1];
    const to = route[leg];
    if (steps === 0) steps = Math.max(1, Math.ceil(distanceBetween(from, to) / stepMeters));
    step += 1;
    const ratio = step / steps;
    const point: LocationPosition = [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
    if (step === steps) { leg += 1; step = 0; steps = 0; }
    return point;
  };
}

// 타이머 호출 횟수가 아니라 위치 측정 시각과 실제 경과 시간으로 계산.
export class RunningSession {
  id = crypto.randomUUID();
  phase: RunPhase = 'running';
  source: 'gps' | 'demo';
  started: number;
  ended: number | null = null;
  pausedAt: number | null = null;
  pausedMs = 0;
  distance = 0;
  points = 0;
  path: LocationPosition[] = [];
  pathSegments: LocationPosition[][] = [];
  samples: SpeedSample[] = [];
  speed = 0;
  private previous: LocationUpdate | null = null;
  private distanceAnchor: LocationPosition | null = null;
  private lastTimestamp = 0;

  constructor(source: 'gps' | 'demo', started = Date.now()) {
    this.source = source;
    this.started = started;
  }

  elapsed(now = Date.now()) {
    return Math.max(0, ((this.ended ?? this.pausedAt ?? now) - this.started - this.pausedMs) / 1000);
  }

  pause(now = Date.now()) {
    if (this.phase !== 'running') return;
    this.pausedAt = now;
    this.phase = 'paused';
    this.speed = 0;
    this.previous = null;
    this.distanceAnchor = null;
  }

  resume(now = Date.now()) {
    if (this.phase !== 'paused' || this.pausedAt === null) return;
    this.pausedMs += now - this.pausedAt;
    this.pausedAt = null;
    this.phase = 'running';
    this.previous = null;
    this.distanceAnchor = null;
  }

  ingest(update: LocationUpdate): boolean {
    if (this.phase !== 'running' || update.timestamp <= this.lastTimestamp || update.timestamp < this.started ||
        !Number.isFinite(update.timestamp) || !Number.isFinite(update.accuracy) || update.accuracy < 0 || update.accuracy > 50 ||
        !update.position.every(Number.isFinite) || Math.abs(update.position[0]) > 90 || Math.abs(update.position[1]) > 180) return false;
    this.lastTimestamp = update.timestamp;
    this.points += 1;
    const previous = this.previous;
    this.previous = update;
    if (!previous) {
      this.path.push(update.position);
      this.pathSegments.push([update.position]);
      this.distanceAnchor = update.position;
      this.speed = 0;
      return true;
    }
    const segment = distanceBetween(previous.position, update.position);
    const dt = (update.timestamp - previous.timestamp) / 1000;
    this.speed = update.speed !== null && Number.isFinite(update.speed) && update.speed >= 0
      ? update.speed : segment / dt;
    // 작은 이동도 누적하되 3m 이상 진행한 때만 경로·거리에 반영.
    const travelled = this.distanceAnchor ? distanceBetween(this.distanceAnchor, update.position) : 0;
    if (travelled >= 3) {
      this.distance += travelled;
      this.path.push(update.position);
      this.pathSegments.at(-1)?.push(update.position);
      this.distanceAnchor = update.position;
    }
    const elapsed_s = Math.floor(this.elapsed(update.timestamp));
    const last = this.samples.at(-1);
    if (!last || elapsed_s > last.elapsed_s) this.samples.push({ elapsed_s, mps: this.speed });
    else if (elapsed_s === last.elapsed_s) last.mps = this.speed;
    return true;
  }

  finish(now = Date.now()): RunResult {
    if (this.ended === null) {
      if (this.pausedAt !== null) this.pausedMs += now - this.pausedAt;
      this.pausedAt = null;
      this.ended = now;
      this.phase = 'finished';
      this.speed = 0;
    }
    return {
      id: this.id, startedAt: new Date(this.started).toISOString(), endedAt: new Date(this.ended).toISOString(),
      durationSeconds: Math.floor(this.elapsed(now)), distanceMeters: this.distance,
      source: this.source, points: this.points, path: this.path, speedSamples: this.samples,
    };
  }
}
