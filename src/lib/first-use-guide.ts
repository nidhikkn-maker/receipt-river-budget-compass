// First-use guide content. Explains real flows in plain language; it shows no
// sample figures and never creates records — every action opens an existing flow.

export const MANAGE_CHOICES = [
  { key: "personal", title: "My money", body: "Your own spending, bank accounts, cards, savings and investments." },
  { key: "family", title: "Family", body: "Household money shared with people you invite. Each person signs in with their own account." },
  { key: "business", title: "Business", body: "A company, shop or professional work. Start by adding its documents — Thapal reads them and asks before saving anything." },
] as const;
export type ManageChoice = (typeof MANAGE_CHOICES)[number]["key"];

export interface Journey {
  key: "receipt" | "transfer" | "card_payment" | "statement" | "asset" | "reimbursement";
  title: string;
  situation: string;
  ledgerlineSays: string;
  youDo: string;
  safeguard: string;
  next: { label: string; to: "/new" | "/statements" | "/transfers" | "/assets" | "/claim-submission"; search?: Record<string, string> };
  technical: string;
  spaces: ManageChoice[];
}

export const JOURNEYS: Journey[] = [
  { key: "receipt", title: "A shop receipt", situation: "You paid at a shop or restaurant and have the bill.",
    ledgerlineSays: "“I found a receipt from the shop for the total on the bill. I think this belongs to a category because of what you chose last time.”",
    youDo: "Check the shop, total and date, choose or confirm the category, then confirm.", safeguard: "If I can't read the total or date, I say so and ask you — I never guess.",
    next: { label: "Scan a receipt", to: "/new", search: { mode: "scan" } }, technical: "Expense entry with attached source document", spaces: ["personal", "family", "business"] },
  { key: "transfer", title: "Money moved between my accounts", situation: "You sent money from your savings account to another account of yours.",
    ledgerlineSays: "“This went from one of your accounts to another. It isn't spending or income.”",
    youDo: "Confirm both accounts are yours. Thapal links the money going out and coming in as one move.", safeguard: "If the receiving account isn't confirmed, it stays in Review instead of being counted as spending.",
    next: { label: "Review moves between my accounts", to: "/transfers" }, technical: "Contra entry / internal transfer", spaces: ["personal", "family", "business"] },
  { key: "card_payment", title: "Paying my credit card bill", situation: "You paid your card bill from your bank account.",
    ledgerlineSays: "“This pays off your card. The purchases were already counted when you made them, so this isn't new spending.”",
    youDo: "Confirm which card was paid.", safeguard: "The same payment seen in your bank and card statements is one payment, not two expenses.",
    next: { label: "Record a card payment", to: "/new", search: { mode: "quick" } }, technical: "Credit card settlement (liability reduction)", spaces: ["personal", "business"] },
  { key: "statement", title: "A bank statement", situation: "You downloaded a statement from your bank or card.",
    ledgerlineSays: "“I found the transactions in this statement. Some are already in your records; I couldn't match a few and need your help.”",
    youDo: "Look at the ones I couldn't match, decide what each one was, then save.", safeguard: "Nothing is saved until you confirm, the balance must add up first, and you can undo the whole upload.",
    next: { label: "Add a statement", to: "/statements" }, technical: "Statement import and bank reconciliation", spaces: ["personal", "family", "business"] },
  { key: "asset", title: "Buying something that lasts", situation: "You bought a laptop, vehicle or equipment you'll use for years.",
    ledgerlineSays: "“This looks like something you own rather than everyday spending. Its recorded value goes down a little each year — no money leaves your account when that happens.”",
    youDo: "Add it to Things I own with the bill attached.", safeguard: "Tax rules for business assets stay exactly as the law states; your accountant sees the official terms.",
    next: { label: "Add something I own", to: "/assets" }, technical: "Fixed asset capitalisation and depreciation", spaces: ["personal", "business"] },
  { key: "reimbursement", title: "Getting paid back", situation: "You paid for something on behalf of your employer, a client or a friend.",
    ledgerlineSays: "“You paid this for someone else. It's money to receive, not your own spending.”",
    youDo: "Mark who should pay you back. When the money arrives, link it — it isn't income.", safeguard: "The original bill stays attached, and the claim shows what's still to be paid back.",
    next: { label: "Prepare a claim", to: "/claim-submission" }, technical: "Reimbursable expense and claim receivable", spaces: ["personal", "business"] },
];

export const journeysFor = (choice: ManageChoice | null) => choice ? JOURNEYS.filter(j => j.spaces.includes(choice)) : JOURNEYS;
