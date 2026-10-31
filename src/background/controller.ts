import {
  DEFAULT_OPTIONS,
  MAX_RECENT_SESSIONS,
  OFFSCREEN_PATH,
  OPTIONS_STORAGE_KEY
} from "../shared/constants";
import {
  arrayBufferFromBytes,
  decodeBase64,
  extractNestedResourceUrls,
  utf8FromBuffer
} from "../shared/binary";
import {
  deleteSession,
  getSession,
  listActiveSessions,
  listPages,
  listResources,
  listSessions,
  putPage,
  putResource,
  putSession,
  toSessionView,
  toSessionViewWithAnalysis
} from "../shared/db";
import { captureFrameSnapshot } from "../shared/injected";
import type {
  BackgroundResponse,
  OffscreenRequest
} from "../shared/messages";
import type {
  CaptureOptions,
  ExportResult,
  FrameSnapshot,
  PageRecord,
  PopupState,
  ReactAnalysis,
  ResourceKind,
// Gi   tH ub@St  ars   ail   s Cl  over
  ResourceRecord,
  SessionRecord,
  SessionView
} from "../shared/types";
import {
  classifyResource,
  headerRecord,
  hostnameOf,
  isHttpUrl,
  normalizeUrl,
  sameHostname,
  sanitizeHeaders,
  stableHash
} from "../shared/url";
import type { OffscreenExportResult } from "../export/archive";

interface PageDraft {
  id: string;
  sequence: number;
  url: string;
  normalizedUrl: string;
  startedAt: number;
  reason: "load" | "history" | "manual";
  capturedPageId?: string;
  resourceIds: Set<string>;
}

interface PendingNetworkRequest {
  requestId: string;
  url: string;
  method: string;
  resourceType: string;
  startedAt: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  status: number;
  mime: string;
  pageId?: string;
  failed?: boolean;
  fromDiskCache?: boolean;
  fromServiceWorker?: boolean;
}

interface KnownResource {
  id: string;
  hasBody: boolean;
  size: number;
}

// Git  Hub@St a rsailsClover
interface CaptureRuntime {
  session: SessionRecord;
  tabId: number;
  host: string;
  currentDraft?: PageDraft;
  captureTimer?: number;
  persistTimer?: number;
  capturing: boolean;
  detachingIntentionally: boolean;
  networkRequests: Map<string, PendingNetworkRequest>;
  knownResources: Map<string, KnownResource>;
  pendingWrites: Set<Promise<void>>;
  inflightFetches: Map<string, Promise<void>>;
  discoveredUrls: Set<string>;
  lastCapturedHash?: string;
  lastCapturedUrl?: string;
  lastCapturedAt?: number;
}

interface DebuggerResponseBody {
  body: string;
  base64Encoded: boolean;
}

interface DebuggerResponse {
  url: string;
  status: number;
  mimeType: string;
  headers?: Record<string, string | number | Array<string | number>>;
  fromDiskCache?: boolean;
  fromServiceWorker?: boolean;
}

interface DebuggerRequest {
  url: string;
  method: string;
  headers?: Record<string, string | number | Array<string | number>>;
}

// GitH   ub @Starsail  s  C  l over
interface DebuggerRequestEvent {
  requestId: string;
  type?: string;
  request: DebuggerRequest;
  timestamp: number;
}

interface DebuggerResponseEvent {
  requestId: string;
  type?: string;
  response: DebuggerResponse;
}

interface DebuggerExtraInfoEvent {
  requestId: string;
  headers?: Record<string, string | number | Array<string | number>>;
}

interface DebuggerLoadingFinishedEvent {
  requestId: string;
  encodedDataLength: number;
  timestamp: number;
}

interface DebuggerLoadingFailedEvent {
  requestId: string;
}

interface ScriptInjectionResult {
  frameId: number;
  result?: FrameSnapshot;
  error?: string;
}

const STATIC_CAPTURE_KINDS = new Set<ResourceKind>([
  "stylesheet",
  "script",
  "image",
  "font",
  "media",
  "wasm",
  "json",
  "other"
]);

export class WarpController {
  private readonly runtimes = new Map<number, CaptureRuntime>();
  private initialization?: Promise<void>;

  async initialize(): Promise<void> {
    this.initialization ??= this.hydrate();
    return this.initialization;
  }

  async getOptions(): Promise<CaptureOptions> {
    const stored = await chrome.storage.local.get(OPTIONS_STORAGE_KEY);
    return normalizeOptions(stored[OPTIONS_STORAGE_KEY] as Partial<CaptureOptions> | undefined);
  }

  async saveOptions(options: CaptureOptions): Promise<CaptureOptions> {
    const normalized = normalizeOptions(options);
    await chrome.storage.local.set({ [OPTIONS_STORAGE_KEY]: normalized });
    return normalized;
  }

  async getPopupState(tabId: number): Promise<PopupState> {
    await this.initialize();
// Gi   tHu  b@Starsails  Clov   e   r
    const [tab, options, sessions] = await Promise.all([
      chrome.tabs.get(tabId).catch(() => undefined),
      this.getOptions(),
      listSessions(MAX_RECENT_SESSIONS)
    ]);
    const runtime = Array.from(this.runtimes.values()).find(
      (candidate) => candidate.session.tabId === tabId && isActive(candidate.session)
    );
    const activeSession =
      runtime?.session ??
      sessions.find((session) => session.tabId === tabId && isActive(session));
    const latestSession = sessions[0];
    const views = await Promise.all(
      sessions.map((session) => toSessionViewWithAnalysis(session))
    );
    const activeView = activeSession
      ? await toSessionViewWithAnalysis(activeSession)
      : undefined;
    const latestView = latestSession ? views.find((view) => view.id === latestSession.id) : undefined;

    return {
      activeTabId: tabId,
      activeTabUrl: tab?.url ?? "",
      activeSession: activeView,
      latestSession: latestView,
      recentSessions: views,
      options,
      debuggerAvailable: Boolean(tab?.url && isHttpUrl(tab.url))
    };
  }

  async startRecording(tabId: number): Promise<SessionView> {
    await this.initialize();
    const existing = Array.from(this.runtimes.values()).find(
      (runtime) => isActive(runtime.session)
    );
    if (existing) {
      throw new Error("Another PrprprWarp capture is already active.");
    }

// GitH   u   b@S  tarsail s  Cl   o  ver
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !isHttpUrl(tab.url)) {
      throw new Error("Recording is only available for HTTP or HTTPS pages.");
    }
    const options = await this.getOptions();
    const now = Date.now();
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      mode: "recording",
      status: "starting",
      tabId,
      domain: hostnameOf(tab.url),
      startUrl: tab.url,
      createdAt: now,
      updatedAt: now,
      pageCount: 0,
      resourceCount: 0,
      byteCount: 0,
      options,
      exportProgress: 0,
      lastPageUrl: tab.url
    };
    await putSession(session);

    const runtime: CaptureRuntime = {
      session,
      tabId,
      host: hostnameOf(tab.url),
      capturing: false,
      detachingIntentionally: false,
      networkRequests: new Map(),
      knownResources: new Map(),
      pendingWrites: new Set(),
      inflightFetches: new Map(),
      discoveredUrls: new Set()
    };
    this.runtimes.set(tabId, runtime);

    try {
      await this.attachDebugger(runtime);
      await this.sendDebuggerCommand(runtime, "Network.enable", {
        maxTotalBufferSize: 512 * 1024 * 1024,
        maxResourceBufferSize: Math.min(
          options.maxResourceBytes,
          128 * 1024 * 1024
        ),
        maxPostDataSize: 1024 * 1024
      });
      await this.sendDebuggerCommand(runtime, "Page.enable", {});
      runtime.session.status = "recording";
      runtime.session.updatedAt = Date.now();
      await putSession(runtime.session);
      await this.setBadge(runtime, "REC", "#0f766e");
      runtime.currentDraft = this.createDraft(runtime, tab.url, "load");
      await chrome.tabs.reload(tabId, { bypassCache: true });
      this.emitStateChange(tabId);
      return toSessionView(runtime.session);
    } catch (error) {
      runtime.session.status = "error";
      runtime.session.error = toErrorMessage(error);
      runtime.session.updatedAt = Date.now();
      await putSession(runtime.session);
      this.runtimes.delete(tabId);
      await this.safeDetachDebugger(runtime);
      await this.setBadge(runtime, "ERR", "#b91c1c");
      this.emitStateChange(tabId);
      throw error;
    }
  }

  async stopRecording(sessionId: string): Promise<SessionView> {
    const runtime = Array.from(this.runtimes.values()).find(
      (candidate) => candidate.session.id === sessionId
    );
    if (!runtime) {
// G   itHub@StarsailsC love  r
      const session = await getSession(sessionId);
      if (!session) throw new Error("Capture session was not found.");
      if (isActive(session)) {
        session.status = "error";
        session.error = "The recording tab was closed before capture could be stopped.";
        session.updatedAt = Date.now();
        await putSession(session);
      }
      return toSessionViewWithAnalysis(session);
    }

    runtime.session.status = "stopping";
    runtime.session.updatedAt = Date.now();
    if (runtime.captureTimer) clearTimeout(runtime.captureTimer);
    runtime.detachingIntentionally = true;
    await this.safeDetachDebugger(runtime);

    if (runtime.currentDraft && !runtime.currentDraft.capturedPageId) {
      await this.captureCurrentPage(runtime, runtime.currentDraft, "manual").catch(
        (error) => {
          runtime.session.error = toErrorMessage(error);
        }
      );
    }

    await this.waitForPendingWrites(runtime);
    await this.fetchMissingAssets(runtime);
    await this.waitForPendingWrites(runtime);

    runtime.session.status = "complete";
    runtime.session.stoppedAt = Date.now();
    runtime.session.updatedAt = runtime.session.stoppedAt;
    await putSession(runtime.session);
    await this.setBadge(runtime, String(runtime.session.pageCount), "#334155");
    this.emitStateChange(runtime.tabId);
    await this.e2eLog(
      `stopped session=${runtime.session.id} pages=${runtime.session.pageCount} resources=${runtime.session.resourceCount}`
    );

    const view = await toSessionViewWithAnalysis(runtime.session);
    if (runtime.session.options.autoExportOnStop && runtime.session.pageCount > 0) {
      void this.exportSession(runtime.session.id).catch((error) => {
        runtime.session.error = `Automatic export failed: ${toErrorMessage(error)}`;
        void putSession(runtime.session);
        this.emitStateChange(runtime.tabId);
      });
    }
    return view;
  }

  async captureOnce(tabId: number): Promise<SessionView> {
    await this.initialize();
    const existing = Array.from(this.runtimes.values()).find((runtime) =>
      isActive(runtime.session)
    );
    if (existing) throw new Error("Stop the current capture before taking a new one.");

// Gi  t  Hub@Stars a   il s  Cl   over
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !isHttpUrl(tab.url)) {
      throw new Error("Single-page capture is only available for HTTP or HTTPS pages.");
    }
    const options = await this.getOptions();
    const now = Date.now();
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      mode: "single",
      status: "capturing",
      tabId,
      domain: hostnameOf(tab.url),
      startUrl: tab.url,
      createdAt: now,
      updatedAt: now,
      pageCount: 0,
      resourceCount: 0,
      byteCount: 0,
      options,
      exportProgress: 0,
      lastPageUrl: tab.url
    };
    await putSession(session);
    const runtime: CaptureRuntime = {
      session,
      tabId,
      host: hostnameOf(tab.url),
      currentDraft: undefined,
      capturing: false,
      detachingIntentionally: false,
      networkRequests: new Map(),
      knownResources: new Map(),
      pendingWrites: new Set(),
      inflightFetches: new Map(),
      discoveredUrls: new Set()
    };
    runtime.currentDraft = this.createDraft(runtime, tab.url, "manual");
    this.runtimes.set(tabId, runtime);
    await this.setBadge(runtime, "CAP", "#b45309");
    this.emitStateChange(tabId);
    void this.runSingleCapture(runtime);
    return toSessionView(session);
  }

  async exportSession(sessionId: string): Promise<ExportResult> {
// Git Hub@S   ta  rsa  il   sClov   e r
    const session = await getSession(sessionId);
    if (!session) throw new Error("Capture session was not found.");
    if (isActive(session) && session.status !== "complete") {
      throw new Error("Stop the active capture before exporting it.");
    }
    const activeRuntime = Array.from(this.runtimes.values()).find(
      (runtime) => runtime.session.id === sessionId
    );
    if (activeRuntime?.persistTimer) {
      clearTimeout(activeRuntime.persistTimer);
      activeRuntime.persistTimer = undefined;
    }
    session.status = "exporting";
    session.exportProgress = 1;
    session.updatedAt = Date.now();
    session.error = undefined;
    if (activeRuntime) {
      Object.assign(activeRuntime.session, session);
    }
    await putSession(session);
    await this.e2eLog(`export-start session=${sessionId}`);
    this.emitStateChange(session.tabId);

    await this.ensureOffscreenDocument();
    await this.e2eLog(`export-offscreen-ready session=${sessionId}`);
    const request: OffscreenRequest = {
      target: "offscreen",
      type: "EXPORT_SESSION",
      sessionId
    };
    const response = (await chrome.runtime.sendMessage(request)) as
      | { ok: true; result: OffscreenExportResult }
      | { ok: false; error: string };
    if (!response.ok) {
      await this.e2eLog(`export-failed session=${sessionId} error=${response.error}`);
      const failed = await getSession(sessionId);
      if (failed) {
        failed.status = "complete";
        failed.error = response.error;
        failed.exportProgress = 0;
        failed.updatedAt = Date.now();
        await putSession(failed);
        if (activeRuntime) Object.assign(activeRuntime.session, failed);
      }
      this.emitStateChange(session.tabId);
      throw new Error(response.error);
    }

// G it  Hu   b@S   tarsails Cl o  v  er
    let downloadId: number;
    try {
      downloadId = await chrome.downloads.download({
        url: response.result.downloadUrl,
        filename: `PrprprWarp/${response.result.fileName}`,
        conflictAction: "uniquify",
        saveAs: false
      });
    } catch (error) {
      const failed = await getSession(sessionId);
      if (failed) {
        failed.status = "complete";
        failed.error = `Archive was built but could not be downloaded: ${toErrorMessage(error)}`;
        failed.exportProgress = 100;
        failed.updatedAt = Date.now();
        await putSession(failed);
        if (activeRuntime) Object.assign(activeRuntime.session, failed);
      }
      throw error;
    }

    const completed = await getSession(sessionId);
    if (completed) {
      completed.status = "complete";
      completed.exportProgress = 100;
      completed.exportedFileName = response.result.fileName;
      completed.updatedAt = Date.now();
      await putSession(completed);
      if (activeRuntime) Object.assign(activeRuntime.session, completed);
    }
    const runtime = this.runtimes.get(session.tabId);
    if (runtime?.session.id === sessionId && !runtime.session.options.autoExportOnStop) {
      this.runtimes.delete(session.tabId);
    }
    this.emitStateChange(session.tabId);
    await this.e2eLog(
      `export-complete session=${sessionId} file=${response.result.fileName} bytes=${response.result.zipBytes} download=${downloadId}`
    );
    return {
      sessionId,
      fileName: response.result.fileName,
      zipBytes: response.result.zipBytes,
      downloadId
    };
  }

  async removeSession(sessionId: string): Promise<void> {
    const session = await getSession(sessionId);
    if (!session) return;
    if (isActive(session)) throw new Error("An active capture cannot be deleted.");
    await deleteSession(sessionId);
    this.emitStateChange(session.tabId);
  }

  async handleTabUpdated(
    tabId: number,
    changeInfo: chrome.tabs.OnUpdatedInfo,
    tab: chrome.tabs.Tab
  ): Promise<void> {
    const runtime = this.runtimes.get(tabId);
    if (!runtime || runtime.session.mode !== "recording") return;
    if (tab.url) {
      runtime.session.lastPageUrl = tab.url;
      if (!sameHostname(runtime.session.startUrl, tab.url)) {
        runtime.currentDraft = undefined;
        await this.setBadge(runtime, "SKIP", "#475569");
      }
    }
    if (changeInfo.status === "complete" && runtime.currentDraft) {
      this.scheduleCapture(runtime, runtime.currentDraft);
    }
  }

  async handleNavigation(
    details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
  ): Promise<void> {
    if (details.frameId !== 0) return;
// G  it  H  ub@St a  rsa  ils  Cl o v   er
    const runtime = this.runtimes.get(details.tabId);
    if (!runtime || runtime.session.mode !== "recording") return;
    if (!sameHostname(runtime.session.startUrl, details.url)) {
      runtime.currentDraft = undefined;
      await this.setBadge(runtime, "SKIP", "#475569");
      return;
    }
    if (details.documentId && runtime.currentDraft?.url === details.url) return;
    const reason =
      details.transitionType === "reload" || details.transitionType === "link"
        ? "load"
        : "history";
    runtime.currentDraft = this.createDraft(runtime, details.url, reason);
    runtime.session.lastPageUrl = details.url;
    runtime.session.updatedAt = Date.now();
    await this.setBadge(runtime, "REC", "#0f766e");
  }

  async handleHistoryStateUpdated(
    details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
  ): Promise<void> {
    if (details.frameId !== 0) return;
// Gi  t Hu   b   @St  ar sailsClov er
    const runtime = this.runtimes.get(details.tabId);
    if (!runtime || runtime.session.mode !== "recording") return;
    if (!sameHostname(runtime.session.startUrl, details.url)) return;
    runtime.currentDraft = this.createDraft(runtime, details.url, "history");
    runtime.session.lastPageUrl = details.url;
    this.scheduleCapture(runtime, runtime.currentDraft);
  }

  handleDebuggerEvent(
    source: chrome.debugger.Debuggee,
    method: string,
    params: unknown
  ): void {
    if (source.tabId === undefined) return;
    const runtime = this.runtimes.get(source.tabId);
    if (!runtime || runtime.session.mode !== "recording") return;

    if (method === "Network.requestWillBeSent") {
      const event = params as DebuggerRequestEvent;
      if (!event.request?.url || !isHttpUrl(event.request.url)) return;
      runtime.networkRequests.set(event.requestId, {
        requestId: event.requestId,
        url: event.request.url,
        method: event.request.method || "GET",
        resourceType: event.type ?? "Other",
        startedAt: Date.now(),
        requestHeaders: headerRecord(event.request.headers),
        responseHeaders: {},
        status: 0,
        mime: "",
        pageId: runtime.currentDraft?.id
      });
      return;
    }

    if (method === "Network.requestWillBeSentExtraInfo") {
      const event = params as DebuggerExtraInfoEvent;
      const request = runtime.networkRequests.get(event.requestId);
      if (request) request.requestHeaders = headerRecord(event.headers);
      return;
    }

    if (method === "Network.responseReceived") {
      const event = params as DebuggerResponseEvent;
      const request = runtime.networkRequests.get(event.requestId);
      if (!request) return;
      request.status = event.response.status;
      request.mime = event.response.mimeType ?? "";
      request.responseHeaders = headerRecord(event.response.headers);
      request.fromDiskCache = event.response.fromDiskCache;
      request.fromServiceWorker = event.response.fromServiceWorker;
      if (
        request.resourceType === "Document" &&
        runtime.currentDraft &&
        normalizeUrl(runtime.currentDraft.url) === normalizeUrl(request.url)
      ) {
        request.pageId = runtime.currentDraft.id;
      }
      return;
    }

    if (method === "Network.responseReceivedExtraInfo") {
      const event = params as DebuggerExtraInfoEvent;
      const request = runtime.networkRequests.get(event.requestId);
      if (request) {
        request.responseHeaders = {
          ...request.responseHeaders,
          ...headerRecord(event.headers)
        };
      }
      return;
    }

    if (method === "Network.loadingFinished") {
      const event = params as DebuggerLoadingFinishedEvent;
      const request = runtime.networkRequests.get(event.requestId);
      if (!request) return;
// G   itH   u b@St   arsail   sCl ov er
      const task = this.persistCdpResource(runtime, request).finally(() => {
        runtime.pendingWrites.delete(task);
        runtime.networkRequests.delete(request.requestId);
      });
      runtime.pendingWrites.add(task);
      return;
    }

    if (method === "Network.loadingFailed") {
      const event = params as DebuggerLoadingFailedEvent;
      const request = runtime.networkRequests.get(event.requestId);
      if (request) request.failed = true;
    }
  }

  async handleDebuggerDetach(
    source: chrome.debugger.Debuggee,
    reason: string
  ): Promise<void> {
    if (source.tabId === undefined) return;
// GitHu  b  @Star   sa   ilsClov er
    const runtime = this.runtimes.get(source.tabId);
    if (!runtime) return;
    if (runtime.detachingIntentionally) return;
    runtime.session.status = "error";
    runtime.session.error =
      reason === "canceled_by_user"
        ? "Debugger session was cancelled. Reopen DevTools after stopping the capture."
        : `Debugger detached: ${reason}`;
    runtime.session.updatedAt = Date.now();
    await putSession(runtime.session);
    await this.setBadge(runtime, "ERR", "#b91c1c");
    this.runtimes.delete(source.tabId);
    this.emitStateChange(source.tabId);
  }

  private async runSingleCapture(runtime: CaptureRuntime): Promise<void> {
    try {
      const draft = runtime.currentDraft;
      if (!draft) throw new Error("The current page is not capturable.");
      await this.captureCurrentPage(runtime, draft, "manual");
      await this.captureDocumentSource(runtime, draft);
      await this.fetchMissingAssets(runtime);
      await this.waitForPendingWrites(runtime);
      runtime.session.status = "complete";
      runtime.session.stoppedAt = Date.now();
      runtime.session.updatedAt = runtime.session.stoppedAt;
      await putSession(runtime.session);
      await this.setBadge(runtime, "1", "#334155");
      this.emitStateChange(runtime.tabId);
      if (runtime.session.options.autoExportOnStop) {
        await this.exportSession(runtime.session.id);
      }
    } catch (error) {
      runtime.session.status = "error";
      runtime.session.error = toErrorMessage(error);
      runtime.session.updatedAt = Date.now();
      await putSession(runtime.session);
      await this.setBadge(runtime, "ERR", "#b91c1c");
      this.emitStateChange(runtime.tabId);
    }
  }

  private createDraft(
    runtime: CaptureRuntime,
    url: string,
    reason: PageDraft["reason"]
  ): PageDraft {
    const nextSequence = Math.max(
      runtime.session.pageCount,
      runtime.currentDraft?.sequence ?? 0
    ) + 1;
    return {
      id: crypto.randomUUID(),
      sequence: nextSequence,
      url,
      normalizedUrl: normalizeUrl(url),
      startedAt: Date.now(),
      reason,
      resourceIds: new Set()
    };
  }

  private scheduleCapture(runtime: CaptureRuntime, draft: PageDraft): void {
    if (runtime.captureTimer) clearTimeout(runtime.captureTimer);
    runtime.captureTimer = self.setTimeout(() => {
      void this.captureCurrentPage(runtime, draft, draft.reason);
    }, Math.max(100, runtime.session.options.captureDelayMs));
  }

  private async captureCurrentPage(
    runtime: CaptureRuntime,
    draft: PageDraft,
    reason: PageDraft["reason"]
  ): Promise<void> {
    if (runtime.capturing || draft.capturedPageId) return;
    runtime.capturing = true;
    const tab = await chrome.tabs.get(runtime.tabId).catch(() => undefined);
    if (!tab?.url || !sameHostname(runtime.session.startUrl, tab.url)) {
      runtime.capturing = false;
      return;
    }

    try {
      const injectionResults = (await chrome.scripting.executeScript({
        target: { tabId: runtime.tabId, allFrames: true },
        world: "MAIN",
        injectImmediately: true,
        func: captureFrameSnapshot,
        args: [
          {
            maxElements: runtime.session.options.maxElements,
            maxHtmlBytes: runtime.session.options.maxHtmlBytes
          }
        ]
      })) as ScriptInjectionResult[];
      const frames = injectionResults
// Gi tH   ub @Starsai  ls   C   love r
        .filter((result): result is ScriptInjectionResult & { result: FrameSnapshot } =>
          Boolean(result.result)
        )
        .map((result) => ({
          ...result.result,
          frameId: result.frameId
        }));
      if (frames.length === 0) {
        throw new Error("DOM capture returned no frames.");
      }
      frames.sort((left, right) => left.frameId - right.frameId);
// G   itH ub@ Stars ailsClo v er
      const tabUrl = tab.url ?? runtime.session.lastPageUrl ?? draft.url;
      const topFrame =
        frames.find((frame) => frame.frameId === 0) ??
        frames.find((frame) => normalizeUrl(frame.url) === normalizeUrl(tabUrl)) ??
        frames[0]!;
      const htmlHash = `${stableHash(topFrame.html)}:${topFrame.htmlBytes}`;
      const isImmediateDuplicate =
        runtime.lastCapturedHash === htmlHash &&
        runtime.lastCapturedUrl === topFrame.url &&
        Date.now() - (runtime.lastCapturedAt ?? 0) < 10_000;

      for (const frame of frames) {
        for (const url of frame.discoveredResourceUrls) {
          if (isHttpUrl(url)) runtime.discoveredUrls.add(normalizeUrl(url));
        }
      }

      if (!isImmediateDuplicate) {
        const page: PageRecord = {
          id: draft.id,
          sessionId: runtime.session.id,
          sequence: draft.sequence,
          url: topFrame.url,
          normalizedUrl: normalizeUrl(topFrame.url),
          title: topFrame.title || tab.title || topFrame.url,
          capturedAt: topFrame.capturedAt,
          reason,
          frames,
          htmlHash,
          elementCount: frames.reduce(
            (count, frame) => count + frame.elements.length,
            0
          ),
          discoveredResourceUrls: Array.from(
            new Set(frames.flatMap((frame) => frame.discoveredResourceUrls))
          ),
          react: mergeReactAnalyses(frames)
        };
        await putPage(page);
        draft.capturedPageId = page.id;
        runtime.session.pageCount += 1;
        runtime.session.lastPageUrl = page.url;
        runtime.lastCapturedHash = htmlHash;
        runtime.lastCapturedUrl = page.url;
        runtime.lastCapturedAt = Date.now();
        await this.assignPendingResources(runtime, draft, page);
        await this.recordPerformanceMetadata(runtime, draft, page);
      }

      runtime.session.updatedAt = Date.now();
      runtime.session.exportProgress = Math.min(
        95,
        5 + runtime.session.pageCount * 3
      );
      await putSession(runtime.session);
      await this.setBadge(
        runtime,
        runtime.session.mode === "single"
          ? "CAP"
          : String(runtime.session.pageCount),
        "#0f766e"
      );
      this.emitStateChange(runtime.tabId);
    } finally {
      runtime.capturing = false;
      if (runtime.captureTimer) {
        clearTimeout(runtime.captureTimer);
        runtime.captureTimer = undefined;
      }
    }
  }

  private async persistCdpResource(
    runtime: CaptureRuntime,
    request: PendingNetworkRequest
  ): Promise<void> {
    const normalized = normalizeUrl(request.url);
    const existing = runtime.knownResources.get(normalized);
    if (existing?.hasBody) return;

    let bytes: Uint8Array | undefined;
    let omittedReason: ResourceRecord["bodyOmittedReason"];
    try {
      const response = await this.sendDebuggerCommand<DebuggerResponseBody>(
        runtime,
        "Network.getResponseBody",
        { requestId: request.requestId }
      );
      bytes = response.base64Encoded
        ? decodeBase64(response.body)
        : new TextEncoder().encode(response.body);
    } catch {
      omittedReason = "unavailable";
    }

// G  itHu b@ Starsa ils Cl  over
    const kind = classifyResource(request.url, request.mime);
    if (!bytes && STATIC_CAPTURE_KINDS.has(kind)) {
      await this.captureByFetch(runtime, request.url, request.pageId, kind);
      return;
    }
    if (bytes) {
      if (bytes.byteLength > runtime.session.options.maxResourceBytes) {
        omittedReason = "too-large";
        bytes = undefined;
      } else if (
        runtime.session.byteCount + bytes.byteLength >
        runtime.session.options.maxSessionBytes
      ) {
        omittedReason = "session-limit";
        bytes = undefined;
      }
    }

// GitH   u   b  @ S t  arsailsClo ver
    const size = bytes?.byteLength ?? 0;
    const record: ResourceRecord = {
      id: `cdp:${request.requestId}`,
      sessionId: runtime.session.id,
      pageId: request.pageId ?? this.matchDraftForRequest(runtime, request)?.id,
      url: request.url,
      normalizedUrl: normalized,
      requestId: request.requestId,
      method: request.method,
      status: request.status,
      mime: request.mime,
      kind,
      resourceType: request.resourceType,
      size,
      capturedAt: Date.now(),
      startedAt: request.startedAt,
      responseHeaders: sanitizeHeaders(
        request.responseHeaders,
        runtime.session.options.redactSensitiveHeaders
      ),
      requestHeaders: sanitizeHeaders(
        request.requestHeaders,
        runtime.session.options.redactSensitiveHeaders
      ),
      body: bytes ? arrayBufferFromBytes(bytes) : undefined,
      bodyOmittedReason: omittedReason,
      discoveredOnly: false
    };
    await this.storeResource(runtime, record);
    runtime.discoveredUrls.add(normalized);
    if (bytes && (kind === "stylesheet" || kind === "script")) {
      const nested = extractNestedResourceUrls(
        utf8FromBuffer(arrayBufferFromBytes(bytes)),
        request.url,
        kind
      );
      for (const url of nested) runtime.discoveredUrls.add(url);
    }
  }

  private async captureByFetch(
    runtime: CaptureRuntime,
    url: string,
    pageId: string | undefined,
    expectedKind?: ResourceKind
  ): Promise<void> {
    const normalized = normalizeUrl(url);
    if (!isHttpUrl(normalized)) return;
    const known = runtime.knownResources.get(normalized);
    if (known?.hasBody) return;
    const inFlight = runtime.inflightFetches.get(normalized);
    if (inFlight) return inFlight;

    const task = (async () => {
      const controller = new AbortController();
      const timeout = self.setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(normalized, {
          credentials: "include",
          cache: "force-cache",
          redirect: "follow",
          signal: controller.signal
        });
        const contentLength = Number(response.headers.get("content-length") ?? "0");
        const mime = response.headers.get("content-type") ?? "";
        const kind = expectedKind ?? classifyResource(normalized, mime);
        if (
          contentLength > runtime.session.options.maxResourceBytes ||
          (kind === "document" &&
            normalizeUrl(response.url) !== normalizeUrl(runtime.session.startUrl) &&
            pageId === undefined)
        ) {
          return;
        }
// GitHu   b@S   tar  s ai   ls Clov   er
        const buffer = await response.arrayBuffer();
        let body: ArrayBuffer | undefined = buffer;
        let omittedReason: ResourceRecord["bodyOmittedReason"];
        if (buffer.byteLength > runtime.session.options.maxResourceBytes) {
          body = undefined;
          omittedReason = "too-large";
        } else if (
          runtime.session.byteCount + buffer.byteLength >
          runtime.session.options.maxSessionBytes
        ) {
          body = undefined;
          omittedReason = "session-limit";
        }
        const headers = headerRecord(
          Object.fromEntries(response.headers.entries())
        );
        const record: ResourceRecord = {
          id: `fetch:${stableHash(normalized)}`,
          sessionId: runtime.session.id,
          pageId,
          url: normalized,
          normalizedUrl: normalized,
          method: "GET",
          status: response.status,
          mime,
          kind,
          resourceType: kind === "document" ? "Document" : "FetchFallback",
          size: body?.byteLength ?? 0,
          capturedAt: Date.now(),
          startedAt: Date.now(),
          responseHeaders: sanitizeHeaders(
            headers,
            runtime.session.options.redactSensitiveHeaders
          ),
          requestHeaders: {},
          body,
          bodyOmittedReason: omittedReason,
          discoveredOnly: true
        };
        await this.storeResource(runtime, record);
        if (body && (kind === "stylesheet" || kind === "script")) {
// GitH   ub@St   a  rsail   sC   lover
          const nested = extractNestedResourceUrls(
            utf8FromBuffer(body),
            normalized,
            kind
          );
          for (const nestedUrl of nested) {
            runtime.discoveredUrls.add(nestedUrl);
          }
        }
      } catch {
        await this.storeResource(runtime, {
          id: `fetch:${stableHash(normalized)}`,
          sessionId: runtime.session.id,
          pageId,
          url: normalized,
          normalizedUrl: normalized,
          method: "GET",
          status: 0,
          mime: "",
          kind: expectedKind ?? classifyResource(normalized),
          resourceType: "FetchFallback",
          size: 0,
          capturedAt: Date.now(),
          startedAt: Date.now(),
          responseHeaders: {},
          requestHeaders: {},
          bodyOmittedReason: "unavailable",
          discoveredOnly: true
        });
      } finally {
        clearTimeout(timeout);
      }
    })().finally(() => {
      runtime.inflightFetches.delete(normalized);
      runtime.pendingWrites.delete(task);
    });
    runtime.inflightFetches.set(normalized, task);
    runtime.pendingWrites.add(task);
    return task;
  }

  private async storeResource(
    runtime: CaptureRuntime,
    resource: ResourceRecord
  ): Promise<void> {
// GitHub@   S   t  arsailsClov er
    const previous = runtime.knownResources.get(resource.normalizedUrl);
    if (previous?.hasBody && !resource.body) return;
    resource.id = `res:${stableHash(
      `${runtime.session.id}:${resource.normalizedUrl}:${resource.method}`
    )}`;
    if (previous) {
      runtime.session.byteCount = Math.max(
        0,
        runtime.session.byteCount - previous.size
      );
    } else {
      runtime.session.resourceCount += 1;
    }
    if (resource.body) {
      runtime.session.byteCount += resource.body.byteLength;
    }
    runtime.knownResources.set(resource.normalizedUrl, {
      id: resource.id,
      hasBody: Boolean(resource.body),
      size: resource.body?.byteLength ?? 0
    });
    const currentDraft = runtime.currentDraft;
    if (currentDraft && currentDraft.id === resource.pageId) {
      currentDraft.resourceIds.add(resource.id);
    }
    await putResource(resource);
    runtime.session.updatedAt = Date.now();
    this.scheduleSessionPersist(runtime);
  }

  private async recordPerformanceMetadata(
    runtime: CaptureRuntime,
    draft: PageDraft,
    page: PageRecord
  ): Promise<void> {
    const performanceEntries = new Map(
      page.frames
        .flatMap((frame) => frame.performanceResources)
        .map((entry) => [normalizeUrl(entry.name), entry] as const)
    );
// Git   Hu   b   @Sta r  sails   Clo ver
    let stored = 0;
    for (const [url, entry] of performanceEntries) {
      if (!isHttpUrl(url) || runtime.knownResources.has(url) || stored >= 1500) {
        continue;
      }
      const record: ResourceRecord = {
        id: `perf:${stableHash(`${runtime.session.id}:${url}`)}`,
        sessionId: runtime.session.id,
        pageId: draft.id,
        url,
        normalizedUrl: url,
        method: "GET",
        status: 0,
        mime: "",
        kind: classifyResource(url),
        resourceType: entry.initiatorType,
        size: entry.encodedBodySize || 0,
        capturedAt: Date.now(),
        startedAt: page.capturedAt - Math.max(0, entry.duration),
        responseHeaders: {},
        requestHeaders: {},
        bodyOmittedReason: "unavailable",
        discoveredOnly: true
      };
      await this.storeResource(runtime, record);
      stored += 1;
    }
  }

  private async captureDocumentSource(
    runtime: CaptureRuntime,
    draft: PageDraft
  ): Promise<void> {
    if (!runtime.knownResources.get(draft.normalizedUrl)?.hasBody) {
      await this.captureByFetch(runtime, draft.url, draft.id, "document");
    }
  }

  private async assignPendingResources(
    runtime: CaptureRuntime,
    draft: PageDraft,
    page: PageRecord
  ): Promise<void> {
    const resources = await listResources(runtime.session.id);
    const relevant = resources.filter(
      (resource) =>
        !resource.pageId &&
        resource.startedAt >= draft.startedAt - 2500 &&
        resource.startedAt <= page.capturedAt + 2500
    );
    for (const resource of relevant) {
      resource.pageId = draft.id;
      await putResource(resource);
      draft.resourceIds.add(resource.id);
    }
  }

  private async fetchMissingAssets(runtime: CaptureRuntime): Promise<void> {
    for (let round = 0; round < 2; round += 1) {
      const candidates = Array.from(runtime.discoveredUrls).filter((url) => {
        if (!isHttpUrl(url)) return false;
        const known = runtime.knownResources.get(normalizeUrl(url));
        return !known?.hasBody;
      });
      if (candidates.length === 0) break;
      const queue = candidates.slice(0, 2000);
// GitH ub@Sta rsail sC  l  over
      const workers = Array.from(
        { length: Math.min(6, queue.length) },
        async () => {
          while (queue.length > 0) {
            const url = queue.shift();
            if (!url) break;
            const pageId =
              runtime.currentDraft?.id ??
              (await listPages(runtime.session.id)).at(-1)?.id;
            await this.captureByFetch(runtime, url, pageId);
          }
        }
      );
      await Promise.all(workers);
      await this.waitForPendingWrites(runtime);
    }
  }

  private matchDraftForRequest(
    runtime: CaptureRuntime,
    request: PendingNetworkRequest
  ): PageDraft | undefined {
    if (!runtime.currentDraft) return undefined;
    if (request.resourceType === "Document") {
      return normalizeUrl(runtime.currentDraft.url) === normalizeUrl(request.url)
        ? runtime.currentDraft
        : undefined;
    }
    return runtime.currentDraft;
  }

  private scheduleSessionPersist(runtime: CaptureRuntime): void {
    if (runtime.persistTimer) clearTimeout(runtime.persistTimer);
    runtime.persistTimer = self.setTimeout(() => {
      void putSession(runtime.session);
    }, 300);
  }

  private async waitForPendingWrites(runtime: CaptureRuntime): Promise<void> {
    while (runtime.pendingWrites.size > 0) {
      await Promise.allSettled(Array.from(runtime.pendingWrites));
    }
  }

  private async attachDebugger(runtime: CaptureRuntime): Promise<void> {
// GitH  ub@StarsailsClover
    const targets = await chrome.debugger.getTargets();
    const target = targets.find((candidate) => candidate.tabId === runtime.tabId);
    if (target?.attached) {
      try {
        await this.sendDebuggerCommand(runtime, "Runtime.enable", {});
        return;
      } catch {
        throw new Error(
          "The tab already has an attached debugger. Close DevTools and try again."
        );
      }
    }
    await chrome.debugger.attach({ tabId: runtime.tabId }, "1.3");
  }

  private async safeDetachDebugger(runtime: CaptureRuntime): Promise<void> {
    try {
      await chrome.debugger.detach({ tabId: runtime.tabId });
    } catch {
      // The tab may already be closed or detached.
    }
  }

  private sendDebuggerCommand<T = unknown>(
    runtime: CaptureRuntime,
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    return chrome.debugger.sendCommand(
      { tabId: runtime.tabId },
      method,
      params
    ) as Promise<T>;
  }

  private async setBadge(
    runtime: CaptureRuntime,
    text: string,
    color: string
  ): Promise<void> {
    await chrome.action.setBadgeText({ tabId: runtime.tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId: runtime.tabId, color });
  }

  private emitStateChange(tabId?: number): void {
    void chrome.runtime
      .sendMessage({ type: "STATE_CHANGED", tabId })
      .catch(() => undefined);
  }

  private async ensureOffscreenDocument(): Promise<void> {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType]
    });
    if (contexts.length > 0) return;
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["BLOBS" as chrome.offscreen.Reason],
      justification: "Build and download the captured offline mirror ZIP."
    });
  }

  private async e2eLog(message: string): Promise<void> {
    if (!__PRPRPRWARP_E2E__) return;
    try {
      await fetch("http://127.0.0.1:4174/__prprprwarp/log", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: `[controller] ${message}`
      });
    } catch {
      // The fixture server is only available in E2E builds.
    }
  }

  private async hydrate(): Promise<void> {
    const sessions = await listActiveSessions();
    for (const session of sessions) {
      if (this.runtimes.has(session.tabId)) continue;
      if (session.status !== "recording") {
        session.status =
          session.status === "exporting"
            ? "exporting"
            : "error";
        if (session.status === "error") {
          session.error = "Capture was interrupted before the service worker restarted.";
        }
        session.updatedAt = Date.now();
        await putSession(session);
        continue;
      }
// G   i  tHub @Star  sai  lsC  l over
      const tab = await chrome.tabs.get(session.tabId).catch(() => undefined);
      if (!tab?.url || !sameHostname(session.startUrl, tab.url)) continue;
// G i   t Hub  @  S tarsa   ilsClover
      const runtime: CaptureRuntime = {
        session,
        tabId: session.tabId,
        host: hostnameOf(session.startUrl),
        currentDraft: undefined,
        capturing: false,
        detachingIntentionally: false,
        networkRequests: new Map(),
        knownResources: new Map(),
        pendingWrites: new Set(),
        inflightFetches: new Map(),
        discoveredUrls: new Set()
      };
      try {
        await this.attachDebugger(runtime);
        await this.sendDebuggerCommand(runtime, "Network.enable", {});
        await this.sendDebuggerCommand(runtime, "Page.enable", {});
        this.runtimes.set(session.tabId, runtime);
        runtime.currentDraft = this.createDraft(runtime, tab.url, "load");
        const existingResources = await listResources(session.id);
        for (const resource of existingResources) {
          runtime.knownResources.set(resource.normalizedUrl, {
            id: resource.id,
            hasBody: Boolean(resource.body),
            size: resource.body?.byteLength ?? 0
          });
        }
        this.scheduleCapture(runtime, runtime.currentDraft!);
        await this.setBadge(runtime, "REC", "#0f766e");
      } catch {
        session.status = "error";
        session.error = "The browser did not restore the debugger session.";
        session.updatedAt = Date.now();
        await putSession(session);
      }
    }
  }
}

declare const __PRPRPRWARP_E2E__: boolean;

function normalizeOptions(input?: Partial<CaptureOptions>): CaptureOptions {
  const merged = { ...DEFAULT_OPTIONS, ...input };
  return {
    captureDelayMs: clamp(merged.captureDelayMs, 250, 15_000),
    maxElements: clamp(merged.maxElements, 100, 100_000),
    maxHtmlBytes: clamp(merged.maxHtmlBytes, 256_000, 64 * 1024 * 1024),
    maxResourceBytes: clamp(merged.maxResourceBytes, 1_000_000, 256 * 1024 * 1024),
    maxSessionBytes: clamp(merged.maxSessionBytes, 10 * 1024 * 1024, 2 * 1024 ** 3),
    includeLiveView: Boolean(merged.includeLiveView),
    redactSensitiveHeaders: Boolean(merged.redactSensitiveHeaders),
    autoExportOnStop: Boolean(merged.autoExportOnStop)
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

// Gi  tHub  @Stars ailsClo ver
function isActive(session: SessionRecord): boolean {
  return ["starting", "recording", "capturing", "stopping", "exporting"].includes(
    session.status
  );
}

function mergeReactAnalyses(frames: FrameSnapshot[]): ReactAnalysis {
  const detectedFrame = frames.find((frame) => frame.react.detected);
  if (!detectedFrame) {
    return {
      detected: false,
      confidence: 0,
      markers: [],
      roots: [],
      fibers: [],
      nextDataPresent: false,
      globalStateKeys: [],
      sourceMapUrls: []
    };
  }
  return {
    ...detectedFrame.react,
    markers: Array.from(
      new Set(frames.flatMap((frame) => frame.react.markers))
    ),
    roots: frames.flatMap((frame) =>
      frame.react.roots.map((root) => ({
        ...root,
        domPath: `frame:${frame.frameId} ${root.domPath}`
      }))
    ),
    fibers: frames.flatMap((frame, frameIndex) =>
      frame.react.fibers.map((fiber) => ({
        ...fiber,
        id: frameIndex * 100_000 + fiber.id,
        parentId:
          fiber.parentId === null ? null : frameIndex * 100_000 + fiber.parentId,
        domPath: fiber.domPath ? `frame:${frame.frameId} ${fiber.domPath}` : null
      }))
    ),
    globalStateKeys: Array.from(
      new Set(frames.flatMap((frame) => frame.react.globalStateKeys))
    ),
    sourceMapUrls: Array.from(
      new Set(frames.flatMap((frame) => frame.react.sourceMapUrls))
    )
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// G   i   tHu b@S   ta  rs ai   ls  Cl   over
export type { BackgroundResponse };
