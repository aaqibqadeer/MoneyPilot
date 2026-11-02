/**
 * Time-saving actions: cancel a subscription, ask for a refund, dispute a card charge.
 * Pure and client-safe. MoneyPilot never cancels or files anything itself (no merchant or
 * issuer APIs exist for that); it finds the right page and drafts the message.
 */
import { merchantKey } from "@/lib/bills/recurring";

export interface CancelInfo {
  /** Matched service, or the merchant name as given. */
  name: string;
  known: boolean;
  url: string;
  steps: string;
  /** Billed through an app store: cancel there, not with the merchant. */
  via?: "apple" | "google";
}

type Entry = [match: RegExp, name: string, url: string, steps: string, via?: CancelInfo["via"]];

/** Order matters: app-store billing first, then specific before generic (YouTube before Google). */
const SERVICES: Entry[] = [
  [/\bapple com\b|\bitunes\b|\bapple bill\b/, "Apple (App Store)", "https://apps.apple.com/account/subscriptions", "On iPhone: Settings → your name → Subscriptions → pick it → Cancel Subscription.", "apple"],
  [/\byoutube/, "YouTube Premium / TV", "https://www.youtube.com/paid_memberships", "Open Purchases and memberships → pick the membership → Deactivate."],
  [/\bgoogle play\b|\bgoogle one\b|\bgoogle storage\b/, "Google Play", "https://play.google.com/store/account/subscriptions", "Open Subscriptions → pick it → Cancel subscription.", "google"],
  [/\bnetflix\b/, "Netflix", "https://www.netflix.com/cancelplan", "Sign in → Cancel Membership → Finish Cancellation."],
  [/\bspotify\b/, "Spotify", "https://www.spotify.com/account/", "Account → Manage your plan → Cancel subscription."],
  [/\bhulu\b/, "Hulu", "https://secure.hulu.com/account", "Account → Cancel Your Subscription."],
  [/\bdisney\b/, "Disney+", "https://www.disneyplus.com/account", "Account → Subscription → Cancel Subscription."],
  [/\bhbo\b|\bmax com\b/, "HBO Max", "https://www.hbomax.com/", "Profile → Settings → Subscription → Manage Subscription → Cancel."],
  [/\bparamount\b/, "Paramount+", "https://www.paramountplus.com/account/", "Account → Cancel Subscription."],
  [/\bpeacock\b/, "Peacock", "https://www.peacocktv.com/account", "Account → Plans & Payment → Change Plan → Cancel Plan."],
  [/\bamazon prime\b|\bprime video\b|\bamzn prime\b|\bprime member/, "Amazon Prime", "https://www.amazon.com/gp/primecentral", "Prime membership → Manage membership → End membership."],
  [/\baudible\b/, "Audible", "https://www.audible.com/account", "Account details → Cancel membership."],
  [/\bkindle unlimited\b/, "Kindle Unlimited", "https://www.amazon.com/kindle-dbs/ku/ku-central", "Manage membership → Cancel Kindle Unlimited."],
  [/\badobe\b/, "Adobe", "https://account.adobe.com/plans", "Plans → Manage plan → Cancel plan. Annual plans billed monthly can carry an early-cancel fee."],
  [/\bmicrosoft\b|\bmsft\b|\bxbox\b/, "Microsoft / Xbox", "https://account.microsoft.com/services", "Services & subscriptions → Manage → Cancel subscription."],
  [/\bdropbox\b/, "Dropbox", "https://www.dropbox.com/account/plan", "Plan → Cancel plan."],
  [/\bopenai\b|\bchatgpt\b/, "ChatGPT", "https://chatgpt.com/", "Profile → Settings → Account (or Subscription) → Manage → Cancel plan."],
  [/\banthropic\b|\bclaude ai\b/, "Claude", "https://claude.ai/settings/billing", "Settings → Billing → Cancel plan."],
  [/\blinkedin\b/, "LinkedIn Premium", "https://www.linkedin.com/premium/manage/", "Manage Premium account → Cancel subscription."],
  [/\bnytimes\b|\bny times\b|\bnew york times\b/, "New York Times", "https://myaccount.nytimes.com/seg/subscription", "Subscription overview → Cancel subscription."],
  [/\bpatreon\b/, "Patreon", "https://www.patreon.com/settings/memberships", "Memberships → Edit → Cancel membership."],
  [/\btwitch\b/, "Twitch", "https://www.twitch.tv/subscriptions", "Subscriptions → pick the channel → Don't renew."],
  [/\bgithub\b/, "GitHub", "https://github.com/settings/billing", "Billing and plans → Downgrade or cancel."],
  [/\bzoom\b/, "Zoom", "https://zoom.us/billing", "Billing → Current plans → Cancel subscription."],
  [/\bgrammarly\b/, "Grammarly", "https://account.grammarly.com/subscription", "Subscription → Cancel subscription."],
  [/\bpeloton\b/, "Peloton", "https://members.onepeloton.com/preferences/subscriptions", "Subscriptions → Cancel."],
  [/\bwalmart\b.*\bplus\b|\bwmt plus\b|\bwalmart\+/, "Walmart+", "https://www.walmart.com/plus/account", "Walmart+ account → Cancel membership."],
  [/\bsiriusxm\b|\bsirius\b/, "SiriusXM", "https://care.siriusxm.com/", "Sign in → Manage subscription → Cancel. Phone retention offers are common; ask for the cancel, not a discount."],
  [/\bsling\b/, "Sling TV", "https://www.sling.com/my-account", "My Account → Cancel Subscription."],
  [/\bfubo\b/, "Fubo", "https://www.fubo.tv/account", "Account → Subscription & Billing → Cancel subscription."],
  [/\bdoordash\b|\bdashpass\b/, "DoorDash DashPass", "https://www.doordash.com/", "Account → DashPass → End Subscription."],
  [/\buber one\b|\buber\b.*\bpass\b/, "Uber One", "https://www.uber.com/", "Uber app → Account → Uber One → Manage membership → End membership."],
  [/\binstacart\b/, "Instacart+", "https://www.instacart.com/store/account/instacart-plus", "Account → Instacart+ → Manage → End membership."],
  [/\bduolingo\b/, "Duolingo", "https://www.duolingo.com/settings/super", "Usually billed by Apple or Google: cancel in that store. Web plans: Settings → Super → Cancel."],
  [/\bplanet fitness\b|\bla fitness\b|\b24 hour fitness\b|\banytime fitness\b|\bgym\b/, "Gym membership", "", "Gyms often require cancelling in person or by letter. Send the cancellation letter below by certified mail and keep the receipt."],
];

export function cancelHelp(merchant: string): CancelInfo {
  const k = merchantKey(merchant);
  const hit = SERVICES.find(([re]) => re.test(k));
  if (!hit) {
    return {
      name: merchant,
      known: false,
      url: `https://www.google.com/search?q=${encodeURIComponent(`how to cancel ${merchant.trim()} subscription`)}`,
      steps: "Look for Account, Billing or Subscription on their site or app. If there's no online option, send the cancellation email below and keep a copy.",
    };
  }
  const [, name, url, steps, via] = hit;
  return { name, known: true, url: url || `https://www.google.com/search?q=${encodeURIComponent(`cancel ${merchant.trim()} membership`)}`, steps, ...(via ? { via } : {}) };
}

export interface IssuerInfo {
  name: string;
  known: boolean;
  url: string;
  steps: string;
}

const ISSUERS: [RegExp, string, string][] = [
  [/\bchase\b/, "Chase", "https://www.chase.com/"],
  [/\bamerican express\b|\bamex\b/, "American Express", "https://www.americanexpress.com/"],
  [/\bciti\b|\bcitibank\b/, "Citi", "https://www.citi.com/"],
  [/\bcapital one\b/, "Capital One", "https://www.capitalone.com/"],
  [/\bbank of america\b|\bbofa\b/, "Bank of America", "https://www.bankofamerica.com/"],
  [/\bdiscover\b/, "Discover", "https://www.discover.com/"],
  [/\bwells fargo\b/, "Wells Fargo", "https://www.wellsfargo.com/"],
  [/\bu ?s bank\b|\busbank\b/, "U.S. Bank", "https://www.usbank.com/"],
  [/\busaa\b/, "USAA", "https://www.usaa.com/"],
  [/\bnavy federal\b/, "Navy Federal", "https://www.navyfederal.org/"],
  [/\bbarclays\b/, "Barclays", "https://cards.barclaycardus.com/"],
  [/\bsynchrony\b/, "Synchrony", "https://www.synchrony.com/"],
  [/\bpnc\b/, "PNC", "https://www.pnc.com/"],
  [/\btd bank\b/, "TD Bank", "https://www.td.com/us/"],
  [/\bally\b/, "Ally", "https://www.ally.com/"],
  [/\bapple card\b|\bgoldman\b/, "Apple Card", "https://card.apple.com/"],
];

/** Every big US issuer lets you dispute from the transaction in its app; these are the shared steps. */
const ISSUER_STEPS = "Sign in (the app is fastest) → open the transaction → Dispute (or Report a problem) → pick the reason and paste the letter below. No dispute button? Call the number on the back of your card.";

export function issuerHelp(institution?: string): IssuerInfo {
  const k = merchantKey(institution ?? "");
  const hit = ISSUERS.find(([re]) => re.test(k));
  if (!hit) return { name: institution || "your bank", known: false, url: "", steps: ISSUER_STEPS };
  return { name: hit[1], known: true, url: hit[2], steps: ISSUER_STEPS };
}

export const DISPUTE_REASONS = {
  cancelled: "I cancelled but was still charged",
  not_received: "I didn't receive what I paid for",
  duplicate: "I was charged twice",
  wrong_amount: "The amount is wrong",
  defective: "Item was defective or not as described",
  not_recognized: "I don't recognize this charge",
} as const;
export type DisputeReason = keyof typeof DISPUTE_REASONS;

const REASON_TEXT: Record<DisputeReason, string> = {
  cancelled: "I cancelled this service before this charge and did not authorize further billing.",
  not_received: "I paid for goods or services that I have not received.",
  duplicate: "This charge duplicates an earlier charge for the same purchase.",
  wrong_amount: "I was charged a different amount than I agreed to pay.",
  defective: "What I received was defective or not as described, and the merchant has not resolved it.",
  not_recognized: "I do not recognize this charge and did not authorize it.",
};

export interface ChargeFacts {
  merchant: string;
  /** Positive cents = money out. */
  amountCents: number;
  date: Date | string;
  currency?: string;
  /** Last 4 of the card or account. */
  mask?: string;
  /** Account type from the bank: credit, depository, … */
  accountType?: string;
  reason: DisputeReason;
  name?: string;
}

export interface Letter {
  subject: string;
  body: string;
}

const fmtMoney = (c: number, cur = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(Math.abs(c) / 100);
const fmtDate = (d: Date | string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(d));
const sign = (name?: string) => `\n\nThank you,\n${name || "[Your name]"}`;

export function cancelLetter(o: { merchant: string; name?: string; email?: string; amountCents?: number; currency?: string; mask?: string }): Letter {
  const charge = o.amountCents ? ` (currently ${fmtMoney(o.amountCents, o.currency)} per billing period${o.mask ? `, charged to card ending ${o.mask}` : ""})` : "";
  return {
    subject: `Cancel my ${o.merchant} subscription`,
    body: `Hello ${o.merchant} team,\n\nPlease cancel my subscription and any automatic renewal on my account${o.email ? ` (${o.email})` : ""}${charge}, effective immediately. Do not charge my payment method again.\n\nPlease reply to confirm the cancellation and the date the last charge was made.${sign(o.name)}`,
  };
}

export function refundLetter(o: ChargeFacts): Letter {
  return {
    subject: `Refund request: ${fmtMoney(o.amountCents, o.currency)} charge on ${fmtDate(o.date)}`,
    body: `Hello ${o.merchant} team,\n\nOn ${fmtDate(o.date)} I was charged ${fmtMoney(o.amountCents, o.currency)}${o.mask ? ` on my card ending ${o.mask}` : ""}. ${REASON_TEXT[o.reason]}\n\nPlease refund ${fmtMoney(o.amountCents, o.currency)} to the original payment method and reply to confirm. If I don't hear back within 10 days, I will dispute the charge with my card issuer.${sign(o.name)}`,
  };
}

export function disputeLetter(o: ChargeFacts & { issuer?: string }): Letter {
  return {
    subject: `Billing dispute: ${o.merchant}, ${fmtMoney(o.amountCents, o.currency)} on ${fmtDate(o.date)}`,
    body: `To ${o.issuer || "my card issuer"},\n\nI am disputing the following charge${o.mask ? ` on my account ending ${o.mask}` : ""}:\n\nMerchant: ${o.merchant}\nDate: ${fmtDate(o.date)}\nAmount: ${fmtMoney(o.amountCents, o.currency)}\n\n${REASON_TEXT[o.reason]}${o.reason === "not_recognized" ? "" : " I contacted the merchant and they have not resolved it."}\n\nPlease credit this amount to my account while you investigate${isCredit(o.accountType) ? ", as provided by the Fair Credit Billing Act" : ""}, and send me the result in writing.${sign(o.name)}`,
  };
}

const isCredit = (type?: string) => type === "credit";
const DAY = 86400000;

/**
 * Safe "act by" date. US credit cards: 60 days after the statement that first showed the charge
 * (Fair Credit Billing Act); the statement can close up to a month later, so the charge date +60
 * is the conservative date. Debit: report unauthorized charges within 2 business days to cap loss
 * at $50, outer limit 60 days after the statement (EFTA / Reg E).
 */
export function disputeDeadline(date: Date | string, accountType?: string) {
  const at = new Date(new Date(date).getTime() + 60 * DAY);
  const rule = isCredit(accountType)
    ? "Credit card: dispute in writing within 60 days of the statement that first showed the charge."
    : "Debit or bank account: report unauthorized charges within 2 business days to keep your loss to $50 at most; the outer limit is 60 days after the statement.";
  return { actBy: at, rule };
}

/** mailto: link with subject and body; `to` may be empty so the user picks the address. */
export const mailto = (l: Letter, to = "") => `mailto:${to}?subject=${encodeURIComponent(l.subject)}&body=${encodeURIComponent(l.body)}`;
