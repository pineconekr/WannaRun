# 담당: 서솔빈
# 내 정보 조회 · 러너 활동 지역

import math

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from backend.auth import CurrentSession, Db
from backend.models import Run, User
from backend.schemas import ActivityArea, ActivityAreas, PersonalStats, UserResponse

router = APIRouter(prefix="/api/users", tags=["사용자"])

# 활동 지역 격자 크기(도). 0.02도는 위도 약 2.2km라 동네 수준만 드러나고 경로나 정확한 위치는 드러나지 않습니다.
AREA_GRID_DEG = 0.02


def current_user(db: Db, session: CurrentSession) -> User:
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요해요. 다시 로그인해 주세요.")
    return user


@router.get("/me", response_model=UserResponse)
def get_me(db: Db, session: CurrentSession):
    return current_user(db, session)


@router.get("/me/stats", response_model=PersonalStats)
def get_my_stats(db: Db, session: CurrentSession):
    totals = db.execute(
        select(
            func.coalesce(func.sum(Run.distance_m), 0).label("total_distance_m"),
            func.coalesce(func.sum(Run.duration_s), 0).label("total_duration_s"),
            func.count(Run.id).label("run_count"),
        ).where(
            Run.user_id == session.user_id,
            Run.source == "gps",
            Run.distance_m > 0,
            Run.duration_s > 0,
        )
    ).mappings().one()
    return totals


def area_center(value: float) -> float:
    return round((math.floor(value / AREA_GRID_DEG) + 0.5) * AREA_GRID_DEG, 4)


@router.get("/{user_id}/areas", response_model=ActivityAreas)
def get_activity_areas(user_id: str, db: Db, session: CurrentSession):
    """랭킹에 집계되는 GPS 러닝이 지나간 지역을 약 2km 격자로 뭉뚱그려 돌려줍니다. 경로는 공개하지 않습니다."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="러너를 찾을 수 없어요.")
    paths = db.scalars(
        select(Run.path).where(
            Run.user_id == user_id,
            Run.source == "gps",
            Run.distance_m > 0,
            Run.duration_s > 0,
        )
    )
    runs_per_cell: dict[tuple[float, float], int] = {}
    for path in paths:
        cells = {(area_center(point[0]), area_center(point[1])) for point in path or []}
        for cell in cells:
            runs_per_cell[cell] = runs_per_cell.get(cell, 0) + 1
    return ActivityAreas(
        username=user.username,
        areas=[ActivityArea(lat=lat, lng=lng, runs=runs) for (lat, lng), runs in sorted(runs_per_cell.items())],
    )
