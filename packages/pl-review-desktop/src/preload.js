const { contextBridge, ipcRenderer, webUtils } = require("electron");
const { pathToFileURL } = require("node:url");

contextBridge.exposeInMainWorld("reviewApi", {
  selectPdf: () => ipcRenderer.invoke("select-pdf"),
  selectReviewManifest: () => ipcRenderer.invoke("select-review-manifest"),
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  ensureJobsDirectory: (existingPath) => ipcRenderer.invoke("ensure-jobs-directory", existingPath),
  checkCliDependencies: () => ipcRenderer.invoke("check-cli-dependencies"),
  checkDockerInstalled: () => ipcRenderer.invoke("check-docker-installed"),
  checkDockerDaemonRunning: () => ipcRenderer.invoke("check-docker-daemon-running"),
  startDockerDaemon: (mode = "start") => ipcRenderer.invoke("start-docker-daemon", mode),
  listPrairieLearnContainers: () => ipcRenderer.invoke("list-prairielearn-containers"),
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (config) => ipcRenderer.invoke("save-config", config),
  startPrairieLearn: (config) => ipcRenderer.invoke("start-prairielearn", config),
  restartPrairieLearn: (config) => ipcRenderer.invoke("restart-prairielearn", config),
  reconnectPrairieLearn: (config) => ipcRenderer.invoke("reconnect-prairielearn", config),
  stopPrairieLearnStart: () => ipcRenderer.invoke("stop-prairielearn-start"),
  stopConnectedPrairieLearn: (baseUrl) => ipcRenderer.invoke("stop-connected-prairielearn", baseUrl),
  attachPrairieLearnWebview: (webContentsId) => ipcRenderer.invoke("attach-prairielearn-webview", webContentsId),
  detachPrairieLearnWebview: () => ipcRenderer.invoke("detach-prairielearn-webview"),
  getPrairieLearnStatus: () => ipcRenderer.invoke("get-prairielearn-status"),
  reloadPrairieLearnFromDisk: () => ipcRenderer.invoke("reload-prairielearn-from-disk"),
  getPrairieLearnCurrent: () => ipcRenderer.invoke("get-prairielearn-current"),
  goToNextPrairieLearnQuestion: () => ipcRenderer.invoke("go-to-next-prairielearn-question"),
  goToPreviousPrairieLearnQuestion: () => ipcRenderer.invoke("go-to-previous-prairielearn-question"),
  goToPrairieLearnUrl: (url) => ipcRenderer.invoke("go-to-prairielearn-url", url),
  loadReviewContext: () => ipcRenderer.invoke("load-review-context"),
  selectReviewSequence: (sequenceId) => ipcRenderer.invoke("select-review-sequence", sequenceId),
  selectReviewBank: (bankSlug) => ipcRenderer.invoke("select-review-bank", bankSlug),
  searchReviewQuestions: (bankSlug, query) => ipcRenderer.invoke("search-review-questions", bankSlug, query),
  updateReviewTags: (bankSlug, tags) => ipcRenderer.invoke("update-review-tags", bankSlug, tags),
  jumpToReviewQuestion: (bankSlug, questionIndex) => ipcRenderer.invoke("jump-to-review-question", bankSlug, questionIndex),
  applyReviewAction: (bankSlug, action) => ipcRenderer.invoke("apply-review-action", bankSlug, action),
  undoReviewAction: (bankSlug) => ipcRenderer.invoke("undo-review-action", bankSlug),
  onDockerOutput: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("docker-output", listener);
    return () => ipcRenderer.removeListener("docker-output", listener);
  },
  onPrairieLearnAutomationEvent: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("prairielearn-automation-event", listener);
    return () => ipcRenderer.removeListener("prairielearn-automation-event", listener);
  },
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  buildPdfUrl: (filePath, page = 1) => {
    const url = pathToFileURL(filePath);
    url.hash = `page=${page}`;
    return url.toString();
  }
});
