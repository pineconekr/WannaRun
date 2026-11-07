import React, { useId, useMemo, useState } from 'react';

type SpeedSample = { elapsed_s: number; mps: number };
type Props = { samples: SpeedSample[]; label?: string };

// Retain each bucket's real extrema and the endpoints; never interpolate data.
function drawingSamples(samples: SpeedSample[]) {
  if (samples.length <= 600) return samples;
  const result = [samples[0]];
  const bucketSize = Math.ceil((samples.length - 2) / 299);
  for (let start = 1; start < samples.length - 1; start += bucketSize) {
    const end = Math.min(start + bucketSize, samples.length - 1);
    let low = start;
    let high = start;
    for (let index = start + 1; index < end; index++) {
      if (samples[index].mps < samples[low].mps) low = index;
      if (samples[index].mps > samples[high].mps) high = index;
    }
    result.push(samples[Math.min(low, high)]);
    if (low !== high) result.push(samples[Math.max(low, high)]);
  }
  result.push(samples[samples.length - 1]);
  return result;
}

function elapsedLabel(seconds: number) {
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

export function SpeedChart({ samples, label = '시간에 따른 속도' }: Props) {
  const id = useId();
  const [unit, setUnit] = useState<'m/s' | 'km/h'>('m/s');
  const data = useMemo(() => {
    const valid = samples.filter(sample => Number.isFinite(sample.elapsed_s) && sample.elapsed_s >= 0 && Number.isFinite(sample.mps) && sample.mps >= 0)
      .sort((a, b) => a.elapsed_s - b.elapsed_s);
    let maximum = 0;
    for (const sample of valid) maximum = Math.max(maximum, sample.mps);
    return { count: valid.length, maximum, lastTime: valid.length ? valid[valid.length - 1].elapsed_s : 0, points: drawingSamples(valid) };
  }, [samples, samples.length]);
  const multiplier = unit === 'km/h' ? 3.6 : 1;
  const maxTime = Math.max(1, data.lastTime);
  const maxSpeed = Math.max(1, data.maximum * multiplier * 1.1);
  const x = (time: number) => 48 + time / maxTime * 314;
  const y = (mps: number) => 170 - mps * multiplier / maxSpeed * 134;
  const points = data.points.map(sample => `${x(sample.elapsed_s)},${y(sample.mps)}`).join(' ');

  return <figure className="wr-speed-chart" aria-labelledby={`${id}-heading`}>
    <div className="wr-chart-heading">
      <figcaption id={`${id}-heading`}>{label}</figcaption>
      {data.count > 0 && <div className="wr-unit-controls" role="group" aria-label="속도 단위">
        {(['m/s', 'km/h'] as const).map(value => <button type="button" key={value} aria-pressed={unit === value} onClick={() => setUnit(value)}>{value}</button>)}
      </div>}
    </div>
    {data.count === 0 ? <p className="wr-notice">저장된 속도 측정값이 없어요. 거리와 시간으로 그래프를 만들지 않아요.</p> : <>
      <svg viewBox="0 0 384 216" role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>{label} ({unit})</title>
        <desc id={`${id}-description`}>가로축은 경과 시간(분:초), 세로축은 속도({unit})입니다. 실제 측정값 {data.count}개, 최고 속도 {(data.maximum * multiplier).toFixed(2)} {unit}.{data.count === 1 ? ' 한 번의 측정값을 점으로 표시합니다.' : ''}</desc>
        {[0, 0.5, 1].map(ratio => <g key={ratio}>
          <line className="wr-chart-grid" x1="48" x2="362" y1={170 - ratio * 134} y2={170 - ratio * 134} />
          <text x="40" y={174 - ratio * 134} textAnchor="end">{(maxSpeed * ratio).toFixed(1)}</text>
        </g>)}
        <path className="wr-chart-axis" d="M48 30V170H362" />
        <text x="48" y="20">속도 ({unit})</text>
        {[0, 0.5, 1].map(ratio => <text key={ratio} x={x(maxTime * ratio)} y="190" textAnchor={ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle'}>{elapsedLabel(maxTime * ratio)}</text>)}
        <text x="362" y="210" textAnchor="end">경과 시간 (분:초)</text>
        {data.count > 1 ? <polyline className="wr-chart-line" points={points} /> : <circle className="wr-chart-point" cx={x(data.points[0].elapsed_s)} cy={y(data.points[0].mps)} r="4" />}
      </svg>
      <p className="wr-muted">측정값 {data.count.toLocaleString('ko-KR')}개 · 최고 {(data.maximum * multiplier).toFixed(2)} {unit}{data.count > 600 ? ' · 그래프는 구간별 최솟값·최댓값을 표시해요.' : ''}</p>
    </>}
  </figure>;
}
