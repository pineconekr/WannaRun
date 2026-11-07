# 담당: 서솔빈
"""Owner-only record API.

POST accepts an optional UUID id: a new record returns 201, an owner retry returns
the saved record with 200 without overwriting it, and another owner's id returns
a generic 409. Missing ids remain server-generated for older clients.
Title/note default to '오늘의 러닝'/''; source defaults to gps and speed_samples to
[]. PATCH accepts only title/note and preserves omitted fields. Speed samples
contain finite, nonnegative elapsed_s/mps, ordered within duration_s.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from backend.auth import CurrentSession, Db
from backend.models import Run
from backend.schemas import RunCreate, RunPatch, RunResponse

router = APIRouter(prefix="/api/runs", tags=["러닝 기록"])


def retry_response(run: Run, user_id: str, response: Response) -> Run:
    if run.user_id != user_id:
        raise HTTPException(status_code=409, detail="사용할 수 없는 기록 ID")
    response.status_code = 200
    return run


@router.post("", response_model=RunResponse, status_code=201)
def create_run(data: RunCreate, response: Response, db: Db, session: CurrentSession):
    run_id = str(data.id) if data.id is not None else None
    if run_id is not None:
        existing = db.get(Run, run_id)
        if existing is not None:
            return retry_response(existing, session.user_id, response)
    fields = data.model_dump(exclude={"id"})
    run = Run(user_id=session.user_id, **fields)
    if run_id is not None:
        run.id = run_id
    db.add(run)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # A simultaneous retry can win between the initial read and INSERT.
        existing = db.get(Run, run_id) if run_id is not None else None
        if existing is None:
            raise
        return retry_response(existing, session.user_id, response)
    db.refresh(run)
    return run


@router.get("", response_model=list[RunResponse])
def list_runs(db: Db, session: CurrentSession):
    return db.scalars(
        select(Run)
        .where(Run.user_id == session.user_id)
        .order_by(Run.started_at.desc(), Run.id.desc())
    ).all()


@router.get("/{run_id}", response_model=RunResponse)
def get_run(run_id: UUID, db: Db, session: CurrentSession):
    run = db.get(Run, str(run_id))
    if run is None or run.user_id != session.user_id:
        raise HTTPException(status_code=404, detail="기록 없음")
    return run


@router.patch("/{run_id}", response_model=RunResponse)
def patch_run(run_id: UUID, data: RunPatch, db: Db, session: CurrentSession):
    run = get_run(run_id, db, session)
    for name, value in data.model_dump(exclude_unset=True).items():
        setattr(run, name, value)
    db.commit()
    db.refresh(run)
    return run
