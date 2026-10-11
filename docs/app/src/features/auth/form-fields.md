# `app/src/features/auth/form-fields.tsx`

`AuthField`: one labelled input bound to react-hook-form, shared by the sign-up, join, forgot-password and reset-password forms.

| Prop | Use |
|---|---|
| `control`, `name` | The react-hook-form control and field path; generic over the form's values. |
| `label` | Visible label, linked to the input by the shadcn `FormItem` id (tests find inputs by this label). |
| `type` | `text`, `email` (adds `inputMode="email"`) or `password`. `password` renders the app's `PasswordInput` with its show/hide button. |
| `autoComplete` | Passed through (`name`, `organization`, `username`, `new-password`). |
| `description` | Optional hint under the input, such as "At least 10 characters." |

Validation messages render through `FormMessage` from the form's zod schema.
