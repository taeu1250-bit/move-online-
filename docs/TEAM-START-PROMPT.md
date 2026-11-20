# 팀원에게 보낼 안내와 Codex 시작 프롬프트

## 보내기 전

팀원은 본인 GitHub 계정의 협력자 초대를 수락하고, Codex에서 GitHub를 연결한 뒤 클라우드 작업 환경을 선택합니다. 프롬프트만으로 계정 연결이나 권한 부여가 완료되지는 않습니다. Cloud 메뉴가 없으면 [공동 개발 안내](TEAM-DEVELOPMENT.md)의 대안을 확인하세요.

## 팀원에게 보낼 메시지

```text
moov. 전체 소스코드를 GitHub에 올려뒀어!
https://github.com/taeu1250-bit/move-online-

팀원들은 각자 Codex에서 GitHub 계정을 연결하고, 작업 환경을 Cloud로 선택한 뒤 이 저장소를 가져오면 돼.
Node.js는 클라우드에 준비하면 되니까 각자 컴퓨터에 설치할 필요는 없어.
Cloud 이용 가능 여부는 본인 계정에서 확인해 줘.

아래 공동 개발 안내를 읽고 시작 프롬프트를 Codex에 붙여 넣어 줘.
공동 개발 안내: https://github.com/taeu1250-bit/move-online-/blob/main/docs/TEAM-DEVELOPMENT.md
시작 프롬프트: https://github.com/taeu1250-bit/move-online-/blob/main/docs/TEAM-START-PROMPT.md

처음에는 실행과 테스트까지만 확인하고, 맡은 기능은 각자 브랜치에서 수정해 줘.
완료하면 Pull Request를 올려서 함께 확인한 뒤 합치자.
GitHub 수정만으로 기존 온라인 사이트가 자동 변경되지는 않아.
```

## 처음 연결할 때 Codex에 붙여 넣기

```text
moov. 공동 개발을 시작해 줘.
저장소: https://github.com/taeu1250-bit/move-online-.git

내 컴퓨터에는 Node.js를 설치하지 않고 Codex 클라우드에서 작업하고 싶어.
현재 작업 환경이 클라우드인지 먼저 확인하고, 로컬 환경이면 파일이나 프로그램을 설치하지 말고 클라우드로 전환하는 방법을 안내해 줘.
GitHub 연결이나 저장소 권한이 부족하면 필요한 연결 절차를 알려 줘. 연결이 완료됐다고 가정하지 마.

1. 연결된 저장소와 Git 상태를 확인해 줘. 저장소가 없다면 클라우드 작업 공간에 복제해 줘.
2. README.md, docs/TEAM-DEVELOPMENT.md, V2-IMPLEMENTATION.md를 읽고 기존 구조와 구현 범위를 파악해 줘.
3. .nvmrc와 package.json에 지정된 Node.js를 클라우드에 준비하고 npm ci, npm run verify를 실행해 줘.
4. npm run dev:demo로 앱을 실행해 줘. 가능한 경우 인증된 비공개 미리보기로 화면을 확인해 줘.
   127.0.0.1은 클라우드 내부 주소이므로 내 컴퓨터에서 바로 열 수 있다고 안내하지 마.
   테스트 계정 전환 기능이 있는 검증 앱을 공개 인터넷에 노출하지 마.
5. 지금은 코드 분석과 개발 환경 준비까지만 진행하고, 기능 변경은 내 다음 요청을 기다려 줘.

이후 작업 원칙:
- 기존 디자인과 기능을 유지하고 앱을 처음부터 다시 만들지 마.
- 작업 전 기존 변경을 보존하고 최신 main을 확인한 뒤 작업별 feature 브랜치를 사용해 줘.
- 완료한 변경은 npm run verify로 검증하고, 변경 파일을 확인한 뒤 해당 브랜치에 커밋·push하고 main 대상 Pull Request를 만들어 줘.
- main 직접 변경, 자동 병합, Sites 배포는 하지 마.
- 실제 D1 회원·경기 데이터와 Firebase 인증 데이터는 변경하지 마. 검증용 데이터만 사용해 줘.
- 실제 비밀키, 개인정보, DB 백업은 GitHub에 올리지 마.
- 검증한 항목과 실행하지 못한 항목을 구분해서 알려 줘.

먼저 현재 브랜치와 커밋, 환경 준비 결과, 테스트 결과, 미리보기 가능 여부를 한국어로 알려 줘.
```

## 기능을 맡긴 뒤 사용할 프롬프트

```text
moov.에서 이번에 맡은 기능: [수정할 기능과 원하는 동작을 적어 주세요]

README.md와 docs/TEAM-DEVELOPMENT.md를 기준으로 현재 코드를 확인해 줘.
기존 변경 사항을 보존하고, 최신 main을 반영한 작업별 feature 브랜치에서 개발해 줘.
다른 팀원의 변경과 충돌하면 기존 작업을 버리지 말고 양쪽 의도를 확인해 해결해 줘.
기존 디자인과 기능을 유지하고, npm run verify 및 변경 기능에 맞는 검증을 진행해 줘.
변경 파일을 확인한 뒤 커밋·push하고 main 대상 Pull Request를 만들어 줘.
PR에는 변경 이유, 결과, 검증 내용과 남은 문제를 적어 줘.
직접 병합하거나 기존 Sites 사이트·실제 데이터에 배포하지 마.
완료 후 PR 링크와 테스트 결과를 한국어로 알려 줘.
```

GitHub의 코드는 공유되지만 개인 Codex 대화나 테스트 DB가 자동으로 공유되는 것은 아닙니다. 합의한 기능과 정책은 저장소 문서 및 PR에 남겨 주세요.
