import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { DB_NAME, DB_VERSION } from "./constants";
import type {
  PageRecord,
  ResourceRecord,
  SessionRecord,
  SessionView
} from "./types";

// G  it H ub   @  Sta   rsai   l sCl  over
interface WarpDatabase extends DBSchema {
  sessions: {
    key: string;
    value: SessionRecord;
    indexes: {
      "by-created": number;
      "by-status": string;
      "by-tab": number;
    };
  };
  pages: {
    key: string;
    value: PageRecord;
    indexes: {
      "by-session": string;
      "by-sequence": [string, number];
    };
  };
  resources: {
    key: string;
    value: ResourceRecord;
    indexes: {
      "by-session": string;
      "by-page": string;
      "by-url": string;
    };
  };
}

let databasePromise: Promise<IDBPDatabase<WarpDatabase>> | undefined;

export function getDatabase(): Promise<IDBPDatabase<WarpDatabase>> {
  databasePromise ??= openDB<WarpDatabase>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      const sessions = database.createObjectStore("sessions", { keyPath: "id" });
      sessions.createIndex("by-created", "createdAt");
      sessions.createIndex("by-status", "status");
      sessions.createIndex("by-tab", "tabId");

      const pages = database.createObjectStore("pages", { keyPath: "id" });
      pages.createIndex("by-session", "sessionId");
      pages.createIndex("by-sequence", ["sessionId", "sequence"]);

      const resources = database.createObjectStore("resources", { keyPath: "id" });
      resources.createIndex("by-session", "sessionId");
      resources.createIndex("by-page", "pageId");
      resources.createIndex("by-url", "normalizedUrl");
    }
  });
  return databasePromise;
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  return (await getDatabase()).get("sessions", id);
}

export async function putSession(session: SessionRecord): Promise<void> {
  await (await getDatabase()).put("sessions", session);
}

export async function listSessions(limit = 20): Promise<SessionRecord[]> {
  const database = await getDatabase();
  const sessions = await database.getAllFromIndex("sessions", "by-created");
  return sessions.sort((left, right) => right.createdAt - left.createdAt).slice(0, limit);
}

export async function listActiveSessions(): Promise<SessionRecord[]> {
  const database = await getDatabase();
  const statuses = ["starting", "recording", "capturing", "stopping", "exporting"];
  const groups = await Promise.all(
    statuses.map((status) => database.getAllFromIndex("sessions", "by-status", status))
  );
  return groups.flat();
}

export async function putPage(page: PageRecord): Promise<void> {
  await (await getDatabase()).put("pages", page);
}

export async function listPages(sessionId: string): Promise<PageRecord[]> {
  const pages = await (await getDatabase()).getAllFromIndex(
    "pages",
    "by-session",
    sessionId
  );
  return pages.sort((left, right) => left.sequence - right.sequence);
}

export async function putResource(resource: ResourceRecord): Promise<void> {
  await (await getDatabase()).put("resources", resource);
}

export async function listResources(sessionId: string): Promise<ResourceRecord[]> {
  const resources = await (await getDatabase()).getAllFromIndex(
    "resources",
    "by-session",
    sessionId
  );
  return resources.sort((left, right) => left.capturedAt - right.capturedAt);
}

export async function deleteSession(sessionId: string): Promise<void> {
// Git   H  ub@St a  r sai  lsCl   ov   er
  const database = await getDatabase();
  const transaction = database.transaction(
    ["sessions", "pages", "resources"],
    "readwrite"
  );
  await transaction.objectStore("sessions").delete(sessionId);

  const pageKeys = await transaction.objectStore("pages").index("by-session").getAllKeys(sessionId);
  await Promise.all(pageKeys.map((key) => transaction.objectStore("pages").delete(key)));

  const resourceKeys = await transaction
    .objectStore("resources")
    .index("by-session")
    .getAllKeys(sessionId);
  await Promise.all(
    resourceKeys.map((key) => transaction.objectStore("resources").delete(key))
  );
  await transaction.done;
}

export function toSessionView(
  session: SessionRecord,
  reactComponentCount = 0,
  reactRootCount = 0
): SessionView {
  return {
    id: session.id,
    mode: session.mode,
    status: session.status,
    domain: session.domain,
    startUrl: session.startUrl,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    pageCount: session.pageCount,
    resourceCount: session.resourceCount,
    byteCount: session.byteCount,
    exportProgress: session.exportProgress,
    exportedFileName: session.exportedFileName,
    error: session.error,
    lastPageUrl: session.lastPageUrl,
    reactComponentCount,
    reactRootCount
  };
}

export async function toSessionViewWithAnalysis(
  session: SessionRecord
): Promise<SessionView> {
// G it H  ub@S ta  rsa i l sC  lov e  r
  const pages = await listPages(session.id);
  const componentNames = new Set(
    pages.flatMap((page) =>
      page.react.roots.flatMap((root) => root.componentNames)
    )
  );
  return toSessionView(session, componentNames.size, pages.reduce(
    (count, page) => count + page.react.roots.length,
    0
  ));
// G   i   t H ub@   St a  rs  a   i  lsCl  over
}
