import { useEffect } from "react";
import { useI18n, EN_KEYS, toEnglishKey, translateKey } from "@/lib/i18n";

/**
 * DOM auto-translation layer.
 *
 * Instead of wrapping every string in every file with t(), this component walks
 * the rendered DOM and swaps any text / placeholder / title / aria-label whose
 * value exactly matches a dictionary key (see src/locales/*). Because React
 * always renders the English source text, screens that were never touched still
 * get translated as soon as their strings exist in the locale files — you only
 * maintain the three dictionaries, not 140 route files.
 *
 * Safety: only exact dictionary matches are ever replaced, so dynamic data
 * (product names, numbers, user input) is never mangled. Add `data-no-i18n` to
 * any element whose subtree must stay verbatim.
 */

// Element tags whose text content must never be treated as UI copy.
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "CODE", "PRE", "TEXTAREA", "INPUT", "SELECT", "OPTION",
]);

const ATTRS = ["placeholder", "title", "aria-label"] as const;

const OBSERVER_CONFIG: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: [...ATTRS],
};

export function AutoTranslate() {
  const { lang } = useI18n();

  useEffect(() => {
    if (typeof document === "undefined" || !document.body) return;

    // Remember each node's original English source so re-translating between
    // languages (ar → ur) always resolves from English, not from a translation.
    const textOrigin = new WeakMap<Text, string>();
    const attrOrigin = new WeakMap<Element, Record<string, string>>();

    const shouldSkip = (el: Element | null): boolean => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        if (n instanceof SVGElement) return true;
        if (SKIP_TAGS.has(n.tagName)) return true;
        if (n.hasAttribute("data-no-i18n")) return true;
        if (n.getAttribute("contenteditable") === "true") return true;
      }
      return false;
    };

    const englishForText = (node: Text): string | null => {
      const raw = node.nodeValue ?? "";
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const known = textOrigin.get(node);
      if (known) return known;
      const key = toEnglishKey(trimmed);
      if (key) textOrigin.set(node, key);
      return key;
    };

    const applyText = (node: Text) => {
      const key = englishForText(node);
      if (!key) return;
      const raw = node.nodeValue ?? "";
      const trimmed = raw.trim();
      const target = translateKey(key, lang);
      if (trimmed === target) return;
      // preserve any leading/trailing whitespace around the label
      const next = raw.replace(trimmed, target);
      if (node.nodeValue !== next) node.nodeValue = next;
    };

    const applyAttrs = (el: Element) => {
      for (const attr of ATTRS) {
        if (!el.hasAttribute(attr)) continue;
        const cur = el.getAttribute(attr) ?? "";
        const trimmed = cur.trim();
        if (!trimmed) continue;
        let store = attrOrigin.get(el);
        let key = store?.[attr];
        if (!key) {
          const resolved = toEnglishKey(trimmed);
          if (!resolved) continue;
          key = resolved;
          store = store ?? {};
          store[attr] = key;
          attrOrigin.set(el, store);
        }
        const target = translateKey(key, lang);
        const next = cur.replace(trimmed, target);
        if (cur !== next) el.setAttribute(attr, next);
      }
    };

    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        if (!shouldSkip((root as Text).parentElement)) applyText(root as Text);
        return;
      }
      if (!(root instanceof Element) && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

      // Never descend into a skipped subtree (SVG charts, code, editors, inputs,
      // data-no-i18n). Charts animate constantly; walking into them every frame is
      // what caused the jank on chart-heavy pages.
      if (root instanceof Element && shouldSkip(root)) return;

      if (root instanceof Element) applyAttrs(root);

      const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const texts: Text[] = [];
      for (let n = textWalker.nextNode(); n; n = textWalker.nextNode()) texts.push(n as Text);
      for (const t of texts) {
        if (!shouldSkip(t.parentElement)) applyText(t);
      }

      const elWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      for (let n = elWalker.nextNode(); n; n = elWalker.nextNode()) {
        const el = n as Element;
        if (!shouldSkip(el)) applyAttrs(el);
      }
    };

    let scheduled = false;
    const pending: Node[] = [];

    const flush = () => {
      scheduled = false;
      const batch = pending.splice(0);
      // Detach while we write so our own mutations don't re-trigger the observer.
      observer.disconnect();
      try {
        for (const node of batch) {
          if (node.isConnected === false) continue;
          if (node.nodeType === Node.TEXT_NODE) {
            if (!shouldSkip((node as Text).parentElement)) applyText(node as Text);
          } else {
            walk(node);
          }
        }
      } finally {
        // Always re-attach, even if a translation threw, so the observer never dies.
        observer.observe(document.body, OBSERVER_CONFIG);
      }
    };

    // Nearest element for a mutated node (self if element, else parent).
    const elementOf = (n: Node): Element | null =>
      n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement;

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // Drop mutations originating inside a skipped context BEFORE queuing any
        // work. Recharts/SVG animations fire thousands of these per second; without
        // this guard we'd scan chart subtrees every frame and the UI would stutter.
        if (m.type === "characterData" || m.type === "attributes") {
          if (shouldSkip(elementOf(m.target))) continue;
          pending.push(m.target);
        } else {
          m.addedNodes.forEach((n) => {
            if (!shouldSkip(elementOf(n))) pending.push(n);
          });
        }
      }
      if (!scheduled && pending.length) {
        scheduled = true;
        requestAnimationFrame(flush);
      }
    });

    // Initial full pass for the current language, then start observing.
    walk(document.body);
    observer.observe(document.body, OBSERVER_CONFIG);

    return () => observer.disconnect();
  }, [lang]);

  return null;
}

// Re-exported so callers can reference the key set without reaching into i18n.
export { EN_KEYS };
