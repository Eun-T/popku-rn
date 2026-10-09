# POPKU 회원탈퇴 사전 조사 및 추천 설계

- 조사일: 2026-10-07
- 상태: **조사·설계 제안. 아직 구현하지 않음.**
- 조사 대상: `C:/dev/popku-rn`, `C:/dev/popku-be`
- 근거: 저장소의 SQL, 백엔드 코드, 관련 문서. 운영 DB의 실제 FK는 직접 조회하지 않음.
- 조사 과정에서 코드·DB·설정 파일을 변경하지 않았으며, migration을 생성하거나 적용하지 않음.
- 이 문서는 조사 결과를 보관하기 위해 작성한 것이며, 아래 제안을 확정된 구현이나 운영 정책으로 기록하지 않음.

## 요청한 탈퇴 정책

1. email 제거/익명화, password·provider_id 제거, 기존 nickname으로 식별 불가, 모든 refresh token 폐기.
2. 관심 팝업 및 본인이 누른 글·리뷰 좋아요 삭제.
3. QUESTION/FREE 게시글 삭제, 연결 이미지도 S3에서 삭제.
4. 방문 리뷰와 리뷰 이미지는 유지하고 작성자는 `탈퇴한 사용자`로 표시.
5. 댓글·대댓글 유지, 작성자는 `탈퇴한 사용자`로 표시. 다른 사용자의 대화 구조를 깨뜨리지 않음.
6. 탈퇴한 기존 계정으로 로그인 불가.
7. 같은 이메일 또는 동일 Google 계정으로 새 계정 재가입을 허용할 수 있는 구조.

## 조사 결론

**A 방식인 사용자 행 유지 + 개인정보 제거 + 탈퇴 상태 전환을 추천한다.** 현재 리뷰·댓글이 users와 직접 연결되어 있으므로 작성자 참조를 유지하는 편이 변경 범위와 데이터 손실 위험을 줄인다.

단, **일반 게시글을 물리 삭제하면서 그 글의 댓글까지 보존하려면 댓글 연결 구조도 변경해야 한다.** 사용자 익명화만으로는 모든 정책을 충족하지 못한다.

## 현재 users 구조

현재 users에는 탈퇴 상태 컬럼이 없다.

| 항목 | 현재 정의 |
|---|---|
| `id` | BIGINT AUTO_INCREMENT PK |
| `email` | VARCHAR(255), NOT NULL, UNIQUE |
| `password` | VARCHAR(255), nullable |
| `nickname` | VARCHAR(50), NOT NULL, UNIQUE |
| `profile_image_key` | VARCHAR(500), nullable |
| `provider` | LOCAL/GOOGLE/KAKAO/NAVER/APPLE enum, NOT NULL |
| `provider_id` | VARCHAR(255), nullable |
| `role` | USER/ADMIN enum |
| `created_at`, `updated_at` | 생성·수정 시각 |
| `(provider, provider_id)` | UNIQUE |

근거: [002_tables.sql](../../popku-be/src/main/resources/sql/init/002_tables.sql)

## users 물리 삭제의 영향

### users(id)를 참조하는 모든 FK

아래는 저장소 SQL에서 확인한 모든 users 참조 FK다. 확인한 migration에는 이 삭제 정책을 변경하는 SQL이 없다. 운영 DB와 일치하는지는 적용 전 별도 확인해야 한다.

| 테이블 / 컬럼 | 현재 ON DELETE | 결과 |
|---|---|---|
| `posts.user_id` | CASCADE | 작성 게시글 삭제 |
| `reviews.user_id` | CASCADE | 작성 리뷰 삭제 |
| `comments.user_id` | CASCADE | 작성 댓글·답글 삭제 |
| `comments.reply_to_user_id` | SET NULL | 살아남은 답글의 멘션 대상 연결 해제 |
| `favorites.user_id` | CASCADE | 관심 팝업 삭제 |
| `post_likes.user_id` | CASCADE | 누른 게시글 좋아요 삭제 |
| `review_likes.user_id` | CASCADE | 누른 리뷰 좋아요 삭제 |
| `comment_likes.user_id` | CASCADE | 누른 댓글 좋아요 삭제 |
| `refresh_tokens.user_id` | CASCADE | 모든 refresh token 행 삭제 |
| `user_consents.user_id` | CASCADE | 약관·개인정보·마케팅 동의 행 삭제 |
| `reports.reporter_user_id` | CASCADE | 본인이 제출한 신고 삭제 |
| `inquiries.user_id` | CASCADE | 본인 문의 삭제 |
| `notifications.recipient_user_id` | CASCADE | 본인에게 온 알림 삭제 |
| `notifications.actor_user_id` | SET NULL | 다른 사용자의 알림에서 행위자 연결 해제 |
| `push_tokens.user_id` | CASCADE | 기기 push token 삭제 |
| `notification_settings.user_id` | CASCADE | 알림 설정 삭제 |
| `user_blocks.blocker_user_id` | CASCADE | 본인이 설정한 차단 삭제 |
| `user_blocks.blocked_user_id` | CASCADE | 다른 사용자가 해당 계정을 차단한 관계 삭제 |
| `edit_requests.user_id` | SET NULL | 장소 수정 요청은 남고 작성자 연결 해제 |

### 추가로 발생하는 연쇄 삭제

| 시작점 | 추가로 삭제되는 데이터 |
|---|---|
| 게시글 삭제 | post_images, 해당 글의 모든 post_likes, 해당 글의 모든 사용자 댓글·답글 |
| 리뷰 삭제 | review_images, 해당 리뷰의 모든 review_likes, 해당 리뷰의 모든 사용자 댓글·답글 |
| 부모 댓글 삭제 | 다른 사용자가 작성한 답글도 parent_comment_id CASCADE로 삭제 |
| 댓글 삭제 | 해당 댓글의 모든 comment_likes 삭제 |

**이미지 테이블 행이 삭제되어도 S3 객체는 삭제되지 않는다.** DB CASCADE는 Java 이미지 정리 코드를 호출하지 않는다.

reports.target_id와 notifications.target_id에는 대상 게시글·리뷰·댓글 FK가 없다. 삭제된 대상을 가리키는 행이 자동 정리된다고 볼 수 없다.

근거: [002_tables.sql](../../popku-be/src/main/resources/sql/init/002_tables.sql)

## A / B 방식 비교

| 항목 | A. 사용자 행 익명화 | B. 사용자 행 물리 삭제 |
|---|---|---|
| 리뷰·댓글 작성자 FK | 기존 ID 유지 가능 | nullable 변경 또는 별도 작성자 구조 필요 |
| 현재 JOIN users 조회 | 유지 가능 | LEFT JOIN·탈퇴 작성자 구분 로직 필요 |
| 댓글 멘션 대상 | 연결 유지하면서 탈퇴 표시 가능 | SET NULL만으로 탈퇴 여부 구분 불가 |
| 리뷰 UNIQUE | 기존 사용자별 관계 유지 | 공용 탈퇴 계정으로 옮기면 같은 장소 리뷰끼리 충돌 가능 |
| 개인정보 제거 | 명시적 익명화 UPDATE 필요 | 사용자 행에서는 제거되지만 종속 데이터 점검 필요 |
| 재가입 | email/provider_id 해제 후 새 ID 발급 | 새 ID 발급 |
| 기존 JWT 차단 | 탈퇴 상태 검사 필수 | 사용자 행 부재로 차단 가능 |
| 변경 범위 | 상대적으로 작음 | FK·조회·DTO·멘션 변경이 큼 |

B도 가능하지만 현재 reviews.user_id, comments.user_id의 NOT NULL/CASCADE와 여러 INNER JOIN을 함께 변경해야 한다.

A에서도 기존 ID, 콘텐츠, 이미지 key가 남는다. 모든 연결성이 사라지는 완전한 익명화라고 표현하기보다는 **계정의 개인정보 제거 및 탈퇴 처리**로 설명하는 것이 정확하다.

## 현재 인증·공개 표시·S3 구현

- JWT 요청마다 CustomUserDetailsService.loadUserById()가 DB 사용자를 조회한다. 탈퇴 상태 검사를 추가하면 기존 access token도 이후 요청부터 차단할 수 있다.
- PopkuPrincipal.isEnabled()는 현재 항상 true다.
- refresh rotation은 사용자 상태를 확인하지 않고 새 refresh token을 생성한다.
- Google 로그인은 `(GOOGLE, provider_id)`가 존재하면 기존 계정 ID를 반환한다.
- `/api/users/me`는 현재 사용자 정보를 반환하며 탈퇴 상태 검사가 없다.
- 공개 리뷰·댓글은 users.nickname과 profile_image_key를 읽는다. 멘션도 대상 사용자의 현재 nickname을 조회한다.
- 게시글 삭제는 이미지 key를 먼저 확보하고 DB 커밋 후 S3 삭제를 수행한다.
- S3 삭제 실패는 로그만 남기며 영속적인 재시도 작업은 없다.

근거:

- [JwtAuthenticationFilter.java](../../popku-be/src/main/java/org/popku/security/filter/JwtAuthenticationFilter.java)
- [CustomUserDetailsService.java](../../popku-be/src/main/java/org/popku/security/service/CustomUserDetailsService.java)
- [PopkuPrincipal.java](../../popku-be/src/main/java/org/popku/security/principal/PopkuPrincipal.java)
- [RefreshTokenService.java](../../popku-be/src/main/java/org/popku/security/service/RefreshTokenService.java)
- [GoogleAuthService.java](../../popku-be/src/main/java/org/popku/security/service/GoogleAuthService.java)
- [UserController.java](../../popku-be/src/main/java/org/popku/users/controller/UserController.java)
- [ReviewMapper.xml](../../popku-be/src/main/resources/org/popku/community/mapper/ReviewMapper.xml)
- [CommunityCommentMapper.xml](../../popku-be/src/main/resources/org/popku/community/mapper/CommunityCommentMapper.xml)
- [CommunityPostEditService.java](../../popku-be/src/main/java/org/popku/community/service/CommunityPostEditService.java)
- [CommunityImageCleanup.java](../../popku-be/src/main/java/org/popku/community/service/CommunityImageCleanup.java)
- [S3PopupImageStore.java](../../popku-be/src/main/java/org/popku/admin/popup/service/S3PopupImageStore.java)

# 추천 탈퇴 설계

아래 내용은 구현 제안이며 현재 구현된 기능이나 확정된 운영 정책이 아니다.

## DB 변경

### 1. users는 유지하고 deleted_at 추가

- `deleted_at DATETIME NULL` 추가.
- deleted_at IS NULL이면 활성 계정, 값이 있으면 탈퇴 계정.
- email과 nickname을 nullable로 변경하고 기존 UNIQUE 유지.
- status와 deleted_at을 동시에 두기보다는 우선 deleted_at 하나로 판단해 상태 불일치 위험을 줄인다.
- 활성 계정에는 email/nickname이 반드시 존재하도록 서비스 검증 유지. 가능하면 DB CHECK 추가.
- 정지·휴면 등 별도 상태가 필요해지면 그때 확장.

### 2. 리뷰·댓글 작성자 FK 유지

- reviews.user_id, comments.user_id 유지.
- comments.parent_comment_id, reply_to_user_id 유지.
- 탈퇴 때문에 댓글을 삭제하거나 부모 연결을 변경하지 않음.
- 실수로 users를 물리 삭제하는 것을 막기 위해 리뷰·댓글 작성자 FK를 CASCADE에서 RESTRICT로 변경하는 방안 추천.

### 3. 삭제 게시글의 댓글 연결 대상 보존

현재 댓글 CHECK는 post_id 또는 review_id 중 정확히 하나를 요구한다. 단순히 post_id=NULL로 변경할 수 없다.

정책을 문자 그대로 충족하기 위한 제안:

- deleted_post_threads 테이블 추가: 원래 게시글 ID와 삭제 시각만 보관. 원문·이미지·작성자 개인정보는 저장하지 않음.
- comments.deleted_post_thread_id 추가.
- 댓글 대상 CHECK를 살아 있는 게시글 / 리뷰 / 삭제 게시글의 대화 보존용 대상 중 정확히 하나로 확장.
- 게시글 삭제 전에 해당 글의 모든 댓글을 보존용 대상으로 이동.
- 댓글 ID, 작성자, 부모 댓글, 멘션 연결은 유지.

게시글에 deleted_at만 추가하고 본문을 지우는 방식은 더 작게 구현할 수 있지만 게시글 행 물리 삭제와는 다르다. 이 설계는 게시글 행까지 삭제하는 기준이다.

### 4. S3 삭제 작업 테이블 추가

예: image_deletion_jobs.

- 객체 key, 작업 상태, 시도 횟수, 다음 재시도 시각, 마지막 오류, 생성·완료 시각.
- 사용자 탈퇴나 삭제로 작업이 사라지지 않도록 사용자 FK CASCADE에 종속시키지 않음.

## 백엔드 처리 순서

제안 endpoint: 인증된 `DELETE /api/users/me`. 사용자 ID는 body가 아니라 principal에서 가져온다.

하나의 DB 트랜잭션에서:

1. users 행을 FOR UPDATE로 잠그고 활성 상태 확인.
2. 삭제 대상 QUESTION/FREE 게시글과 이미지 key 확보.
3. 해당 게시글의 댓글 전체를 대화 보존용 대상으로 이동.
4. 게시글 이미지 key를 S3 삭제 작업 테이블에 기록.
5. QUESTION/FREE 게시글 삭제. 이미지 DB 행과 해당 글 좋아요는 CASCADE 삭제하며 댓글은 이미 이동했으므로 유지.
6. 본인의 관심 팝업·게시글 좋아요·리뷰 좋아요 삭제.
7. 모든 refresh token 폐기.
8. 개인정보 컬럼 제거 및 deleted_at 기록.
9. 함께 삭제하기로 확정한 부가 데이터 정리.
10. 커밋 후 S3 삭제 작업 실행.

트랜잭션 실패 시 개인정보 제거·콘텐츠 삭제·삭제 작업 등록이 함께 롤백된다. S3 삭제는 커밋 전에 실행하지 않는다.

현재 게시글 삭제 메서드는 댓글을 CASCADE 삭제하고 관련 댓글 신고도 정리한다. 탈퇴 처리에서 그대로 호출하지 않고 댓글 보존 순서를 가진 별도 처리가 필요하다.

이미지 없는 게시글 생성, 좋아요, 댓글 생성 등도 사용자 잠금 후 활성 상태를 확인해야 한다. 현재 일부 코드는 사용자 잠금 없이 대상 게시글·리뷰만 잠근다.

잠금 순서는 가능한 한 사용자 → 게시글/리뷰 → 종속 데이터로 통일하고 여러 대상을 잠글 때 ID 순서를 고정한다.

## 익명화할 컬럼

| 컬럼 | 추천 탈퇴 후 값 | 이유 |
|---|---|---|
| email | NULL | 개인정보 제거·동일 이메일 재가입 허용 |
| password | NULL | 기존 LOCAL 인증 제거 |
| provider_id | NULL | Google 연결 해제·재가입 허용 |
| nickname | NULL | 기존 닉네임 제거·UNIQUE 해제 |
| profile_image_key | NULL | 프로필 연결 제거 |
| provider | LOCAL 등 고정 기본값 | 필요 없는 기존 로그인 구분 정보 최소화 |
| role | USER | 과거 ADMIN 권한 제거 |
| deleted_at | 탈퇴 시각 | 인증·공개 표시 판단 |
| id | 유지 | 리뷰·댓글 참조 유지 |

password는 이미 nullable이므로 별도 nullable 변경이 필요 없다.

nickname을 모든 탈퇴 계정에서 `탈퇴한 사용자`로 UPDATE하면 UNIQUE 충돌이 발생한다. DB nickname은 NULL로 지우고 공개 DTO에서 표시명을 반환한다.

email을 가짜 주소로 대체할 필요도 없다. nullable로 변경하면 UNIQUE를 유지하면서 탈퇴 계정들의 NULL을 허용할 수 있다.

## 삭제할 데이터

요청 정책에 따라 삭제할 항목:

- 본인의 favorites.
- 본인이 누른 post_likes, review_likes.
- 본인의 QUESTION/FREE posts와 post_images.
- 게시글에 연결된 실제 S3 이미지.
- 본인의 모든 refresh_tokens.

refresh token은 revoked_at만 남기는 방식도 이미 지원하지만 별도 보관 목적이 없다면 행 삭제로 token hash와 device ID도 함께 제거하는 것을 추천한다.

아래 항목은 이번 정책에 명시되지 않았으므로 최종 결정이 필요하다.

| 항목 | 추천 기본안 / 결정 사항 |
|---|---|
| comment_likes | 개인 활동으로 함께 삭제 추천 |
| push_tokens, notification_settings | 함께 삭제 추천 |
| 받은 notifications | 함께 삭제 추천 |
| 다른 사용자 알림의 actor_user_id | NULL 처리. title/message에 과거 닉네임이 있는지도 점검 |
| user_blocks | 양방향 관계 삭제 추천 |
| user_consents | 삭제 또는 최소 기록 보관 여부·기간 결정 필요 |
| 본인이 제출한 reports | 운영 기록 보존 여부·기간 결정 필요 |
| inquiries | 문의 본문의 개인정보를 포함해 삭제/보관 정책 결정 필요 |
| edit_requests | 작성자 연결 해제 및 본문 보관 정책 결정 필요 |

신고·문의·알림 본문은 자유 텍스트다. users 컬럼 제거만으로 그 안의 개인정보까지 제거되는 것은 아니다.

DB enum에는 ON_SITE_INFO도 있다. 현재 작성 API는 QUESTION/FREE만 허용하지만 기존 ON_SITE_INFO 데이터가 있다면 처리 정책을 별도 확인해야 한다.

## 유지할 데이터

- 기존 ID를 가진 탈퇴 사용자 행.
- 방문 리뷰 원문·별점·작성일.
- review_images 및 실제 리뷰 S3 이미지.
- 유지되는 콘텐츠에 대한 다른 사용자의 좋아요.
- 댓글·대댓글 원문·ID·부모 관계.
- 댓글 작성자 연결과 멘션 대상 연결.
- 삭제 게시글의 대화 보존용 대상.

공개 응답의 탈퇴 작성자 처리:

- nickname: `탈퇴한 사용자`.
- avatarUrl: null.
- isOwner: false.
- 탈퇴한 멘션 대상도 `탈퇴한 사용자`로 표시.

Community 피드, 팝업 리뷰 목록, 리뷰 상세, 댓글 목록과 멘션 대상 조회를 모두 확인해야 한다. 리뷰 조회에서 탈퇴 사용자를 JOIN 조건으로 제외하면 리뷰도 사라지므로 작성자 표시만 바꾼다.

기존 작성자 ID는 내부 관계를 위해 유지할 수 있지만 공개 DTO에서도 노출할지는 별도 결정이다. ID와 S3 key에 남은 사용자 ID로 콘텐츠 간 연결이 가능하다는 점을 알고 선택해야 한다.

## 재가입 처리

기존 계정을 복구하지 않고 새 users ID로 가입한다.

- LOCAL: 기존 email이 NULL이므로 동일 이메일 신규 가입 가능.
- GOOGLE: 기존 provider_id가 NULL이므로 동일 Google subject 신규 가입 가능.
- 기존 nickname도 제거하므로 재사용 가능.
- 신규 가입 시 이메일 인증 또는 Google 검증, 닉네임 입력, 필수 동의를 다시 수행.
- 기존 리뷰·댓글·관심 팝업을 새 계정에 자동 연결하지 않음.

reviews의 `(user_id, place_id)` UNIQUE는 유지된다. 새 ID이므로 같은 팝업에 새 리뷰를 작성할 수 있는 구조이며 이를 허용할지는 운영 정책에서 확인해야 한다.

Google 인증 후 신규 가입 절차로 들어가는 것과 탈퇴한 기존 계정으로 로그인되는 것은 구분해야 한다.

## 인증 차단

| 경로 | 필요한 처리 |
|---|---|
| LOCAL 로그인 | 활성 사용자만 인증 |
| JWT 인증 | ID 조회 후 deleted_at 확인, 탈퇴 계정은 401 |
| refresh | 사용자 상태 확인 후에만 rotation·발급 |
| Google 로그인 | 탈퇴 계정 ID로 토큰 발급 금지 |
| /api/users/me | 탈퇴 계정 반환 금지 |
| 닉네임 변경·활동 생성 | 트랜잭션 안에서 활성 상태 재확인 |
| 이미지 presign·업로드 연결 | 탈퇴 계정의 신규 발급·게시 금지 |

PopkuPrincipal.isEnabled()도 상태를 반영해야 한다. 다만 현재 JWT 필터는 principal을 직접 인증 객체에 넣으므로 isEnabled 변경만으로 충분하지 않다. loadUserById()에서 명시적으로 거부해야 한다.

토큰 발급·refresh와 탈퇴가 동시에 실행될 때 사용자 행 잠금을 공유해야 한다. 기존 refresh를 먼저 읽고 나중에 회전한다면 잠금 이후 token과 사용자 상태를 다시 확인한다.

이미 인증을 통과해 실행 중인 요청은 JWT 검사만으로 취소되지 않는다. 쓰기 트랜잭션의 상태 확인이 필요하다.

RN에서는 탈퇴 성공 후 기존 clearTokens()로 SecureStore와 메모리 인증 상태를 정리할 수 있다.

근거: [RN auth.ts](../src/lib/auth.ts), [PopkuPrincipal.java](../../popku-be/src/main/java/org/popku/security/principal/PopkuPrincipal.java)

## S3 처리

게시글 이미지 실제 삭제는 가능하다. 기존 S3 구현에 DeleteObject가 있다.

- 게시글 삭제 전에 정확한 image key 확보.
- DB 트랜잭션 안에서 삭제 작업 영속 기록.
- 커밋 후 worker가 S3 삭제.
- 실패 시 재시도, 반복 실패는 운영자가 확인할 수 있게 기록.
- 재시도 전에 살아 있는 이미지 참조 여부 확인.
- 삭제 성공 전까지 완료로 기록하지 않음.

리뷰 이미지는 `community/reviews/{userId}/...` 경로와 review_images를 유지한다. 사용자 탈퇴 시 전체 사용자 이미지 경로를 일괄 삭제하면 안 된다.

현재 PUT presigned URL은 10분간 유효하다. 탈퇴 이전 발급 URL로 뒤늦게 업로드하면 먼저 삭제한 객체가 다시 생길 수 있다.

추가로 필요한 처리:

- presign 발급과 탈퇴를 사용자 잠금으로 직렬화.
- 탈퇴 시점에 이미 유효한 URL의 만료 이후 추가 정리 실행.
- 게시글 이미지 prefix만 대상으로 미연결 업로드 점검.
- 리뷰에 연결된 이미지와 게시글 이미지를 분리해 처리.

현재 업로드 grant 전체를 DB에 기록하는 구조는 없다. 미연결 이미지 정리에는 제한된 prefix 조회 권한 또는 업로드 기록 구조가 추가로 필요하다.

S3 실패 때문에 탈퇴 DB 트랜잭션을 되돌리지 않는다. 개인정보 제거와 인증 차단은 완료하고 이미지 삭제를 재시도한다.

버킷 versioning·Object Lock·lifecycle 설정은 확인하지 않았다. versioning이 켜져 있다면 현재 DeleteObject만으로 과거 버전까지 제거되는지 별도 확인해야 한다.

근거: [CommunityImageService.java](../../popku-be/src/main/java/org/popku/community/service/CommunityImageService.java), [ReviewImageService.java](../../popku-be/src/main/java/org/popku/community/service/ReviewImageService.java), [S3PopupImageStore.java](../../popku-be/src/main/java/org/popku/admin/popup/service/S3PopupImageStore.java)

## 예상 migration

실제 SQL은 작성하지 않았다. 예상 범위:

1. 사용자 탈퇴 상태: users.deleted_at 추가, email/nickname nullable 변경, 활성 사용자 필수값 CHECK 검토, 리뷰·댓글 작성자 FK RESTRICT 변경.
2. 삭제 게시글 댓글 보존: deleted_post_threads 생성, comments.deleted_post_thread_id와 FK/index 추가, chk_comments_target 확장.
3. 이미지 삭제 재시도: image_deletion_jobs 생성, 작업 상태·재시도 시각 index 추가.

적용 전 운영 DB에서 실제 FK·CHECK·UNIQUE와 적용된 migration을 조회한다. 기존 활성 사용자는 deleted_at=NULL로 유지하며 사전 migration에서 콘텐츠를 삭제하지 않는다.

## 주의할 FK

- reviews.user_id: 현재 CASCADE이므로 users 물리 삭제 금지.
- comments.user_id: 현재 CASCADE이므로 사용자 익명화로 보존.
- comments.parent_comment_id: 부모 삭제 시 다른 사용자 답글도 삭제. 탈퇴 과정에서 부모 댓글 삭제 금지.
- comments.post_id: 게시글 삭제 전 댓글 대상 이동 필수.
- comments.review_id: 리뷰를 삭제하지 않으면 유지 가능.
- comments.reply_to_user_id: A에서는 연결 유지 후 탈퇴 표시 가능.
- reviews(user_id, place_id) UNIQUE: 여러 탈퇴자를 하나의 공용 계정으로 합치면 충돌 가능.
- reports.target_id: FK가 없어 명시적 정리 필요. 유지한 댓글 신고를 기존 게시글 삭제 로직으로 함께 지우지 않도록 주의.
- notifications.target_id: 대상 삭제 시 자동 정리되지 않음.
- 이미지 FK: DB 행 삭제와 S3 객체 삭제는 별도 처리.

삭제 게시글의 댓글을 DB에 보존하는 것과 화면에서 계속 보여주는 것은 별개다. 현재 댓글 API는 게시글이 존재해야 조회된다. 보존된 대화를 열람하게 할지, 읽기 전용으로 제공할지는 추가 결정이 필요하다. 열람을 유지하려면 삭제 게시글 대화 대상을 조회하는 API 처리도 추가해야 한다.

기존 문서의 탈퇴 멘션 예시는 `@탈퇴한회원`이고 이번 요청은 `탈퇴한 사용자`다. 구현할 때 이번 정책에 맞게 표현을 통일해야 한다.

근거: [DECISIONS.md](DECISIONS.md)

## 구현해야 할 파일

백엔드 경로는 `C:/dev/popku-be/src/main/` 기준이다. 신규 파일명은 제안이다.

| 영역 | 대상 |
|---|---|
| DB | resources/sql/init/002_tables.sql, 신규 migration |
| 사용자 모델·조회 | java/org/popku/users/domain/User.java, UserMapper.java, UserMapper.xml |
| 탈퇴 처리 | 신규 UserWithdrawalService, UserWithdrawalMapper |
| 탈퇴 API | 기존 users/controller/UserController.java |
| API 접근 제어 | security/config/SecurityConfig.java |
| 인증 상태 검사 | CustomUserDetailsService.java, PopkuPrincipal.java |
| 로그인·토큰 동시성 | AuthController.java, GoogleAuthService.java, RefreshTokenService.java, refresh mapper |
| 탈퇴 작성자 표시 | CommunityFeedMapper.xml, ReviewMapper.xml, CommunityCommentMapper.xml 및 필요한 Row/DTO 변환 |
| 댓글 보존·조회 | CommunityCommentMapper, 필요 시 CommunityCommentService |
| 탈퇴 후 쓰기 방지 | 게시글·리뷰·댓글·좋아요·관심 팝업·이미지 발급/연결 서비스의 활성 상태 검사 |
| 이미지 정리 | 신규 삭제 작업 mapper·service·worker, 기존 PopupImageStore 재사용 |
| RN 후속 연결 | 기존 인증 상태 정리 함수와 탈퇴 API 호출 연결 |
| 테스트 | FK 보존, 재가입, 기존 JWT/refresh 차단, 동시 요청, S3 실패·재시도·지연 업로드 |

### 핵심 검증 시나리오

- 탈퇴자의 부모 댓글에 달린 다른 사용자 답글 보존.
- 삭제 게시글에 달린 모든 사용자 댓글·대댓글 보존.
- 리뷰·이미지 유지와 탈퇴 작성자·멘션 표시.
- 동일 이메일/Google 계정 재가입 시 새 ID 발급 및 과거 활동 자동 연결 금지.
- 기존 access token과 모든 refresh token 차단.
- 탈퇴 직전 시작된 요청이 탈퇴 후 활동이나 token을 생성하지 못함.
- S3 실패 중에도 개인정보 제거·기존 계정 인증 차단 유지.
- DB 롤백 시 S3 이미지가 삭제되지 않음.
- 삭제 worker 재시도 및 presigned URL 지연 업로드 정리.

## 아직 결정할 항목

- 게시글 물리 삭제와 대화 보존용 대상 도입 여부.
- 삭제 게시글 대화의 공개·읽기 전용 조회 여부.
- 재가입자가 같은 팝업에 다시 리뷰를 쓸 수 있는지.
- 공개 DTO의 탈퇴 작성자 ID 노출 여부.
- 댓글 좋아요, 차단, 알림, push token 등 부가 데이터 삭제 범위.
- 동의·신고·문의·장소 수정 요청 기록의 보관 여부와 기간.
- 기존 ON_SITE_INFO 게시글 처리.
- S3 버킷 versioning/Object Lock/lifecycle 및 미연결 업로드 정리 방법.

## 작업 및 검증 상태

조사·설계만 수행했으며 기능 코드 수정, migration 생성·적용, DB 변경, 패키지 설치를 하지 않았다. 조사 및 문서 저장 작업이므로 타입체크와 테스트는 실행하지 않았다.


-------------------------------------------------------------------------------------------

# 회원탈퇴 정책 및 처리 플로우

## 1. 기본 원칙

POPKU의 회원탈퇴는 `users` 행을 물리적으로 삭제하지 않는다.

탈퇴 사용자가 작성한 방문 리뷰 및 일부 댓글을 유지해야 하므로,
기존 `users.id`는 유지하고 개인정보와 인증정보를 제거한 뒤
`deleted_at`을 기록하는 방식으로 처리한다.

탈퇴 여부:

- `deleted_at IS NULL` → 활성 사용자
- `deleted_at IS NOT NULL` → 탈퇴 사용자

별도의 ACTIVE / DELETED 상태 컬럼은 사용하지 않는다.

---

## 2. 회원탈퇴 API

`DELETE /api/users/me`

- 인증된 사용자만 호출 가능
- userId는 요청 Body/Query로 받지 않고 현재 Principal에서 가져온다.
- 성공: `204 No Content`
- 탈퇴 완료 후 기존 계정의 인증 요청: `401 Unauthorized`

---

## 3. 전체 처리 플로우

    [사용자]
    설정
      ↓
    회원탈퇴
      ↓
    탈퇴 안내 확인
      ↓
    회원탈퇴 버튼
      ↓
    최종 확인 Alert
      ↓
    "탈퇴하기"
      ↓
    DELETE /api/users/me
      ↓
    ─────────────────────────────
              Backend
    ─────────────────────────────
      ↓
    사용자 행 Lock + 활성 상태 확인
      ↓
    QUESTION/FREE 게시글 이미지 Key 확보
      ↓
    QUESTION/FREE 게시글 삭제
      ↓
    해당 글의 이미지 DB row / 좋아요 / 댓글 / 대댓글 CASCADE 삭제
      ↓
    관심 팝업 / 내가 누른 좋아요 등 개인 활동 삭제
      ↓
    user_consents / inquiries 삭제
      ↓
    reports 신고자 연결 제거
      ↓
    edit_requests 작성자 연결 제거
      ↓
    Refresh Token 등 인증 관련 데이터 삭제
      ↓
    users 개인정보 익명화
      ↓
    deleted_at 기록
      ↓
    DB Transaction Commit
      ↓
    삭제 대상 QUESTION/FREE 게시글 이미지 S3 삭제 시도
      ↓
    204 No Content
      ↓
    ─────────────────────────────
                 RN
    ─────────────────────────────
      ↓
    clearTokens()
      ↓
    Access Token 삭제
    Refresh Token 삭제
    SecureStore 정리
    메모리 User/Auth 상태 정리
      ↓
    로그아웃 상태
      ↓
    /profile 이동

---

## 4. users 처리

`users` 행 자체는 유지한다.

| 컬럼 | 탈퇴 후 |
|---|---|
| id | 유지 |
| email | NULL |
| password | NULL |
| provider_id | NULL |
| nickname | NULL |
| profile_image_key | NULL |
| role | USER |
| deleted_at | 탈퇴 시각 |

DB의 nickname에 `"탈퇴한 사용자"`를 직접 저장하지 않는다.

실제 nickname은 `NULL`로 제거하고,
공개 API 응답에서 `deleted_at IS NOT NULL`인 경우에만
`"탈퇴한 사용자"`로 표시한다.

이유:

- 기존 개인정보 제거
- email/nickname UNIQUE 해제
- 동일 이메일/nickname 재가입 가능
- 리뷰/댓글의 기존 user_id FK 유지
- 여러 탈퇴 계정의 nickname UNIQUE 충돌 방지

---

## 5. 질문 / 자유 게시글

탈퇴 사용자가 작성한 `QUESTION`, `FREE` 게시글은 삭제한다.

게시글 삭제 시 해당 글에 종속된 데이터도 함께 삭제한다.

    QUESTION/FREE 게시글
              ↓
            삭제
              ↓
      ┌───────┼────────┐
      ↓       ↓        ↓
    이미지   좋아요   댓글/대댓글
    DB row   삭제      삭제
    삭제

해당 게시글에 다른 사용자가 작성한 댓글/대댓글이 있어도
게시글 삭제 시 함께 삭제되는 것을 허용한다.

따라서 삭제된 게시글의 댓글을 보존하기 위한
`deleted_post_threads` 같은 별도 구조는 사용하지 않는다.

---

## 6. 질문 / 자유 게시글 S3 이미지

게시글을 DB에서 삭제하기 전에 이미지 S3 Object Key를 확보한다.

처리 순서:

    이미지 Key 확보
        ↓
    DB 게시글 삭제
        ↓
    DB Transaction Commit
        ↓
    S3 DeleteObject 시도

S3 삭제가 실패하더라도 이미 완료된 회원탈퇴 DB Transaction은
Rollback하지 않는다.

즉:

    DB 회원탈퇴 성공
    +
    S3 이미지 삭제 실패
        ↓
    회원탈퇴 상태는 그대로 유지
        ↓
    S3 삭제 실패 로그 기록

현재 S3 삭제 실패에 대한 자동 재시도 기능은 없다.

따라서 일시적인 S3 삭제 실패가 발생하면
사용되지 않는 고아(orphan) 이미지가 S3에 남을 가능성이 있다.

현재는 실패 로그를 남기고,
추후 필요할 경우 다음을 추가할 수 있다.

- S3 삭제 작업 DB 저장
- 자동 재시도 Worker / Queue
- 고아 이미지 정기 Cleanup
- 운영 오류 모니터링 및 알림

---

## 7. 방문 리뷰

탈퇴 사용자가 작성한 방문 리뷰는 삭제하지 않는다.

유지:

- reviews row
- rating
- content
- created_at
- review_images
- 실제 S3 리뷰 이미지
- 다른 사용자가 해당 리뷰에 누른 좋아요
- 기존 reviews.user_id

표시 예시:

    탈퇴 전

    venzire
    ★★★★★ 5.0
    재밌게 보고 왔어요.

            ↓ 회원탈퇴

    탈퇴한 사용자
    ★★★★★ 5.0
    재밌게 보고 왔어요.

공개 API에서는 작성자가 탈퇴 상태이면:

- `nickname = "탈퇴한 사용자"`
- `avatarUrl = null`

리뷰 이미지 역시 리뷰가 유지되므로 S3에서 삭제하지 않는다.

---

## 8. 댓글 / 대댓글

### 8-1. 탈퇴 사용자가 작성한 QUESTION/FREE 글의 댓글

탈퇴 사용자의 QUESTION/FREE 게시글 자체가 삭제되면
그 글에 달린 댓글/대댓글도 모두 삭제한다.

댓글 작성자가 다른 사용자여도 동일하다.

    탈퇴 사용자의 글
      ├─ 다른 사용자 댓글
      │    └─ 다른 사용자 대댓글
      └─ 다른 사용자 댓글

              ↓ 탈퇴

            전부 삭제

### 8-2. 탈퇴 사용자가 다른 사람 글에 작성한 댓글

다른 사용자의 살아있는 게시글에
탈퇴 사용자가 작성한 댓글/대댓글은 삭제하지 않는다.

작성자 관계는 기존 userId로 유지하고,
공개 API에서 작성자 이름만 `"탈퇴한 사용자"`로 표시한다.

    철수의 게시글

    탈퇴한 사용자
    저도 어제 다녀왔어요.

### 8-3. 유지되는 리뷰 등에 작성한 댓글

유지되는 리뷰 등에 탈퇴 사용자가 작성한 댓글이 존재하면
해당 댓글 역시 유지한다.

댓글/대댓글의 기존 parent/reply 관계도 유지한다.

탈퇴 사용자를 대상으로 한 멘션은
공개 화면에서 `"탈퇴한 사용자"`로 표시한다.

---

## 9. 개인 활동 데이터

탈퇴 시 삭제:

- favorites
- post_likes
- review_likes
- comment_likes
- refresh_tokens
- push_tokens
- notification_settings
- 본인이 받은 notifications
- user_blocks의 양방향 차단 관계
- user_consents
- inquiries

---

## 10. 신고

탈퇴 사용자가 작성한 신고 내용 자체는 유지한다.

단, 탈퇴한 신고자를 식별할 수 없도록 사용자 연결을 제거한다.

    reports 내용 → 유지
    reporter_user_id → NULL

신고 대상 콘텐츠에는 영향을 주지 않는다.

---

## 11. 장소 정보 수정 요청

탈퇴 사용자가 작성한 장소 정보 수정 요청은 유지한다.

    edit_request 내용 → 유지
    user_id → NULL

즉, 제보 내용은 남기되 탈퇴 사용자와의 연결만 제거한다.

---

## 12. 인증 차단

`deleted_at IS NOT NULL`인 사용자는 더 이상 인증된 사용자로 동작할 수 없다.

차단 대상:

- LOCAL 로그인
- 기존 Access JWT
- Refresh Token 발급 / Rotation
- Google 로그인
- `/api/users/me`
- 기타 인증이 필요한 API

JWT 인증 과정에서 사용자 ID로 DB 사용자를 조회하고
`deleted_at`을 확인한다.

따라서 탈퇴 전에 발급된 Access Token이 남아 있어도
탈퇴 완료 후 해당 계정으로 인증할 수 없다.

Refresh Token은 탈퇴 시 DB에서 모두 삭제한다.

결과:

    기존 Access Token
    → deleted_at 검사로 차단

    기존 Refresh Token
    → DB에서 삭제되어 사용 불가

---

## 13. 재가입

회원탈퇴 후 재가입 대기기간은 없다.

재사용 가능:

- 동일 이메일
- 동일 Google 계정
- 동일 nickname

기존 탈퇴 계정을 복구하지 않는다.

재가입 시 항상 새로운 `users` row와 새로운 `userId`를 생성한다.

    기존 계정
    userId = 10
    deleted_at = 탈퇴 시각

            ↓ 재가입

    신규 계정
    userId = 25
    deleted_at = NULL

기존 탈퇴 계정에 남아 있는 리뷰/댓글은
새 계정으로 다시 연결하지 않는다.

따라서 기존 콘텐츠는 계속 `"탈퇴한 사용자"`로 표시된다.

---

## 14. RN 회원탈퇴 플로우

회원탈퇴 화면에서 버튼을 누른 즉시 API를 호출하지 않는다.

먼저 최종 확인 Alert를 표시한다.

    정말 탈퇴하시겠어요?

    탈퇴하면 삭제되는 정보는
    복구할 수 없습니다.

    [취소] [탈퇴하기]

`탈퇴하기`를 선택한 경우에만
`DELETE /api/users/me`를 호출한다.

### 성공

서버에서 `204 No Content`를 받은 경우에만 로컬 인증정보를 제거한다.

    DELETE /api/users/me
            ↓
           204
            ↓
       clearTokens()
            ↓
    Access Token 제거
    Refresh Token 제거
    SecureStore 정리
    메모리 User/Auth 상태 정리
            ↓
       로그아웃 상태
            ↓
         /profile

서버 logout API는 추가 호출하지 않는다.

### 실패

DELETE 요청이 실패하면:

- 로그인 상태 유지
- 로컬 Token 유지
- 오류 Alert 표시
- 재시도 가능

서버 탈퇴가 실패했는데 RN에서 먼저 로그아웃시키면 안 된다.

요청 중에는 중복 탈퇴 요청도 막는다.

---

## 15. 현재 알려진 예외사항

### S3 삭제 실패

QUESTION/FREE 게시글 이미지의 S3 삭제가 실패할 경우
현재 자동 재시도 기능은 없다.

실패 내용은 서버 로그에 기록한다.

회원탈퇴 DB 처리는 정상적으로 완료된 상태를 유지한다.

추후 운영 규모가 커지면 자동 재시도 또는 고아 이미지 Cleanup 시스템을 추가한다.

### 이미 실행 중인 요청

탈퇴 전에 이미 인증 검사를 통과하여 서버에서 실행 중인 요청까지
강제로 취소하지는 않는다.

탈퇴 완료 이후 새롭게 인증되는 요청은 차단된다.

---

## 16. 핵심 정책 요약

    회원탈퇴
    │
    ├─ users
    │   └─ 행 유지
    │       ├─ 개인정보 제거
    │       ├─ 인증정보 제거
    │       └─ deleted_at 기록
    │
    ├─ 질문/자유글
    │   └─ 삭제
    │       ├─ 이미지 DB row 삭제
    │       ├─ 실제 S3 이미지 삭제 시도
    │       ├─ 좋아요 삭제
    │       └─ 해당 글 댓글/대댓글 삭제
    │
    ├─ 방문 리뷰
    │   └─ 유지
    │       ├─ 리뷰 이미지 유지
    │       └─ 작성자 "탈퇴한 사용자"
    │
    ├─ 다른 사람 글에 작성한 댓글
    │   └─ 유지
    │       └─ 작성자 "탈퇴한 사용자"
    │
    ├─ 관심 팝업
    │   └─ 삭제
    │
    ├─ 내가 누른 좋아요
    │   └─ 삭제
    │
    ├─ 인증/세션
    │   └─ 제거 및 차단
    │
    ├─ 신고
    │   └─ 내용 유지 + 신고자 연결 제거
    │
    ├─ 장소 수정 요청
    │   └─ 내용 유지 + 작성자 연결 제거
    │
    └─ 재가입
        └─ 허용
            ├─ 동일 이메일 가능
            ├─ 동일 Google 계정 가능
            ├─ 동일 nickname 가능
            └─ 새로운 userId 생성

---

## 17. 구현 상태

- Backend `DELETE /api/users/me` 구현 완료
- 회원탈퇴 DB migration 작성 완료
- users 익명화 + deleted_at 처리 완료
- QUESTION/FREE 삭제 처리 완료
- 리뷰/댓글 탈퇴 작성자 익명 표시 완료
- 기존 Access JWT 차단 완료
- Refresh Token 차단/삭제 완료
- 동일 이메일 / Google / nickname 재가입 검증 완료
- RN 회원탈퇴 화면 구현 완료
- RN 회원탈퇴 API 연결 완료
- RN SecureStore / Auth state 정리 완료
- Backend 관련 테스트 통과
- RN TypeScript typecheck 통과
- RN 회원탈퇴 관련 테스트 통과
- 실기기 회원탈퇴 테스트 완료
- 실제 DB에서 삭제/유지 결과 확인 완료

현재 정책 기준 회원탈퇴 기능 구현 및 검증 완료.