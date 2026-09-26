# Mobbin visual style reference

This folder is visual reference only. It does not define questionnaire logic,
data rules, or backend behavior.

## Recommended style: calm financial professional

Use the restrained financial-software character shared by the saved references:

- bright white or very-light gray canvas;
- a single deep navy or charcoal primary color;
- one muted accent color for progress and selected states;
- generous empty space and a narrow, centered content column;
- crisp sans-serif typography, with a system font stack initially;
- thin gray borders, 8–12 px rounded controls, and almost no shadows.

## Layout language

- On wide screens, use a slim progress rail or understated top progress bar.
- Keep the main panel quiet and centered rather than dashboard-like.
- Make controls full-width and comfortably tall (about 44–48 px).
- Use one clear filled primary button and a low-emphasis text/outline secondary
  action.
- Use choice rows/cards with a visible selected state: light accent tint,
  colored border, and a small check/radio indicator.

## Color direction

Start with these design tokens, then validate them against accessibility
contrast requirements during implementation:

```css
--canvas: #f8fafc;
--surface: #ffffff;
--ink: #172033;
--muted: #667085;
--border: #d9dee8;
--accent: #246b78;
--accent-soft: #e7f4f3;
--danger: #b42318;
```

## Reference images and inspiration

- `images/mercury-progress-layout.jpg` — clean progress rail, quiet spacing,
  and minimal blue accent. [View on Mobbin](https://mobbin.com/screens/89d118cc-f223-4d5f-8bbe-ae4ec910d753)
- `images/melio-form-layout.jpg` — polished form field rhythm and a compact
  vertical stepper. [View on Mobbin](https://mobbin.com/screens/5b7f001b-1d87-4dd1-95f5-8297cb6cc8cd)
- `images/okx-option-cards.jpg` — large, scan-friendly choice rows.
  [View on Mobbin](https://mobbin.com/screens/ba0c3696-4607-4e97-b4ef-989125a0d781)
- `images/quickbooks-progress-layout.jpg` — understated top progress bar and
  clear heading hierarchy. [View on Mobbin](https://mobbin.com/screens/88bd11c5-eb0d-4e13-a7a7-24651d015f24)

Do not copy the reference brands, logos, text, or artwork into ResSpark. Use
them only to guide spacing, hierarchy, control treatment, and visual tone.
