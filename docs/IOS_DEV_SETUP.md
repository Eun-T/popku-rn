# iOS DEV / 운영 설정 분리

## 이번 작업에서 적용한 범위

Windows의 Expo 설정만 분리했다. Mac 네이티브 프로젝트 수정, prebuild, 빌드, 설치는 실행하지 않았다.

| 선택 | Expo 앱 이름 | iOS Bundle ID | URL scheme |
| --- | --- | --- | --- |
| 기본값 또는 `APP_VARIANT=production` | 기존 값 유지 | 기존 `com.popku.app` 유지 | 기존 값 유지 |
| `APP_VARIANT=development` | 팝카이브 DEV | com.popku.app.dev | popkurn-dev |

DEV는 `ios.infoPlist.CFBundleDisplayName`도 지정한다. 운영은 `app.json`의 값을 그대로 사용한다. Android package, Google Maps plugin, Apple 로그인, 기존 iOS plist/Scene 설정은 복사해 보존한다. Google 로그인 callback을 추가할 때도 선택한 Bundle ID를 유지한다.

`eas.json`의 development profile에서 iOS에만 DEV 환경 변수와 Debug 구성을 지정했다. Android development profile에는 이 환경 변수를 추가하지 않았다. production/preview/submit, 버전, EAS project ID, 운영 서명 설정은 변경하지 않았다. production/preview marker 또는 `CONFIGURATION=Release`와 DEV variant가 함께 있으면 설정 오류로 중단한다. 이것은 Expo 설정 보호 장치이며 실제 Xcode Release 설정 검증을 대신하지 않는다.

## Syncthing 및 Mac 설정 전달

Windows Syncthing 설정에서 확인한 폴더는 `popku-src` → `C:\dev\popku-rn\src`, `popku-assets` → `C:\dev\popku-rn\assets`이며 둘 다 sendonly다. 루트 설정, `plugins/`, `docs/`, `tests/`, `ios/`는 이 두 폴더에 포함되지 않는다. `src/.stignore`는 `constants/api.ts`와 `*.sync-conflict-*`를 제외한다.

Mac `~/popku-rn`에는 사용자가 별도로 관리하는 네이티브 프로젝트가 있다. Mac에 적용할 때 다음 파일의 변경 부분을 수동으로 병합한다.

- `app.config.js`: variant 선택 및 DEV identity, Google callback 병합 대상 변경.
- `eas.json`: development profile의 `ios.env.APP_VARIANT`와 `ios.buildConfiguration`.
- 이 안내 및 `tests/iosAppVariant.test.cjs`: 선택적으로 전달해 확인에 사용.

Windows `app.json`에는 현재 `ios.enableSceneSupport`가 없다. 사용자 확인에 따르면 Mac에는 `true` 및 공식 UIScene plugin 적용 결과가 있다. **Windows app.json으로 Mac app.json을 덮어쓰지 않는다.** Mac의 기존 plugin 목록과 수동 변경이 있다면 해당 부분도 유지한다. Syncthing 범위를 변경하거나 ios 폴더를 동기화하지 않는다.

## 네이티브 수정 전에 Mac에서 확인할 명령

아래는 프로젝트 설정을 읽는 명령이다. prebuild를 실행하지 않는다.

```sh
cd ~/popku-rn
git status --short
ls -d ios/*.xcworkspace ios/*.xcodeproj
node -e 'const c=require("./app.json").expo; console.log({name:c.name, bundleIdentifier:c.ios?.bundleIdentifier, enableSceneSupport:c.ios?.enableSceneSupport})'
```

출력된 실제 workspace 경로를 지정한다. 아래의 예시 문자열은 실제 값으로 교체한다.

```sh
IOS_WORKSPACE='ios/확인한이름.xcworkspace'
xcodebuild -list -workspace "$IOS_WORKSPACE"
```

목록에서 실제 앱 scheme을 확인한 뒤 Debug/Release 결과를 각각 확인한다. 이 명령은 앱을 빌드하거나 설치하지 않는다.

```sh
IOS_SCHEME='확인한 앱 scheme'
for IOS_CONFIGURATION in Debug Release; do
  xcodebuild -showBuildSettings \
    -workspace "$IOS_WORKSPACE" -scheme "$IOS_SCHEME" \
    -configuration "$IOS_CONFIGURATION" |
    awk '/Build settings for action/ || / (CONFIGURATION|PRODUCT_BUNDLE_IDENTIFIER|PRODUCT_NAME|INFOPLIST_FILE|GENERATE_INFOPLIST_FILE|INFOPLIST_KEY_CFBundleDisplayName|CODE_SIGN_ENTITLEMENTS|CODE_SIGN_STYLE|DEVELOPMENT_TEAM|PROVISIONING_PROFILE_SPECIFIER|SWIFT_ACTIVE_COMPILATION_CONDITIONS|GCC_PREPROCESSOR_DEFINITIONS) = /'
done
```

확인한 앱 target의 `INFOPLIST_FILE`과 `CODE_SIGN_ENTITLEMENTS` 경로를 사용해 plist를 확인한다.

```sh
plutil -p 'ios/실제앱폴더/Info.plist'
plutil -p 'ios/실제앱폴더/실제앱.entitlements'
find ios -name '*.xcscheme' -not -path '*/Pods/*' -print
```

entitlements가 없으면 해당 명령은 생략한다. 다음 항목도 Xcode 또는 해당 파일에서 읽어 확인한다.

- AppDelegate.swift: 기존 FactoryProvider와 Google Maps 초기화, 로그인 callback 처리.
- Info.plist: UIApplicationSceneManifest, EXExpoAppSceneDelegate, CFBundleDisplayName, CFBundleURLTypes, CFBundleIdentifier의 실제 값/치환 변수.
- scheme: Run은 어떤 구성인지, Archive는 Release인지. 앱 scheme과 URL scheme은 서로 다른 값이다.
- Debug의 `DEBUG` 정의와 React Native bundle script/Metro 연결 경로, 설치된 expo-dev-client pod 유무.
- Release의 Bundle ID가 `com.popku.app`인지, 운영 display name, 서명 team/profile, entitlements, 버전/build number.

확인 결과가 예상과 다르면 네이티브 적용 전에 원인을 먼저 확인한다. 현재 Debug/Release의 실제 값은 아직 확인되지 않았다.

## 네이티브 적용 단계 — 확인 결과 검토 및 승인 이후

기존 ios 프로젝트가 있는 상태에서는 Expo 설정만 바꿔도 기존 Xcode 파일은 바뀌지 않는다. 이번 단계에서는 이 작업을 실행하지 않는다.

실제 설정을 확인한 뒤 최소 변경안을 정한다. 기본 방향은 기존 앱 target/Pods/Release 설정을 유지하고 Debug identity만 분리하는 것이다. 예를 들어 현재 Info.plist를 복사한 DEV 전용 plist를 Debug에만 연결하면 Release plist를 수정하지 않고 DEV 이름과 URL callback을 지정할 수 있다. 현재 INFOPLIST_FILE 구성에 따라 이 방식의 적합성을 먼저 확인해야 한다.

- Debug: Bundle ID `com.popku.app.dev`, 표시 이름 `팝카이브 DEV`, 앱 URL scheme `popkurn-dev`.
- Release: 현재 운영 Bundle ID/이름/plist/서명/profile/버전/Archive 설정을 그대로 유지.
- DEV plist를 만드는 경우 기존 Scene 설정, 권한 문구, URL queries 등을 그대로 복사하고 DEV identity/callback만 분리.
- 기존 AppDelegate.swift, UIScene FactoryProvider, Maps 초기화 코드 및 Podfile/Podfile.lock은 유지.
- Apple Developer의 DEV App ID, 개발 서명 및 Sign in with Apple capability/entitlements를 확인. 운영 profile을 DEV에 재사용하지 않는다.
- Google Maps 키가 iOS Bundle ID로 제한되어 있다면 DEV ID 허용 여부를 확인. 운영 키/제한을 임의로 수정하지 않는다.
- Google 로그인은 `com.popku.app.dev`에 등록된 별도 iOS OAuth client와 해당 callback이 필요하다. DEV 세션의 `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`에 그 값을 지정하고 운영 값은 보존한다. backend의 허용 audience 확인도 필요하다. 이번 작업은 Google/Apple 콘솔 및 backend를 수정하지 않았다.

적용 전 해당 네이티브 파일을 별도 백업하고 적용 후 위의 Debug/Release 읽기 명령을 반복한다. 운영 Release 값이 달라지면 설치/Archive에 진행하지 않는다. `prebuild` 및 `prebuild --clean`을 이 절차에 사용하지 않는다.

## DEV 설치 및 Metro 사용 — 네이티브 적용 완료 이후

아래는 후속 단계의 절차이며 이번 작업에서는 실행하지 않는다. 먼저 DEV 네이티브 Bundle ID, 표시 이름, `popkurn-dev` callback, 개발 서명을 확인한다. expo-dev-client는 이미 package.json에 있으며 Mac의 pod 설치 여부는 별도 확인이 필요하다.

프로젝트와 실제 scheme을 확인한 Mac에서:

```sh
cd ~/popku-rn
APP_VARIANT=development npx expo run:ios --scheme "$IOS_SCHEME" --configuration Debug --device
```

기존 ios 프로젝트가 존재하는지 먼저 확인하고 위 명령을 사용한다. ios가 없는 환경에서 이 명령을 실행해 자동 생성되게 하지 않는다. 연결된 아이폰을 선택하면 DEV 앱을 빌드/설치한다. Xcode로 설치할 경우 해당 scheme의 Run Debug와 실제 기기를 선택한다.

네이티브 코드가 바뀌지 않은 이후 작업에서는 빌드 없이 Metro를 시작한다.

```sh
APP_VARIANT=development npx expo start --dev-client --scheme popkurn-dev --lan
```

아이폰과 Metro 호스트는 같은 네트워크에서 연결한다. DEV 앱에서 개발 서버에 연결하고 Fast Refresh를 사용한다. DEV OAuth ID가 준비되면 위 DEV 명령들에 동일한 `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` 값을 전달한다. 운영 `.env`를 DEV 값으로 덮어쓰지 않는다. Windows에서 Metro를 실행하는 경우에도 같은 variant 및 DEV OAuth 값을 사용한다.

새 Metro 서버를 열기 전 기존 서버 상태를 확인하며 실행 중인 서버/에뮬레이터를 임의로 종료하지 않는다.

## TestFlight와 롤백

이번 Windows 변경에서 운영 기본값, EAS production/submit 및 버전 설정은 유지했다. Mac Release/TestFlight 동작은 빌드로 검증하지 않았다. `APP_VARIANT=production`과 기존 운영 환경/인증값으로 Release/Archive를 사용하며, `CONFIGURATION=Release` 검사는 실제 네이티브 Bundle ID 검사를 대체하지 않는다.

Expo 설정 롤백은 app.config.js에서 이번 variant 선택/DEV override만 제거하고 Google callback 병합을 이전의 `config.ios` 대상으로 되돌린다. eas.json의 development에 추가한 `ios.env.APP_VARIANT` 및 `ios.buildConfiguration`만 제거한다. 기본 운영 설정 확인만 하려면 `APP_VARIANT=production`을 사용한다. 이것은 이후 수정된 네이티브 Debug를 되돌리는 명령이 아니다.

후속 Mac 네이티브 작업의 롤백은 작업 직전 백업에서 변경한 Debug 관련 항목/DEV plist만 복구한다. 저장소 전체 reset을 사용하지 않으며 기존 UI 변경을 유지한다.

참고: [Expo 앱 variant](https://docs.expo.dev/build-reference/variants/), [EAS 플랫폼별 설정](https://docs.expo.dev/eas/json/), [Expo 로컬 개발](https://docs.expo.dev/guides/local-app-development/), [Google iOS 로그인](https://developers.google.com/identity/sign-in/ios/start-integrating), [Maps 키 제한](https://developers.google.com/maps/api-security-best-practices).
