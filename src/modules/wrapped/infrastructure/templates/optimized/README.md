# Optimized Yu-Gi-Oh! Themed Images

These images are used as decorative backgrounds and icons in the Season Wrapped PDF.

## Image Files

| Filename | Purpose | Size | Optimization |
|----------|---------|------|--------------|
| `yugioh_dragon_background.png` | Cover page & summary background | 252 KB | Resized to 400px, 30% quality |
| `yugioh_monster_background.png` | Stats pages background | 252 KB | Resized to 400px, 30% quality |
| `yugioh_battlefield_background.png` | Format pages background | 231 KB | Resized to 400px, 30% quality |
| `yugioh_cards_background.png` | Rivals page background | 191 KB | Resized to 400px, 30% quality |
| `yugioh_chapter_icon.png` | Chapter section icons | 4.6 KB | Resized to 60px, 70% quality |

## Total Size
- **Original images**: ~3 MB
- **Optimized images**: ~900 KB
- **Space saved**: ~70% reduction

## Usage

Images are loaded as base64 in `templateRenderer.ts` and applied as:
- Page backgrounds at 6% opacity with blue tint filter
- Chapter icons at 40px size next to section headings

## Original Source
Original PNG files were sourced from Yu-Gi-Oh! artwork and optimized using ImageMagick.
