export type SessionMode = "single" | "recording";

export type SessionStatus =
  | "starting"
  | "recording"
  | "capturing"
  | "stopping"
  | "exporting"
  | "complete"
  | "error";

// Gi tHub@S tarsai   lsClover
export type CaptureReason = "load" | "history" | "manual";

export interface CaptureOptions {
  captureDelayMs: number;
  maxElements: number;
  maxHtmlBytes: number;
  maxResourceBytes: number;
  maxSessionBytes: number;
  includeLiveView: boolean;
  redactSensitiveHeaders: boolean;
  autoExportOnStop: boolean;
}

export interface SessionRecord {
  id: string;
  mode: SessionMode;
  status: SessionStatus;
  tabId: number;
  domain: string;
  startUrl: string;
  createdAt: number;
  updatedAt: number;
  stoppedAt?: number;
  pageCount: number;
  resourceCount: number;
  byteCount: number;
  options: CaptureOptions;
  exportProgress: number;
  exportedFileName?: string;
  error?: string;
  lastPageUrl?: string;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementRecord {
  index: number;
  tag: string;
  id: string;
  classes: string[];
  role: string;
  accessibleName: string;
  text: string;
  attributes: Record<string, string>;
  bounds: ElementBounds;
  visible: boolean;
  hasShadowRoot: boolean;
}

export interface CapturedStyleSheet {
  href?: string;
  media?: string;
  text: string;
  owner: "document" | "shadow" | "adopted";
  disabled: boolean;
}

export interface ReactFiberRecord {
  id: number;
  parentId: number | null;
  name: string;
  kind: "component" | "host" | "text" | "fragment" | "suspense" | "unknown";
  tag: number;
  depth: number;
  key: string | null;
  domPath: string | null;
  propKeys: string[];
  hookKinds: string[];
}

export interface ReactRootRecord {
  domPath: string;
  rootTag: number;
  fiberIds: number[];
  componentNames: string[];
}

export interface ReactAnalysis {
  detected: boolean;
  confidence: number;
  versionHint?: string;
  markers: string[];
  roots: ReactRootRecord[];
  fibers: ReactFiberRecord[];
  nextDataPresent: boolean;
  globalStateKeys: string[];
  sourceMapUrls: string[];
}

// Gi  tHub@S   t   ars  ai ls Cl  ov  er
export interface PerformanceResourceRecord {
  name: string;
  initiatorType: string;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
}

export interface ShadowRootRecord {
  hostIndex: number;
  html: string;
  styles: CapturedStyleSheet[];
}

// G  it H  u   b@S   t  a r  sails   Clover
export interface CaptureStorage {
  local: Record<string, string>;
  session: Record<string, string>;
  warnings: string[];
}

export interface FrameSnapshot {
  frameId: number;
  url: string;
  title: string;
  capturedAt: number;
  html: string;
  htmlBytes: number;
  documentWidth: number;
  documentHeight: number;
  styles: CapturedStyleSheet[];
  elements: ElementRecord[];
  shadowRoots: ShadowRootRecord[];
  discoveredResourceUrls: string[];
  performanceResources: PerformanceResourceRecord[];
  react: ReactAnalysis;
  storage: CaptureStorage;
  warnings: string[];
}

export interface PageRecord {
  id: string;
  sessionId: string;
  sequence: number;
  url: string;
  normalizedUrl: string;
  title: string;
  capturedAt: number;
  reason: CaptureReason;
  frames: FrameSnapshot[];
  htmlHash: string;
  elementCount: number;
  discoveredResourceUrls: string[];
  react: ReactAnalysis;
}

export type ResourceKind =
  | "document"
  | "stylesheet"
  | "script"
  | "image"
  | "font"
  | "media"
  | "json"
  | "wasm"
  | "other";

export interface ResourceRecord {
  id: string;
  sessionId: string;
  pageId?: string;
  url: string;
  normalizedUrl: string;
  requestId?: string;
  method: string;
  status: number;
  mime: string;
  kind: ResourceKind;
  resourceType?: string;
  size: number;
  capturedAt: number;
  startedAt: number;
  responseHeaders: Record<string, string>;
  requestHeaders: Record<string, string>;
  body?: ArrayBuffer;
  bodyOmittedReason?: "too-large" | "session-limit" | "unavailable";
  discoveredOnly: boolean;
}

export interface ActiveSessionPointer {
  sessionId: string;
  tabId: number;
  domain: string;
}

// Gi   tH ub@S  t  a  rs  ails   Clover
export interface SessionView {
  id: string;
  mode: SessionMode;
  status: SessionStatus;
  domain: string;
  startUrl: string;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  resourceCount: number;
  byteCount: number;
  exportProgress: number;
  exportedFileName?: string;
  error?: string;
  lastPageUrl?: string;
  reactComponentCount: number;
  reactRootCount: number;
}

export interface PopupState {
  activeTabId: number;
  activeTabUrl: string;
  activeSession?: SessionView;
  latestSession?: SessionView;
  recentSessions: SessionView[];
  options: CaptureOptions;
  debuggerAvailable: boolean;
}

// Gi   tH   ub@Sta  rsai   l s  C love  r
export interface ExportResult {
  sessionId: string;
  fileName: string;
  zipBytes: number;
  downloadId: number;
}

export interface ExportManifest {
  schema: "prprprwarp.archive/v1";
  appVersion: string;
  releaseTag: string;
  exportedAt: string;
  session: SessionView;
  pages: Array<{
    id: string;
    sequence: number;
    url: string;
    title: string;
    capturedAt: string;
    snapshotPath: string;
    livePath?: string;
    elementCount: number;
    frameCount: number;
    reactComponentCount: number;
  }>;
  resources: Array<{
    url: string;
    method: string;
    status: number;
    mime: string;
    kind: ResourceKind;
    size: number;
    assetPath?: string;
    capturedAt: string;
    bodyOmittedReason?: ResourceRecord["bodyOmittedReason"];
  }>;
  stats: {
    pages: number;
    resources: number;
    assets: number;
    bytes: number;
    reactComponents: number;
  };
}
