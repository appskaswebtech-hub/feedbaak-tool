// Ready-made surveys. Question shape matches the create-survey form state.

const choice = (text, options, extra = {}) => ({
  text,
  isSingle: true,
  isMultiChoice: false,
  isConditional: false,
  isTextBox: false,
  questionType: null,
  branchRules: [],
  options: options.map((o) => (typeof o === "string" ? { text: o, haveTextBox: false } : o)),
  ...extra,
});

const rating = (text, extra = {}) => ({
  text, isSingle: false, isMultiChoice: false, isConditional: false, isTextBox: false,
  questionType: "rating", branchRules: [], options: [], ...extra,
});

const nps = (text, extra = {}) => ({
  text, isSingle: false, isMultiChoice: false, isConditional: false, isTextBox: false,
  questionType: "nps", branchRules: [], options: [], ...extra,
});

const textBox = (text, extra = {}) => ({
  text, isSingle: false, isMultiChoice: false, isConditional: false, isTextBox: true,
  questionType: null, branchRules: [], options: [], ...extra,
});

const yesNo = (text, extra = {}) => ({
  text, isSingle: false, isMultiChoice: false, isConditional: true, isTextBox: false,
  questionType: null, branchRules: [], options: [{ text: "Yes", haveTextBox: false }, { text: "No", haveTextBox: false }], ...extra,
});

export const SURVEY_TEMPLATES = [
  {
    key: "attribution",
    name: "How did you hear about us?",
    description: "Find out which marketing channel brought each customer.",
    title: "How did you hear about us",
    questions: () => [
      choice("How did you hear about us?", [
        "Google search",
        "Facebook / Instagram",
        "TikTok",
        "YouTube",
        "Friend or family",
        "Email or newsletter",
        "Influencer or blog",
        { text: "Other", haveTextBox: true },
      ]),
    ],
  },
  {
    key: "satisfaction",
    name: "Customer satisfaction",
    description: "Star rating, recommendation score and an open comment.",
    title: "Customer satisfaction",
    questions: () => [
      rating("How satisfied are you with your purchase?"),
      nps("How likely are you to recommend us to a friend or colleague?"),
      textBox("Is there anything we could do better?"),
    ],
  },
  {
    key: "delivery",
    name: "Delivery feedback",
    description: "Rate the delivery. Low scores go straight to a comment box.",
    title: "Delivery feedback",
    questions: () => [
      rating("How would you rate your delivery experience?", {
        branchRules: [{ op: "lte", value: "3", goTo: 3 }],
      }),
      yesNo("Was your order packaged well?"),
      textBox("Tell us how we can improve delivery."),
    ],
  },
  {
    key: "nps",
    name: "Net Promoter Score",
    description: "One 0-10 question, plus a follow-up for unhappy customers.",
    title: "Net Promoter Score",
    questions: () => [
      nps("How likely are you to recommend us to a friend or colleague?", {
        branchRules: [{ op: "gte", value: "9", goTo: "end" }],
      }),
      textBox("What is the main reason for your score?"),
    ],
  },
];
