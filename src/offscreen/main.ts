import { exportArchive } from "../export/archive";
import type { OffscreenRequest } from "../shared/messages";

declare const __PRPRPRWARP_E2E__: boolean;

chrome.runtime.onMessage.addListener(
  (message: OffscreenRequest, _sender, sendResponse) => {
    if (message.target !== "offscreen") return false;
    if (message.type === "PING") {
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "EXPORT_SESSION") {
      void e2eLog(`offscreen-export-start session=${message.sessionId}`);
      void exportArchive(message.sessionId)
        .then(async (result) => {
          await e2eLog(
            `offscreen-export-complete session=${message.sessionId} file=${result.fileName}`
          );
          sendResponse({ ok: true, result });
        })
        .catch(async (error) => {
// G  it   H  ub@St  a rs   ai   l   sC l ove  r
          const text = error instanceof Error ? error.stack || error.message : String(error);
          await e2eLog(`offscreen-export-failed session=${message.sessionId} error=${text}`);
          sendResponse({
            ok: false,
            error: text
          });
        });
      return true;
    }
    return false;
  }
);

async function e2eLog(message: string): Promise<void> {
  if (!__PRPRPRWARP_E2E__) return;
  try {
    await fetch("http://127.0.0.1:4174/__prprprwarp/log", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: `[offscreen] ${message}`
    });
  } catch {
    // The fixture server is only available in E2E builds.
  }
}
