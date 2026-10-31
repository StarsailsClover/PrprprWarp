import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  Box,
  Camera,
  Check,
  Download,
  ExternalLink,
  Layers3,
  LoaderCircle,
  Radio,
  Settings2,
  Square,
  Trash2
} from "lucide-react";
import { sendBackgroundMessage, type RuntimeEvent } from "../shared/messages";
import type { PopupState, SessionView } from "../shared/types";
import { formatBytes, hostnameOf, isHttpUrl } from "../shared/url";
import "./popup.css";

function Popup() {
  const [state, setState] = useState<PopupState>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [completion, setCompletion] = useState<string>();

  const load = async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const activeTab = tabs.find((tab) => tab.active);
    const targetTab = isHttpUrl(activeTab?.url ?? "")
      ? activeTab
      : tabs
          .filter((tab) => tab.id !== undefined && isHttpUrl(tab.url ?? ""))
          .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0];
    if (targetTab?.id === undefined) {
      setError("Open an HTTP or HTTPS page to use PrprprWarp.");
      return;
    }
    const response = await sendBackgroundMessage({
      type: "GET_POPUP_STATE",
      tabId: targetTab.id
    });
    if (response.ok && "state" in response) setState(response.state);
    if (!response.ok) setError(response.error);
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 1200);
    const listener = (message: RuntimeEvent) => {
      if (message.type === "STATE_CHANGED") void load();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      window.clearInterval(interval);
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  const active = state?.activeSession;
  const latest = state?.latestSession;

  const run = async (
    name: string,
    action: () => Promise<void>,
    success?: string
  ) => {
    setBusy(name);
    setError(undefined);
    setCompletion(undefined);
    try {
      await action();
      if (success) setCompletion(success);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(undefined);
    }
  };

  const startRecording = () =>
    run("start", async () => {
      if (!state) return;
      const response = await sendBackgroundMessage({
        type: "START_RECORDING",
        tabId: state.activeTabId
      });
      if (!response.ok) throw new Error(response.error);
    });

  const captureOnce = () =>
    run("single", async () => {
      if (!state) return;
      const response = await sendBackgroundMessage({
        type: "CAPTURE_ONCE",
        tabId: state.activeTabId
      });
      if (!response.ok) throw new Error(response.error);
    });

  const stopRecording = (session: SessionView) =>
    run("stop", async () => {
      const response = await sendBackgroundMessage({
        type: "STOP_RECORDING",
        sessionId: session.id
      });
      if (!response.ok) throw new Error(response.error);
    }, "Capture stopped. Packing the archive now.");

  const exportSession = (session: SessionView) =>
    run(`export:${session.id}`, async () => {
      const response = await sendBackgroundMessage({
        type: "EXPORT_SESSION",
        sessionId: session.id
      });
      if (!response.ok) throw new Error(response.error);
    }, "Archive sent to Downloads.");

  const deleteSession = (session: SessionView) =>
    run(`delete:${session.id}`, async () => {
      const response = await sendBackgroundMessage({
        type: "DELETE_SESSION",
        sessionId: session.id
      });
      if (!response.ok) throw new Error(response.error);
    });

  const status = useMemo(() => {
    if (!active) return { label: "Ready", tone: "idle" as const };
    if (active.status === "recording") return { label: "Recording", tone: "live" as const };
    if (active.status === "exporting") {
      return { label: `Packing ${active.exportProgress}%`, tone: "busy" as const };
    }
    return { label: titleCase(active.status), tone: "busy" as const };
  }, [active]);

  if (!state) {
    return (
      <main className="loading-shell">
        <LoaderCircle className="spin" size={20} />
      </main>
    );
  }

  return (
    <main className="popup-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">W</div>
          <div>
            <h1>PrprprWarp</h1>
            <span className={`status status-${status.tone}`}>
              <span />
              {status.label}
            </span>
          </div>
        </div>
        <button
          className="icon-button"
          type="button"
          title="Settings"
          aria-label="Settings"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          <Settings2 size={17} />
        </button>
      </header>

      <section className="target">
        <div className="target-copy">
          <span className="eyebrow">Current site</span>
          <strong>{hostnameOf(state.activeTabUrl) || "Unavailable"}</strong>
          <span className="target-url">{state.activeTabUrl || "Open an HTTP or HTTPS page"}</span>
        </div>
        {active ? (
          <button
            className="primary-button stop-button"
            type="button"
            disabled={Boolean(busy) || active.status === "exporting"}
            onClick={() => void stopRecording(active)}
          >
            {busy === "stop" ? <LoaderCircle className="spin" size={17} /> : <Square size={15} fill="currentColor" />}
            Stop and pack
          </button>
        ) : (
          <button
            className="primary-button"
            type="button"
            disabled={!state.debuggerAvailable || Boolean(busy)}
            onClick={() => void startRecording()}
          >
            {busy === "start" ? <LoaderCircle className="spin" size={17} /> : <Radio size={17} />}
            Record domain
          </button>
        )}
      </section>

      {!active && (
        <button
          className="single-button"
          type="button"
          disabled={!state.debuggerAvailable || Boolean(busy)}
          onClick={() => void captureOnce()}
        >
          {busy === "single" ? <LoaderCircle className="spin" size={17} /> : <Camera size={17} />}
          Capture this page
        </button>
      )}

      {(active || latest) && (
        <section className="metrics" aria-label="Capture metrics">
          <Metric icon={<Layers3 size={15} />} value={String((active ?? latest)?.pageCount ?? 0)} label="Pages" />
          <Metric icon={<Box size={15} />} value={String((active ?? latest)?.resourceCount ?? 0)} label="Resources" />
          <Metric icon={<Radio size={15} />} value={String((active ?? latest)?.reactComponentCount ?? 0)} label="React" />
          <Metric icon={<Download size={15} />} value={formatBytes((active ?? latest)?.byteCount ?? 0)} label="Stored" />
        </section>
      )}

      {active && isBusyStatus(active.status) && (
        <section className="progress-panel">
          <div>
            <span>{status.label}</span>
            <span>{Math.max(active.exportProgress, 6)}%</span>
          </div>
          <div className="progress-track">
            <div style={{ width: `${Math.max(active.exportProgress, 6)}%` }} />
          </div>
        </section>
      )}

      {completion && (
        <div className="banner banner-success">
          <Check size={15} />
          <span>{completion}</span>
        </div>
      )}
      {error && (
        <div className="banner banner-error">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      <section className="recent">
        <div className="section-heading">
          <h2>Recent captures</h2>
          <span>{state.recentSessions.length}</span>
        </div>
        {state.recentSessions.length === 0 ? (
          <div className="empty-state">No captures yet</div>
        ) : (
          <div className="session-list">
            {state.recentSessions.map((session) => (
              <article className="session-row" key={session.id}>
                <div className="session-main">
                  <div className="session-title">
                    <span>{session.domain}</span>
                    <span className={`mini-status mini-${session.status}`}>{session.status}</span>
                  </div>
                  <div className="session-meta">
                    <span>{session.pageCount} pages</span>
                    <span>{session.resourceCount} resources</span>
                    <span>{formatBytes(session.byteCount)}</span>
                  </div>
                  {session.error && <p className="session-error">{session.error}</p>}
                </div>
                <div className="session-actions">
                  {session.status === "complete" && (
                    <button
                      className="icon-button compact"
                      type="button"
                      title="Export archive"
                      aria-label="Export archive"
                      disabled={Boolean(busy)}
                      onClick={() => void exportSession(session)}
                    >
                      {busy === `export:${session.id}` ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}
                    </button>
                  )}
                  {!isActiveStatus(session.status) && (
                    <button
                      className="icon-button compact danger"
                      type="button"
                      title="Delete capture"
                      aria-label="Delete capture"
                      disabled={Boolean(busy)}
                      onClick={() => void deleteSession(session)}
                    >
                      {busy === `delete:${session.id}` ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <span>{state.options.includeLiveView ? "Snapshot + live" : "Snapshot only"}</span>
        <button
          type="button"
          onClick={() => void chrome.tabs.create({ url: "https://github.com/StarsailsClover/PrprprWarp" })}
        >
          GitHub <ExternalLink size={12} />
        </button>
      </footer>
    </main>
  );
}

function Metric({
  icon,
  value,
  label
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="metric">
      <span className="metric-icon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isActiveStatus(status: SessionView["status"]): boolean {
  return ["starting", "recording", "capturing", "stopping", "exporting"].includes(status);
}

function isBusyStatus(status: SessionView["status"]): boolean {
  return ["capturing", "stopping", "exporting"].includes(status);
}

createRoot(document.getElementById("root")!).render(<Popup />);
