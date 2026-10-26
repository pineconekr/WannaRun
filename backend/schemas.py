# 담당: 서솔빈
# 계정·온보딩 요청·응답

import re

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

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
    onboarding_completed: bool


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    onboarding_completed: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
