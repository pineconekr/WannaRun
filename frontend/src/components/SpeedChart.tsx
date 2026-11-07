import React, { useId, useMemo, useState } from 'react';

type SpeedSample = { elapsed_s: number; mps: number };
type Props = {
  samples: SpeedSample[];
  /** 러닝 전체 평균 속도(m/s). 없으면 측정값의 평균을 씁니다. */
  averageMps?: number;
  label?: string;
};

/** limit개 이하로 줄입니다. 구간마다 실제 최저·최고값과 양 끝값만 남기고 값을 지어내지 않습니다. */
export function thinSamples(samples: SpeedSample[], limit: number) {
  if (samples.length <= limit) return samples;
  const result = [samples[0]];
  const bucketSize = Math.ceil((samples.length - 2) / Math.max(1, Math.floor((limit - 2) / 2)));
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

export function SpeedChart({ samples, averageMps, label = '속도 변화' }: Props) {
  const id = useId();
  const [unit, setUnit] = useState<'km/h' | 'm/s'>('km/h');
  const data = useMemo(() => {
    const valid = samples.filter(sample => Number.isFinite(sample.elapsed_s) && sample.elapsed_s >= 0 && Number.isFinite(sample.mps) && sample.mps >= 0)
      .sort((a, b) => a.elapsed_s - b.elapsed_s);
    let maximum = 0;
    let sum = 0;
    for (const sample of valid) { maximum = Math.max(maximum, sample.mps); sum += sample.mps; }
    return { count: valid.length, maximum, mean: valid.length ? sum / valid.length : 0,
      lastTime: valid.length ? valid[valid.length - 1].elapsed_s : 0, points: thinSamples(valid, 600) };
  }, [samples, samples.length]);
  const multiplier = unit === 'km/h' ? 3.6 : 1;
  const maxTime = Math.max(1, data.lastTime);
  const maxSpeed = Math.max(1, data.maximum * multiplier * 1.1);
  const x = (time: number) => 48 + time / maxTime * 314;
  const y = (mps: number) => 170 - mps * multiplier / maxSpeed * 134;
  const points = data.points.map(sample => `${x(sample.elapsed_s)},${y(sample.mps)}`).join(' ');
  const peakKmh = data.maximum * 3.6;
  // 최고 속도가 평균과 거의 같으면 새로운 정보가 아니라서 숨깁니다.
  const showPeak = peakKmh - (averageMps ?? data.mean) * 3.6 >= 0.5;

  return <figure className="wr-speed-chart" aria-labelledby={`${id}-heading`}>
    <figcaption id={`${id}-heading`}>{label} ({unit})</figcaption>
    {data.count > 0 && <div className="wr-filters" role="group" aria-label="속도 단위">
      {(['km/h', 'm/s'] as const).map(value => <button type="button" key={value} aria-pressed={unit === value} onClick={() => setUnit(value)}>{value}</button>)}
    </div>}
    {data.count === 0 ? <p className="wr-muted">속도를 기록하지 않은 러닝이라 그래프가 없어요.</p> : <>
      <svg viewBox="0 0 384 216" role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>{label} ({unit})</title>
        <desc id={`${id}-description`}>가로축은 경과 시간(분:초), 세로축은 속도({unit})입니다. 실제 측정값 {data.count}개, 최고 속도 {(data.maximum * multiplier).toFixed(1)} {unit}.{data.count === 1 ? ' 한 번의 측정값을 점으로 표시합니다.' : ''}{data.count > 600 ? ' 구간별 실제 최솟값과 최댓값을 표시합니다.' : ''}</desc>
        {[0, 0.5, 1].map(ratio => <g key={ratio}>
          <line className="wr-chart-grid" x1="48" x2="362" y1={170 - ratio * 134} y2={170 - ratio * 134} />
          <text className="wr-chart-num" x="40" y={174 - ratio * 134} textAnchor="end">{(maxSpeed * ratio).toFixed(1)}</text>
        </g>)}
        <path className="wr-chart-axis" d="M48 30V170H362" />
        {[0, 0.5, 1].map(ratio => <text key={ratio} className="wr-chart-num" x={x(maxTime * ratio)} y="190" textAnchor={ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle'}>{elapsedLabel(maxTime * ratio)}</text>)}
        <text x="362" y="212" textAnchor="end">경과 시간 (분:초)</text>
        {data.count > 1 ? <>
          <polygon className="wr-chart-area" points={`${x(data.points[0].elapsed_s)},170 ${points} ${x(data.points[data.points.length - 1].elapsed_s)},170`} />
          <polyline className="wr-chart-line" points={points} />
        </> : <circle className="wr-chart-point" cx={x(data.points[0].elapsed_s)} cy={y(data.points[0].mps)} r="4" />}
      </svg>
      {showPeak && <p className="wr-muted">최고 {(data.maximum * multiplier).toFixed(1)} {unit}</p>}
    </>}
  </figure>;
}
