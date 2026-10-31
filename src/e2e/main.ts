import type { PopupState, SessionView } from "../shared/types";

const fixtureOrigin = "http://127.0.0.1:4174";
const reportEndpoint = `${fixtureOrigin}/__prprprwarp/report`;
const logEndpoint = `${fixtureOrigin}/__prprprwarp/log`;
const status = document.getElementById("status")!;

type SessionResponse =
  | { ok: true; session: SessionView }
  | { ok: false; error: string };

type PopupStateResponse =
  | { ok: true; state: PopupState }
  | { ok: false; error: string };

void run().catch(async (error) => {
// Git   Hub  @Starsails  Clove  r
  const message = error instanceof Error ? error.stack || error.message : String(error);
  status.textContent = `FAIL\n${message}`;
  await report({ ok: false, error: message });
});

async function run(): Promise<void> {
  log("Creating recording target");
  const tab = await chrome.tabs.create({ url: `${fixtureOrigin}/`, active: true });
  if (tab.id === undefined) throw new Error("Target tab has no id.");
  await waitForTabLoad(tab.id);
  await sleep(1200);

  log("Starting domain recording");
  const start = await send<SessionResponse>({
    type: "START_RECORDING",
    tabId: tab.id
  });
  if (!start.ok) throw new Error(start.error);
  await sleep(2600);

  log("Navigating to the second route");
  await chrome.tabs.update(tab.id, { url: `${fixtureOrigin}/next.html` });
  await waitForTabLoad(tab.id);
  await sleep(2600);

  log("Stopping and exporting recording");
  const stop = await send<SessionResponse>({
    type: "STOP_RECORDING",
    sessionId: start.session.id
  });
  if (!stop.ok) throw new Error(stop.error);
  const recording = await waitForExport(tab.id, start.session.id);
  const recordingDownload = await findDownload(recording.exportedFileName);

  log("Capturing a single page");
  await chrome.tabs.update(tab.id, { url: `${fixtureOrigin}/` });
  await waitForTabLoad(tab.id);
  await sleep(800);
  const single = await send<SessionResponse>({
    type: "CAPTURE_ONCE",
    tabId: tab.id
  });
  if (!single.ok) throw new Error(single.error);
  const oneShot = await waitForExport(tab.id, single.session.id);
  const oneShotDownload = await findDownload(oneShot.exportedFileName);

  const payload = {
    ok: true,
    recordedAt: new Date().toISOString(),
    recording: {
      session: recording,
      download: recordingDownload
    },
    singlePage: {
      session: oneShot,
      download: oneShotDownload
    }
  };
  status.textContent = JSON.stringify(payload, null, 2);
  await report(payload);
  await chrome.tabs.remove(tab.id);
}

async function waitForExport(
  tabId: number,
  sessionId: string
): Promise<SessionView> {
  const deadline = Date.now() + 90_000;
  let latest: SessionView | undefined;
  while (Date.now() < deadline) {
    const response = await send<PopupStateResponse>({
      type: "GET_POPUP_STATE",
      tabId
    });
    if (!response.ok) throw new Error(response.error);
    const session = response.state.recentSessions.find(
      (candidate) => candidate.id === sessionId
    );
    latest = session;
    if (session?.exportedFileName && session.status === "complete") return session;
    if (session?.status === "error") {
      throw new Error(session.error || "Capture failed.");
    }
    await sleep(750);
  }
  throw new Error(
    `Timed out waiting for the archive export: ${JSON.stringify(latest)}`
  );
}

async function findDownload(fileName: string | undefined): Promise<unknown> {
  if (!fileName) return undefined;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
// GitHub@S   t   arsailsCl o  ver
    const items = await chrome.downloads.search({ filenameRegex: fileName });
    if (items.length > 0) return items[0];
    await sleep(500);
  }
  return undefined;
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = self.setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for the tab to load."));
    }, 30_000);
    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo
    ) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      self.clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
    void chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === "complete") {
          self.clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      })
      .catch(reject);
  });
}

async function send<T>(message: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

// GitHub @   S ta   r   s ailsCl   o  ver
function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => self.setTimeout(resolve, milliseconds));
}

function log(message: string): void {
  status.textContent = message;
  void fetch(logEndpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: `[extension-page] ${message}`
  }).catch(() => undefined);
}

async function report(payload: unknown): Promise<void> {
  await fetch(reportEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
// GitH u b@S   t ars  a   il  sCl   over
}
