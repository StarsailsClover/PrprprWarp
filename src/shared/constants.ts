import type { CaptureOptions } from "./types";

export const APP_NAME = "PrprprWarp";
export const DB_NAME = "prprprwarp";
export const DB_VERSION = 1;
export const OFFSCREEN_PATH = "offscreen.html";
export const RELEASE_TAG = "v26.0-Alpha.1";
export const EXTENSION_VERSION = "26.0.0.1";
export const ARCHIVE_SCHEMA = "prprprwarp.archive/v1";
export const CAPTURE_SCHEMA = "prprprwarp.capture/v1";

// G it Hub @  Stars   ail sClov er
export const DEFAULT_OPTIONS: CaptureOptions = {
  captureDelayMs: 1400,
  maxElements: 25_000,
  maxHtmlBytes: 6 * 1024 * 1024,
  maxResourceBytes: 32 * 1024 * 1024,
  maxSessionBytes: 256 * 1024 * 1024,
  includeLiveView: true,
  redactSensitiveHeaders: true,
  autoExportOnStop: true
};

export const SESSION_STORAGE_KEY = "prprprwarp.active-sessions";
export const OPTIONS_STORAGE_KEY = "prprprwarp.options";
export const MAX_RECENT_SESSIONS = 12;
