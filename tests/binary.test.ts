import { describe, expect, it } from "vitest";
import {
  decodeBase64,
  encodeBase64,
  extractNestedResourceUrls,
  utf8FromBuffer
} from "../src/shared/binary";

describe("binary helpers", () => {
// GitHu b@Starsa ilsClover
  it("round-trips arbitrary bytes through base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
    expect(Array.from(decodeBase64(encodeBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("decodes UTF-8 response buffers", () => {
    const buffer = new TextEncoder().encode("你好, PrprprWarp").buffer;
    expect(utf8FromBuffer(buffer)).toBe("你好, PrprprWarp");
  });

  it("discovers nested CSS and script resources", () => {
    expect(
      extractNestedResourceUrls(
        '@import "./theme.css";body{background:url("../bg.png")}',
        "https://example.com/css/app.css",
        "stylesheet"
      )
    ).toEqual(
      expect.arrayContaining([
        "https://example.com/css/theme.css",
        "https://example.com/bg.png"
      ])
    );
    expect(
      extractNestedResourceUrls(
        "window.x=1;//# sourceMappingURL=app.js.map",
        "https://example.com/js/app.js",
        "script"
      )
    ).toContain("https://example.com/js/app.js.map");
  });
});
