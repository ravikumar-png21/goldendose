# GoldenDose — Design System

*Step 3 of 10: UI design. The exact colours, sizes and fonts every screen uses.*

A **design system** is a small rulebook. Instead of choosing a colour every time we
build a button, we choose once, give it a name (a **token**), and reuse it everywhere.
That keeps every screen consistent, and changing one token updates the whole app.

These tokens live at the top of `prototype/styles.css`, under `:root`.

## Typeface

**Atkinson Hyperlegible**, made by the Braille Institute for people with low vision.
Letters that are easily confused (I, l, 1 / O, 0 / b, d) are drawn to look clearly different.
That matters when the difference is between a 1 and a 7 on a dose.

| Use | Size | Weight |
|---|---|---|
| Greeting ("Good morning, Kamala") | 40px | Bold |
| Medicine name | 32px | Bold |
| Body text and instructions | 24px | Regular |
| Button text | 28px | Bold |
| Smallest text allowed anywhere on the elder's side | 20px | Regular |

Normal phone apps use about 16px for body text. Ours is 24px, about 1.5 times larger,
and medicine names are twice the normal size.

## Colours

Every text colour is checked against its background for a **contrast ratio** of at
least 7:1 (the strictest web accessibility level, WCAG AAA).

| Token | Colour | Used for | Why |
|---|---|---|---|
| `--paper` | #F6F5F0 | Page background | Softer than pure white, less glare for ageing eyes |
| `--ink` | #141414 | Main text | Near-black, maximum contrast |
| `--ink-soft` | #45453F | Secondary text | Still passes 7:1 |
| `--card` | #FFFFFF | Medicine cards | Lifts cards off the page |
| `--go` | #0B5A2F | "Taken" button, green tick | Green means done. Dark enough for white text |
| `--go-bg` | #E3F2E7 | Finished-dose card | Gentle green wash |
| `--alarm` | #FFD23F | Alarm screen | Sunflower yellow: impossible to miss, but not alarming like red |
| `--wait` | #6B3A00 | "Not taken yet" text | Warm brown on cream. Deliberately not red, to avoid worry |
| `--wait-bg` | #FFF1DC | "Not taken yet" card | |

**Colour is never the only signal.** A green card always also has a tick icon and the word "Taken".
About 1 in 12 men can't tell red from green.

## Touch targets

| Element | Size |
|---|---|
| Main action button ("Taken") | Full width, at least 72px tall |
| Secondary buttons ("Undo", "Skip") | At least 64px tall |
| Space between buttons | At least 24px |
| Gestures | Single tap only: no long press, double tap or swipe |

Apple and Google recommend 44–48px minimum targets for everyone. We use 64–72px.

## Shape and spacing

- Cards: rounded corners (20px), generous padding (24px), 20px gap between cards.
- One column only. Nothing side by side on the elder's screens.

## Theme

Light theme only for version 1. Dark text on a light background is the easiest to read for
most older eyes. A dark "night mode" is a possible later addition.
