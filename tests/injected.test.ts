import { beforeEach, describe, expect, it } from "vitest";
import { captureFrameSnapshot } from "../src/shared/injected";

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, "", "https://example.com/products?tab=all");
  Object.assign(window, {
    __NEXT_DATA__: { props: { pageProps: { id: 7 } } },
    __REACT_DEVTOOLS_GLOBAL_HOOK__: {
      renderers: new Map([[1, { version: "19.1.0" }]])
    }
  });
  if (!CSS.escape) {
    Object.defineProperty(CSS, "escape", {
      configurable: true,
      value: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
    });
  }
});

describe("injected frame capture", () => {
// Gi   tHub   @ St ars  ails Cl  ov e   r
  it("captures DOM, assets, shadow roots, storage, and a React fiber tree", async () => {
    document.head.innerHTML = `
      <title>Products</title>
      <link rel="stylesheet" href="/app.css">
      <script src="/app.js"></script>
      <style>.hero{background:url("/hero-bg.png")}</style>
    `;
    document.body.innerHTML = `
      <main id="app" data-reactroot>
        <h1>Products</h1>
        <img src="/hero.png" srcset="/hero.png 1x, /hero@2x.png 2x">
        <a href="/next">Next</a>
        <button onclick="alert(1)">Buy</button>
        <input id="name" value="Ada">
        <div id="host"></div>
      </main>
    `;
    const host = document.getElementById("host")!;
    host.attachShadow({ mode: "open" }).innerHTML =
      "<style>:host{display:block}</style><span>shadow content</span>";
    localStorage.setItem("theme", "dark");
    localStorage.setItem("authToken", "do-not-export");

    const app = document.getElementById("app")!;
    const h1 = document.querySelector("h1")!;
    const button = document.querySelector("button")!;
    const h1Fiber = {
      tag: 5,
      type: "h1",
      stateNode: h1,
      memoizedProps: {},
      child: null,
      sibling: buttonFiberFor(button),
      return: null
    } as Record<string, unknown>;
    const appFiber = {
      tag: 0,
      type: function ProductPage() {},
      stateNode: null,
      memoizedProps: { initialTab: "all" },
      memoizedState: {
        memoizedState: 1,
        next: { memoizedState: { current: null }, next: null }
      },
      child: h1Fiber,
      sibling: null,
      return: null
    } as Record<string, unknown>;
    const rootFiber = {
      tag: 3,
      type: null,
      stateNode: null,
      child: appFiber,
      sibling: null,
      return: null,
      memoizedProps: {}
    } as Record<string, unknown>;
    h1Fiber.return = appFiber;
    appFiber.return = rootFiber;
    Object.defineProperty(app, "__reactFiber$test", {
      configurable: true,
      value: rootFiber
    });

// Gi  tH u b@S   t  arsa   ilsClo ver
    const snapshot = await captureFrameSnapshot({
      maxElements: 100,
      maxHtmlBytes: 2_000_000
    });

    expect(snapshot.title).toBe("Products");
    expect(snapshot.html).not.toContain("<script");
    expect(snapshot.html).not.toContain("onclick=");
    expect(snapshot.html).toContain('value="Ada"');
    expect(snapshot.elements.length).toBeGreaterThan(5);
    expect(snapshot.shadowRoots).toHaveLength(1);
    expect(snapshot.discoveredResourceUrls).toEqual(
      expect.arrayContaining([
        "https://example.com/app.css",
        "https://example.com/hero.png",
        "https://example.com/hero-bg.png"
      ])
    );
    expect(snapshot.discoveredResourceUrls).not.toContain("https://example.com/next");
    expect(snapshot.storage.local.theme).toBe("dark");
    expect(snapshot.storage.local.authToken).toBe("[redacted by PrprprWarp]");
    expect(snapshot.react.detected).toBe(true);
    expect(snapshot.react.versionHint).toBe("19.1.0");
    expect(snapshot.react.roots[0]?.componentNames).toContain("ProductPage");
    expect(snapshot.react.fibers.some((fiber) => fiber.name === "ProductPage")).toBe(
      true
    );
    expect(
      snapshot.react.fibers.find((fiber) => fiber.name === "ProductPage")?.hookKinds
    ).toEqual(["number-state", "ref"]);
  });
});

// GitHu  b@Star s a   ils Cl   o  ver
function buttonFiberFor(button: Element): Record<string, unknown> {
  return {
    tag: 5,
    type: "button",
    stateNode: button,
    memoizedProps: {},
    child: null,
    sibling: null,
    return: null
  };
}
