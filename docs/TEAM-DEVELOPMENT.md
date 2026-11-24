# 팀원 공동 개발

## 권장: 컴퓨터에 Node.js 설치 없이 Codex 클라우드 사용

팀원은 본인 계정으로 Codex 클라우드에서 이 저장소를 가져와 개발합니다. Node.js는 클라우드 작업 환경에 준비하므로 개인 컴퓨터에 Git이나 Node.js를 설치할 필요가 없습니다. 실행 환경의 Node.js 요구사항 자체가 없어지는 것은 아닙니다.

- 저장소: https://github.com/taeu1250-bit/move-online-
- [팀원에게 보낼 메시지와 시작 프롬프트](TEAM-START-PROMPT.md)
- 현재 런타임 기준: `.nvmrc`, `.node-version`의 Node.js 26.13.0 및 `package.json`의 engines.
- GitHub 협력자 권한, Codex 클라우드 이용 권한, Sites·Firebase·D1 접근 권한은 각각 별개입니다.

### 처음 연결하는 순서

1. 본인 GitHub 계정으로 협력자 초대를 수락합니다.
2. 본인 계정으로 Codex에 로그인하고 **Work in → Cloud**를 선택합니다.
3. GitHub를 연결하고 `taeu1250-bit/move-online-` 저장소를 선택합니다. 저장소가 보이지 않으면 연결에 허용된 저장소 범위와 협력자 계정을 확인합니다.
4. 기본 클라우드 환경을 사용할 수 있으면 선택하고, [시작 프롬프트](TEAM-START-PROMPT.md)를 붙여 넣습니다.
5. 반복해서 쓸 환경을 만들려면 **Select environment → Create environment**에서 저장소를 선택하고 **Get started**를 진행합니다. Codex에 프로젝트가 지정한 Node.js와 의존성을 준비하고 검증하도록 요청합니다. 결과를 확인한 뒤 환경을 저장·게시하고 새 작업에서 선택합니다. 여기서 환경의 **Publish**는 준비된 개발 환경을 저장하는 절차이며 moov. 웹사이트 배포와는 다릅니다.

메뉴와 이용 가능 여부는 본인 계정 및 워크스페이스 설정에서 확인합니다. Cloud가 보이지 않거나 접근이 제한된 경우에는 이용 가능한 환경부터 확인합니다. 프롬프트로 이용 권한을 우회하거나 자동 생성할 수는 없습니다.

Codex는 준비된 환경에서 다음 명령을 실행합니다.

```sh
npm ci
npm run verify
npm run dev:demo
```

`npm ci`는 저장소에 고정된 의존성을 설치하고, `npm run verify`는 TypeScript 검사·빌드·자동 테스트를 실행합니다. 런타임 설치 또는 네트워크 제한 때문에 실행하지 못했다면 해당 실패를 구분해 보고합니다. 설치를 맞추려고 기능 코드나 lockfile을 임의로 바꾸지 않습니다.

공식 안내: [Codex 클라우드 환경](https://learn.chatgpt.com/docs/environments/cloud-environments).

### 클라우드 미리보기와 테스트 데이터

`npm run dev:demo`는 실제 회원가입 없이 검증용 계정을 전환하며 화면·팀·모집·신청을 시험하는 앱입니다. 실제 온라인 D1과 Firebase 회원을 사용하지 않습니다. 각 개발 환경의 임시 DB를 사용하며 서버를 종료하면 초기화됩니다.

스크립트 주소 `http://127.0.0.1:5188/.sites-runtime/qa/index.html`은 **실행 중인 클라우드 내부 주소**입니다. 팀원 컴퓨터의 브라우저에서 그 주소를 입력하는 것만으로 접속되지는 않습니다. 환경에서 지원하는 인증된 비공개 미리보기나 브라우저로 확인합니다. 미리보기를 제공하지 못하면 Codex는 실행·테스트 결과와 화면 확인의 제한을 구분해 보고해야 합니다.

검증 앱에는 테스트 계정 전환 기능이 있으므로 공개 포트·공개 터널·공개 배포로 노출하지 않습니다. 비공개 미리보기에 별도 설정이 필요하면 먼저 확인합니다. 이번 문서 변경은 팀원 계정의 클라우드 환경 생성이나 실행 검증을 완료했다는 뜻이 아닙니다.

## 기존 작업 폴더를 버전 9로 업데이트

현재 브랜치와 미커밋 변경을 먼저 확인하고 본인 작업을 보존합니다. 깨끗한 main에서 `git pull --ff-only`로 최신 코드를 받은 뒤 `npm ci`와 `npm run verify`를 실행합니다. 작업 브랜치에서는 최신 main을 병합하거나 팀 규칙에 맞게 반영합니다. 충돌 시 본인 작업을 덮어쓰지 않습니다. [현재 기능과 변경 사항](V9-UPDATE.md)을 먼저 확인하세요.

## 공동 작업 순서

1. 맡을 기능을 정합니다. 같은 파일을 수정할 가능성이 있으면 작업 범위를 먼저 공유합니다.
2. 작업 폴더의 브랜치·커밋·미커밋 변경을 확인합니다. 기존 변경은 커밋하거나 별도 작업 공간에 보존한 뒤 최신 `main`에서 작업별 브랜치를 만듭니다.
3. 기존 기능과 디자인을 유지하며 수정합니다.
4. `npm run verify` 및 변경 기능에 필요한 검증을 실행하고, 올릴 파일에 생성물·개인정보·비밀값이 없는지 확인합니다.
5. 작업 브랜치에 커밋·push한 뒤 `main` 대상 **Pull Request(PR: 변경을 합쳐 달라는 요청)**를 만듭니다.
6. 태우 또는 팀에서 정한 검토자가 확인한 뒤 병합합니다. 다른 팀원은 다음 작업 전에 병합된 최신 코드를 받습니다.

다음 명령은 기존 변경을 보존한 작업 공간에서 사용하는 예시이며 Codex에 대신 실행하도록 요청할 수 있습니다. `feature/my-change`는 작업마다 다른 이름으로 바꿉니다.

```sh
git switch main
git pull --ff-only
git switch -c feature/my-change
# 기능 수정 및 검증
npm run verify
# 변경 파일을 검토한 다음 필요한 파일만 stage
git add <변경한-파일-경로>
git commit -m "변경 내용을 구체적으로 작성"
git push -u origin feature/my-change
```

`main` 직접 수정·강제 push·자동 병합을 기본 작업 방식으로 사용하지 않습니다. 이는 팀의 작업 규칙이며 저장소 보호 규칙을 새로 설정한 것은 아닙니다. 충돌이 나면 다른 팀원의 변경을 삭제하거나 강제 덮어쓰지 말고 양쪽 의도를 확인합니다. 변경이 없는 초기 실행 확인만으로 빈 PR을 만들 필요는 없습니다.

화면은 `src/screens`, 정책과 타입은 `src/domain`, API와 권한은 `server`, DB 정의는 `db`에 있습니다. 앱 디자인과 서버 정책을 바꿀 때 관련 경로를 함께 확인합니다. Codex 대화·테스트 데이터는 GitHub를 통해 자동 공유되지 않으므로 합의한 변경은 문서와 PR에 남깁니다.

## 대안: GitHub Codespaces

Codex 클라우드를 사용할 수 없다면 GitHub Codespaces에서 브라우저 기반 개발 환경을 만들 수 있습니다. 개인 컴퓨터에 Node.js를 설치하지 않아도 되지만, Codespace 안에는 프로젝트 런타임과 의존성을 준비해야 합니다. Codespaces 생성만으로 Codex가 연결되는 것은 아니며 해당 환경에서 사용할 Codex 도구와 계정 연결을 별도로 확인해야 합니다.

이 저장소에는 Codespaces 전용 자동 설정을 추가하지 않았습니다. 개인 계정의 무료 사용량은 한도가 있으므로 계정의 사용량·비용 설정을 확인하고 유료 전환을 임의로 진행하지 않습니다. [GitHub 공식 안내](https://docs.github.com/en/codespaces/about-codespaces/what-are-codespaces).

## 선택: 자기 컴퓨터에서 실행

로컬 실행을 선택하는 팀원만 Git과 Node.js 26.13.0을 설치한 뒤 저장소를 복제합니다.

```sh
git clone https://github.com/taeu1250-bit/move-online-.git
cd move-online-
npm ci
npm run dev:demo
```

로컬에서는 `http://127.0.0.1:5188/.sites-runtime/qa/index.html`을 자기 컴퓨터의 브라우저에서 열 수 있습니다. 검증 계정과 임시 DB의 동작은 위 설명과 같으며 종료는 Ctrl+C입니다.

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
