# Sign-in brand assets

Retrieved from official sources on 2026-10-09. Assets are bundled locally; the login screen does not fetch remote logos.

- `google-g.png`: unmodified Google G artwork linked by the [Google sign-in branding guidelines](https://developers.google.com/identity/branding-guidelines), from https://developers.google.com/static/identity/images/g-logo.png.
- `apple-logo-white.svg`: unmodified `Logo - SIWA - Left-aligned - White - Medium.svg` from the [Apple Design Resources](https://developer.apple.com/design/resources/) `Logo-Sign-in-with-Apple.dmg` download. Original canvas: 31 × 44, including Apple-supplied padding. The complete canvas scales to the 52dp button height; do not crop it or add vertical padding.
- `../../fonts/google-sans-medium.ttf`: unmodified `build/GoogleSans/static/GoogleSans-Medium.ttf` from [Google Sans v14.000](https://github.com/googlefonts/googlesans/releases/tag/v14.000). Its accompanying SIL Open Font License is `../../fonts/google-sans-OFL.txt`. Loaded only for the Google login caption; other UI fonts are unchanged.

Brand constraints override the requested identical 16dp captions/20dp Apple image box:

- Google Neutral: #F2F2F2, no border, #1F1F1F, Google Sans Medium 14/20; iOS icon-to-caption gap 12dp.
- Apple: system-font caption approximately 43% of button height (22dp at 52dp); black background with white logo/text, at least 8% horizontal margin on the title's trailing side. The full logo canvas is approximately 36.64 × 52dp; the visible original glyph is approximately 18.27 × 22.45dp.
- Both buttons retain 52dp height, full width, 8dp corner radius, medium weight, centered logo-and-caption groups and the previous 12dp vertical button gap. The Apple asset's built-in horizontal padding remains in addition to the group gap.

Custom Apple buttons remain subject to App Review. Check native SVG rendering, localized captions and accessibility font sizes on an iPhone before release.
