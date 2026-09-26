<!-- generated-by: gsd-doc-writer -->
# ResSpark

ResSpark helps a tax professional quickly see which IRS payment or settlement option may fit a person's financial situation.

> It is a screening tool, not a final filing decision. A tax professional should always review the documents and confirm the numbers before anything is sent to the IRS.

## The big picture

```mermaid
flowchart LR
    A[Client answers<br/>and example documents] --> B[Build a financial picture]
    B --> C[Look at income,<br/>living costs, and property]
    C --> D[Compare the result<br/>with IRS rules]
    D --> E[Show the best<br/>next option]
    E --> F[Tax professional<br/>reviews it]
```

The tool looks at how much money comes in each month, what the person needs to live on, what property or savings they have, how much they owe, and how much time the IRS has left to collect.

## Example documents

The [`Examples/`](Examples/) folder has three made-up client packets. They include things like tax transcripts, bank statements, pay stubs, housing records, and insurance or vehicle documents.

```text
Examples/
├── 01_marcus_delgado_CNC/              # A hardship case
├── 02_whitfield_gregory_OIC/           # A settlement-offer case
└── 03_renata_alves_streamlined_IA/     # A payment-plan case
```

The current program does not read those PDFs on its own. They are examples of the information that would be entered into the program.

```mermaid
flowchart LR
    A[Example documents] --> B[Enter the important numbers]
    B --> C[Run the decision logic]
    C --> D[Get a suggested next step]
```

## How it chooses a next step

```mermaid
flowchart TD
    A[Start with the client's information] --> B{Are basic tax requirements met?}
    B -- No --> X[Stop and fix the missing issue]
    B -- Yes --> C{Is there money left each month?}

    C -- No --> D{Is there very little usable property or savings?}
    D -- Yes --> E[Possible hardship status]
    D -- No --> F[Human review needed]

    C -- Yes --> G{Can the full balance be paid before the IRS deadline?}
    G -- Yes --> H[Choose the payment plan that fits]
    G -- No --> I{Would a settlement offer be lower than the full balance?}
    I -- Yes --> J[Possible settlement offer]
    I -- No --> K[Possible partial-payment plan]
```

In plain English, the tool first checks for anything that blocks a solution. Then it asks: is there money left after normal living costs, can the person pay everything before the deadline, and if not, is a smaller settlement realistic?

## What the tool counts

```mermaid
flowchart TD
    A[Monthly income] --> E[Money left each month]
    B[Normal living costs] --> E

    C[Cash, savings, vehicles,<br/>home equity, and other property] --> F[Usable property value]
    D[IRS local cost limits<br/>for the person's county] --> B

    E --> G[Choose a possible path]
    F --> G
    H[Amount owed and IRS deadline] --> G
```

The program uses the person's actual county for housing costs and the right local transportation area. It also gives the allowed vehicle reductions before counting vehicle value.

## Possible results

| Result | Simple meaning |
|---|---|
| Stop and fix the issue | Something basic is missing, such as an unfiled return or an open bankruptcy case. |
| Hardship status | There is no money left each month and very little usable property. |
| Payment plan | The person can pay the full balance before the IRS collection deadline. |
| Settlement offer | The person's available property and future ability to pay appear lower than the full balance. |
| Partial-payment plan | The person can pay something each month, but not enough to pay the full balance before the deadline. |
| Human review | The numbers point in more than one direction and a professional needs to decide. |

## A few helpful terms

- **IRS collection deadline:** the last date the IRS can generally collect the debt.
- **Settlement offer:** an Offer in Compromise, where the IRS may accept less than the full balance.
- **Partial-payment plan:** a monthly plan used when the full balance will not be paid before the collection deadline.

## Project layout

```text
ResSpark/
├── Examples/       # Made-up document packets
├── Context/        # IRS forms and standards used for reference
├── THIS ONE/       # Original version of the simple logic
└── THIS ONE V2/    # Updated version with current county, payment, and offer rules
```

The updated logic lives in `THIS ONE V2`:

- `financial_data.py` holds the client information.
- `questions.py` lists the simple intake questions.
- `standards.py` holds the county and transportation cost lookups.
- `determination.py` does the math and picks a suggested path.
- `demo.py` runs sample cases.

## Run the demo

```bash
cd "THIS ONE V2"
python demo.py
```

The demo prints the monthly income, allowed costs, usable property value, and suggested next step for three sample cases.
