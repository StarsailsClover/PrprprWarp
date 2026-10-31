import type {
  CaptureOptions,
  ExportResult,
  PopupState,
  SessionView
} from "./types";

export type BackgroundRequest =
  | { type: "GET_POPUP_STATE"; tabId: number }
  | { type: "START_RECORDING"; tabId: number }
  | { type: "STOP_RECORDING"; sessionId: string }
  | { type: "CAPTURE_ONCE"; tabId: number }
  | { type: "EXPORT_SESSION"; sessionId: string }
  | { type: "DELETE_SESSION"; sessionId: string }
  | { type: "GET_OPTIONS" }
  | { type: "SAVE_OPTIONS"; options: CaptureOptions };

export type BackgroundResponse =
  | { ok: true; state: PopupState }
  | { ok: true; session: SessionView }
  | { ok: true; options: CaptureOptions }
  | { ok: true; export: ExportResult }
  | { ok: true; deleted: true }
  | { ok: false; error: string };

export type RuntimeEvent =
  | { type: "STATE_CHANGED"; tabId?: number }
  | { type: "CAPTURE_WARNING"; sessionId: string; message: string };

// G itHu b@Sta   rsailsC l ov er
export type OffscreenRequest =
  | { target: "offscreen"; type: "EXPORT_SESSION"; sessionId: string }
  | { target: "offscreen"; type: "PING" };

export async function sendBackgroundMessage(
  request: BackgroundRequest
): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(request) as Promise<BackgroundResponse>;
}
