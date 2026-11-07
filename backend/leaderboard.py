"""Public totals only; periods follow the Korean calendar (KST) on run start, end-exclusive."""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from backend.auth import CurrentSession, Db
from backend.models import Run, User
from backend.schemas import LeaderboardResponse, Period

router = APIRouter(prefix="/api/leaderboard", tags=["랭킹"])


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# Korea has no daylight saving time, so a fixed +09:00 offset equals Asia/Seoul.
KST = timezone(timedelta(hours=9), "Asia/Seoul")


def period_bounds(period: Period, now: datetime) -> tuple[datetime, datetime] | None:
    """Week starts Monday 00:00 KST, month on the 1st 00:00 KST; returned in UTC."""
    bounds = _kst_bounds(period, now.astimezone(KST))
    if bounds is None:
        return None
    return bounds[0].astimezone(timezone.utc), bounds[1].astimezone(timezone.utc)


def _kst_bounds(period: Period, now: datetime) -> tuple[datetime, datetime] | None:
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        start = midnight - timedelta(days=now.weekday())
        return start, start + timedelta(days=7)
    if period == "month":
        start = midnight.replace(day=1)
        end = (
            start.replace(year=start.year + 1, month=1)
            if start.month == 12
            else start.replace(month=start.month + 1)
        )
        return start, end
    return None


@router.get("", response_model=LeaderboardResponse)
def get_leaderboard(
    db: Db,
    session: CurrentSession,
    now: Annotated[datetime, Depends(utc_now)],
    period: Period = "all",
):
    totals = (
        select(
            User.id.label("user_id"),
            User.username,
            func.sum(Run.distance_m).label("total_distance_m"),
            func.sum(Run.duration_s).label("total_duration_s"),
            func.count(Run.id).label("run_count"),
        )
        .join(Run, Run.user_id == User.id)
        .where(Run.source == "gps", Run.distance_m > 0, Run.duration_s > 0)
        .group_by(User.id, User.username)
    )
    bounds = period_bounds(period, now)
    if bounds is not None:
        totals = totals.where(Run.started_at >= bounds[0], Run.started_at < bounds[1])
    totals = totals.subquery()
    # Rank only by distance; usernames order tied rows without breaking the tie.
    ranked = select(
        func.rank().over(order_by=totals.c.total_distance_m.desc()).label("rank"),
        totals,
    ).subquery()
    entries = db.execute(
        select(ranked).order_by(
            ranked.c.rank, ranked.c.username, ranked.c.user_id
        )
    ).mappings().all()
    return {"period": period, "entries": entries}
