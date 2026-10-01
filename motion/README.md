# motion

Motion design tokens shared between the desktop app and the website, plus the
standalone GSAP promo reel.

| File           | What it is                                                        |
| -------------- | ----------------------------------------------------------------- |
| `tokens.css`   | Durations and easings as CSS custom properties                     |
| `motion.html`  | 15s looping promo reel built with GSAP, no build step              |

## Usage

Import once at the top of a stylesheet:

```css
@import "../motion/tokens.css";
```

The app consumes this from `app/src/app.css`; the website inlines its own copy in
`website/index.html` since it ships without a build step.

## Tokens

| Token | Value | Use for |
| --- | --- | --- |
| `--motion-instant` | 80ms | Hover tints, checkbox fills |
| `--motion-fast` | 150ms | Opacity and background-color on buttons and rows |
| `--motion-base` | 250ms | Slide-in panels, standard entrance motion |
| `--motion-slow` | 400ms | Resizable panel drags, deliberately slow feedback |

| Easing | Use for |
| --- | --- |
| `--motion-ease-out` | Entrances and slide-ins (fast start, gentle settle) |
| `--motion-ease-in-out` | Transitions between two stable states |
| `--motion-ease-linear` | Continuous motion only — progress rings, spinners |

## Rules

- Never hardcode a duration or a cubic-bezier in a component. Use a token.
- Choose the shortest duration that still reads as intentional.
- Animate only `opacity` and `transform`. Layout-shifting properties (width,
  height, top, left) should move to a token before being used in a transition.

## Promo reel

`motion.html` is a self-contained page — open it directly in a browser, or serve
the repo root with any static server. It is not part of either build.

```
pnpm dlx serve .        # then open /motion/motion.html
```

GSAP loads from cdnjs, so the reel needs network access on first paint. The
Manrope faces are self-hosted from `../website/fonts/`, matching the site.

Structure: one `gsap.timeline({ repeat: -1, repeatDelay: 1 })` at 15.2s, with
`addLabel` calls for `intro`, `timer`, `today`, `stats`, and `outro`. The HUD
progress bar and scene dots read off `tl.progress()` and `tl.labels`.

- `resetState()` runs on every `onRepeat` to clear counters, classes, and
  transforms, so each loop starts identical.
- The stage is a fixed 1280x720 canvas scaled to fit the viewport, so frame
  geometry never shifts with window size.
- `prefers-reduced-motion` pauses on a settled frame at 5.9s instead of
  autoplaying.