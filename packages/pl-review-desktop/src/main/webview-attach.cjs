function createWebviewAttachService({
  webContents,
  fetch,
  remoteDebuggingPort,
  setTimeoutFn = setTimeout
}) {
  let cachedBrowserWSEndpoint = null;

  async function getRemoteDebuggingBrowserWSEndpoint(forceRefresh = false) {
    if (!forceRefresh && cachedBrowserWSEndpoint) {
      return cachedBrowserWSEndpoint;
    }

    const endpointUrl = `http://127.0.0.1:${remoteDebuggingPort}/json/version`;
    const deadline = Date.now() + 5000;
    let lastError = null;

    while (Date.now() < deadline) {
      try {
        const response = await fetch(endpointUrl);
        if (!response.ok) {
          throw new Error(`Remote debugging endpoint returned ${response.status}.`);
        }

        const payload = await response.json();
        const browserWSEndpoint = String(payload?.webSocketDebuggerUrl || "").trim();
        if (!browserWSEndpoint) {
          throw new Error("Remote debugging endpoint did not provide a browser WebSocket URL.");
        }

        cachedBrowserWSEndpoint = browserWSEndpoint;
        return browserWSEndpoint;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeoutFn(resolve, 150));
      }
    }

    throw new Error(lastError?.message || "Could not resolve the Electron DevTools WebSocket endpoint.");
  }

  function getGuestWebContents(hostContents, guestWebContentsId) {
    const numericId = Number(guestWebContentsId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new Error("A valid webContents id is required.");
    }

    const guestContents = webContents.fromId(numericId);
    if (!guestContents || guestContents.isDestroyed()) {
      throw new Error(`Could not find guest webContents ${numericId}.`);
    }

    if (guestContents.hostWebContents !== hostContents) {
      throw new Error(`webContents ${numericId} is not owned by the requesting renderer.`);
    }

    return guestContents;
  }

  async function getGuestTargetId(guestContents) {
    const debuggerApi = guestContents.debugger;
    const attachedHere = !debuggerApi.isAttached();

    try {
      if (attachedHere) {
        debuggerApi.attach("1.3");
      }

      const response = await debuggerApi.sendCommand("Target.getTargetInfo");
      const targetId = String(response?.targetInfo?.targetId || "").trim();
      if (!targetId) {
        throw new Error("DevTools target id was not available for the guest webContents.");
      }

      return targetId;
    } finally {
      if (attachedHere && debuggerApi.isAttached()) {
        debuggerApi.detach();
      }
    }
  }

  return {
    getRemoteDebuggingBrowserWSEndpoint,
    getGuestWebContents,
    getGuestTargetId
  };
}

module.exports = {
  createWebviewAttachService
};
