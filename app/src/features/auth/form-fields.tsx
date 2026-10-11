import { type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'

// One labelled input bound to react-hook-form; `password` swaps in the show/hide password input.
export function AuthField<T extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  autoComplete,
  description,
}: {
  control: Control<T>
  name: FieldPath<T>
  label: string
  type?: 'text' | 'email' | 'password'
  autoComplete?: string
  description?: string
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {type === 'password' ? (
              <PasswordInput autoComplete={autoComplete} {...field} />
            ) : (
              <Input
                type={type}
                autoComplete={autoComplete}
                inputMode={type === 'email' ? 'email' : undefined}
                {...field}
              />
            )}
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
