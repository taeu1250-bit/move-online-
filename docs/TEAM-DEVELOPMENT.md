# 팀원 공동 개발

## 처음 한 번

Git과 Node.js 26.13.0을 설치한 뒤 저장소를 복제한다. `.nvmrc`와 `.node-version`도 같은 버전을 지정한다.

```sh
git clone https://github.com/taeu1250-bit/move-online-.git
cd move-online-
npm ci
npm run dev:demo
```

터미널에 표시되는 `http://127.0.0.1:5188/.sites-runtime/qa/index.html`을 연다. 실제 Firebase 계정 없이 로컬 검증 계정으로 화면·팀·모집·신청을 시험할 수 있다. 각 PC의 데이터는 별개이며 이 모드의 DB는 서버를 종료하면 초기화된다. 실제 온라인 D1과 Firebase 회원에는 영향을 주지 않는다. 종료는 Ctrl+C다.

## 작업할 때마다

```sh
git switch main
git pull --ff-only
git switch -c feature/my-change
```

화면은 `src/screens`, 정책과 타입은 `src/domain`, API와 권한은 `server`, DB 정의는 `db`에 있다. 앱 디자인과 서버 정책을 바꿀 때 관련 경로를 함께 확인한다.

수정 후:

```sh
npm run verify
git add .
git commit -m "변경 내용을 구체적으로 작성"
git push -u origin feature/my-change
```

GitHub에서 `main` 대상 Pull Request를 만들고 다른 팀원이 검토한다. 승인·배포 방식은 팀에서 정한다. 팀원의 저장소 쓰기 권한은 소유자가 GitHub의 Settings → Collaborators에서 별도로 부여해야 한다. 이 코드 업로드로 다른 사람의 권한이 자동 생성되지는 않는다.

## 인증 흐름까지 로컬 시험

첫 번째 터미널:

```sh
npx --yes firebase-tools@15.35.0 emulators:start --only auth --project demo-moov-dev --config firebase.local.json
```

두 번째 터미널:

```sh
npm run dev:emulator
```

`http://127.0.0.1:8788`에서 가상 `@yonsei.ac.kr` 이메일로 가입하고 에뮬레이터 터미널의 인증 링크를 이용한다. 데이터는 `.sites-runtime/local-d1`에 로컬로 보관된다. 두 브라우저 프로필로 서로 다른 사용자 흐름을 시험한다. 실제 인증 메일은 발송하지 않는다.

실제 개발용 Firebase 프로젝트로 시험해야 할 때만 `.dev.vars.example`을 `.dev.vars`로 복사하고 승인받은 웹 구성값을 설정한다. `npm run db:local`, `npm run dev`로 로컬 Worker와 로컬 D1을 사용한다. Firebase의 localhost 승인 도메인도 확인한다. 운영자 UID와 서버 작업키는 공유 문서나 소스에 붙여 넣지 않는다.

## DB·정책 변경

- 이미 적용된 `drizzle` SQL·스냅샷·journal 항목은 수정하지 않고 새 마이그레이션을 추가한다.
- `npm run db:generate`로 생성한 SQL을 검토하고 로컬에서 테스트한다.
- 정원·승인·취소·위임·신고 권한은 서버에서 검증한다. UI 조건만 바꾸지 않는다.
- v2 상태 엔진은 신규 경기부터 적용한다. 이전 이름 입력 명단을 실제 계정에 임의 연결하지 않는다.
- 테스트 데이터·개인정보·DB 덤프·비밀키는 커밋하지 않는다.

## 배포 관계

GitHub는 공동 소스 저장소다. push/merge만으로 기존 Sites 앱이 변경되도록 연결하지 않았다. `.openai/hosting.json`은 원본 Sites 출처 설정이며, 실제 배포는 기존 프로젝트를 대상으로 별도 검증과 권한을 거쳐 진행한다. `wrangler.jsonc`는 로컬용 D1 설정이다. 그대로 운영 배포하지 않는다.

분 단위 예약 준비 코드는 `tools/lifecycle-scheduler`에 있고 아직 배포·활성화하지 않았다. 기존 서버 코드에 예약 핸들러가 있어도 예약 서비스가 연결되지 않으면 무접속 정시 처리를 보장하지 않는다.
