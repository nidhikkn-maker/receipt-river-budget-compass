/**
 * Weekly watch of official tax/GST/MCA pages [v6 §49–51]. Pure helpers: a page is reduced to its
 * list of headline/link texts, fingerprinted, and new headlines are reported as a detected change.
 * A detected change never alters a rule — the owner records a proposal and approves it.
 */
const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/** Headline texts: anchor and heading texts with real words, de-duplicated, in page order. */
export function headlines(html: string, max = 400): string[] {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, " ");
  const out: string[] = []; const seen = new Set<string>();
  for (const m of body.matchAll(/<(a|h[1-4]|li|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = decode(m[2]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (t.length < 25 || t.length > 300 || !/[a-z]{3}/i.test(t)) continue;
    if (!/notif|circular|amend|rule|due|date|extend|gst|tax|return|form|schedule|rate|order|press|advisory|update|scheme|act|\d{4}/i.test(t)) continue;
    const k = t.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export async function fingerprint(lines: string[]): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lines.join("\n").toLowerCase()));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** New headlines compared with the previous snapshot; first sight is a baseline, not a change. */
export function newHeadlines(previous: string[] | null, current: string[]): string[] {
  if (!previous) return [];
  const before = new Set(previous.map((x) => x.toLowerCase()));
  return current.filter((x) => !before.has(x.toLowerCase()));
}
