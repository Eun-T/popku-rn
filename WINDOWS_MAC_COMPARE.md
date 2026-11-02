# Windows / Mac Archive 비교 보고서

이 보고서는 C:\dev\popku-rn의 현재 네 파일을 읽고 작성한 정적 분석 자료다. Mac 파일은 직접 확인하지 않았으므로 Windows와 일치한다고 단정하지 않는다. 보고서 생성 외 프로젝트 파일 변경, 파일 복사, Syncthing 변경, 빌드, 테스트, 네이티브 변경, Git commit/push, Archive는 수행하지 않았다.

## 1. SHA-256 및 원문 취급

해시는 마스킹 전 Windows 실제 파일 바이트를 기준으로 다시 계산했다. 아래 원문에는 app.json의 Google Maps API 키 두 값만 `[MASKED_GOOGLE_MAPS_API_KEY]`로 대체했다. 해당 키의 권한·제한·유효성은 확인하지 않았다. 나머지 세 파일에는 실제 비밀키·토큰·비밀번호가 발견되지 않았다. EAS project ID, 앱 식별자, 공개 API 주소는 인증 비밀값이 아니므로 유지했다.

보고서 코드 블록은 원본 파일의 바이트 보존용 배포물이 아니다. 특히 마스킹된 app.json 코드 블록의 해시는 원본 해시와 다르다. 줄바꿈·BOM 차이도 해시 차이를 만들 수 있다.

| 파일 | SHA-256 (원본 바이트) |
| --- | --- |
| `src/constants/api.ts` | `b9900a56d6e781a4c7fc452f6e26e2a6c6d3f1105c81a8fb1de19c2eb1fe5ef3` |
| `app.json` | `a2a5ad973bb18556e5f1cc15daa4d9cc995a42c12705452c1f423d744c28a4e1` |
| `eas.json` | `c33796a47b4290972d9193fabd4b5ee29c117c1250d55d8912379b7278c526f9` |
| `.env.example` | `5a1a549a8f5b6ff3fdb8ac59a4831ae497091927612e0dc8c2efdd70b430e374` |

## 2. 파일별 핵심 설정과 동작

### src/constants/api.ts

- `IS_DEVELOPMENT_ENVIRONMENT`는 `__DEV__`가 참이고 `EXPO_PUBLIC_APP_ENV`가 production/preview가 아닐 때만 참이다. Release 번들은 환경변수에 development를 넣어도 개발 동작으로 전환되지 않는다.
- `API_BASE_URL`은 `resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, IS_DEVELOPMENT_ENVIRONMENT)`로 계산한다. 신규 운영 URL이 이 파일의 요청 기본값으로 고정된 것은 아니다.
- 연결된 `src/constants/apiEnvironment.js:36`을 추가로 읽어 확인했다. URL 앞뒤 공백과 끝의 `/`를 제거한다. 개발 중 빈 값은 `http://192.168.50.146:8080`을 사용한다. 출시 환경의 빈 값·HTTP·로컬/사설 호스트·URL 인증정보·query/hash 등은 오류로 거부한다. `/api` 경로를 자동 제거하지 않으므로 환경변수에는 base URL만 넣는다.
- `API_BASE_URL`이 정확히 `https://api.theplave.co.kr`이면 저장 키 계산에만 `https://api.popchive.com`을 사용한다. 요청 주소는 신규 API 그대로다. 기존 API를 지정해도 기존 API로 요청하며 자동 전환하지 않는다.
- namespace는 저장 키 계산용 URL의 각 문자를 `charCodeAt(0).toString(16)`으로 바꾸고 `_`로 연결한 뒤 `api.`를 붙인다. 암호학적 해시가 아니다. 기본 로컬 URL만 빈 namespace다.
- 따라서 정확한 구·신규 운영 주소는 같은 namespace를 사용한다. 다른 호스트·포트·경로 또는 문자열 변형까지 공유하는 처리는 없다. 일반 URL 정규화 전체를 수행하는 코드도 아니다.
- 연결된 `src/lib/auth.ts:9-11`을 추가로 읽어 다음 저장 키 형식을 확인했다.

| 구분 | access token | refresh token | 세션 |
| --- | --- | --- | --- |
| 운영 및 기타 비어 있지 않은 namespace | `<namespace>.accessToken` | `<namespace>.refreshToken` | `<namespace>.session.v1` |
| 기본 로컬 API | `accessToken` | `refreshToken` | `session.v1` |

운영 도메인 전환으로 저장 키가 달라지는 문제를 방지하는 구현은 있다. 다만 기존 앱의 실제 저장 형식, Mac Keychain 접근 설정, 서버 JWT 검증·refresh 저장소·토큰 수락 여부는 이 네 파일만으로 입증할 수 없다. 코드 주석의 '같은 백엔드' 설명은 운영 서버 검증 결과가 아니다. 모든 기존 사용자의 로그인 유지를 보장하지 않는다.

### app.json

| 항목 | Windows 현재 값 / 상태 |
| --- | --- |
| 앱 이름 / slug | `popku-rn` / `popku` |
| Expo version | `1.0.0` |
| 운영 iOS Bundle ID | `com.popku.app` |
| 앱 URL scheme | `popkurn` |
| 공통 아이콘 | `./assets/images/icon.png` |
| iOS 아이콘 | `./assets/images/popicon.png` |
| 스플래시 이미지 | `./assets/images/splash-icon.png` |
| Scene 설정 | `ios.enableSceneSupport` 및 `UIApplicationSceneManifest` 명시 없음 |
| iOS 표시 이름 override | `CFBundleDisplayName` 명시 없음 |
| iOS build number | 명시 없음 |
| Apple 로그인 | `usesAppleSignIn: true`, `expo-apple-authentication` plugin |
| URL queries | `nmap`, `comgooglemaps` (앱 URL scheme과 별개) |
| 위치 권한 | `NSLocationWhenInUseUsageDescription` 지정 |
| 외형 | app.json은 `automatic`; 연결된 app.config.js에서 theme flag에 따라 최종값 변경 |
| 실험 설정 | `typedRoutes: true`, `reactCompiler: true` |

Scene 항목의 부재는 Mac의 Scene 설정을 false로 바꾸거나 제거하라는 뜻이 아니다. Windows에는 더플레이브 운영 표시 이름이나 확정된 새 버전이 반영되어 있지 않다. 이 파일을 출시 이름·버전의 완성된 기준으로 사용하면 안 된다.

Expo plugins 전체 목록:

1. `expo-router`
2. `expo-splash-screen`: 기본 배경 `#208AEF`, 이미지 너비 76, iOS 배경 `#FFFFFF`, 이미지 너비 180
3. `react-native-maps`: Android/iOS Google Maps API 키 지정 (보고서 원문에서는 값 마스킹)
4. `expo-secure-store`
5. `expo-image-picker`: 사진 권한 문구 지정, cameraPermission/microphonePermission false
6. `expo-build-properties`: Android `usesCleartextTraffic: true`
7. `expo-localization`
8. `./plugins/withMapAppQueries`
9. `expo-apple-authentication`

`app.config.js`도 읽어 최종 설정에 영향을 주는 부분을 확인했다. 기본 variant는 production이며 이때 이름·Bundle ID·scheme은 전달된 기존 설정을 보존한다. development는 `팝카이브 DEV` / `com.popku.app.dev` / `popkurn-dev`로 바꾸고 표시 이름도 지정한다. 유효한 iOS OAuth client ID가 있으면 callback scheme과 Google 로그인 plugin을 추가한다. 따라서 app.json만으로 최종 Expo 설정이나 기존 Xcode 네이티브 설정을 확정할 수 없다. 기존 ios 프로젝트가 자동으로 이 JSON과 일치한다고 가정하지 않는다.

### eas.json

| 프로필 | 환경 / API | APP_VARIANT | iOS 구성 및 기타 |
| --- | --- | --- | --- |
| development | API URL·앱 환경 마커·EAS environment를 이 파일에서 명시하지 않음 | `ios.env.APP_VARIANT=development` (iOS에만 적용) | `developmentClient: true`, internal 배포, `ios.buildConfiguration=Debug` |
| preview | API URL·앱 환경 마커·EAS environment를 이 파일에서 명시하지 않음 | 명시 없음 | internal 배포, iOS buildConfiguration 명시 없음 |
| production | `environment=production`, `EXPO_PUBLIC_API_URL=https://api.theplave.co.kr`, `EXPO_PUBLIC_APP_ENV=production` | 명시 없음 (Windows app.config.js 기본값은 production) | `autoIncrement: true`, iOS buildConfiguration 명시 없음 |

- CLI 요구 버전은 `>= 24.8.0`, `appVersionSource=remote`, submit.production은 빈 객체다.
- 명시되지 않은 환경변수는 이 파일만으로 최종값을 알 수 없다. 외부 환경변수나 EAS 환경의 실제 값은 미확인이다.
- preview는 API URL을 별도로 공급해야 한다. Release 번들이 빈 URL을 로컬 API로 대체하지 않는다.
- Windows app.config.js는 development variant와 production/preview marker 또는 `CONFIGURATION=Release`의 조합을 거부한다. 실제 Mac 네이티브 설정 검사를 대체하지 않는다.
- 로컬 Xcode Archive가 EAS production의 env·remote 버전·autoIncrement를 자동 적용한다고 가정하면 안 된다. 실제 JS 번들 생성 환경과 Xcode Release/Archive 설정에서 각각 확인해야 한다.
- 생산용 Archive의 의도는 신규 API와 production marker/variant 사용이다. `APP_VARIANT=production`을 명시하면 외부 development 값 유입을 피할 수 있지만, 현재 eas.json에 그 값이 명시되어 있는 것은 아니다.

### .env.example

- `EXPO_PUBLIC_API_URL=`는 빈 예시다. 신규 운영 API 예시는 주석의 `https://api.theplave.co.kr`이다.
- Release/preview는 공개 HTTPS URL이 필요하며 base URL 뒤에 `/api`를 붙이지 말라고 안내한다.
- `EXPO_PUBLIC_APP_ENV=development`는 개발용 예시다. 운영 설정으로 그대로 복사하면 안 된다. EAS production에서 production marker를 지정한다고 설명한다.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`와 `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`는 빈 값이다. iOS Bundle ID `com.popku.app`과 OAuth callback 관련 안내가 있다.
- 실제 비밀키·JWT·refresh token·비밀번호·OAuth client secret은 없다. 모든 값이 비어 있는 것은 아니지만 앱 환경 marker와 공개 API 예시는 비밀값이 아니다.
- `EXPO_PUBLIC_` 변수에 비밀키나 토큰을 넣지 말라고 안내한다. 예시 파일은 실제 Mac `.env`와 다르며 기존 Mac 환경 파일을 덮어쓰는 용도로 사용하지 않는다.

## 3. Mac에서 반드시 보존할 설정

- Windows app.json을 Mac에 통째로 복사하지 않는다. Mac의 확정된 운영 표시 이름·출시 버전·build number와 사용자 변경을 보존한다. 구 표시 이름이 남았다면 더플레이브로 바꾸기 위한 수정 위치를 먼저 확인하고, 버전 숫자는 임의로 정하지 않는다.
- 기존 운영 앱 Bundle ID, 서명 team/profile, entitlements, Keychain 접근 설정을 유지한다. Windows 기준 운영 ID는 `com.popku.app`이다. Mac 값이 다르면 원인을 확인하고 임의 변경하지 않는다.
- 기존 Scene 지원, UIApplicationSceneManifest, Scene delegate/FactoryProvider, AppDelegate, Google Maps 초기화, URL callback과 URL queries를 보존한다. Windows 파일에 없다는 이유로 제거하지 않는다.
- 기존 Mac ios 프로젝트 전체, Xcode project/workspace, schemes, Info.plist, Podfile/Podfile.lock 및 Release/Archive 설정을 덮어쓰지 않는다. prebuild 또는 prebuild --clean을 실행하지 않는다.
- Mac의 iOS용 Google Maps 키와 OAuth client ID, callback scheme, 기존 plugins 및 EAS 프로젝트 연결을 검토 없이 Windows 값으로 교체하지 않는다. 보고서의 마스킹 문자열은 설정값이 아니다.
- Mac `.env*`의 기존 필요한 값을 보존하고 API/운영 marker만 별도 검토한다. `.env.example`을 실제 운영 환경으로 통째 복사하지 않는다.

## 4. Windows 기준 필수 반영 사항

1. `src/constants/api.ts`의 신규 운영 API → 기존 운영 namespace 별칭을 유지한다. API URL만 바꾸고 별칭 처리를 누락하면 기존 저장 세션에 접근하지 못할 수 있다. auth.ts의 키 형식 및 기존 device ID 키를 임의로 개명하지 않는다.
2. 연결 의존 파일 `src/constants/apiEnvironment.js`와 Mac auth.ts의 저장 키 형식도 함께 확인한다. 이번 보고서의 전체 원문·해시 대상은 지정된 네 파일뿐이다.
3. 실제 운영 JS 번들 생성 환경의 `EXPO_PUBLIC_API_URL`을 `https://api.theplave.co.kr`로 설정하고 `/api`는 붙이지 않는다. `EXPO_PUBLIC_APP_ENV=production`, `APP_VARIANT=production` 사용 여부를 확인한다. 이는 적용 지침이며 이번 작업에서 변경한 값이 아니다.
4. EAS를 사용한다면 production 프로필의 신규 API·production marker·environment 선택을 반영한다. 로컬 Archive 환경도 별도로 맞춘다. development의 iOS APP_VARIANT/Debug 설정은 개발용으로 유지하고 운영 Archive와 혼용하지 않는다.
5. app.json의 필요한 에셋 경로·권한·로그인/보안 저장 plugin 등을 Mac 기존 설정과 비교·병합한다. Mac에만 있는 Scene/plugin/callback/서명 설정을 유지한다. 새 이름·버전의 기준은 Windows의 `popku-rn`/`1.0.0`으로 덮어쓰지 않는다.
6. 실제 Mac 파일의 해시와 내용 diff를 확인한 후 반영 범위를 결정한다. 이전 조사에서 `src/.stignore`의 `constants/api.ts` 제외를 확인했으므로 이 파일은 Syncthing 반영 완료를 가정하지 않는다. 동기화 설정은 이번 작업에서 변경하지 않는다.

## 5. Mac 읽기 전용 비교 명령

프로젝트 위치가 다르면 cd 경로만 실제 경로로 바꾼다.

```sh
cd ~/popku-rn
shasum -a 256 src/constants/api.ts app.json eas.json .env.example
```

해시가 같으면 해당 파일 바이트가 같다. 다르면 실제 diff로 설정 차이와 줄바꿈/BOM 차이를 구분한다. Mac 고유 설정이 있는 app.json은 Windows와 해시가 달라도 정상일 수 있다. 보고서의 마스킹된 app.json을 원본 비교 파일로 사용하지 않는다. 이 명령은 빌드·테스트·Archive를 수행하지 않는다.

## 6. 네 파일 전체 원문

아래는 읽은 순서 그대로의 전체 텍스트다. app.json의 Maps API 키 두 값만 마스킹했다.

### src/constants/api.ts

```typescript
import { LOCAL_API_URL, resolveApiBaseUrl } from './apiEnvironment';

// A release bundle cannot opt into development behavior through an environment variable.
export const IS_DEVELOPMENT_ENVIRONMENT = __DEV__
  && process.env.EXPO_PUBLIC_APP_ENV !== 'production'
  && process.env.EXPO_PUBLIC_APP_ENV !== 'preview';
export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, IS_DEVELOPMENT_ENVIRONMENT);

// Both production domains serve the same backend. Keep the existing production keys
// across app upgrades; do not migrate tokens or share sessions with other API hosts.
const tokenStorageUrl = API_BASE_URL === 'https://api.theplave.co.kr'
  ? 'https://api.popchive.com'
  : API_BASE_URL;
export const API_TOKEN_STORAGE_NAMESPACE = tokenStorageUrl === LOCAL_API_URL
  ? ''
  : `api.${tokenStorageUrl.split('').map(character => character.charCodeAt(0).toString(16)).join('_')}`;

```

### app.json

```json
{
  "expo": {
    "name": "popku-rn",
    "slug": "popku",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "popkurn",
    "userInterfaceStyle": "automatic",
    "ios": {
      "icon": "./assets/images/popicon.png",
      "bundleIdentifier": "com.popku.app",
      "usesAppleSignIn": true,
      "infoPlist": {
        "LSApplicationQueriesSchemes": ["nmap", "comgooglemaps"],
        "NSLocationWhenInUseUsageDescription": "현재 위치 주변의 팝업을 찾기 위해 위치 정보가 필요합니다."
      }
    },
    "android": {
      "package": "com.popku.app",
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/images/android-icon-foreground.png",
        "backgroundImage": "./assets/images/android-icon-background.png",
        "monochromeImage": "./assets/images/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false
    },
    "web": {
      "output": "static",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#208AEF",
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 76,
          "ios": {
            "backgroundColor": "#FFFFFF",
            "image": "./assets/images/splash-icon.png",
            "imageWidth": 180
          }
        }
      ],
      [
        "react-native-maps",
        {
          "androidGoogleMapsApiKey": "[MASKED_GOOGLE_MAPS_API_KEY]",
          "iosGoogleMapsApiKey": "[MASKED_GOOGLE_MAPS_API_KEY]"
        }
      ],
      "expo-secure-store",
      [
        "expo-image-picker",
        {
          "photosPermission": "게시글에 사진을 첨부하기 위해 사진 라이브러리 접근이 필요합니다.",
          "cameraPermission": false,
          "microphonePermission": false
        }
      ],
      [
        "expo-build-properties",
        {
          "android": {
            "usesCleartextTraffic": true
          }
        }
      ],
      "expo-localization",
      "./plugins/withMapAppQueries",
      "expo-apple-authentication"
    ],
    "experiments": {
      "typedRoutes": true,
      "reactCompiler": true
    },
    "extra": {
      "router": {},
      "eas": {
        "projectId": "9e8814af-ed94-44ab-83b5-613d0778136b"
      }
    },
    "owner": "popku"
  }
}
```

### eas.json

```json
{
  "cli": {
    "version": ">= 24.8.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "env": {
          "APP_VARIANT": "development"
        },
        "buildConfiguration": "Debug"
      }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true,
      "environment": "production",
      "env": {
        "EXPO_PUBLIC_APP_ENV": "production",
        "EXPO_PUBLIC_API_URL": "https://api.theplave.co.kr"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### .env.example

```dotenv
# Development only: leave empty to keep the existing local API.
# Release / preview: required public HTTPS URL; local/private hosts and HTTP are rejected.
EXPO_PUBLIC_API_URL=
# Production API: EXPO_PUBLIC_API_URL=https://api.theplave.co.kr
# Base URL only: do not append /api or put secret keys/tokens in EXPO_PUBLIC variables.
# EAS production sets this marker. A release bundle always enforces HTTPS even if it says development.
# Google Places search is enabled only in development; Google Maps is unaffected.
EXPO_PUBLIC_APP_ENV=development

# Google Web OAuth Client ID used to request an ID token for the POPKU backend.
# Android OAuth Client ID is configured in Google Cloud for com.popku.app and SHA-1.
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
# iOS OAuth Client ID for Bundle ID com.popku.app; also derives the callback URL scheme.
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
```
