import { useEffect, useRef } from "react";
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

/** What we last wrote into a node: its English key, and the exact text we rendered. */
type Origin = { key: string; rendered: string };

export function AutoTranslate() {
  const { lang } = useI18n();

  // These live OUTSIDE the effect so they survive a language change. Rebuilding
  // them per-language would force every already-translated node to be resolved
  // back to English through the reverse index, which is lossy — two languages
  // can translate different keys to the same string.
  const textOriginRef = useRef(new WeakMap<Text, Origin>());
  const attrOriginRef = useRef(new WeakMap<Element, Record<string, Origin>>());

  useEffect(() => {
    if (typeof document === "undefined" || !document.body) return;

    const textOrigin = textOriginRef.current;
    const attrOrigin = attrOriginRef.current;

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
      const trimmed = (node.nodeValue ?? "").trim();
      if (!trimmed) return null;
      const known = textOrigin.get(node);
      // If the node still shows exactly what we last rendered into it, reuse the
      // stored key instead of re-deriving one from the current text. Re-deriving
      // our own output is what made text flicker: a translation can collide with
      // an unrelated English key (de "Batch" → "Charge", and "Charge" is a key in
      // its own right → "Belasten"), so the node resolved to a different key, got
      // rewritten, resolved back, and ping-ponged forever. React only reuses a
      // Text node with *different* content, which the mismatch below still
      // catches — so dynamic values are unaffected.
      if (known && known.rendered === trimmed) return known.key;
      return toEnglishKey(trimmed);
    };

    const applyText = (node: Text) => {
      const key = englishForText(node);
      if (!key) return;
      const raw = node.nodeValue ?? "";
      const trimmed = raw.trim();
      const target = translateKey(key, lang);
      // Record what this node now shows so the next pass recognises our own
      // output rather than trying to reverse-engineer it.
      textOrigin.set(node, { key, rendered: target });
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
        const known = store?.[attr];
        // Same rule as text nodes: if the attribute still holds exactly what we
        // wrote, reuse the stored key rather than resolving our own output back
        // through the reverse index, which can land on a different key and flip.
        let key = known && known.rendered === trimmed ? known.key : undefined;
        if (!key) {
          const resolved = toEnglishKey(trimmed);
          if (!resolved) continue;
          key = resolved;
        }
        const target = translateKey(key, lang);
        store = store ?? {};
        store[attr] = { key, rendered: target };
        attrOrigin.set(el, store);
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
        // Drop only the records our own writes just produced. flush() is
        // synchronous, so nothing else can have touched the DOM in between.
        //
        // This deliberately does NOT disconnect/re-observe. disconnect() also
        // throws away records already queued but not yet delivered, so any React
        // commit landing between the observer callback and this animation frame
        // was silently lost and its nodes stayed untranslated — which is what
        // left a mix of English and Urdu on screen after switching language,
        // since a switch triggers a burst of re-renders.
        observer.takeRecords();
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
