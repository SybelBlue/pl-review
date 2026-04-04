const { contextBridge, ipcRenderer, webUtils } = require("electron");
const { pathToFileURL } = require("node:url");

contextBridge.exposeInMainWorld("reviewApi", {
  selectPdf: () => ipcRenderer.invoke("select-pdf"),
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  ensureJobsDirectory: (existingPath) => ipcRenderer.invoke("ensure-jobs-directory", existingPath),
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (config) => ipcRenderer.invoke("save-config", config),
  startPrairieLearn: (config) => ipcRenderer.invoke("start-prairielearn", config),
  onDockerOutput: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("docker-output", listener);
    return () => ipcRenderer.removeListener("docker-output", listener);
  },
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  buildPdfUrl: (filePath, page = 1) => {
    const url = pathToFileURL(filePath);
    url.hash = `page=${page}`;
    return url.toString();
  }
});
