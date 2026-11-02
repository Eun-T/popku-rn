# 홈 카테고리 이미지

이 폴더(`C:\dev\popku-rn\assets\images\home-categories`)에 다음 PNG 6개를 추가합니다.

- `all.png`
- `korea.png`
- `japan.png`
- `fashion.png`
- `beauty.png`
- `fnb.png`

정사각형 이미지를 사용하며 앱에서는 64 × 64dp 원형으로 잘라 표시합니다.
파일이 없는 현재 상태에서는 원형 아이콘 플레이스홀더를 표시합니다.
플레이스 탐색용 WebP 파일은 기존 `assets/images/categories/` 폴더에 유지합니다.

파일을 추가한 뒤 `src/components/home/HomeCategoryShortcuts.tsx`의 `categoryImages`를 다음과 같이 변경합니다.
준비된 항목만 하나씩 등록해도 됩니다. **실제 존재하는 파일만 등록하세요.**

```tsx
const categoryImages: Partial<Record<CategoryId, ImageSourcePropType>> = {
  all: require('../../../assets/images/home-categories/all.png'),
  korea: require('../../../assets/images/home-categories/korea.png'),
  japan: require('../../../assets/images/home-categories/japan.png'),
  fashion: require('../../../assets/images/home-categories/fashion.png'),
  beauty: require('../../../assets/images/home-categories/beauty.png'),
  fnb: require('../../../assets/images/home-categories/fnb.png'),
};
```
