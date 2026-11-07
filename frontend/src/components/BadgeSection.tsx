import React from 'react';

export type BadgeActivity = { startedAt: string; distanceMeters: number };

function formatAchievementDate(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}. ${month}. ${day}.`;
}

type Props = {
  activities: BadgeActivity[];
};

function getDistanceMilestoneDate(activities: BadgeActivity[], targetMeters: number) {
  let distance = 0;
  for (const activity of activities) {
    distance += activity.distanceMeters;
    if (distance >= targetMeters) return activity.startedAt;
  }
  return undefined;
}

function getWeeklyMilestoneDate(activities: BadgeActivity[]) {
  const counts = new Map<string, number>();
  for (const activity of activities) {
    const date = new Date(activity.startedAt);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const weekKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const count = counts.get(weekKey) ?? 0;
    if (count === 2) return activity.startedAt;
    counts.set(weekKey, count + 1);
  }
  return undefined;
}

export default function BadgeSection({ activities }: Props) {
  const chronologicalActivities = [...activities].sort(
    (left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt),
  );
  const workoutCount = activities.length;
  const totalDistanceKm = activities.reduce((sum, activity) => sum + activity.distanceMeters, 0) / 1000;
  const firstRunDate = chronologicalActivities[0]?.startedAt;
  const tenKmDate = getDistanceMilestoneDate(chronologicalActivities, 10_000);
  const fiftyKmDate = getDistanceMilestoneDate(chronologicalActivities, 50_000);
  const weeklyRunsDate = getWeeklyMilestoneDate(chronologicalActivities);
  const badges = [
    { icon: '🏁', name: '첫 러닝', condition: '러닝 1회 완료', earned: workoutCount >= 1, earnedAt: firstRunDate },
    { icon: '👟', name: '10km 달성', condition: '누적 거리 10km', earned: totalDistanceKm >= 10, earnedAt: tenKmDate },
    { icon: '🔥', name: '꾸준한 한 주', condition: '한 주 3회 러닝', earned: Boolean(weeklyRunsDate), earnedAt: weeklyRunsDate },
    { icon: '🏅', name: '50km 클럽', condition: '누적 거리 50km', earned: totalDistanceKm >= 50, earnedAt: fiftyKmDate },
  ];

  return (
    <section className="wr-badges" aria-labelledby="badge-title">
      <header className="wr-badges-header">
        <div>
          <h2 id="badge-title">미션 배지</h2>
          <p>러닝 미션을 달성하고 배지를 모아보세요.</p>
        </div>
        <span>{badges.filter((badge) => badge.earned).length}/{badges.length}</span>
      </header>
      <ul className="wr-badge-grid">
        {badges.map((badge) => (
          <li className={`wr-badge-card${badge.earned ? ' is-earned' : ' is-locked'}`} key={badge.name}>
            <span className="wr-badge-icon" aria-hidden="true">{badge.earned ? badge.icon : '🔒'}</span>
            <strong>{badge.name}</strong>
            {badge.earnedAt && (
              <time className="wr-badge-earned-date" dateTime={badge.earnedAt}>
                {formatAchievementDate(badge.earnedAt)}
              </time>
            )}
            <span>{badge.condition}</span>
            <small>{badge.earned ? '달성 완료' : '도전 중'}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
