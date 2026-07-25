# 모닥불 Season 1 전용 런처

Minecraft 1.21.1 Fabric 기반 `모닥불 Season 1` 서버용 독립 런처 작업본입니다.

이 프로젝트는 공유받은 `hulonge-setup-1.0.0.exe`의 실제 사용 흐름과 한글화를 참고하고, 최신 [Helios Launcher](https://github.com/dscalzi/HeliosLauncher) MIT 소스를 기반으로 다시 구성했습니다. 휴롱 런처의 GitHub 저장소, Microsoft 애플리케이션 ID, 서버 주소는 재사용하지 않습니다.

## 목표

- Microsoft 계정 로그인
- 서버 상태와 접속 인원 표시
- Minecraft, Java, Fabric 로더 자동 준비
- 모드·설정·리소스팩 다운로드 및 무결성 검사
- `116.126.112.66:25565` 자동 접속
- 런처와 클라이언트 파일의 자동 업데이트
- 기본 한국어 UI

## 아직 연결해야 하는 값

GitHub 소유자는 `GTYoon`으로 확정했고 다음 저장소 이름을 사용합니다.

- 런처 소스·설치기: `GTYoon/modakbul-launcher`
- 클라이언트 배포 파일: `GTYoon/modakbul-client`

프로덕션 빌드 전 남은 필수 값은 Microsoft Entra 애플리케이션의 Client ID입니다.

설정 검증:

```powershell
.\tools\Test-LauncherConfig.ps1
```

현재 모드팩에서 Helios용 배포 매니페스트 생성:

```powershell
.\tools\Build-Distribution.ps1 `
  -FilesBaseUrl "https://example.com/modakbul" `
  -ServerIconUrl "https://example.com/modakbul/server-icon.png" `
  -NewsRssUrl "https://github.com/GTYoon/modakbul-launcher/releases.atom"

.\tools\Test-Distribution.ps1 `
  -DistributionPath "..\..\..\client-build\release\update-repository\distribution.template.json"
```

Windows 설치기 빌드:

```powershell
npm ci
npm run lint
npm run dist:win
```

Node.js 22가 필요합니다. Microsoft 로그인을 배포하려면 `docs/MicrosoftAuth.md`의 등록 및 승인 절차도 완료해야 합니다.

## 라이선스와 출처

Helios Launcher 원저작자 Daniel D. Scalzi의 MIT 라이선스와 저작권 고지를 `LICENSE.txt`에 유지합니다.
