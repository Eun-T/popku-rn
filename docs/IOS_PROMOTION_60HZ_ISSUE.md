# iOS ProMotion 60Hz / 120Hz Cadence Investigation

Status: Unresolved / Deferred
Investigated: 2026-10-07

현재는 기능 개발을 계속한다. 향후 Expo / React Native / iOS 업데이트 후 또는 재현 조건이 더 명확해졌을 때 이 이슈를 다시 조사한다. 직접 root cause는 미확정이며 native fix는 적용하지 않았다.

이 문서는 실기기 사용자 관찰·A/B 테스트·Instruments 측정과 Windows workspace의 설치 source/config 조사 결과를 구분해 기록한다. 실기기 측정은 사용자가 수행했으며, 조사 과정에서 실제 설치 앱의 native binary나 Info.plist를 확보하지 못했다.

## 1. 문제 증상

실기기:

- iPhone 16 Pro
- iOS 26.6.2

조사 당시 프로젝트 설치 버전:

| 항목 | 버전 |
| --- | --- |
| Expo | 57.0.25 |
| React Native | 0.86.3 |
| Expo Router | 57.0.23 |
| react-native-screens | 4.26.2 |
| react-native-maps | 1.27.2 |

Expo 개발 빌드에서 다음 현상을 관찰했다.

- Place → PlaceDetail 전환 및 interactive swipe에서 약 60Hz 상태가 발생한다.
- Map → 동일 PlaceDetail에서는 약 120Hz 상태가 관찰된다.
- 동일 popup, 동일 `/places/[id]` route, 동일 `{ id }` params 및 동일 PlaceDetail을 사용한다.
- 앱을 background로 보냈다가 foreground로 복귀하면 일반 RN 화면이 가끔 다시 120Hz가 된다.
- 이후 다시 60Hz가 되는 경우도 있다. 코드·route·UI 변경 없이 실행 중 60 ↔ 120 상태가 바뀔 수 있다.

사용자는 2026-10-06 약 23시 이전에는 Place → Detail도 120Hz였던 것으로 기억한다. **해당 시점의 git snapshot/commit이 없으므로 발생 시각은 사용자 관찰이며 확정된 변경 경계가 아니다.**

Git 조사에서 2026-10-06 22:00 이후 commit/reflog 기록은 없었다. 조사 당시 마지막 commit은 `6481844`(2026-10-03 11:47:53 KST)이며 많은 미커밋 변경이 존재했다. HEAD와 현재 diff 전체를 23시 이후 변경으로 해석해서는 안 된다.

## 2. Instruments 측정 결과

React Native 개발 메뉴의 Perf Monitor UI FPS에서 차이를 처음 확인했다. 이후 사용자가 Xcode Instruments에서 실제 display cadence 차이도 확인했으므로 Perf Monitor 숫자만의 문제로 보지 않는다.

측정 경로:

```text
Xcode Instruments
└─ Animation Hitches
   └─ Built-In Display
      └─ Displayed Surfaces / CA Frames
```

| 경로 | 관찰된 Display Duration | 해석 |
| --- | --- | --- |
| Place → Detail | 약 16.67ms가 연속적으로 관찰됨 | 약 60Hz cadence |
| 실제 Map → 동일 Detail | 약 8.33ms가 연속적으로 관찰되는 구간 존재 | 약 120Hz cadence |

Map 경로에도 일부 16.67ms / 20.84ms / 25ms 및 hitch가 존재했다. 완벽히 고정된 120fps나 모든 frame이 정상 처리됐다는 의미는 아니다. **두 상태에서 실제 display cadence가 다르다는 관찰**이다.

Display cadence와 지도 자체의 렌더링 fps, RN JS FPS는 구분해야 한다. 원본 Instruments trace는 이 문서에 첨부되지 않았으므로 향후 재조사 시 동일 조건으로 다시 수집한다.

## 3. 수행한 Place A/B 테스트

| 실험 | 결과 |
| --- | --- |
| FloatingTabBar의 GlassView / BlurView 배경 제거 | Place → Detail 약 60Hz 유지 |
| TodayOpeningCarousel의 PosterBackground BlurView만 제거, 배경 Image 유지 | 약 60Hz 유지 |
| Place 탐색 / 전체 탭 비교 | 두 경로 모두 약 60Hz |
| 기존 Place hook을 유지한 채 UI를 View / Text / Pressable로 대체 | 약 60Hz 유지 |
| 기존 Place 구현 자체를 mount하지 않는 별도 MinimalPlaceScreen | 약 60Hz 유지 |
| MinimalPlaceScreen을 유지하면서 Places nested Native Stack 우회 | 약 60Hz 유지 |

강한 최소 화면 실험에서는 export wrapper가 MinimalPlaceScreen과 기존 구현 중 하나만 mount하도록 분리했다. 기존 구현 내부의 early return으로 숨긴 것이 아니다.

MinimalPlaceScreen에는 다음만 사용했다.

- useRouter
- View
- Text
- Pressable 하나

이 실험에서 기존 Place 구현이 mount되지 않으므로 다음이 함께 제거됐다.

- Place UI 전체와 FlatList / ScrollView / images 등의 visual subtree
- Place API 요청
- 기존 effects / timers / state
- favorites subscription
- pagination
- image recovery / cache logic
- Explore / 전체 UI와 FilterSheet / Skeleton / Place 자식 컴포넌트

위 비시각 항목들은 각각 별도의 독립 실험으로 제거한 것이 아니라 **기존 Place 구현의 mount를 차단한 하나의 실험에서 함께 격리**됐다.

테스트 popup ID는 기존 데이터 문서에 실제 팝업으로 기록된 아이파크몰 덕후 페스티벌의 publicId `901fed19-bcdb-11f1-ad88-f4c88a6f75ec`를 상수로 사용했다. 테스트용 API 요청으로 ID를 얻지 않았다.

## 4. Map A/B 테스트

기존 MapScreen은 Google MapView와 기존 map logic을 함께 실행한다. 이 상태에서는 Map → 동일 PlaceDetail에서 약 120Hz가 관찰됐다.

다음 실험은 Map route에서 기존 MapScreen을 mount하지 않고 별도의 MinimalMapScreen만 mount하도록 구성했다. MinimalMapScreen에는 useRouter / View / Text / Pressable 하나만 사용했다. 기존 MapView, hooks, API, effects, state, camera/listener, marker, animation은 실행되지 않았다.

Place 최소 화면과 같은 popup ID 및 navigation 호출을 사용했다.

```tsx
router.push({
  pathname: '/places/[id]',
  params: { id: '901fed19-bcdb-11f1-ad88-f4c88a6f75ec' },
});
```

| 활성 화면 | 동일 PlaceDetail 진입 결과 |
| --- | --- |
| 실제 MapScreen + Google MapView + 기존 map logic | 약 120Hz |
| MinimalMapScreen | 약 60Hz |
| MinimalPlaceScreen | 약 60Hz |

**이 A/B는 MapView 하나만 제거한 것이 아니라 MapScreen 전체를 제거했다.** 따라서 실제 MapScreen 활성 상태와 120Hz 사이의 강한 상관관계는 확인됐지만, Google MapView 자체가 직접 120Hz를 만든다고 확정할 수 없다.

## 5. 현재 배제된 / 우선순위가 낮아진 원인

현재 A/B 결과상 다음 후보의 우선순위가 크게 낮아졌다. 완전히 불가능하다는 의미는 아니다.

- Place UI 렌더링 부하
- Place API 요청량
- Place timer / effect
- image loading / cache
- TodayOpeningCarousel Blur
- FloatingTabBar Glass / Blur
- Places nested Native Stack
- PlaceDetail 자체의 차이
- popup ID 차이
- navigation 호출 방식 차이

모든 테스트용 flag, 최소 화면, 테스트 ID 상수, 임시 분기는 조사 후 원복했다. Places Native Stack, 실제 Place/Map 화면 및 원래 Blur/Glass UI를 복구했고 최근 Place 기능 개발 내용은 유지했다. 기록 작성 시 A/B 코드는 남아 있지 않다.

## 6. React Native native 조사 결과

RN 0.86.3의 설치 source를 읽어 확인했다. 경로와 구현 설명은 조사 버전 기준이며 향후 업데이트 시 다시 확인해야 한다.

Native Animated source:

`node_modules/react-native/Libraries/NativeAnimation/RCTNativeAnimatedNodesManager.mm`

`startAnimationLoopIfNeeded`의 CADisplayLink 생성 경로:

```objc
_displayLink = [CADisplayLink displayLinkWithTarget:self
                                        selector:@selector(stepAnimations:)];
[_displayLink addToRunLoop:[NSRunLoop mainRunLoop]
                  forMode:NSRunLoopCommonModes];
```

이 경로에 `preferredFramesPerSecond = 60`, `preferredFrameRateRange`, 명시적 120Hz request는 없었다. 활성 animation이 있을 때 link를 생성하고 animation이 모두 끝나면 invalidate한다.

| 조사 경로 | 설치 source | 확인 결과 |
| --- | --- | --- |
| RCTDisplayLink | `React/Base/RCTDisplayLink.m` | timer frame observer용 CADisplayLink. preferred fps/range 지정 없음 |
| Native Animated | `Libraries/NativeAnimation/RCTNativeAnimatedNodesManager.mm` | 활성 animation용 CADisplayLink. preferred fps/range 지정 없음 |
| Fabric scheduler | `React/Fabric/RCTScheduler.mm` | shared animation backend의 link 생성 및 pause/resume. preferred fps/range 지정 없음 |
| Perf Monitor | `React/CoreModules/RCTPerfMonitor.mm` | 측정용 CADisplayLink. preferred fps/range 지정 없음 |
| Bridgeless RCTInstance | `ReactCommon/react/runtime/platform/ios/ReactCommon/RCTInstance.mm` | timer callback에 RCTDisplayLink를 사용하고 RCTTiming을 등록 |

조사된 경로에서 앱 전체를 60Hz로 고정하는 `preferredFramesPerSecond = 60` 설정은 발견되지 않았다. 명시적인 high-refresh hint가 없다는 사실만으로 실제 cadence가 반드시 60Hz라고 단정할 수도 없다.

검색된 `1/60` 값의 의미:

- `React/CoreModules/RCTTiming.mm`의 `kFrameDuration`: idle callback budget 계산에 사용.
- `Libraries/NativeAnimation/Drivers/RCTAnimationDriver.h`의 `RCTSingleFrameInterval`: animation sample interval.
- `Drivers/RCTFrameAnimation.mm`: 실제 경과 시간에 따라 sample 사이를 보간하여 variable frame rate에 대응.

이 값들이 앱 전체 display refresh를 60Hz로 강제한다는 근거는 없다.

현재 설치 RN/Expo의 정상 factory 경로는 **New Architecture / Fabric**을 사용한다. `Libraries/AppDelegate/RCTReactNativeFactory.mm`은 `newArchEnabled`와 `fabricEnabled`에 YES를 반환하며, Bridgeless RCTInstance도 RCTDisplayLink를 사용한다. RCTDisplayLink가 있다는 이유만으로 Old Architecture라고 해석하면 안 된다.

Expo factory의 기본 release level은 Stable이고, 기본 `useSharedAnimatedBackend`는 false다. Fabric scheduler의 shared backend 경로 존재와 그 경로가 실제 빌드에서 활성화되는지는 구분해야 한다. 실제 설치 binary의 별도 override는 검증하지 못했다.

## 7. foreground / background lifecycle

관련 설치 source:

- `node_modules/react-native/React/CoreModules/RCTTiming.mm`
- `node_modules/react-native/React/Base/RCTDisplayLink.m`

확인한 notification 경로:

```text
WillResignActive / DidEnterBackground
→ RCTTiming.stopTimers()
→ pauseCallback
→ RCTDisplayLink.paused = YES

WillEnterForeground / DidBecomeActive
→ RCTTiming.startTimers()
→ pauseCallback
→ 기존 RCTDisplayLink.paused = NO
```

재시작은 pending timer 및 RN instance/delegate 등의 조건에 따라 이루어진다. 이 경로는 foreground마다 link를 새로 생성·재등록하는 방식이 아니라 기존 link의 pause/resume이다.

foreground 복귀 시 기존 display link가 다시 활성화되는 실행 경로는 확인됐다. 하지만 이 과정에서 RN이 120Hz preferred range를 설정하는 코드는 발견되지 않았다. 조사한 Fabric animation scheduler에서도 foreground notification에 연결된 120Hz range 재설정은 발견되지 않았다.

따라서 foreground 복귀 후 가끔 120Hz로 회복되는 현상과 lifecycle transition 사이에 연관성이 있을 가능성은 있으나, **60 → 120을 결정하는 직접 mechanism은 미확정**이다. iOS의 refresh-rate 재선택이나 Google SDK 내부 lifecycle 처리는 이 source 조사만으로 확인되지 않았다.

## 8. react-native-screens 조사

react-native-screens 4.26.2의 `node_modules/react-native-screens/ios/RNSScreen.mm`에서 transition progress용 CADisplayLink를 확인했다. transition 완료 시 pause/invalidate한다.

조사한 코드에서는 preferredFrameRateRange, preferredFramesPerSecond 또는 지속적인 60Hz 제한 근거를 발견하지 못했다.

Places nested Native Stack을 완전히 우회한 A/B에서도 60Hz였으므로 현재 우선순위는 낮다.

## 9. react-native-maps / Google Maps 조사

react-native-maps 1.27.2의 다음 설치 source를 조사했다.

- `ios/AirGoogleMaps/AIRGoogleMap.h`: AIRGoogleMap은 GMSMapView를 상속.
- `ios/AirGoogleMaps/AIRGoogleMap.mm`: GMSMapView 초기화 경로. wrapper에서 preferred frame-rate 값을 설정하는 코드는 발견되지 않음.
- `ios/AirGoogleMaps/RNMapsGoogleMapView.mm`: recycle 시 native view를 제거하고 참조를 비움.

Google Maps wrapper에서 preferredFrameRateRange, preferredFramesPerSecond, maximumFramesPerSecond를 통한 120Hz 강제 설정은 발견되지 않았다. 검색된 `AirMaps/AIRMapMarker.m`의 CADisplayLink는 Apple Maps marker 좌표 animation이며 Google 경로의 120Hz 근거가 아니다.

설치 podspec은 GoogleMaps 9.4.0과 Google-Maps-iOS-Utils 6.1.0을 요구한다. Podfile.lock과 실제 build artifact가 없어 설치 앱에 포함된 SDK 버전은 직접 검증하지 못했다.

Google Maps SDK 내부는 binary 영역이다. 이 workspace에는 해당 framework/header/build output이 없어 내부 CADisplayLink, frame scheduling, background/foreground 재활성화 처리를 완전히 확인하지 못했다.

Google 공식 문서에서 GMSMapView의 `preferredFrameRate` 기본값은 `kGMSFrameRateMaximum`이다. GMSFrameRate enum 문서는 고성능 기기의 maximum을 60fps로 설명한다. 이 문서만으로 Google Maps가 앱 전체를 명시적으로 120Hz로 만든다고 주장할 수 없다. 지도 렌더링 fps와 앱 display cadence도 서로 다른 관찰 대상이다.

Map 활성 상태와 120Hz 사이에는 실기기 A/B상 강한 상관관계가 있지만 native mechanism은 미확정이다. Root Detail을 push했다고 Map React subtree가 반드시 unmount되는 것은 아니다. native view가 남거나 SDK activity가 유지될 가능성은 있으나, 화면에서 분리된 뒤 SDK의 동작은 확인되지 않았다.

참고:

- [Google GMSMapView reference](https://developers.google.com/maps/documentation/ios-sdk/reference/objc/Classes/GMSMapView)
- [Google GMSFrameRate reference](https://developers.google.com/maps/documentation/ios-sdk/reference/objc/Enums/GMSFrameRate)

## 10. CADisableMinimumFrameDurationOnPhone

현재 `app.json`의 `expo.ios.infoPlist`에는 이 key가 명시적으로 설정되어 있지 않다.

하지만 설치된 Expo plugin source:

`node_modules/@expo/config-plugins/build/plugins/withIosBaseMods.js`

의 기본 Info.plist template에서 다음 값을 확인했다.

```js
CADisableMinimumFrameDurationOnPhone: true
```

현재 config를 대상으로 파일을 쓰지 않는 Expo config introspection도 수행했다.

```text
sourceValue: not explicitly set
resolvedValue: not explicitly set
introspectedValue: true
introspectedConfigValue: true
iosDirectoryExists: false
```

이는 현재 config와 plugin으로 iOS app을 생성할 때 true가 들어갈 것으로 예상된다는 근거다. introspection은 `ios/`가 없는 환경의 기본 template fallback도 사용하므로 실제 Xcode build artifact 확인과 같지 않다.

| 확인 대상 | 조사 결과 |
| --- | --- |
| app.json 명시적 값 | 없음 |
| 해석된 Expo config의 명시적 값 | 없음 |
| 설치 Expo plugin 기본값 | true |
| 현재 config의 read-only introspection | true |
| generated ios/Info.plist | workspace에 없음 |
| 실제 iPhone 설치 dev build의 Info.plist | 직접 검증 못함 |

Windows workspace에는 `ios/`, Podfile/Podfile.lock, generated Info.plist, Xcode project 및 built .app/.ipa가 없었다. 따라서 **현재 iPhone에 설치된 POPKU dev build의 실제 값은 미확인**이다. 향후 Mac/Xcode에서 해당 설치 build에 대응하는 built .app의 Info.plist를 확인해야 한다.

Apple 문서상 이 key는 시스템 기본값보다 높은 frame-rate request를 허용하는 opt-in이다. true라고 항상 120Hz가 보장되는 것은 아니다. 동일 설치 앱에서 실행 중 60 ↔ 120이 바뀌는 현상까지 이 정적 key 하나만으로 설명하기는 어렵다.

최근 변경과의 관계:

- package.json / package-lock.json 마지막 저장: 2026-10-04 19:10경.
- app.json 마지막 저장: 2026-10-04 19:16경.
- eas.json 마지막 저장: 2026-09-27 22:30경.
- 주요 RN/Expo/navigation lock 버전은 HEAD와 동일.
- 관련 RN source와 Expo 기본 plist plugin에서도 10월 6일 23시 이후 변경 근거를 찾지 못함.

mtime은 마지막 저장 시각이며 변경 전체의 이력이 아니다. 실제 dev build를 다시 만들면서 설정이 달라졌는지는 artifact가 없어 확인하지 못했다. 23시 이후 특정 config 변경이 원인이라는 증거는 없다.

참고:

- [Apple ProMotion optimization](https://developer.apple.com/documentation/quartzcore/optimizing-iphone-and-ipad-apps-to-support-promotion-displays)
- [Apple CADisableMinimumFrameDurationOnPhone](https://developer.apple.com/documentation/bundleresources/information-property-list/cadisableminimumframedurationonphone)

## 11. 현재 가장 가능성 높은 가설

가능성 순서이며 숫자로 확률을 확정한 것은 아니다.

### A. RN high-refresh hint 부재와 iOS cadence 선택

- Supporting evidence: 조사한 RN animation/display link에 명시적 high-refresh hint가 없다. 실제 Map에서는 120Hz, Minimal Map/Place에서는 60Hz였으므로 활성 native content/activity에 따라 cadence가 달라진다는 설명과 맞는다.
- Contradicting/unknown evidence: hint가 없다고 반드시 60Hz가 되는 것은 아니다. iOS가 해당 시점에 60Hz를 선택하는 직접 mechanism과 일반 RN 화면의 이전 120Hz 상태는 설명이 확정되지 않았다.

### B. lifecycle 또는 Map/native SDK 활성 상태에 따른 cadence 재선택

- Supporting evidence: 같은 route/UI에서도 foreground 복귀 후 가끔 120Hz로 회복된다. RN link pause/resume 경로는 확인됐고 Map 활성 상태와 높은 cadence 사이에도 강한 상관관계가 있다.
- Contradicting/unknown evidence: RN foreground 코드에 120Hz hint 설정은 없다. Google SDK 내부 link의 잔존/재활성화나 iOS refresh negotiation은 확인하지 못했다. 전체 MapScreen A/B만으로 MapView 단독 영향은 확정할 수 없다.

### C. 설치 dev build와 현재 Expo config 결과의 차이

- Supporting evidence: 실제 설치 앱의 plist/native binary가 없어 현재 introspection과 일치하는지 확인하지 못했다. native renderer 경로별 반응이 다를 가능성은 남아 있다.
- Contradicting/unknown evidence: 현재 introspection은 true이고 주요 lock 버전 변화도 없다. 동일 설치 앱에서 가끔 120Hz로 회복되므로 고정 config 차이만으로 모든 증상을 설명하기 어렵다. 현재 우선순위는 낮다.

## 12. 검토했지만 적용하지 않은 native fix

`RCTNativeAnimatedNodesManager.mm`에서 CADisplayLink 생성 직후 high-refresh hint를 설정하는 방법을 검토했다.

**아래 코드는 검토 기록일 뿐, 프로젝트에 적용하지 않았다.**

```objc
if (@available(iOS 15.0, *)) {
  float maximum = (float)UIScreen.mainScreen.maximumFramesPerSecond;
  if (maximum > 0) {
    _displayLink.preferredFrameRateRange =
        CAFrameRateRangeMake(MIN(60.0f, maximum), maximum, maximum);
  }
}
```

목적은 Root JS Stack의 native animation이 Map 활성 상태와 독립적으로 높은 cadence를 요청하도록 하는 것이다. iOS는 hint를 보장하지 않으며 animation 종료 후 scroll/정지 화면까지 계속 120Hz로 만드는 방법도 아니다.

적용하지 않은 이유:

- 실제 root cause가 확정되지 않음.
- 해결 여부를 실기기로 검증하지 않음.
- RN native source patch가 필요함.
- dependency 재설치 후에도 유지하려면 Expo config plugin 등으로 patch를 보존해야 할 수 있음.
- RN 0.86의 기본 precompiled RN 경로에서는 source 수정만으로 반영되지 않으므로 `ios.buildReactNativeFromSource: true`가 필요함.
- Expo dev build 재빌드가 필요하며 JS Reload로 반영되지 않음.
- CPU/GPU/전력 사용 증가 가능성.
- 향후 RN 업데이트 및 animation backend 변경과 충돌 가능성.
- 실제 built Info.plist의 opt-in 확인이 선행되어야 함.

현재 판단: **Deferred**. 이 문서 작성 과정에서도 source patch, package 변경, native 설정 변경, prebuild 또는 build를 실행하지 않았다.

## 13. 향후 재조사 체크리스트

- [ ] 1. Expo / RN / react-native-screens 업데이트 후 재현을 확인한다.
- [ ] 2. iOS 업데이트 후 재현을 확인한다.
- [ ] 3. 실제 iPhone 설치 build에 대응하는 .app의 Info.plist에서 CADisableMinimumFrameDurationOnPhone을 확인하고 build ID/시각을 기록한다.
- [ ] 4. Instruments의 동일 경로에서 8.33ms vs 16.67ms를 재측정하고 trace를 보관한다.
- [ ] 5. 다른 Map logic을 고정한 채 MapView만 단독으로 mount/unmount하는 더 좁은 A/B를 수행한다.
- [ ] 6. RN release notes / issues에서 ProMotion, CADisplayLink, preferredFrameRateRange 관련 변경을 확인한다.
- [ ] 7. 필요할 경우 native frame-rate hint patch를 별도 branch에서만 실험한다.
- [ ] 8. patch 적용 전/후 Place → Detail 전환 및 interactive swipe를 Instruments로 비교한다.
- [ ] 9. 배터리/GPU 영향과 animation 종료 후 cadence를 확인한다.

실험 시 같은 popup ID, route/params, build, 측정 동작을 유지한다. background/foreground 전후 상태와 저전력 모드·발열 조건도 함께 기록하고, 코드 변경 시 완전 Reload로 이전 native view 상태가 실험에 남지 않도록 한다.

## 14. 최종 결론

- 실제 60Hz/120Hz display cadence 차이는 사용자의 Instruments 측정으로 확인됐다.
- 특정 Place UI 성능 문제라는 증거는 현재 약하다.
- 실제 MapScreen 활성 상태 및 app lifecycle과 cadence 변화 사이에 강한 관찰상 연관성이 있다. MapView 단독의 직접 원인은 미확정이다.
- RN 0.86.3의 관련 CADisplayLink 경로에서 명시적인 high-refresh hint는 확인되지 않았다. 앱 전체 60Hz 강제 설정도 발견되지 않았다.
- 직접 root cause는 아직 미확정이다. 실제 설치 build의 plist와 Google SDK 내부 scheduling은 검증하지 못했다.
- native patch는 위험 대비 근거가 부족하여 보류한다.
- 현재는 기능 개발을 계속하고, 향후 Expo/RN/iOS 등 native stack 업데이트 후 재검증한다.

현재 증거만으로 native hint patch가 Place → Detail을 120Hz로 복구할지에 대한 판단: **UNKNOWN**.
