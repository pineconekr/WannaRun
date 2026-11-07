import React from 'react';
import type { RunResult } from '../screens/MapScreen';
import { clock, pace } from '../services/runRecords';
import { formatKm } from '../services/format';

type Props = {
  record: Pick<RunResult, 'distanceMeters' | 'durationSeconds'>;
  /** 거리 소수 자릿수. 한 번의 러닝은 2, 누적·합계는 1. */
  digits?: 1 | 2;
};

export function RunStats({ record, digits = 2 }: Props) {
  const averageSpeed = record.durationSeconds > 0 && record.distanceMeters > 0
    ? record.distanceMeters / record.durationSeconds : 0;
  return <dl className="wr-stats">
    <div className="wr-stat-distance"><dt>이동 거리</dt><dd>{formatKm(record.distanceMeters, digits)}<small>km</small></dd></div>
    <div><dt>활동 시간</dt><dd>{clock(record.durationSeconds)}</dd></div>
    <div><dt>평균 페이스</dt><dd>{pace(record)}<small>/km</small></dd></div>
    <div><dt>평균 속도</dt><dd>{(averageSpeed * 3.6).toFixed(1)}<small>km/h</small></dd></div>
  </dl>;
}
