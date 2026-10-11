# `app/src/lib/utils.ts`

Vendored, byte-identical to shadcn-admin (see `docs/app/src/VENDORED.md`): `cn` (clsx + tailwind-merge),
`sleep`, `getPageNumbers` (pagination with ellipsis), `getDisplayNameInitials`.

## Tests

`app/src/lib/utils.test.ts` (project `web`): the fork's `getPageNumbers` cases plus one `cn('a', 'b') === 'a b'`
case added in Plan 01-02 so the `web` project always collects at least one file.
