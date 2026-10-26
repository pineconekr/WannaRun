# WannaRun

혼잡도 기반 코스 추천과 게임을 결합한 러닝 앱.

## 로컬 로그인·회원가입 개발

최초 한 번 저장소 루트에서 `uv sync`를 실행합니다(Python 3.13 환경 자동 준비).
두 터미널에서 각각 다음을 실행합니다.

```powershell
cd frontend
npm.cmd run dev:api
```

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

`http://127.0.0.1:5173`에서 아이디로 회원가입 → 로그인 → 프로필 확인 → 로그아웃을 확인합니다.
`vite.config.ts`가 `/api` 요청을 로컬 8000번 서버로 전달합니다.
개발 서버는 테스트 전용 `backend/auth-test.sqlite3`에 계정을 저장하며, API를 처음 시작할 때 DB와 테이블을 준비합니다. DB 파일은 Git에서 제외됩니다.
계정 테이블 구조가 바뀐 경우에만 이 파일을 삭제한 뒤 개발 서버를 다시 실행합니다.
여기서 만든 계정은 운영 DB의 계정과 별개입니다. 아이디는 영문·숫자·밑줄 4~20자, 비밀번호는 8~128자의 테스트용 값을 사용하세요.
운영 서버는 기존 `backend.main:app`과 PostgreSQL `DATABASE_URL` 설정을 사용합니다.
운영 DB 테이블은 `python -m backend.init_db`로 별도 준비해야 합니다.
개발용 `backend.dev:app`은 로컬 테스트 용도이며 배포 진입점으로 사용하지 않습니다.
