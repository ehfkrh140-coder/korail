# KTX Chrome 수동 빈자리 확인 도우미

이 저장소는 꼬인 이전 구조를 정리하고 새로 만든 **일반 Chrome 수동 방식** 도우미입니다.

## 핵심 방향

- KORAIL은 평소 쓰는 **일반 Chrome**에서 직접 로그인합니다.
- KORAIL 조회, 새로고침, 예약 버튼 클릭은 사용자가 직접 합니다.
- 이 앱은 옆에 켜두고 다음 확인 시간을 알려주며, 복사해 온 조회 결과에서 빈자리 후보 문구를 찾아줍니다.
- Playwright, Puppeteer, Selenium, 자동 클릭, 자동 새로고침은 사용하지 않습니다.

KORAIL에서 자동화 브라우저가 `CODE : -8003` 같은 매크로 감지 오류를 만들 수 있으므로, 이 프로젝트는 자동화 브라우저를 완전히 제외했습니다.

## 고정 확인 조건

| 구분 | 날짜 | 구간 | 시간대 | 승객 | 좌석 |
| --- | --- | --- | --- | --- | --- |
| 가는 편 | 2026-05-23 | 광명 → 부산 | 09:00 ~ 13:00 | 성인 1명 | 일반실/특실 아무 좌석 |
| 오는 편 | 2026-05-25 | 부산 → 광명 | 09:00 ~ 15:00 | 성인 1명 | 일반실/특실 아무 좌석 |

## 설치 및 실행

### 1. Node.js 설치

<https://nodejs.org/> 에서 LTS 버전을 설치합니다.

설치 확인:

```bash
node -v
npm -v
```

### 2. 프로젝트 폴더로 이동

```bash
cd /workspace/korail
```

Windows에서 다른 위치에 받았다면 예를 들어 아래처럼 이동합니다.

```bash
cd C:\Users\내이름\korail
```

### 3. package.json 문법 확인

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
```

`package.json OK`가 나오면 정상입니다.

### 4. 실행

이 프로젝트는 외부 패키지가 없어서 `npm install`이 필요 없습니다.

```bash
npm run dev
```

아래 문구가 나오면 실행 중입니다.

```text
KORAIL Chrome seat helper running at http://localhost:3001
```

### 5. 화면 열기

Chrome 주소창에 입력합니다.

```text
http://localhost:3001
```

## 실제 사용 방법

1. 앱 화면의 **KORAIL 예매 페이지 열기**를 누릅니다.
2. KORAIL 탭에서 직접 로그인합니다.
3. 원하는 조건으로 직접 조회합니다.
4. 모두 매진이면 앱의 **반복 확인 시작**을 누릅니다.
5. 타이머가 끝나면 KORAIL 탭에서 직접 새로고침 또는 조회 버튼을 누릅니다.
6. 조회 결과 화면에서 `Ctrl + A` → `Ctrl + C`로 복사합니다.
7. 앱의 **조회 결과 붙여넣기** 칸에 붙여넣고 **빈자리 확인**을 누릅니다.
8. 후보가 나오면 KORAIL 탭으로 돌아가 직접 예약을 진행합니다.

## 왜 자동 새로고침/자동 예약을 넣지 않았나요?

KORAIL 사이트는 자동화 도구 또는 비정상 반복 접근을 제한할 수 있습니다. 이전에 자동화 브라우저가 로그인 단계부터 막히는 문제가 있었기 때문에, 이 새 버전은 안정적인 일반 Chrome 수동 조작을 전제로 합니다.

## 명령어

```bash
npm run dev
npm start
npm run check
```

## 오류 해결

### `npm error code EJSONPARSE`

`package.json` 문법 오류입니다. 이 새 버전의 `package.json`은 아래처럼 단순합니다.

```json
{
  "name": "korail-chrome-seat-helper",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "node src/server.js",
    "start": "node src/server.js",
    "check": "node --check src/server.js"
  }
}
```

### 화면이 안 열릴 때

1. 터미널에서 `npm run dev`가 계속 실행 중인지 확인합니다.
2. Chrome 주소창에 `http://localhost:3001`을 입력합니다.
3. 다른 프로그램이 3001번 포트를 쓰고 있으면 아래처럼 실행합니다.

```bash
PORT=3002 npm run dev
```

Windows PowerShell에서는 아래처럼 실행합니다.

```powershell
$env:PORT=3002; npm run dev
```
