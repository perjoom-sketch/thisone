# Piki Transparent Asset Workflow

## 1. Purpose

This document defines the safe workflow for replacing Piki image assets with real transparent PNG files.

The current Piki directional animation code uses five asset paths:

- `assets/piki/piki-working-left.png`
- `assets/piki/piki-throwing-left.png`
- `assets/piki/piki-working-right.png`
- `assets/piki/piki-throwing-right.png`
- `assets/piki/piki-annoyed.png`

The JavaScript animation path is already implemented. The remaining issue is asset quality: the files must be true transparent PNGs, not screenshots, JPEGs, RGB PNGs, or images with a checkerboard/white/gray background baked into the pixels.

## 2. Core rule

A usable Piki asset must be:

- PNG file extension: `.png`
- Actual internal format: RGBA or equivalent PNG transparency
- Has an alpha channel
- Background pixels around the character have alpha value `0`
- No checkerboard pattern baked into the image
- No white, gray, or colored square canvas behind the character

A file is not acceptable if:

- It is JPEG
- It is PNG but RGB-only
- It has no alpha channel
- The checkerboard is visible as real image pixels
- The background was flattened during export, upload, mobile save, or messenger transfer

## 3. Do not use these transfer paths

Avoid these paths for transparent Piki assets:

- KakaoTalk photo transfer
- iPhone Photos app round-trip
- Screenshot export
- Gallery share as image
- JPEG conversion
- Any mobile path that changes the file into `.jpeg`

These paths can flatten alpha transparency and convert the asset into RGB or JPEG.

## 4. Recommended transfer path

Use this path instead:

1. Remove the background in Photoshop or another reliable image editor.
2. Export as PNG with transparency enabled.
3. Save to the PC filesystem or a cloud drive as a file, not as a photo.
4. Confirm the filename ends with `.png`.
5. Upload the file directly to GitHub as a file.
6. Run alpha-channel verification before merging.

## 5. Photoshop workflow

When using Photoshop-connected tools or Photoshop desktop:

1. Select the Piki subject.
2. Remove the background.
3. Keep only:
   - Piki character
   - magnifying glass
   - flying papers/cards
   - motion lines
   - sweat/cloud/anger marks
4. Export as PNG with transparency.
5. Do not add a background color.
6. Do not add a square card or canvas behind the character.
7. Do not use a checkerboard as a visual design element.

## 6. Required file names

Keep these exact names so the existing Piki animation code does not need to change:

| State | File path |
| --- | --- |
| Working while looking left | `assets/piki/piki-working-left.png` |
| Throwing while looking left | `assets/piki/piki-throwing-left.png` |
| Working while looking right | `assets/piki/piki-working-right.png` |
| Throwing while looking right | `assets/piki/piki-throwing-right.png` |
| Annoyed reaction | `assets/piki/piki-annoyed.png` |

## 7. Required verification

Before any PR that replaces Piki assets is merged, verify every file.

Example Python check:

```python
from PIL import Image
from pathlib import Path

files = [
    'assets/piki/piki-working-left.png',
    'assets/piki/piki-throwing-left.png',
    'assets/piki/piki-working-right.png',
    'assets/piki/piki-throwing-right.png',
    'assets/piki/piki-annoyed.png',
]

for file in files:
    img = Image.open(file)
    has_alpha = img.mode in ('RGBA', 'LA') or 'transparency' in img.info
    print(file, img.mode, 'has_alpha=', has_alpha)

    if not has_alpha:
        raise SystemExit(f'FAIL: {file} has no alpha channel')

    rgba = img.convert('RGBA')
    w, h = rgba.size
    sample_points = [
        (0, 0),
        (w - 1, 0),
        (0, h - 1),
        (w - 1, h - 1),
        (min(10, w - 1), min(10, h - 1)),
    ]
    alphas = [rgba.getpixel(point)[3] for point in sample_points]
    if any(alpha != 0 for alpha in alphas):
        raise SystemExit(f'FAIL: {file} corner/background alpha is not zero: {alphas}')

print('PASS: all Piki assets have transparent backgrounds')
```

Expected result:

- All five files report `RGBA` or valid transparency.
- No file reports RGB-only.
- Corner/background alpha samples are `0`.

## 8. PR validation checklist

A Piki asset replacement PR should satisfy all of the following:

- Only the five files under `assets/piki/` are replaced, unless a code change is explicitly required.
- The files keep the exact existing names.
- The alpha verification script passes.
- No JavaScript logic changes are included unless necessary.
- No CSS background hacks are added.
- No `mix-blend-mode` workaround is added to hide bad assets.
- No image is converted to JPEG.
- The Piki square background is gone in preview.
- Mobile and desktop layouts remain stable.

## 9. Non-goals

This workflow does not change:

- Piki animation code
- Piki timing
- Search API behavior
- Ranking logic
- Review signal logic
- Ad layout
- General search rendering
- Result cards

## 10. Current known issue

After the directional Piki animation update, the animation code points to the five new asset paths. However, if the actual PNG files are RGB-only or contain a baked-in checkerboard/white-gray background, the Piki image appears with a visible square in the analysis container.

The correct fix is to replace the five image assets with true transparent RGBA PNG files, not to hide the square with CSS.
