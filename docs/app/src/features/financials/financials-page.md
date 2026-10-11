# `app/src/features/financials/financials-page.tsx`

`FinancialsPage({ caseId })`: the staff 433-A worksheet (D-14, FORM-03). The route file supplies `caseId` and the page chrome.

| Part | What it does |
|------|--------------|
| `Title` | The UI-SPEC Display role (24 px / 600, one per page): `433-A worksheet for {First Last}`, or `433-A worksheet`. |
| Query | `useFinancials(caseId)`, polled every 5 s. |
| Pending | The title and three `Skeleton` rows. |
| Error | The title and a destructive `Alert`: `Couldn't load the 433-A worksheet`, the generic staff copy, and the muted error code. |
| Layout | A two-column grid on large screens, `lg:grid-cols-[minmax(0,1fr)_360px]`: the sections on the left, an `aside` labelled `Recommendation` on the right (Task 3 fills it). A `div`, not a second `main`: the route's `Main` is the page landmark. |
| Sections | One `SectionTable` per view section, in the Worker's order (D-14 form order). |

## Tests

`financials-page.test.tsx` (`web` project; `./api` partially mocked): the seven section titles in D-14 order (`Household`, `Employment`, `Monthly income`, `Monthly expenses`, `Assets`, `Compliance`, `Tax liability`), each with an expanded collapse button.
