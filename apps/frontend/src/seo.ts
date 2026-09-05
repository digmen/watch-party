import { useHead, useSeoMeta } from "@unhead/vue";

// Canonical URLs, og:url and the sitemap all need one stable absolute base — and the Cloudflare
// Quick Tunnel hostname is random and changes on every restart, so there genuinely isn't one
// until a real domain exists. Rather than hardcode a URL that would be wrong within a day, the
// origin comes from the build and the absolute-URL tags are simply omitted when it's unset.
// Set VITE_PUBLIC_ORIGIN (e.g. https://watchparty.example) to switch them on.
export const PUBLIC_ORIGIN: string = import.meta.env.VITE_PUBLIC_ORIGIN ?? "";

const SITE_NAME = "Watch Party";

export function absoluteUrl(path: string): string | undefined {
  if (!PUBLIC_ORIGIN) return undefined;
  return `${PUBLIC_ORIGIN.replace(/\/$/, "")}${path}`;
}

interface PageSeo {
  title: string;
  description: string;
  path: string;
  /** Rooms are private and ephemeral — they must never end up in an index. */
  noindex?: boolean;
}

export function usePageSeo({ title, description, path, noindex }: PageSeo): void {
  const url = absoluteUrl(path);

  // Canonical link — useSeoMeta only emits <meta> tags, this one is a <link>, and there was no
  // canonical tag anywhere in the codebase until now. Without it, search engines have no signal
  // for which URL is authoritative when the same page is reachable через несколько путей
  // (домен, поддомены, query-параметры комнаты) — рискует дробить рейтинг между ними.
  // Omitted (not emitted with an empty href) when the origin is unset, same rule as og:url below.
  useHead({
    link: url ? [{ rel: "canonical", href: url }] : [],
  });

  useSeoMeta({
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    ogType: "website",
    ogSiteName: SITE_NAME,
    ogLocale: "ru_RU",
    ogUrl: url,
    ogImage: absoluteUrl("/og-image.png"),
    twitterCard: "summary_large_image",
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: absoluteUrl("/og-image.png"),
    robots: noindex ? "noindex, nofollow" : "index, follow",
  });
}
