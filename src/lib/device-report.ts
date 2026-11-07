/**
 * Device and browser reading for the "report a problem" flow in the receipt viewer.
 *
 * collectDeviceFacts() is the only browser-only function here. Everything that turns
 * those facts into words (describeDevice, deviceSummaryLines) and everything that
 * shapes a storable report (buildReceiptProblem) is pure, so the reading rules can be
 * tested with hand-written facts instead of a real phone.
 */

export interface UaBrand {
  brand: string;
  version: string;
}

export interface DeviceFacts {
  /** Raw navigator.userAgent — kept verbatim so a report can be re-read later. */
  ua: string;
  /** Client hints (navigator.userAgentData) when the browser offers them. */
  mobile?: boolean | undefined;
  platform?: string | undefined;
  brands?: UaBrand[] | undefined;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  maxTouchPoints: number;
  /** Whether the browser reports pointer events (iPhone Safari does). */
  pointerEvents: boolean;
  /** Screen orientation type, e.g. "portrait-primary". */
  orientation?: string | undefined;
  /** True when opened from a Home-screen shortcut rather than the browser. */
  standalone?: boolean | undefined;
  /** Recent viewer moves, newest last: "pinch -> 150%", "drag stopped at edge". */
  log?: string[] | undefined;
}

/** The choices a report can carry. Keep ids stable: they are stored, not the labels. */
export const PROBLEM_KINDS = [
  { id: "zoom", label: "Zoom didn't work" },
  { id: "pan", label: "Dragging didn't work" },
  { id: "double-tap", label: "Double-tap didn't work" },
  { id: "blurry", label: "Picture looked blurry" },
  { id: "stuck", label: "Couldn't get back to the full view" },
  { id: "other", label: "Something else" },
] as const;

export type ProblemKindId = (typeof PROBLEM_KINDS)[number]["id"];

export const isProblemKind = (value: unknown): value is ProblemKindId =>
  PROBLEM_KINDS.some((kind) => kind.id === value);

export const problemLabel = (id: unknown): string =>
  PROBLEM_KINDS.find((kind) => kind.id === id)?.label ?? "Something else";

export const NOTE_MAX = 500;
const UA_MAX = 400;
const NAME_MAX = 120;
const TYPE_MAX = 60;
const LOG_MAX = 12;
const LOG_LINE_MAX = 80;
const BRANDS_MAX = 8;

export interface DeviceReading {
  device: string;
  os: string;
  browser: string;
  screen: string;
  touch: string;
}

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const short = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

/** Facts for a place with no browser at all (server render) — never used for a real report. */
export function emptyDeviceFacts(): DeviceFacts {
  return {
    ua: "",
    screenWidth: 0,
    screenHeight: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    pixelRatio: 1,
    maxTouchPoints: 0,
    pointerEvents: false,
  };
}

/** Read the current device and browser. Browser-only: safe to call from an event handler. */
export function collectDeviceFacts(): DeviceFacts {
  if (typeof window === "undefined" || typeof navigator === "undefined") return emptyDeviceFacts();
  const hints = (navigator as Navigator & { userAgentData?: UaBrand[] & { mobile?: boolean; platform?: string; brands?: UaBrand[] } }).userAgentData;
  const orientation = (window as Window & { orientation?: number }).orientation;
  const screen = window.screen as Screen & { orientation?: { type?: string } };
  return {
    ua: navigator.userAgent.slice(0, UA_MAX),
    mobile: typeof hints?.mobile === "boolean" ? hints.mobile : undefined,
    platform: short(hints?.platform, 40),
    brands: Array.isArray(hints?.brands) ? hints.brands.slice(0, BRANDS_MAX).map((b) => ({ brand: String(b?.brand ?? "").slice(0, 30), version: String(b?.version ?? "").slice(0, 20) })) : undefined,
    screenWidth: numberOr(window.screen?.width, 0),
    screenHeight: numberOr(window.screen?.height, 0),
    viewportWidth: numberOr(window.innerWidth, 0),
    viewportHeight: numberOr(window.innerHeight, 0),
    pixelRatio: numberOr(window.devicePixelRatio, 1),
    maxTouchPoints: numberOr(navigator.maxTouchPoints, 0),
    pointerEvents: typeof (window as Window & { PointerEvent?: unknown }).PointerEvent !== "undefined",
    orientation: short(screen?.orientation?.type, 30) ?? (typeof orientation === "number" ? (orientation === 0 ? "portrait" : "landscape") : undefined),
    standalone: (window as Window & { navigator?: Navigator & { standalone?: boolean } }).navigator?.standalone === true || undefined,
  };
}

const IOS_VERSION = /(?:CPU (?:iPhone )?OS |Version\/)(\d+)(?:[._](\d+))?/i;

/** iPhone and iPad only: the OS line is read from the pattern Apple ships, not guessed. */
function iosVersion(ua: string): string | null {
  const match = IOS_VERSION.exec(ua);
  if (!match) return null;
  const major = match[1];
  const minor = match[2];
  return minor ? `iOS ${major}.${minor}` : `iOS ${major}`;
}

/** iPadOS 13+ asks Safari to pretend it is a Mac, so touch points settle the argument. */
const isHiddenIpad = (facts: DeviceFacts): boolean =>
  /Macintosh|Mac OS X/i.test(facts.ua) && facts.maxTouchPoints > 1;

const IN_APP_BROWSERS: { test: RegExp; name: string }[] = [
  { test: /\b(FBAV|FB_IAB|FBA4S|FBAN)\b/i, name: "Facebook in-app browser" },
  { test: /\bInstagram\b/i, name: "Instagram in-app browser" },
  { test: /\bGSA\//i, name: "Google Search app" },
  { test: /\bMicroMessenger\b/i, name: "WeChat in-app browser" },
  { test: /\bWhatsApp\b/i, name: "WhatsApp in-app browser" },
  { test: /\bDuckDuckGo\//i, name: "DuckDuckGo browser" },
  { test: /\bSnapchat\b/i, name: "Snapchat in-app browser" },
];

function browserName(facts: DeviceFacts): string {
  const ua = facts.ua;
  const embedded = IN_APP_BROWSERS.find((entry) => entry.test.test(ua));
  if (embedded) return embedded.name;

  const brands = (facts.brands ?? []).filter((b) => b.brand && !/^not\b|^Not.?A.?Brand/i.test(b.brand) && b.brand !== "Chromium");
  const named = brands.find((b) => /Google Chrome|Microsoft Edge|Safari|Opera|Brave|Vivaldi|Firefox|Whale|Yandex/i.test(b.brand));
  if (named?.version) return `${named.brand.replace("Google Chrome", "Chrome")} ${named.version}`;
  if (named) return named.brand.replace("Google Chrome", "Chrome");

  if (/CriOS/i.test(ua)) return "Chrome on iPhone";
  if (/FxiOS/i.test(ua)) return "Firefox on iPhone";
  if (/EdgA|EdiOS|Edg\//i.test(ua)) return "Edge";
  if (/OPiOS|OPR\//i.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Android.*;\s*wv\)/i.test(ua)) return "In-app browser (Android webview)";
  // Chrome's own address contains "Safari", so it has to be read first.
  if (/Chrome|Chromium/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua)) return "Safari";
  return "Unknown browser";
}

function deviceName(facts: DeviceFacts): string {
  const ua = facts.ua;
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (isHiddenIpad(facts)) return "iPad";
  if (/Android/i.test(ua)) return /Tablet|SM-T|GT-P|Nexus 7|Pixel C/i.test(ua) || facts.mobile === false ? "Android tablet" : "Android phone";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows NT/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux device";
  return facts.mobile ? "Phone" : "Computer";
}

function osName(facts: DeviceFacts): string {
  const ua = facts.ua;
  if (/iPhone|iPad|iPod/i.test(ua) || isHiddenIpad(facts)) return iosVersion(ua) ?? "iOS (version not readable)";
  const android = /Android (\d+)(?:[._](\d+))?/i.exec(ua);
  if (android) return `Android ${android[1]}${android[2] ? `.${android[2]}` : ""}`;
  if (/Mac OS X/i.test(ua) && !isHiddenIpad(facts)) return "macOS";
  const windows = /Windows NT (\d+\.\d+)/i.exec(ua);
  if (windows) return windows[1] === "10.0" ? "Windows 10 or later" : `Windows NT ${windows[1]}`;
  if (/CrOS/i.test(ua)) return "ChromeOS";
  return "System not readable";
}

function screenLine(facts: DeviceFacts): string {
  if (!facts.screenWidth || !facts.screenHeight) return "Screen size not readable";
  const ratio = facts.pixelRatio && facts.pixelRatio > 0 ? Math.round(facts.pixelRatio * 100) / 100 : 1;
  const physical = `${Math.round(facts.screenWidth * ratio)} × ${Math.round(facts.screenHeight * ratio)}`;
  const shown = facts.viewportWidth && facts.viewportHeight ? ` · page shows ${Math.round(facts.viewportWidth)} × ${Math.round(facts.viewportHeight)}` : "";
  return `${Math.round(facts.screenWidth)} × ${Math.round(facts.screenHeight)} at ${ratio}× (${physical} pixels)${shown}`;
}

function touchLine(facts: DeviceFacts): string {
  const points = `${facts.maxTouchPoints} touch point${facts.maxTouchPoints === 1 ? "" : "s"}`;
  const pointers = facts.pointerEvents ? "pointer events supported" : "no pointer events";
  const extra = [
    facts.orientation ? facts.orientation.replace("-primary", "") : undefined,
    facts.standalone ? "opened as an installed app" : undefined,
  ].filter(Boolean);
  return [points, pointers, ...extra].join(" · ");
}

/** Plain-words reading of the device, used in the confirm dialog, the email and Settings. */
export function describeDevice(facts: DeviceFacts): DeviceReading {
  return {
    device: deviceName(facts),
    os: osName(facts),
    browser: browserName(facts),
    screen: screenLine(facts),
    touch: touchLine(facts),
  };
}

/** The lines a report carries, in a fixed order so a reader always scans the same shape. */
export function deviceSummaryLines(facts: DeviceFacts): string[] {
  const reading = describeDevice(facts);
  return [
    `${reading.device} · ${reading.os}`,
    reading.browser,
    `Screen: ${reading.screen}`,
    `Touch: ${reading.touch}`,
  ];
}

export interface ReceiptProblemRow {
  kind: ProblemKindId;
  note: string;
  receiptName: string;
  receiptType: string;
  facts: DeviceFacts;
}

/**
 * Turn anything the client sent into a storable row: known kind, trimmed note,
 * capped text and numbers, and only the viewer moves worth reading.
 */
export function buildReceiptProblem(input: {
  kind: unknown;
  note: unknown;
  receiptName: unknown;
  receiptType: unknown;
  zoom: unknown;
  facts: unknown;
}): ReceiptProblemRow {
  if (!isProblemKind(input.kind)) throw new Error("Choose what went wrong first");
  const raw = (input.facts ?? {}) as Partial<DeviceFacts>;
  const log = Array.isArray(raw.log) ? raw.log.slice(-LOG_MAX).map((line) => String(line ?? "").slice(0, LOG_LINE_MAX)).filter(Boolean) : [];
  const facts: DeviceFacts = {
    ua: String(raw.ua ?? "").slice(0, UA_MAX),
    mobile: typeof raw.mobile === "boolean" ? raw.mobile : undefined,
    platform: short(raw.platform, 40),
    brands: Array.isArray(raw.brands) ? raw.brands.slice(0, BRANDS_MAX).map((b) => ({ brand: String(b?.brand ?? "").slice(0, 30), version: String(b?.version ?? "").slice(0, 20) })) : undefined,
    screenWidth: Math.round(numberOr(raw.screenWidth, 0)),
    screenHeight: Math.round(numberOr(raw.screenHeight, 0)),
    viewportWidth: Math.round(numberOr(raw.viewportWidth, 0)),
    viewportHeight: Math.round(numberOr(raw.viewportHeight, 0)),
    pixelRatio: Math.round(numberOr(raw.pixelRatio, 1) * 100) / 100,
    maxTouchPoints: Math.round(numberOr(raw.maxTouchPoints, 0)),
    pointerEvents: raw.pointerEvents === true,
    orientation: short(raw.orientation, 30),
    standalone: raw.standalone === true || undefined,
    log,
  };
  const zoom = numberOr(input.zoom, 1);
  return {
    kind: input.kind,
    note: String(input.note ?? "").trim().slice(0, NOTE_MAX),
    receiptName: String(input.receiptName ?? "").slice(0, NAME_MAX),
    receiptType: String(input.receiptType ?? "").slice(0, TYPE_MAX),
    facts: { ...facts, log: [`zoom at report: ${Math.round(zoom * 100)}%`, ...log] },
  };
}
