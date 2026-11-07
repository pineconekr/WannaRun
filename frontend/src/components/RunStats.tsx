import React from 'react';
import type { RunResult } from '../screens/MapScreen';
import { duration, pace } from '../services/runRecords';
export function RunStats({ record }: { record: Pick<RunResult, 'distanceMeters' | 'durationSeconds'> & Partial<RunResult> }) {
  const averageSpeed = record.durationSeconds > 0 && record.distanceMeters > 0
    ? record.distanceMeters / record.durationSeconds : 0;
  return <dl className="wr-stats">
    <div className="wr-stat-distance"><dt>이동 거리</dt><dd>{(record.distanceMeters / 1000).toFixed(2)} <small>km</small></dd></div>
    <div><dt>활동 시간</dt><dd>{duration(record.durationSeconds)}</dd></div>
    <div><dt>평균 페이스</dt><dd>{pace(record)} <small>/km</small></dd></div>
    <div><dt>평균 속도</dt><dd>{averageSpeed.toFixed(2)} <small>m/s</small><span className="wr-stat-secondary">{(averageSpeed * 3.6).toFixed(2)} km/h</span></dd></div>
  </dl>;
}
