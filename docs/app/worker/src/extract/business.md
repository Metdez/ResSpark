# `app/worker/src/extract/business.ts`

Port of `_business` in `src/document_parse.py`.

`business(texts)` reads the `Net Income:` (else `Net Profit:`) pair of a profit-and-loss or Schedule C and returns `_kind: 'business'` with `net_business_income`. A missing label is `Missing Net Income`. In `merge.ts` a second business document replaces the first (Python `row.update`), it is not added.
