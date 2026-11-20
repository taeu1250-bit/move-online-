# 뭅 · moov.

**2차 피드백 변경사항과 검증 범위는 [V2-IMPLEMENTATION.md](./V2-IMPLEMENTATION.md)를 우선 확인한다.** 새 경기의 참가자는 가입 회원으로 제한하며 아래 초기 버전의 이름 입력 명단 설명은 과거 기록에만 해당한다.

**MOVE TOGETHER**  
연세대학교 미래캠퍼스 스포츠 매칭 앱의 온라인 개발 버전이다. React, TypeScript와 Vite 화면을 유지하고 서버는 Cloudflare Worker, 데이터는 Sites가 연결하는 D1, 학교 이메일 인증은 Firebase Authentication을 사용한다.

## 기준 버전과 데이터

공개 시연 앱의 Sites 버전 2, 소스 커밋 `23b47277909cd75dab4febade941d0219b4f1e8c`에서 분기했다. 기존 `src/data/local.ts`는 `moov.campus.demo.v1`에 전체 데이터를 직렬화했다. `currentId`를 바꾸면 시연 역할이 바뀌었고 `applyCommand`가 같은 브라우저 안에서 신청과 승인을 처리했다. 원본은 별도 백업에 보존했다. 온라인 앱의 `src/main.tsx`는 `OnlineRoot`만 실행한다. 개발용 계정 전환이 필요한 경우 별도 시연 앱을 사용한다. 가상 데이터는 온라인 DB로 이관하지 않는다.

| 저장 위치 | 내용과 접근 범위 |
|---|---|
| Firebase Authentication | 학교 이메일 소유 확인, 고유 UID, 로그인 세션, 비밀번호 재설정. 비밀번호는 Firebase SDK가 인증 제공자에게 전달한다. |
| D1 `profiles` | UID, 사용자가 입력한 이름·입학연도·학과·운동 수준. 본인 프로필만 수정한다. |
| D1 `matches` | 경기 정보, 모집자, 기존 참가자 명단, 취소 시각. 기존 명단은 모집자에게 제공한다. |
| D1 `entries` | 개인·그룹 신청과 친선경기 팀 신청, 확정 명단·재승인 대기 명단, 한마디와 처리 상태. 모집자와 해당 신청자에게 제공한다. |
| D1 `notices` | 사용자별 신청·승인·거절·취소 알림과 읽음 상태. 내 활동은 저장된 모집글과 신청 이력으로 구성한다. |
| 기기 | 인증 SDK의 로그인 유지 정보와 PWA 정적 파일 캐시. 경기 API 응답은 `no-store`로 반환한다. |

Worker는 고정된 Google 공개키와 `jose`로 Firebase ID 토큰의 RS256 서명, 발급자, 대상 프로젝트, 유효기간과 UID를 검증한다. 같은 토큰으로 Firebase 계정 상태를 조회하고 이메일, 소유 확인 여부, 비활성화 및 세션 유효 시각을 대조한다. 에뮬레이터용 토큰 판독기는 로컬 전용 빌드에만 포함한다. 모집자·신청자 권한은 DB에 저장된 소유자로 판정한다. 이름과 입학연도는 자기기입 정보다. 신청 중복을 막는 유일 인덱스, 남은 자리 조건이 있는 갱신, 상대팀을 한 팀으로 제한하는 유일 인덱스를 사용한다. 변경과 알림은 D1 `batch` 트랜잭션으로 처리한다. 정원과 모집 상태는 승인된 신청에서 계산한다. 앱으로 돌아오거나 사용자가 변경을 저장할 때 다시 조회하고 열린 화면은 20초마다 갱신한다.

## 개발 PC에서 실행

Node.js 26.13.0에서 확인했다. 저장소 루트에서 다음을 실행한다.

```sh
npm ci
npm run build
npm test
```

실제 Firebase 계정 없이 시험하려면 첫 번째 터미널에서 공식 인증 에뮬레이터를 시작하고 두 번째 터미널에서 로컬 뭅을 실행한다. 두 서비스 모두 이 PC의 루프백 주소에서만 열린다.

```sh
npx --yes firebase-tools@15.35.0 emulators:start --only auth --project demo-moov-dev --config firebase.local.json
```

```sh
npm run dev:emulator
```

[로컬 뭅 열기](http://127.0.0.1:8788). 가상 학교 이메일로 가입하고 첫 번째 터미널에 표시된 메일 확인 링크를 연 뒤 앱에서 **인증 완료 확인**을 누른다. 별도 브라우저 프로필이나 시크릿 창에서 두 번째 계정을 사용한다. 한 계정이 모집한 날짜를 선택하면 다른 계정에서도 신청할 수 있다. 이 로컬 D1은 `.sites-runtime/local-d1`에 저장된다. 에뮬레이터의 메일과 계정은 테스트용이다.

인증 에뮬레이터를 이용한 통합 테스트는 `npm run build:emulator` 후 PowerShell에서 `$env:MOOV_TEST_AUTH_EMULATOR='1'`을 설정하고 `node --test tests/online.test.mjs`를 실행한다. 테스트는 독립적인 임시 D1과 시험 계정을 사용한다. 실제 Firebase 설정으로 로컬 Worker를 시험할 때는 `.dev.vars`를 사용하고 `npm run db:local`, `npm run dev` 순으로 실행한다.

## 개발 Site의 실제 학교 메일 연결

1. 연결한 개발 프로젝트는 `moov-dev-e74a2`, 웹앱은 `1:928879882472:web:07ebc07650a1ccf869d95d`다. 이메일/비밀번호 공급자와 `moov-mirae-online-dev.jj04020985.chatgpt.site`의 승인 상태는 Authentication 설정에서 확인한다. [개발 프로젝트](https://console.firebase.google.com/project/moov-dev-e74a2/authentication/providers)
2. 비공개 Sites 환경의 Firebase 웹 구성은 `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_MEASUREMENT_ID`에 설정했다. 서비스 계정 개인 키는 사용하지 않는다.
3. 회원은 마이페이지에서 팀을 등록하고 활동할 팀을 선택한다. 기존 `MOOV_TEAM_LEADERS` 지정 계정은 최초 사용 시 이전 팀을 가져온다. 일반 신고 및 노쇼 이의제기를 검토할 운영자의 Firebase UID만 `MOOV_ADMIN_UIDS`에 JSON 문자열 배열로 등록한다. 설정이 비어 있으면 일반 회원에게 관리 권한이 주어지지 않는다.
4. 본인 소유 학교 이메일로 가입·실제 인증 링크 수신·재로그인·비밀번호 재설정을 확인한다. 별도 휴대폰 두 대에서 모집자와 신청자로 참가 확정까지 검증한다. Sites 공개 범위와 앱 내 학교 이메일 인증은 각각 관리한다. 테스트 계정의 Firebase 권한과 Sites 열람 권한은 별도로 관리한다.

앱과 Worker는 `@yonsei.ac.kr`의 확인된 주소만 허용한다. Firebase 프로젝트 자체에서 다른 도메인의 계정 생성을 전면 차단하려면 Identity Platform의 `beforeCreate` 차단 함수 설정도 필요하다. [Firebase 인증 안내](https://firebase.google.com/docs/auth/web/manage-users) · [가입 전 차단 함수](https://cloud.google.com/identity-platform/docs/blocking-functions)

## 명단 변경과 권한

모집자와 개설할 때 등록한 참가자를 기본 인원으로 잡는다. D1은 확정된 신청의 실제 명단 길이를 합산한다. 승인 후 인원이 빠지면 즉시 반영하며, 추가·교체 신청은 이전 명단을 보존하고 모집자의 재승인을 기다린다. 각 변경은 명단 버전을 확인한다. 정원이 차면 모집을 닫고 시작 전 취소로 자리가 나면 다시 연다. 친선경기에는 자격이 등록된 대표만 신청하며 한 팀만 확정할 수 있다.

## 다음 단계

개발 순서는 시연 소스 백업, D1·서버 권한 구현, 인증 에뮬레이터 및 두 사용자 검증, 비공개 개발 Site에서 실메일·실기기 시험, 출시 승인이다. 별도 개발 Site만 이 소스의 `.openai/hosting.json`과 연결한다. Sites는 배포 시 D1에 `drizzle` 마이그레이션을 적용한다. 마이그레이션은 추가 방식으로 관리한다. [OpenAI 공식 Sites 문서](https://learn.chatgpt.com/docs/sites/data-and-connections) · [D1 트랜잭션](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

학생 대상 공개 전에는 참가 명단에 다른 팀원의 이름을 입력하는 데 대한 안내·보관 기한·삭제 절차, 팀 대표 확인 담당자, Firebase 발송 한도와 비밀번호 정책을 확정한다. 학생 수 규모로 목록 조회 부하와 알림 누적량을 시험한다. 운영용 Firebase 프로젝트와 D1을 개발용에서 분리하고 출시 승인 후 연결한다.

## 1차 피드백 반영

2026-11-16 피드백은 온라인 개발 Site에 적용한다. 배포는 기존 Sites 소스 저장소를 통해 진행한다. 공개 시연 앱과 별도 GitHub 백업 저장소의 소스는 별도로 관리한다.

- 모집 시 직접 선택한 성별·레벨·종목별 정보와 종료 시각을 상세 화면에만 표시한다. 종료 시각이 없는 이전 경기의 모집자는 시작 후 실제 종료를 기록할 수 있다.
- 팀은 한 계정으로 여러 개 운영할 수 있다. 직접 입력한 이름은 비회원으로 취급한다. 회원의 초대 코드를 통해 초대하고, 해당 회원이 수락한 뒤 대표자가 명시적으로 선택한 계정만 경기 명단과 연결한다.
- 최초 참가 전에 현재 버전의 이용 안내를 확인한다. 명단 증원·교체는 승인 대상이고, 회원 연결만 변경해도 교체로 취급한다. 모집자의 승인은 승인 시점 정원, 타 신청과의 회원 중복, 경기 시작 여부를 함께 검증한다.
- 매너온도는 36.5°C로 시작한다. 점수와 기간은 `src/domain/conduct.ts`에서 관리한다. 48시간 동안 이의제기할 수 있고, 이의제기한 건은 운영자 검토를 기다린다. 확정 점수와 90일 제재를 서버에서 계산한다. 일반 신고는 운영자에게만 보인다.
- 이번 공개 개발 버전의 휴대폰 푸시 설정·발송은 꺼져 있다. 마이페이지에는 표시하지 않는다. 내부 구현은 표준 Web Push와 VAPID를 사용한다. 구독 권한을 직접 허용한 기기에만 암호화해 발송한다. 서버용 개인 키는 Sites 시크릿 `WEB_PUSH_PRIVATE_KEY`, 공개 키는 `WEB_PUSH_PUBLIC_KEY`다. Firebase는 학교 인증을 계속 담당한다. FCM HTTP v1 서비스 계정과 Firebase 유료 함수는 사용하지 않는다.
- 예약 실행은 경기 시각과 승인 명단에서 24시간·3시간 알림을 계산한다. 변경 또는 취소된 일정을 다시 검증하며, 기기·경기·시작 시각·알림당 한 번의 전송을 기록한다. 네트워크 응답이 불명확하면 중복 전송을 피하고 운영자가 상태를 확인할 수 있도록 기록한다. 기기 로그아웃 시 구독을 해제한다. 회원 탈퇴를 처리할 때 D1 프로필과 연계한 기기 구독도 삭제해야 한다.
- 푸시 실기기 검증은 아이폰(iOS 16.4 이상 홈 화면 웹앱)과 안드로이드의 권한 허용·거절/로그아웃을 각각 확인한다. 게스트 이름, 개인별 출석과 이의제기·일반 신고의 보관 기한 및 삭제 담당자를 실제 출시 전 확정한다.

### 휴대폰 푸시를 다시 도입할 경우

현재 자동 실행은 등록되어 있지 않다. 사용자 결정에 따라 앱 내부 알림을 사용한다. 정시 발송용 인프라 및 실기기 수신을 확인한 뒤에만 서버 환경의 `MOOV_REMINDERS_ENABLED=1`로 명시적으로 활성화한다.


예약 실행 환경은 연결된 개발 Site의 `get_site`에서 서비스 자격을 받아 `scripts/run-reminders.mjs`의 숨겨진 표준입력으로 전달한다. 이 스크립트는 해당 개발 Site에만 POST하고 집계만 출력한다. 실행 시 프로젝트, 코드 및 접근 범위가 일치하는지 확인하고 별도 배포나 실제 학생 데이터 수정을 하지 않는다. 설정을 처음 연결하거나 Sites 서비스 자격이 회전하면 작업 전용 HMAC 값을 같은 스크립트의 `jobCredential` 방식으로 계산해 Sites 시크릿 `MOOV_JOB_KEY`를 갱신한다. `MOOV_JOB_ORIGIN`은 개발 Site의 HTTPS origin이다.
