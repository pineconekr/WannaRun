# 담당: 서솔빈
# 계정·온보딩·러닝 기록 요청·응답

import re
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator

USERNAME_PATTERN = re.compile(r"[a-z0-9_]{4,20}")


class AccountRequest(BaseModel):
    username: str
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        value = value.lower()
        if not USERNAME_PATTERN.fullmatch(value):
            raise ValueError("아이디는 영문·숫자·_ 4~20자")
        return value


class SignupRequest(AccountRequest):
    password: SecretStr = Field(min_length=8, max_length=128)


class LoginRequest(AccountRequest):
    pass


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


# Coordinates are [latitude, longitude]; non-finite values never reach JSON storage.
Latitude = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
Longitude = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
Point = tuple[Latitude, Longitude]
NonnegativeFloat = Annotated[float, Field(ge=0, allow_inf_nan=False)]
RunSource = Literal["gps", "demo", "legacy"]
Period = Literal["all", "week", "month"]


class SpeedSample(BaseModel):
    model_config = ConfigDict(extra="forbid")

    elapsed_s: NonnegativeFloat
    mps: NonnegativeFloat


class RunMetadata(BaseModel):
    title: str = Field(default="오늘의 러닝", min_length=1, max_length=120)
    note: str = Field(default="", max_length=2000)


class RunCreate(RunMetadata):
    model_config = ConfigDict(extra="forbid")

    id: UUID | None = None
    started_at: datetime
    ended_at: datetime
    distance_m: NonnegativeFloat
    duration_s: int = Field(ge=0)
    path: list[Point] = Field(max_length=20000)
    source: RunSource = "gps"
    speed_samples: list[SpeedSample] = Field(default_factory=list, max_length=20000)

    # UTC로 통일해 저장. 시간대 없는 값(SQLite 로컬 DB에서 읽은 값 포함)은 UTC로 간주.
    @field_validator("started_at", "ended_at")
    @classmethod
    def to_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def check_time_order(self):
        if self.ended_at < self.started_at:
            raise ValueError("종료 시각이 시작 시각보다 빠름")
        previous = -1.0
        for sample in self.speed_samples:
            if sample.elapsed_s < previous or sample.elapsed_s > self.duration_s:
                raise ValueError("속도 표본 시각은 순서대로 러닝 시간 안에 있어야 함")
            previous = sample.elapsed_s
        return self


class RunResponse(RunCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID


class RunPatch(RunMetadata):
    model_config = ConfigDict(extra="forbid")


class PersonalStats(BaseModel):
    total_distance_m: float
    total_duration_s: int
    run_count: int


class LeaderboardEntry(PersonalStats):
    rank: int
    user_id: str
    username: str


class LeaderboardResponse(BaseModel):
    period: Period
    entries: list[LeaderboardEntry]


class ActivityArea(BaseModel):
    """약 2km 격자 칸의 중심 좌표와 그 칸을 지난 GPS 러닝 수."""

    lat: float
    lng: float
    runs: int


class ActivityAreas(BaseModel):
    username: str
    areas: list[ActivityArea]
