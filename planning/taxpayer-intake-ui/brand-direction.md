# Taxpayer intake UI — visual direction

## Direction: quiet, credible guidance

The taxpayer experience should feel like a professional financial intake, not a
tax form or a bank dashboard: calm, private, plain-spoken, and focused on one
decision at a time.

Use a warm off-white page background, a white question panel, deep navy for
primary text and actions, and muted teal for progress and confirmed answers.
Reserve red for actual blocking errors only. Before implementation, verify all
text and control color pairs meet WCAG contrast requirements.

## Recommended screen structure

1. A slim header: ResSpark wordmark at left; **Save and exit** at right.
2. A labelled progress bar: for example, `Household · 3 of 8`.
3. One centered question panel, 560–640 px wide on desktop and full-width on
   mobile.
4. A short, plain-language help sentence only when it reduces ambiguity.
5. Large option cards for yes/no and short lists; native text and number inputs
   for free-form answers.
6. One full-width primary **Continue** button below the answer. Keep **Back**
   secondary and visible.
7. A short privacy/review statement in the footer: information is used to help
   a tax professional evaluate possible next steps.

## Interaction rules

- Show one question at a time; never reveal inapplicable follow-up questions.
- Selecting a yes/no option visibly marks the card, but save only when the
  user chooses Continue. This makes the action predictable and easy to undo.
- Preserve every confirmed answer server-side; resuming returns to the next
  applicable question.
- Use the same panel for every taxpayer question. Do not add a dashboard,
  side navigation, charts, or resolution recommendations in the intake flow.

## What the references contributed

- Gemini: restrained financial-profile layout, generous whitespace, labelled
  inputs, and step visibility. Use its calm hierarchy, not its product brand.
  [Mobbin flow](https://mobbin.com/flows/c1534b27-1e91-4573-b312-2d17e5ccd4ed)
- Monarch: clear question hierarchy, selected answer cards, and an obvious
  Save & Exit escape hatch. Use the interaction pattern, not its coral brand.
  [Mobbin flow](https://mobbin.com/flows/adae1760-df5a-4a73-9da8-7c222a14ee8e)
- Laravel Cloud: narrow single-question layout with an explicit question count
  and one primary action. This is the strongest structural reference for the
  simple TypeScript version.
  [Mobbin flow](https://mobbin.com/flows/50d44602-9183-47a6-8e5f-91782acd2840)

## Saved reference images

- `reference-images/gemini-financial-profile.jpg`
- `reference-images/monarch-guided-question.jpg`
- `reference-images/laravel-single-question.jpg`

These images are private planning references. They are not assets for the
ResSpark product and must not be copied into the implemented UI.
