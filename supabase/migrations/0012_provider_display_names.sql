-- 0012 provider display names (PostgreSQL 17): backfill documents.original_filename.
--
-- Source: ValorTax call, Oct 12 2026 (.planning/Client/call2.md, 8:00): "pay stub
-- underscore October 12, 2026 ... an actual person has to see this inside Logics".
-- Since 2026-10-18 the Worker stores provider files with a readable
-- original_filename (app/worker/src/storage/display-names.ts) while the storage
-- key keeps the machine name. This migration gives the rows stored before that
-- date the same names, so an older case pushes readable files to Logics too.
--
-- Data rules:
--   * data only: no schema change; only documents.original_filename changes, and
--     only on rows written by provider:plaid or provider:truv whose name still
--     matches an old machine pattern, so the statement is idempotent;
--   * storage_key, sha256, size and status are untouched (the file bytes and the
--     evidence lookups by key suffix do not move);
--   * the new names mirror display-names.ts exactly:
--       YYYY-MM.pdf                  -> Bank statement - September 2026[ - x1234].pdf
--       paystub-YYYY-MM-DD[-check].pdf -> Pay stub - October 12, 2026[ - check 1001].pdf
--       w2-YYYY.pdf                  -> W-2 - 2025.pdf
--       income-report.pdf            -> Income report.pdf
--     The bank mask comes from the storage key (.../bank/<mask>/YYYY-MM.pdf) and
--     is appended only when that folder is all digits (a null mask stores the
--     external account id there instead);
--   * client uploads made inside Truv Bridge keep the client's own file name
--     (they never matched these patterns).
--
-- Re-runnable: a second run matches zero rows.

BEGIN;

-- (a) Plaid statements --------------------------------------------------------
UPDATE public.documents d
SET original_filename =
    'Bank statement - '
    || to_char(to_date(substring(d.original_filename FROM '^(\d{4}-\d{2})\.pdf$'), 'YYYY-MM'), 'FMMonth YYYY')
    || CASE WHEN substring(d.storage_key FROM '/bank/([^/]+)/[^/]+$') ~ '^\d+$'
            THEN ' - x' || substring(d.storage_key FROM '/bank/([^/]+)/[^/]+$')
            ELSE '' END
    || '.pdf'
WHERE d.uploaded_by_actor = 'provider:plaid'
  AND d.original_filename ~ '^\d{4}-(0[1-9]|1[0-2])\.pdf$';

-- (b) Truv pay stubs ----------------------------------------------------------
UPDATE public.documents d
SET original_filename =
    'Pay stub - '
    || to_char(to_date(substring(d.original_filename FROM '^paystub-(\d{4}-\d{2}-\d{2})'), 'YYYY-MM-DD'), 'FMMonth FMDD, YYYY')
    || COALESCE(' - check ' || NULLIF(regexp_replace(substring(d.original_filename FROM '^paystub-\d{4}-\d{2}-\d{2}-(.+)\.pdf$'), '[^A-Za-z0-9-]', '', 'g'), ''), '')
    || '.pdf'
WHERE d.uploaded_by_actor = 'provider:truv'
  AND d.original_filename ~ '^paystub-\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(-.+)?\.pdf$';

-- (c) Truv W-2s ---------------------------------------------------------------
UPDATE public.documents d
SET original_filename = 'W-2 - ' || substring(d.original_filename FROM '^w2-(\d{4})\.pdf$') || '.pdf'
WHERE d.uploaded_by_actor = 'provider:truv'
  AND d.original_filename ~ '^w2-\d{4}\.pdf$';

-- (d) Truv income reports -----------------------------------------------------
UPDATE public.documents d
SET original_filename = 'Income report.pdf'
WHERE d.uploaded_by_actor = 'provider:truv'
  AND d.original_filename = 'income-report.pdf';

COMMIT;
