# WannaRun

혼잡도 기반 코스 추천과 게임 요소를 결합한 러닝 앱.

## 주요 기능

- 아이디 회원가입·로그인, 로그인 없이 둘러보기
- 지도에서 현재 위치와 이동 경로 표시
- 러닝 시간·거리·평균 페이스 측정
- 지도에서 러닝 경로 직접 지정
- 땅따먹기: 지나간 구역 점령

개발 예정: 혼잡도 기반 코스 추천, 러닝 기록 저장, 리더보드, 펫 육성

## 구조

| 폴더 | 내용 |
| --- | --- |
| `frontend` | React + Vite |
| `backend` | FastAPI + PostgreSQL(Neon) |

## 로컬 실행

처음 한 번:

```powershell
uv sync
cd frontend
npm.cmd ci
```

터미널 두 개에서 각각 실행:

```powershell
cd frontend
npm.cmd run dev:api
```

```powershell
cd frontend
npm.cmd run dev
```

http://localhost:5173 접속.
로컬 계정은 `backend/auth-test.sqlite3`에 저장되며 배포 DB와 별개입니다.

## API

API 문서·테스트: https://wannarun-drab.vercel.app/docs
