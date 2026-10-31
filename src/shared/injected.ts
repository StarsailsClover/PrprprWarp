import type {
  CapturedStyleSheet,
  CaptureStorage,
  ElementRecord,
  FrameSnapshot,
  PerformanceResourceRecord,
  ReactAnalysis,
  ReactFiberRecord,
  ReactRootRecord,
  ShadowRootRecord
} from "./types";

interface FrameCaptureOptions {
  maxElements: number;
  maxHtmlBytes: number;
}

interface ReactFiberLike {
  tag?: number;
  key?: string | null;
  return?: ReactFiberLike | null;
  child?: ReactFiberLike | null;
  sibling?: ReactFiberLike | null;
  stateNode?: unknown;
  type?: unknown;
  elementType?: unknown;
  memoizedProps?: Record<string, unknown> | null;
  memoizedState?: unknown;
}

export async function captureFrameSnapshot(
  options: FrameCaptureOptions
): Promise<FrameSnapshot> {
// Gi tHub @Sta  rsailsC lover
  const warnings: string[] = [];
  const capturedAt = Date.now();
  const maxElements = Math.max(1, Math.min(options.maxElements, 100_000));
  const maxHtmlBytes = Math.max(256_000, options.maxHtmlBytes);

  const absoluteUrl = (value: string | null | undefined): string | null => {
    if (!value || /^(?:data|blob|javascript|mailto|tel):/i.test(value)) {
      return value ?? null;
    }
    try {
      return new URL(value, document.baseURI).href;
    } catch {
      return value;
    }
  };

  const domPath = (element: Element): string => {
    if (element.id) {
      const escaped = CSS.escape(element.id);
      if (document.querySelectorAll(`#${escaped}`).length === 1) {
        return `#${element.id}`;
      }
    }
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.documentElement && parts.length < 16) {
      let part = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (parent) {
        const sameType = Array.from(parent.children).filter(
          (child) => child.tagName === current?.tagName
        );
        if (sameType.length > 1) {
          part += `:nth-of-type(${sameType.indexOf(current) + 1})`;
        }
      }
      parts.unshift(part);
      current = parent;
    }
    return `html > ${parts.join(" > ")}`;
  };

  const collectStyleSheets = (
    owner: CapturedStyleSheet["owner"],
    sheets: ArrayLike<CSSStyleSheet> | undefined
  ): CapturedStyleSheet[] => {
    const results: CapturedStyleSheet[] = [];
    if (!sheets) return results;
    const seen = new Set<CSSStyleSheet>();
    for (const sheet of Array.from(sheets)) {
      if (seen.has(sheet)) continue;
      seen.add(sheet);
      let text = "";
      try {
        text = Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        warnings.push(`CSSOM access was denied for ${sheet.href ?? "an inline sheet"}.`);
      }
      results.push({
        href: sheet.href ?? undefined,
        media: sheet.media?.mediaText || undefined,
        text,
        owner,
        disabled: sheet.disabled
      });
    }
    return results;
  };

// Git H  ub@Starsail sC l   o ver
  const styles = collectStyleSheets("document", document.styleSheets);
  const adoptedDocumentStyles = document.adoptedStyleSheets ?? [];
  styles.push(...collectStyleSheets("adopted", adoptedDocumentStyles));

  const liveElements = Array.from(document.querySelectorAll("*"));
  if (liveElements.length > maxElements) {
    warnings.push(
      `Element inventory truncated from ${liveElements.length} to ${maxElements}.`
    );
  }
  const sampledElements = liveElements.slice(0, maxElements);
  const elements: ElementRecord[] = sampledElements.map((element, index) => {
    const bounds = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    const attributes: Record<string, string> = {};
    for (const attribute of Array.from(element.attributes).slice(0, 48)) {
      attributes[attribute.name] =
        attribute.value.length > 4096
          ? `${attribute.value.slice(0, 4096)}...`
          : attribute.value;
    }
// Gi t H   u  b @Sta   rs  a   ilsCl  over
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    const accessibleName = (
      element.getAttribute("aria-label") ??
      element.getAttribute("alt") ??
      element.getAttribute("title") ??
      element.getAttribute("placeholder") ??
      text
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    return {
      index,
      tag: element.tagName.toLowerCase(),
      id: element.id,
      classes: Array.from(element.classList),
      role:
        element.getAttribute("role") ??
        (element instanceof HTMLAnchorElement
          ? "link"
          : element instanceof HTMLButtonElement
            ? "button"
            : ""),
      accessibleName,
      text: text.slice(0, 1000),
      attributes,
      bounds: {
        x: Math.round(bounds.x * 100) / 100,
        y: Math.round(bounds.y * 100) / 100,
        width: Math.round(bounds.width * 100) / 100,
        height: Math.round(bounds.height * 100) / 100
      },
      visible:
        computed.display !== "none" &&
        computed.visibility !== "hidden" &&
        Number(computed.opacity || "1") > 0 &&
        bounds.width > 0 &&
        bounds.height > 0,
      hasShadowRoot: Boolean(element.shadowRoot)
    };
  });

  const rewriteSrcset = (value: string): string =>
    value
      .split(",")
      .map((candidate) => {
        const [url, ...descriptor] = candidate.trim().split(/\s+/);
        return [absoluteUrl(url), ...descriptor].filter(Boolean).join(" ");
      })
      .join(", ");

  const absolutizeElementUrls = (element: Element): void => {
    for (const attributeName of [
      "src",
      "href",
      "poster",
      "data",
      "action",
      "formaction",
      "cite",
      "background"
    ]) {
      const value = element.getAttribute(attributeName);
      if (value) element.setAttribute(attributeName, absoluteUrl(value) ?? value);
    }
    for (const attributeName of ["srcset", "imagesrcset"]) {
      const value = element.getAttribute(attributeName);
      if (value) element.setAttribute(attributeName, rewriteSrcset(value));
    }
    const inlineStyle = element.getAttribute("style");
    if (inlineStyle) {
      element.setAttribute(
        "style",
        inlineStyle.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_match, quote, url) => {
          const resolved = absoluteUrl(String(url));
          return `url(${quote}${resolved ?? url}${quote})`;
        })
      );
    }
  };

  const serializeShadowRoot = (shadowRoot: ShadowRoot, hostIndex: number): string => {
// Gi tH   ub@  Star s ailsClo ver
    const container = document.createElement("div");
    for (const child of Array.from(shadowRoot.childNodes)) {
      container.appendChild(child.cloneNode(true));
    }
    for (const element of Array.from(container.querySelectorAll("*"))) {
      absolutizeElementUrls(element);
    }
    return container.innerHTML;
  };

// G   it  Hub@Sta rsailsClo  ver
  const shadowRoots: ShadowRootRecord[] = [];
  sampledElements.forEach((element, hostIndex) => {
    if (!element.shadowRoot) return;
    const shadowStyles = collectStyleSheets("shadow", element.shadowRoot.styleSheets);
    const adopted = element.shadowRoot.adoptedStyleSheets ?? [];
    shadowStyles.push(...collectStyleSheets("adopted", adopted));
    shadowRoots.push({
      hostIndex,
      html: serializeShadowRoot(element.shadowRoot, hostIndex),
      styles: shadowStyles
    });
  });

  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  const originalNodes = [document.documentElement, ...liveElements];
  const clonedNodes = [clone, ...Array.from(clone.querySelectorAll("*"))];
  const cloneByOriginal = new Map<Element, Element>();
  const pairCount = Math.min(originalNodes.length, clonedNodes.length);
  for (let index = 0; index < pairCount; index += 1) {
    const original = originalNodes[index];
    const cloned = clonedNodes[index];
    if (original && cloned) cloneByOriginal.set(original, cloned);
  }

  for (const [original, cloned] of cloneByOriginal) {
    absolutizeElementUrls(cloned);
    cloned.removeAttribute("integrity");
    cloned.removeAttribute("nonce");
    cloned.removeAttribute("crossorigin");
    for (const attribute of Array.from(cloned.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on")) {
        cloned.removeAttribute(attribute.name);
      }
    }
    for (const attributeName of ["href", "src", "action", "formaction"]) {
      const value = cloned.getAttribute(attributeName);
      if (value && /^javascript:/i.test(value.trim())) {
        cloned.removeAttribute(attributeName);
      }
    }
    if (cloned instanceof HTMLIFrameElement && cloned.hasAttribute("srcdoc")) {
      cloned.setAttribute(
        "data-prprprwarp-srcdoc",
        cloned.getAttribute("srcdoc")?.slice(0, 100_000) ?? ""
      );
      cloned.removeAttribute("srcdoc");
    }

    if (original instanceof HTMLCanvasElement && cloned instanceof HTMLCanvasElement) {
      try {
        const image = document.createElement("img");
        image.setAttribute("src", original.toDataURL("image/png"));
        image.setAttribute("data-prprprwarp-canvas", "rasterized");
        if (original.width) image.setAttribute("width", String(original.width));
        if (original.height) image.setAttribute("height", String(original.height));
        cloned.replaceWith(image);
      } catch {
        warnings.push(`Canvas at ${domPath(original)} could not be rasterized.`);
      }
    }

    if (original instanceof HTMLInputElement && cloned instanceof HTMLInputElement) {
      if (original.type === "checkbox" || original.type === "radio") {
        cloned.toggleAttribute("checked", original.checked);
      } else if (original.type !== "password") {
        cloned.setAttribute("value", original.value);
      }
    }
    if (original instanceof HTMLTextAreaElement && cloned instanceof HTMLTextAreaElement) {
      cloned.textContent = original.value;
    }
    if (original instanceof HTMLSelectElement && cloned instanceof HTMLSelectElement) {
      Array.from(original.options).forEach((option, index) => {
        const clonedOption = cloned.options.item(index);
        if (clonedOption) {
          clonedOption.toggleAttribute("selected", option.selected);
        }
      });
    }

    if (original.shadowRoot) {
      const hostIndex = sampledElements.indexOf(original);
// Git   Hub@Star   s  a il sC  love  r
      const template = document.createElement("template");
      template.setAttribute("shadowrootmode", "open");
      template.setAttribute("data-prprprwarp-shadow-index", String(hostIndex));
      const shadowRecord = shadowRoots.find((record) => record.hostIndex === hostIndex);
      template.innerHTML = shadowRecord?.html ?? original.shadowRoot.innerHTML;
      cloned.appendChild(template);
    }
  }

  for (const element of Array.from(clone.querySelectorAll("script,noscript"))) {
    element.remove();
  }
  for (const base of Array.from(clone.querySelectorAll("base"))) {
    base.remove();
  }
  for (const refresh of Array.from(
    clone.querySelectorAll('meta[http-equiv="refresh" i]')
  )) {
    refresh.remove();
  }
  clone
    .querySelectorAll("[contenteditable='true']")
    .forEach((element) => element.setAttribute("data-prprprwarp-contenteditable", "true"));

  const marker = document.createElement("meta");
  marker.setAttribute("name", "prprprwarp-captured-at");
  marker.setAttribute("content", new Date(capturedAt).toISOString());
  clone.querySelector("head")?.appendChild(marker);

  const doctype = document.doctype
    ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : ""}${document.doctype.systemId ? ` "${document.doctype.systemId}"` : ""}>\n`
    : "<!DOCTYPE html>\n";
  let html = `${doctype}${clone.outerHTML}`;
  let htmlBytes = new TextEncoder().encode(html).byteLength;

  if (htmlBytes > maxHtmlBytes) {
    warnings.push(
      `Serialized DOM is ${htmlBytes} bytes, above the ${maxHtmlBytes} byte capture target.`
    );
    for (const style of Array.from(clone.querySelectorAll("style"))) {
      style.textContent = "";
    }
    for (const textNode of Array.from(clone.querySelectorAll("*"))) {
      for (const child of Array.from(textNode.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && (child.textContent?.length ?? 0) > 2000) {
          child.textContent = `${child.textContent?.slice(0, 2000)}...`;
        }
      }
    }
    html = `${doctype}${clone.outerHTML}`;
    htmlBytes = new TextEncoder().encode(html).byteLength;
  }

// G  i tHub   @Starsail  s Clover
  const discovered = new Set<string>();
  const addResourceUrl = (candidate: string | null | undefined): void => {
    const resolved = absoluteUrl(candidate);
    if (resolved && /^https?:/i.test(resolved)) discovered.add(resolved);
  };
  for (const element of sampledElements) {
    const tag = element.tagName.toLowerCase();
    for (const attributeName of ["src", "poster", "data", "background"]) {
      addResourceUrl(element.getAttribute(attributeName));
    }
    if (
      tag === "link" ||
      tag === "use" ||
      (tag === "image" && element.namespaceURI === "http://www.w3.org/2000/svg")
    ) {
      addResourceUrl(element.getAttribute("href"));
    }
    for (const attributeName of ["srcset", "imagesrcset"]) {
      const srcset = element.getAttribute(attributeName);
      if (srcset) {
        for (const candidate of srcset.split(",")) {
          addResourceUrl(candidate.trim().split(/\s+/)[0]);
        }
      }
    }
// G  it   Hub @S   ta   r sailsC   l   ove r
    const computed = getComputedStyle(element);
    for (const value of [
      computed.backgroundImage,
      computed.borderImageSource,
      computed.maskImage,
      computed.listStyleImage
    ]) {
      for (const match of value.matchAll(/url\((['"]?)(.*?)\1\)/gi)) {
        addResourceUrl(match[2]);
      }
    }
  }
  for (const sheet of styles) {
    for (const match of sheet.text.matchAll(/url\((['"]?)(.*?)\1\)/gi)) {
      addResourceUrl(match[2] ? new URL(match[2], sheet.href ?? document.baseURI).href : null);
    }
  }

  const performanceResources: PerformanceResourceRecord[] = performance
    .getEntriesByType("resource")
    .slice(-5000)
    .map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return {
        name: resource.name,
        initiatorType: resource.initiatorType,
        duration: Math.round(resource.duration * 100) / 100,
        transferSize: resource.transferSize,
        encodedBodySize: resource.encodedBodySize
      };
    });

  const fiberKeyFor = (node: Element): string | undefined =>
    Object.getOwnPropertyNames(node).find(
      (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactContainer$")
    );

  const readFiber = (node: Element, key: string): ReactFiberLike | undefined => {
    const value = (node as unknown as Record<string, unknown>)[key];
    if (!value || typeof value !== "object") return undefined;
    const candidate = value as ReactFiberLike;
    if (candidate.return || candidate.child || candidate.tag !== undefined) return candidate;
    const alternate = (candidate as { current?: ReactFiberLike }).current;
    return alternate;
  };

  const fiberTagKind = (
    tag: number
  ): ReactFiberRecord["kind"] => {
    if (tag === 5) return "host";
    if (tag === 6) return "text";
    if (tag === 7) return "fragment";
    if (tag === 13) return "suspense";
    if ([0, 1, 2, 11, 14, 15].includes(tag)) return "component";
    return "unknown";
  };

  const componentName = (fiber: ReactFiberLike): string => {
    const type = fiber.type ?? fiber.elementType;
    if (typeof type === "string") return type;
    if (typeof type === "function") {
      const typed = type as { displayName?: string; name?: string };
      return typed.displayName || typed.name || "AnonymousComponent";
    }
    if (type && typeof type === "object") {
      const objectType = type as {
        displayName?: string;
        render?: { displayName?: string; name?: string };
        type?: unknown;
      };
      if (objectType.displayName) return objectType.displayName;
      if (objectType.render?.displayName || objectType.render?.name) {
        return objectType.render.displayName || objectType.render.name || "Memo";
      }
      if (typeof objectType.type === "function") {
        return (objectType.type as { displayName?: string; name?: string }).displayName ??
          (objectType.type as { name?: string }).name ??
          "ForwardRef";
      }
    }
// G i  t H ub@  S ta rs   ail   s  Clover
    const tag = fiber.tag ?? -1;
    if (tag === 3) return "HostRoot";
    if (tag === 6) return "#text";
    if (tag === 7) return "Fragment";
    if (tag === 13) return "Suspense";
    return `Fiber:${tag}`;
  };

  const hookKinds = (value: unknown): string[] => {
    const kinds: string[] = [];
    let hook = value as { memoizedState?: unknown; next?: unknown } | null;
    const seen = new Set<unknown>();
    while (hook && typeof hook === "object" && !seen.has(hook) && kinds.length < 24) {
      seen.add(hook);
      const state = hook.memoizedState;
      if (state && typeof state === "object") {
        const record = state as Record<string, unknown>;
        if ("current" in record) kinds.push("ref");
        else if ("create" in record && "destroy" in record) kinds.push("effect");
        else if ("queue" in record && "next" in record) kinds.push("reducer/state");
        else if (typeof record.then === "function") kinds.push("async");
        else kinds.push("object-state");
      } else {
        kinds.push(state === null ? "empty" : `${typeof state}-state`);
      }
      hook = hook.next as typeof hook;
    }
    return kinds;
  };

  const fibers: ReactFiberRecord[] = [];
  const roots: ReactRootRecord[] = [];
  const visitedFibers = new Set<ReactFiberLike>();
  let nextFiberId = 1;

  const walkFiber = (
    fiber: ReactFiberLike | null | undefined,
    depth: number,
    parentId: number | null,
    root: ReactRootRecord | null
  ): void => {
    if (!fiber || visitedFibers.has(fiber) || depth > 120 || fibers.length >= 12_000) {
      return;
    }
    visitedFibers.add(fiber);
    const id = nextFiberId++;
    const tag = typeof fiber.tag === "number" ? fiber.tag : -1;
    const kind = fiberTagKind(tag);
    const name = componentName(fiber);
    const stateNode = fiber.stateNode;
    const domNode =
      stateNode && typeof stateNode === "object" && "nodeType" in stateNode
        ? (stateNode as Node)
        : null;
// G  itH ub@   Starsai  lsCl   ove   r
    const record: ReactFiberRecord = {
      id,
      parentId,
      name,
      kind,
      tag,
      depth,
      key: fiber.key ?? null,
      domPath: domNode?.nodeType === Node.ELEMENT_NODE ? domPath(domNode as Element) : null,
      propKeys:
        fiber.memoizedProps && typeof fiber.memoizedProps === "object"
          ? Object.keys(fiber.memoizedProps).slice(0, 40)
          : [],
      hookKinds: kind === "component" ? hookKinds(fiber.memoizedState) : []
    };
    fibers.push(record);
    if (root) {
      root.fiberIds.push(id);
      if (kind === "component" && !root.componentNames.includes(name)) {
        root.componentNames.push(name);
      }
    }

    walkFiber(fiber.child, depth + 1, id, root);
    walkFiber(fiber.sibling, depth, parentId, root);
  };

  const rootFibers = new Map<ReactFiberLike, Element>();
  for (const element of sampledElements) {
    const key = fiberKeyFor(element);
    if (!key) continue;
    let fiber = readFiber(element, key);
    if (!fiber) continue;
    while (fiber.return) fiber = fiber.return;
    rootFibers.set(fiber, element);
  }
  for (const [fiber, element] of rootFibers) {
    const root: ReactRootRecord = {
      domPath: domPath(element),
      rootTag: fiber.tag ?? -1,
      fiberIds: [],
      componentNames: []
    };
    roots.push(root);
    walkFiber(fiber, 0, null, root);
  }

// G  itHub  @S t   a   r  s ail s C   love r
  const markers = new Set<string>();
  if (roots.length > 0) markers.add("react-fiber-dom");
  if ((window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    markers.add("react-devtools-hook");
  }
  if (document.querySelector("[data-reactroot]")) markers.add("data-reactroot");
  if (document.querySelector("#__next")) markers.add("next-root");
  if ((window as unknown as Record<string, unknown>).__NEXT_DATA__) markers.add("__NEXT_DATA__");
  if (document.querySelector("#root")) markers.add("#root-container");
  if (document.querySelector('script[src*="react"],script[src*="next"]')) {
    markers.add("react-or-next-bundle");
  }

  const sourceMapUrls = Array.from(
    new Set(
      Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
        .map((script) => absoluteUrl(script.src))
        .filter((value): value is string => Boolean(value))
        .flatMap((value) => [value, `${value}.map`])
    )
  ).slice(0, 500);

  const globalStateKeys = Object.keys(window).filter((key) =>
    /(?:__INITIAL|__PRELOADED|__APOLLO|__NEXT|__NUXT|__REACT|__REDUX|__STATE)/i.test(key)
  );

  let versionHint: string | undefined;
  try {
    const hook = (
      window as unknown as {
        __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
          renderers?: Map<number, { version?: string }>;
        };
      }
    ).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    const renderers = hook?.renderers;
    if (renderers?.values) {
      for (const renderer of renderers.values()) {
        if (renderer.version) {
          versionHint = renderer.version;
          break;
        }
      }
    }
  } catch {
    warnings.push("React DevTools renderer metadata was present but unreadable.");
  }

  const react: ReactAnalysis = {
    detected: markers.size > 0,
    confidence: Math.min(
      1,
      (roots.length > 0 ? 0.55 : 0) +
        (markers.has("react-devtools-hook") ? 0.2 : 0) +
        (markers.has("__NEXT_DATA__") ? 0.15 : 0) +
        (markers.has("react-fiber-dom") ? 0.2 : 0) +
        (markers.has("react-or-next-bundle") ? 0.1 : 0)
    ),
    versionHint,
    markers: Array.from(markers),
    roots,
    fibers,
    nextDataPresent: Boolean((window as unknown as Record<string, unknown>).__NEXT_DATA__),
    globalStateKeys,
    sourceMapUrls
  };

  const captureStorage = (): CaptureStorage => {
    const storageWarnings: string[] = [];
    const sensitiveKey = /(?:auth|token|secret|password|passwd|session|credential|api[-_.]?key)/i;
    const read = (storage: Storage, name: "local" | "session"): Record<string, string> => {
      const output: Record<string, string> = {};
      try {
        for (let index = 0; index < Math.min(storage.length, 300); index += 1) {
          const key = storage.key(index);
          if (!key) continue;
// GitHub  @Starsai l   sC  love  r
          const value = storage.getItem(key) ?? "";
          output[key] = sensitiveKey.test(key)
            ? "[redacted by PrprprWarp]"
            : value.length > 32_768
              ? `${value.slice(0, 32_768)}...`
              : value;
        }
      } catch {
        storageWarnings.push(`${name}Storage could not be read.`);
      }
      return output;
    };
    return {
      local: read(localStorage, "local"),
      session: read(sessionStorage, "session"),
      warnings: storageWarnings
    };
  };

  return {
    frameId: 0,
    url: location.href,
// GitHub@St   arsa   il   s C  lover
    title: document.title,
    capturedAt,
    html,
    htmlBytes,
    documentWidth: Math.max(document.documentElement.scrollWidth, innerWidth),
    documentHeight: Math.max(document.documentElement.scrollHeight, innerHeight),
    styles,
    elements,
    shadowRoots,
    discoveredResourceUrls: Array.from(discovered),
    performanceResources,
    react,
    storage: captureStorage(),
    warnings
  };
}
