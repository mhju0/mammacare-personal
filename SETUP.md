# SETUP — MammaCare (personal)

로컬에서 돌리는 법. Azure 없이 완결된다(AI/이미지 클라우드 의존 없음).

## 사전 준비
- Python 3.11
- Node + pnpm (`corepack enable` 또는 `npm i -g pnpm`)
- PostgreSQL 16 (Homebrew: `brew install postgresql@16 && brew services start postgresql@16`)
- (iOS 시뮬레이터용) Xcode + CocoaPods

## 1. 클론 & 비밀파일
```bash
git clone <your-repo-url> mammacare-ios
cd mammacare-ios
```
`.env`는 git에 없다(정상). 보관해 둔 `backend/.env`, `frontend/.env`를 복사해 넣는다.
`git status`에 `.env`가 안 보여야 한다.

## 2. 로컬 DB 생성 + 데이터 복원
처음 한 번만:
```bash
psql -d postgres
```
```sql
CREATE DATABASE mammacare_db;
CREATE USER mammacare WITH PASSWORD '로컬비번';
GRANT ALL PRIVILEGES ON DATABASE mammacare_db TO mammacare;
\q
```
```bash
psql -d mammacare_db -c "GRANT ALL ON SCHEMA public TO mammacare;"
```
백업 덤프 복원(레시피 367 / 재료 145):
```bash
pg_restore -h localhost -p 5432 -U mammacare -d mammacare_db --no-owner --clean --if-exists mammacare_backup.dump
psql -h localhost -p 5432 -U mammacare -d mammacare_db -c "SELECT count(*) FROM recipe;"
```
> `mammacare_backup.dump`는 유일한 데이터 사본이다. 외장/클라우드에 한 부 더 보관.

## 3. `.env` DB 연결
`backend/.env`의 `DATABASE_URL`을 로컬로:
```
DATABASE_URL=postgresql+asyncpg://mammacare:로컬비번@localhost:5432/mammacare_db
```
드라이버 `postgresql+asyncpg://` 유지(async 필수), 주소만 로컬.

## 4. 백엔드
```bash
python3.11 -m venv venv      # 처음 한 번 (프로젝트 루트)
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cd backend && python -c "import app.main"      # 검증
uvicorn app.main:app --reload                  # http://localhost:8000/docs
```

## 5. 프론트엔드
```bash
cd frontend
pnpm install
pnpm dev        # http://localhost:5173
```

## 6. iOS 시뮬레이터 빌드
Android는 사용하지 않는다(`android/` 폴더 제거됨).
```bash
cd frontend
pnpm build
npx cap add ios          # 처음 한 번 (ios/ 폴더 생성)
npx cap sync ios         # 웹 빌드 → 네이티브 동기화
npx cap open ios         # Xcode 열림
```
Xcode에서 시뮬레이터(예: iPhone 15) 선택 → Run.
- CocoaPods 필요 시: `sudo gem install cocoapods` 또는 `brew install cocoapods`
- Bundle ID 기본: `com.mammacare.app`
- 시뮬레이터에서는 푸시(FCM)가 제한적 → 푸시는 웹에서 시연.
- 코드 바꾼 뒤에는 `pnpm build && npx cap sync ios` 다시.

## 로컬에서 되는 것 / 아닌 것
- **됨**: 이메일 가입/로그인, 아기, 일정, 레시피·재료, 알레르기, 커뮤니티, 이미지(로컬 저장).
- **키 있을 때만**: FCM 푸시(Firebase). 로컬 테스트는 이메일 로그인.
