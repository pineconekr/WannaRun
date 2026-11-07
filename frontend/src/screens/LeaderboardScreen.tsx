import React from 'react';

export type LeaderboardEntry = {
  userId: string;
  nickname: string;
  distanceKm: number;
  runCount: number;
};

// API가 전체 사용자 순위를 제공하기 전까지 화면 확인에 사용하는 예시 데이터입니다.
const sampleEntries: LeaderboardEntry[] = [
  { userId: 'runner-01', nickname: '바람처럼', distanceKm: 42.8, runCount: 12 },
  { userId: 'runner-02', nickname: '오늘도러닝', distanceKm: 36.4, runCount: 9 },
  { userId: 'runner-03', nickname: '초록신발', distanceKm: 29.7, runCount: 8 },
  { userId: 'runner-04', nickname: '한걸음씩', distanceKm: 24.2, runCount: 7 },
  { userId: 'runner-05', nickname: '달리는토끼', distanceKm: 18.6, runCount: 5 },
];

type Props = {
  entries?: LeaderboardEntry[];
  currentUserId?: string;
};

export default function LeaderboardScreen({
  entries = sampleEntries,
  currentUserId,
}: Props) {
  const rankedEntries = [...entries]
    .filter((entry) => Number.isFinite(entry.distanceKm) && entry.distanceKm >= 0)
    .sort((left, right) => right.distanceKm - left.distanceKm);

  return (
    <section aria-labelledby="leaderboard-title">
      <header style={{ padding: '12px 4px 20px' }}>
        <p className="wr-eyebrow">RUN TOGETHER</p>
        <h1 id="leaderboard-title" style={{ margin: 0, fontSize: 28 }}>러닝 리더보드</h1>
        <p style={{ color: 'var(--wr-muted)', fontSize: 14, lineHeight: 1.6 }}>
          이번 순위는 누적 러닝 거리 기준이에요.
        </p>
        <span className="wr-map-badge">샘플 순위</span>
      </header>

      {rankedEntries.length === 0 ? (
        <div className="wr-record-card">
          <h2>아직 순위가 없어요</h2>
          <p className="wr-description">러닝 기록이 모이면 순위를 확인할 수 있어요.</p>
        </div>
      ) : (
        <ol style={{ display: 'grid', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
          {rankedEntries.map((entry, index) => (
            <li
              key={entry.userId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '16px 18px',
                border: '1px solid #dfe7df',
                borderRadius: 18,
                background: entry.userId === currentUserId ? '#edf5ec' : '#fff',
              }}
            >
              <span aria-label={`${index + 1}위`} style={{ width: 34, color: 'var(--wr-green)', fontSize: 20, fontWeight: 900 }}>
                {index + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{entry.nickname}{entry.userId === currentUserId ? ' (나)' : ''}</strong>
                <div className="wr-muted" style={{ marginTop: 4, fontSize: 12 }}>
                  러닝 {entry.runCount}회
                </div>
              </div>
              <strong style={{ whiteSpace: 'nowrap' }}>{entry.distanceKm.toFixed(1)} km</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
