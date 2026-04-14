import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/renderer-shell.html");

export async function createRendererTestContext(overrides = {}) {
  const html = await readFile(fixturePath, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/"
  });

  const { window } = dom;
  const { document } = window;
  const webview = document.getElementById("prairielearn-view");
  webview.canGoBack = () => false;
  webview.canGoForward = () => false;
  webview.reload = () => {};
  webview.goBack = () => {};
  webview.goForward = () => {};
  webview.getURL = () => webview.src || "about:blank";
  webview.getWebContentsId = () => 55;

  const reviewApi = {
    selectPdf: async () => null,
    selectReviewManifest: async () => null,
    selectDirectory: async () => null,
    ensureJobsDirectory: async (existingPath) => existingPath || "/tmp/pl_ag_jobs-test",
    checkCliDependencies: async () => ({
      ok: true,
      docker: { ok: true },
      git: { ok: true },
      gh: { installed: true, authenticated: true },
      warnings: []
    }),
    checkDockerInstalled: async () => ({ ok: true }),
    checkDockerDaemonRunning: async () => ({ ok: true, version: "1.0.0" }),
    startDockerDaemon: async () => ({ ok: true }),
    listPrairieLearnContainers: async () => ({ ok: true, containers: [] }),
    getConfig: async () => ({
      baseUrl: "http://127.0.0.1:3000",
      commandMode: "structured",
      autoLoadFromDiskOnConnect: true,
      courseDirectory: "",
      courseDirectories: ["/repo/course-a"],
      jobsDirectory: "/tmp/jobs",
      customStartCommand: "",
      startCommand: ""
    }),
    saveConfig: async (config) => config,
    startPrairieLearn: async (config) => ({ ok: false, error: "not started", config }),
    restartPrairieLearn: async (config) => ({ ok: false, error: "not started", config }),
    reconnectPrairieLearn: async (config) => ({ ok: false, error: "not reconnected", config }),
    stopPrairieLearnStart: async () => ({ ok: true }),
    stopConnectedPrairieLearn: async () => ({ ok: true }),
    attachPrairieLearnWebview: async (webContentsId) => ({ webContentsId, status: null }),
    detachPrairieLearnWebview: async () => ({}),
    getPrairieLearnStatus: async () => ({}),
    reloadPrairieLearnFromDisk: async () => ({}),
    getPrairieLearnCurrent: async () => ({}),
    goToNextPrairieLearnQuestion: async () => ({}),
    goToPreviousPrairieLearnQuestion: async () => ({}),
    goToPrairieLearnUrl: async () => ({}),
    loadReviewContext: async () => ({ banks: [], currentBankSlug: "", session: null }),
    selectReviewSequence: async () => ({ banks: [], currentBankSlug: "", session: null }),
    selectReviewBank: async () => ({ banks: [], currentBankSlug: "", session: null }),
    searchReviewQuestions: async () => [],
    updateReviewTags: async () => ({ banks: [], currentBankSlug: "", session: null }),
    jumpToReviewQuestion: async () => ({ banks: [], currentBankSlug: "", session: null }),
    applyReviewAction: async () => ({ message: "", snapshot: { banks: [], currentBankSlug: "", session: null } }),
    undoReviewAction: async () => ({ message: "", snapshot: { banks: [], currentBankSlug: "", session: null } }),
    onDockerOutput: () => () => {},
    onPrairieLearnAutomationEvent: () => () => {},
    openExternal: async () => {},
    getPathForFile: (file) => file.path || "",
    buildPdfUrl: (filePath, page = 1) => `file://${filePath}#page=${page}`
  };

  window.reviewApi = {
    ...reviewApi,
    ...overrides.reviewApi
  };

  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalEvent = globalThis.Event;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.Event = window.Event;

  return {
    dom,
    window,
    document,
    localStorage: window.localStorage,
    cleanup() {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      globalThis.Event = originalEvent;
      window.close();
    }
  };
}

export function createDataTransfer(types = ["Files"]) {
  return {
    types,
    files: [],
    dropEffect: "copy"
  };
}
