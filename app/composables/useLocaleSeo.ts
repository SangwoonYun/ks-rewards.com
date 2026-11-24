import { useHead, useLocaleHead } from '#imports';

// <html lang>, hreflang alternates, canonical and og:locale for the translated public pages
export function useLocaleSeo() {
  const head = useLocaleHead();
  useHead(() => ({
    htmlAttrs: { lang: head.value.htmlAttrs.lang },
    link: [...(head.value.link || [])],
    meta: [...(head.value.meta || [])]
  }));
}
