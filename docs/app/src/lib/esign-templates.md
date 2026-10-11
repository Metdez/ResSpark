# `app/src/lib/esign-templates.ts`

Shared by the SPA and the Worker. Names the only forms a client may sign in the portal (D-01).

- `ESIGN_TEMPLATE_KEYS`: `engagement_letter`, `form_2848`, `form_8821`, in that order. Form 433-A, 433-F, 656 and 9465 are never signable here (REQUIREMENTS Out of Scope).
- `EsignTemplateKey`: the union of those keys.
- `isEsignTemplateKey(v)`: true only for a string in the list. The start route (06-02) and request creation (06-05) both use it, so a crafted item `config.template` cannot reach DocuSeal (T-06-09).
- `ESIGN_TEMPLATE_LABELS`: the staff/client display names.
- `IRS_ONLINE_NOTE`: staff notes for the two IRS forms only (D-20). `form_8821` is the base sentence: e-signed copies go online at IRS.gov/Submit2848 or IRS.gov/Submit8821, and staff must authenticate the client's identity for a remote signature. `form_2848` adds "The representative signs Part II outside the portal." because a one-role template covers only the taxpayer (RESEARCH Open Question 6). `engagement_letter` has no note.

Sources: IRS Instructions for Form 2848 (irs.gov/instructions/i2848) and the IRS "Submit Forms 2848 and 8821 online" page (irs.gov/submit2848).

## Tests

Unit tests: see [`esign-templates.test.md`](esign-templates.test.md).
