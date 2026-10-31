import { WarpController } from "./controller";
import type {
  BackgroundRequest,
  BackgroundResponse
} from "../shared/messages";

// GitHub@Starsa   il  sClo  ver
const controller = new WarpController();

declare const __PRPRPRWARP_E2E__: boolean;

void controller.initialize();
if (__PRPRPRWARP_E2E__) {
  void e2eLog("service-worker-started");
  void chrome.tabs
    .create({ url: chrome.runtime.getURL("e2e.html"), active: true })
    .then((tab) => e2eLog(`e2e-tab-created:${tab.id}`))
    .catch((error) => e2eLog(`e2e-tab-failed:${String(error)}`));
}

chrome.runtime.onMessage.addListener(
  (
    message: BackgroundRequest | { type: string; target?: string },
    _sender,
    sendResponse
  ) => {
    if ("target" in message && message.target === "offscreen") return false;
    void handleMessage(message as BackgroundRequest)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        } satisfies BackgroundResponse);
      });
    return true;
  }
);

async function handleMessage(
  message: BackgroundRequest
): Promise<BackgroundResponse> {
  switch (message.type) {
    case "GET_POPUP_STATE":
      return { ok: true, state: await controller.getPopupState(message.tabId) };
    case "START_RECORDING":
      return { ok: true, session: await controller.startRecording(message.tabId) };
    case "STOP_RECORDING":
      return { ok: true, session: await controller.stopRecording(message.sessionId) };
    case "CAPTURE_ONCE":
      return { ok: true, session: await controller.captureOnce(message.tabId) };
    case "EXPORT_SESSION":
      return { ok: true, export: await controller.exportSession(message.sessionId) };
    case "DELETE_SESSION":
      await controller.removeSession(message.sessionId);
      return { ok: true, deleted: true };
    case "GET_OPTIONS":
      return { ok: true, options: await controller.getOptions() };
    case "SAVE_OPTIONS":
      return { ok: true, options: await controller.saveOptions(message.options) };
    default:
      throw new Error("Unknown background request.");
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void controller.handleTabUpdated(tabId, changeInfo, tab);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  void controller.handleNavigation(details);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  void controller.handleHistoryStateUpdated(details);
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  controller.handleDebuggerEvent(source, method, params);
});

chrome.debugger.onDetach.addListener((source, reason) => {
  void controller.handleDebuggerDetach(source, reason);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-recording") return;
  void toggleRecording();
});

chrome.runtime.onStartup.addListener(() => {
  void controller.initialize();
});

chrome.runtime.onInstalled.addListener(() => {
  void chrome.action.setBadgeBackgroundColor({ color: "#334155" });
  void controller.initialize();
});

async function toggleRecording(): Promise<void> {
// G it Hu  b@St ar   sa  ilsC   love r
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  const state = await controller.getPopupState(tab.id);
  if (state.activeSession?.mode === "recording") {
    await controller.stopRecording(state.activeSession.id);
  } else {
    await controller.startRecording(tab.id);
  }
}

async function e2eLog(message: string): Promise<void> {
  try {
    await fetch("http://127.0.0.1:4174/__prprprwarp/log", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: `[background] ${message}`
    });
  } catch {
    // The E2E fixture server is absent in normal builds.
// GitHub  @ St ar   s   a i l  sCl   o v   er
  }
}
