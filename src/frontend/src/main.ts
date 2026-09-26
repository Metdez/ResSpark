import "./styles.css";
import { createApp } from "./app";
import { renderDocumentUpload } from "./document-upload/screen";
import { getExampleScreen } from "./example-route";
import { createSandboxCase } from "./resolution-results/model";
import { renderResolutionResults } from "./resolution-results/screen";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("The ResSpark app root is missing.");
}

const example = getExampleScreen(window.location.search);
const startApp = () => {
  window.history.replaceState({}, "", window.location.pathname);
  createApp(root);
};

if (example === "documents") {
  renderDocumentUpload(root, {
    answers: {
      is_wage_earner: true,
      owns_home: false,
      rents_home: true,
      vehicle_count: 1,
      has_real_property: false,
    },
    onBack: startApp,
    onComplete: () => undefined,
  });
} else if (example === "results") {
  renderResolutionResults(root, {
    result: createSandboxCase(
      {
        filing_status_married: true,
        filing_joint_offer: true,
        state_of_residence: "Florida",
        county_of_residence: "Miami-Dade County",
        household_size: 3,
        dependents_count: 1,
        age_taxpayer: 42,
        age_spouse: 40,
        owns_home: false,
        rents_home: true,
        is_wage_earner: true,
        total_tax_owed: 37_500,
        all_returns_filed: true,
        in_open_bankruptcy: false,
      },
      [
        { category: "irs_transcripts", categoryLabel: "IRS account transcript", name: "IRS_Account_Transcript.pdf", type: "application/pdf", size: 284_300 },
        { category: "personal_bank_statements", categoryLabel: "Recent personal bank statements", name: "Bank_Statements_Jan-Mar.pdf", type: "application/pdf", size: 1_428_000 },
        { category: "pay_stubs", categoryLabel: "Recent pay stubs", name: "Pay_Stubs.pdf", type: "application/pdf", size: 194_800 },
      ],
    ),
    onStartOver: startApp,
  });
} else {
  createApp(root);
}
