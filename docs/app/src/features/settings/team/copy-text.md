# `app/src/features/settings/team/copy-text.ts`

`copyText(text, done)` writes `text` to the clipboard and shows the success toast `done`. If the browser refuses (permissions, insecure context), it shows "Couldn't copy the link — Select the link and copy it yourself." This matches the copy behaviour of the request page.

It is used by the invite card ("Copy invite link") and by the member rows ("Copy reset link"). It sits in its own module so the component files export only components, which keeps React Fast Refresh working.
