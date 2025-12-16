# Trip Feature Design System

## Vietnamese-First Typography

### Font Selection Rationale

All fonts were specifically chosen for **comprehensive Vietnamese diacritical support**, ensuring perfect rendering of complex tone marks and accents (ă, â, ê, ô, ơ, ư, and all tonal marks).

### Font Families

**Display Font (Headers, Titles):**
- **Spectral** - Elegant serif with excellent Vietnamese support
- Usage: Titles, headers, important labels
- Weights: 400, 600, 700, 800
- Letter spacing: Tight (-0.02em) for refined look

**Body Font (Paragraphs, Descriptions):**
- **Noto Serif** - Google's comprehensive serif with full Vietnamese coverage
- Usage: Body text, descriptions, long-form content
- Weights: 400, 600, 700 (plus italic variants)
- Line height: 1.6 for readability

**UI Font (Buttons, Controls, Labels):**
- **Be Vietnam Pro** - Sans-serif designed specifically for Vietnamese
- Usage: Buttons, labels, controls, UI elements
- Weights: 400, 500, 600, 700
- Letter spacing: Wide (0.05em) for button text clarity

### Font Import

```html
<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Noto+Serif:ital,wght@0,400;0,600;0,700;1,400&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
```

## Design Language

### Inspiration
Vintage cartography meets modern Vietnamese typography - warm, elegant, and deeply rooted in historical map aesthetics.

### Color Palette

**Parchment & Paper:**
- `#f4e8d8` - Light parchment
- `#ebe0d0` - Medium parchment
- `#e8d5ba` - Dark parchment

**Metallic Accents:**
- `#d4af37` - Gold (primary accent)
- `#e0bc4a` - Light gold
- `#c4a027` - Dark gold
- `#8b7355` - Bronze

**Inks & Text:**
- `#2b2520` - Dark ink (primary text)
- `#4a3f35` - Medium ink
- `#6b5d52` - Light ink
- `#9b8672` - Lighter ink

**Accent Colors:**
- `#a84848` - Rust (decorative, icons)
- `#2e5f4f` - Forest (success states)
- `#ea580c` - Terra (tracking, active elements)

## Button Styles

### Base Button Style
Inspired by the map collection selector and opacity controls:

```css
.btn {
  font-family: 'Be Vietnam Pro', sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;

  padding: 0.875rem 1.5rem;
  border: 2px solid #d4af37;
  border-radius: 2px;

  background: linear-gradient(160deg,
    rgba(244, 232, 216, 0.98) 0%,
    rgba(232, 213, 186, 0.98) 100%);
  backdrop-filter: blur(12px);

  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
```

### Button Variants

**Primary Action** (Gold highlight):
```css
background: linear-gradient(180deg,
  rgba(212, 175, 55, 0.3) 0%,
  rgba(212, 175, 55, 0.2) 100%);
```

**Secondary** (Transparent with border):
```css
background: transparent;
border-color: rgba(107, 93, 82, 0.4);
```

**Success** (Forest green):
```css
background: linear-gradient(180deg,
  rgba(46, 95, 79, 0.15) 0%,
  rgba(46, 95, 79, 0.08) 100%);
```

**Danger** (Rust red):
```css
background: linear-gradient(180deg,
  rgba(168, 72, 72, 0.15) 0%,
  rgba(168, 72, 72, 0.08) 100%);
```

**Active State** (Tracking, selected):
```css
background: linear-gradient(160deg,
  rgba(212, 175, 55, 0.35) 0%,
  rgba(212, 175, 55, 0.25) 100%);
box-shadow:
  0 6px 20px rgba(212, 175, 55, 0.35),
  0 0 0 3px rgba(212, 175, 55, 0.15);
animation: activeGlow 3s ease-in-out infinite;
```

## Label Pattern

Consistent icon + text pattern seen in opacity controls:

```html
<div class="label">
  <span class="label-icon">◐</span>
  <span class="label-text">Overlay Opacity</span>
</div>
```

**Style:**
```css
.label {
  font-family: 'Be Vietnam Pro', sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #6b5d52;
}

.label-icon {
  font-size: 0.875rem;
  color: #a84848;
}
```

## Visual Effects

### Shimmer on Hover
All buttons include a shimmer effect:
```css
.btn::before {
  content: '';
  position: absolute;
  background: linear-gradient(90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent);
  transition: left 0.5s ease;
}

.btn:hover::before {
  left: 100%;
}
```

### Backdrop Blur
Controls and panels use frosted glass effect:
```css
backdrop-filter: blur(12px);
```

### Box Shadows
Layered shadows for depth:
```css
box-shadow:
  0 6px 20px rgba(0, 0, 0, 0.25),
  inset 0 1px 0 rgba(255, 255, 255, 0.4),
  inset 0 -1px 0 rgba(139, 115, 85, 0.15);
```

## Component Styling Guide

### Panels & Containers
```css
background: linear-gradient(160deg, #f4e8d8 0%, #ebe0d0 100%);
border: 2px solid #d4af37;
border-radius: 2px;
padding: 1.5rem;
```

### Input Fields
```css
font-family: 'Be Vietnam Pro', sans-serif;
background: rgba(255, 255, 255, 0.5);
border: 1px solid rgba(212, 175, 55, 0.4);
```

### Dialog Titles
```css
font-family: 'Spectral', serif;
font-size: 1.5rem;
font-weight: 700;
letter-spacing: -0.02em;
text-transform: uppercase;
```

### Body Text
```css
font-family: 'Noto Serif', serif;
font-size: 1.125rem;
line-height: 1.6;
color: #4a3f35;
```

## Animations

### Entrance
```css
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Bounce (for CTAs)
```css
transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Active Glow
```css
@keyframes activeGlow {
  0%, 100% {
    box-shadow: 0 6px 20px rgba(212, 175, 55, 0.35);
  }
  50% {
    box-shadow: 0 6px 24px rgba(212, 175, 55, 0.45);
  }
}
```

## Vietnamese Text Rendering

### Critical Settings
```css
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

body {
  font-feature-settings: 'kern' 1, 'liga' 1;
  font-variant-ligatures: common-ligatures;
}
```

These settings ensure:
- ✅ Crisp rendering of Vietnamese diacritics
- ✅ Proper spacing for stacked tone marks
- ✅ Ligature support for better readability
- ✅ Kerning optimization

## Usage Examples

### Button
```html
<button class="btn btn-primary">
  <span class="btn-icon">🗺️</span>
  <span>Bộ sưu tập Bản đồ</span>
</button>
```

### Label
```html
<div class="label">
  <span class="label-icon">◐</span>
  <span class="label-text">Độ trong suốt</span>
</div>
```

### Dialog Title
```html
<h2 class="text-title">
  Chào mừng đến với Bản đồ Lịch sử
</h2>
```

### Body Text
```html
<p class="text-paragraph">
  Chọn thành phố bắt đầu để khám phá bản đồ lịch sử từ nhiều thời kỳ khác nhau.
</p>
```

## Testing Vietnamese Text

Test with these complex strings to ensure proper rendering:

- **Tone marks:** Hà Nội, Huế, Đà Nẵng
- **Diacritics:** ă, â, ê, ô, ơ, ư
- **Combined:** Thành phố Hồ Chí Minh
- **Long text:** "Chào mừng đến với Bản đồ Lịch sử"

All should render with:
- ✅ No overlapping characters
- ✅ Proper tone mark positioning
- ✅ Consistent spacing
- ✅ Clear legibility at all sizes

## Accessibility

- Minimum font size: 0.75rem (12px)
- Contrast ratios meet WCAG AA standards
- Button states clearly differentiated
- Focus states include visual indicators
- Text remains readable on parchment backgrounds
