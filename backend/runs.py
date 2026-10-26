# 담당: 서솔빈
# 러닝 기록 저장·조회 API. 본인 기록만 접근.

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from backend.auth import CurrentSession, Db
from backend.models import Run
from backend.schemas import RunCreate, RunResponse

router = APIRouter(prefix="/api/runs", tags=["러닝 기록"])


@router.post("", response_model=RunResponse, status_code=201)
def create_run(data: RunCreate, db: Db, session: CurrentSession):
    run = Run(user_id=session.user_id, **data.model_dump())
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


@router.get("", response_model=list[RunResponse])
def list_runs(db: Db, session: CurrentSession):
    return db.scalars(
        select(Run)
        .where(Run.user_id == session.user_id)
        .order_by(Run.started_at.desc())
    ).all()


@router.get("/{run_id}", response_model=RunResponse)
def get_run(run_id: str, db: Db, session: CurrentSession):
    run = db.get(Run, run_id)
    if run is None or run.user_id != session.user_id:
        raise HTTPException(status_code=404, detail="기록 없음")
    return run
