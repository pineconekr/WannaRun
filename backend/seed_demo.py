"""시연용 데모 러너와 GPS 러닝 기록을 넣거나 지웁니다.

로컬 SQLite:  uv run python -m backend.seed_demo --sqlite backend/auth-test.sqlite3
Neon:         DATABASE_URL 설정 후 uv run python -m backend.seed_demo --yes
제거:         같은 명령에 --remove

데모 러너는 아래 DEMO_RUNNERS 아이디로만 만들고 지웁니다. 다른 계정은 건드리지 않습니다.
다시 실행하면 데모 러너의 기록만 오늘 기준으로 새로 만듭니다(중복 없음).
기록은 source='gps'라서 랭킹·개인 통계에 실제 기록처럼 집계됩니다.
운영 DB에 넣으면 실제 사용자 랭킹에 섞이므로 Neon 시연용 브랜치를 권장합니다.
"""

import argparse
import math
import random
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import create_engine, delete, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from backend.auth import password_hasher
from backend.models import AuthSession, Run, User

# (아이디, 평균 페이스 초/km, 러닝 횟수, 평소 거리 km)
DEMO_RUNNERS = (
    ("demo_gwangalli", 300, 9, 8.0),
    ("demo_suyeong_river", 330, 8, 6.5),
    ("demo_minrak_sunrise", 345, 7, 5.5),
    ("demo_centum_night", 360, 6, 5.0),
    ("demo_apec_naru", 380, 5, 4.5),
    ("demo_haeundae_walk", 420, 6, 3.5),
    ("demo_first_10k", 400, 4, 3.0),
)
DEMO_USERNAMES = tuple(runner[0] for runner in DEMO_RUNNERS)

# 수영강·광안리 일대 출발점 [위도, 경도]
STARTS = (
    (35.1688, 129.1258),
    (35.1532, 129.1187),
    (35.1555, 129.1310),
    (35.1690, 129.1310),
    (35.1730, 129.1250),
)
TITLES = ("수영강 아침 러닝", "광안리 해변 조깅", "민락 수변 한 바퀴", "센텀 퇴근길 러닝", "주말 장거리", "가볍게 회복 러닝")
POINT_SPACING_M = 25
SAMPLE_INTERVAL_S = 10
HISTORY_DAYS = 35


def _offset(point: tuple[float, float], meters: float, heading: float) -> tuple[float, float]:
    latitude, longitude = point
    north = meters * math.cos(heading)
    east = meters * math.sin(heading)
    return (
        latitude + north / 111_320,
        longitude + east / (111_320 * math.cos(math.radians(latitude))),
    )


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    rad = math.pi / 180
    x = math.sin((b[0] - a[0]) * rad / 2) ** 2 + math.cos(a[0] * rad) * math.cos(b[0] * rad) * math.sin((b[1] - a[1]) * rad / 2) ** 2
    return 6_371_000 * 2 * math.atan2(math.sqrt(x), math.sqrt(max(0.0, 1 - x)))


def _run(rng: random.Random, user_id: str, pace_s: int, km: float, started: datetime) -> Run:
    target_m = max(1500.0, rng.gauss(km, km * 0.2) * 1000)
    point = _offset(rng.choice(STARTS), rng.uniform(0, 300), rng.uniform(0, 2 * math.pi))
    heading = rng.uniform(0, 2 * math.pi)
    path = [point]
    distance = 0.0
    while distance < target_m:
        heading += rng.gauss(0, 0.35)
        nxt = _offset(path[-1], POINT_SPACING_M, heading)
        distance += _distance(path[-1], nxt)
        path.append(nxt)
    run_pace = pace_s * rng.uniform(0.94, 1.08)
    duration = round(distance / 1000 * run_pace)
    mean_mps = 1000 / run_pace
    samples = [
        {"elapsed_s": float(t), "mps": round(max(0.5, rng.gauss(mean_mps, mean_mps * 0.08)), 2)}
        for t in range(SAMPLE_INTERVAL_S, duration + 1, SAMPLE_INTERVAL_S)
    ]
    return Run(
        user_id=user_id,
        started_at=started,
        ended_at=started + timedelta(seconds=duration),
        distance_m=round(distance, 1),
        duration_s=duration,
        path=[[round(lat, 6), round(lng, 6)] for lat, lng in path],
        title=rng.choice(TITLES),
        note="",
        source="gps",
        speed_samples=samples,
    )


def seed(engine: Engine, password: str | None = None, now: datetime | None = None) -> str | None:
    """데모 러너를 만들고 기록을 새로 채웁니다. 새로 만든 계정이 있으면 그 비밀번호를 돌려줍니다."""
    now = now or datetime.now(timezone.utc)
    created_password = None
    with Session(engine) as db, db.begin():
        for username, pace_s, count, km in DEMO_RUNNERS:
            user = db.scalar(select(User).where(User.username == username))
            if user is None:
                created_password = created_password or password or secrets.token_urlsafe(9)
                user = User(username=username, password_hash=password_hasher.hash(created_password))
                db.add(user)
                db.flush()
            elif password:
                user.password_hash = password_hasher.hash(password)
            db.execute(delete(Run).where(Run.user_id == user.id))

            rng = random.Random(username)
            # 가장 최근 기록은 몇 시간 전이라 이번 주·이번 달 랭킹에도 잡힙니다.
            days_ago = sorted([rng.uniform(0.05, 0.4)] + [rng.uniform(1, HISTORY_DAYS) for _ in range(count - 1)])
            for ago in days_ago:
                started = now - timedelta(days=ago, hours=1)
                db.add(_run(rng, user.id, pace_s, km, started))
    return created_password


def remove(engine: Engine) -> int:
    with Session(engine) as db, db.begin():
        ids = list(db.scalars(select(User.id).where(User.username.in_(DEMO_USERNAMES))))
        if ids:
            db.execute(delete(Run).where(Run.user_id.in_(ids)))
            db.execute(delete(AuthSession).where(AuthSession.user_id.in_(ids)))
            db.execute(delete(User).where(User.id.in_(ids)))
    return len(ids)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sqlite", type=Path, help="이 로컬 SQLite 파일에 넣기")
    parser.add_argument("--password", help="데모 계정 비밀번호(8자 이상). 없으면 새 계정에만 무작위로 만들어 출력")
    parser.add_argument("--remove", action="store_true", help="데모 러너와 그 기록만 지우기")
    parser.add_argument("--yes", action="store_true", help="DATABASE_URL(Neon 등)에 실제로 쓰기")
    args = parser.parse_args()
    if args.password is not None and len(args.password) < 8:
        parser.error("--password는 8자 이상")

    if args.sqlite is not None:
        engine = create_engine(f"sqlite:///{args.sqlite.resolve().as_posix()}")
    else:
        from backend.database import engine

        if engine is None:
            raise RuntimeError("DATABASE_URL 설정 필요 (또는 --sqlite 파일 경로).")
        target = engine.url.render_as_string(hide_password=True)
        if not args.yes:
            action = "삭제" if args.remove else "추가"
            print(f"대상: {target}\n데모 러너 {len(DEMO_RUNNERS)}명 {action} 예정. 실제로 쓰려면 --yes를 붙이세요.")
            return
    try:
        if args.remove:
            print(f"데모 러너 {remove(engine)}명과 그 기록을 지웠어요.")
            return
        created = seed(engine, args.password)
        print(f"데모 러너 {len(DEMO_RUNNERS)}명의 기록을 오늘 기준으로 채웠어요: {', '.join(DEMO_USERNAMES)}")
        if created and not args.password:
            print(f"새 데모 계정 비밀번호: {created}")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
