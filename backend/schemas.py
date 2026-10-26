# 담당: 서솔빈
# 계정·온보딩·러닝 기록 요청·응답

import re
from datetime import datetime, timezone

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


# 좌표는 [위도, 경도]
Point = tuple[float, float]


class RunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    started_at: datetime
    ended_at: datetime
    distance_m: float = Field(ge=0)
    duration_s: int = Field(ge=0)
    path: list[Point] = Field(max_length=20000)

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
        return self


class RunResponse(RunCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
