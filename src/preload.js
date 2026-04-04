const { contextBridge, ipcRenderer } = require("electron");
const { pathToFileURL } = require("node:url");

contextBridge.exposeInMainWorld("reviewApi", {
  selectPdf: () => ipcRenderer.invoke("select-pdf"),
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (config) => ipcRenderer.invoke("save-config", config),
  startPrairieLearn: (config) => ipcRenderer.invoke("start-prairielearn", config),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  buildPdfUrl: (filePath, page = 1) => {
    const url = pathToFileURL(filePath);
    url.hash = `page=${page}`;
    return url.toString();
  }
});

