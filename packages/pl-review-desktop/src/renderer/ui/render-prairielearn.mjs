import { setIndicatorState } from "./render-config.mjs";

export function summarizeUrlForHint(url) {
  if (!url) {
    return "No PrairieLearn page loaded.";
  }

  try {
    const parsed = new URL(url);
    const summary = `${parsed.hostname}${parsed.pathname}${parsed.search}${parsed.hash}` || parsed.toString();
    return summary.length > 72 ? `${summary.slice(0, 69)}...` : summary;
  } catch (error) {
    return url;
  }
}

export function setCurrentUrl({ elements, state, url }) {
  state.currentPrairieLearnUrl = url || "";
  if (!elements.currentUrl) {
    return;
  }

  elements.currentUrl.textContent = summarizeUrlForHint(url);
  elements.currentUrl.title = url || "No PrairieLearn page loaded.";
  elements.currentUrl.classList.toggle("is-active", Boolean(url));
}

export function isPrairieLearnWaitingForConfiguration({ state }) {
  return !state.prairieLearnReady;
}

export function updateWebviewNavigationButtons(elements) {
  const blocked = elements.webview.hidden;
  elements.webviewBackButton.disabled = blocked || !elements.webview.canGoBack();
  elements.webviewForwardButton.disabled = blocked || !elements.webview.canGoForward();
  elements.webviewReloadButton.disabled = blocked;
}

export function setConfigOverlayOpen({ elements, state, isOpen }) {
  state.isConfigOverlayOpen = Boolean(isOpen);
  renderPrairieLearnSurface({ elements, state });
}

export function collapseConnectionPanelOnSuccessfulPlUrl({ elements, state, url }) {
  if (!url || url === "about:blank") {
    return;
  }

  try {
    const target = new URL(url);
    const base = new URL(state.config.baseUrl || "http://127.0.0.1:3000");
    if (target.origin === base.origin) {
      setConfigOverlayOpen({ elements, state, isOpen: false });
    }
  } catch (error) {
    // Ignore invalid URLs from partial webview transitions.
  }
}

export function setPrairieLearnStatus({ elements, state, message, level = "idle" }) {
  state.prairieLearnStatusLevel = level;
  if (elements.plStatus) {
    elements.plStatus.textContent = message;
  }
  if (elements.plIndicator) {
    setIndicatorState(elements.plIndicator, level);
  }
}

export function renderPrairieLearnSurface({ elements, state }) {
  const forcedOverlay = isPrairieLearnWaitingForConfiguration({ state });
  const showOverlay = forcedOverlay || state.isConfigOverlayOpen;

  if (elements.plConfigOverlay) {
    elements.plConfigOverlay.hidden = !showOverlay;
  }
  if (elements.webview) {
    elements.webview.hidden = showOverlay;
    elements.webview.setAttribute("aria-hidden", showOverlay ? "true" : "false");
    elements.webview.tabIndex = showOverlay ? -1 : 0;
  }
  if (elements.openBrowserButton) {
    elements.openBrowserButton.disabled = forcedOverlay;
  }
  if (elements.plStatusToggle) {
    const connectionLabel = forcedOverlay
      ? "Connection required"
      : showOverlay
        ? "Hide connection panel"
        : "Show connection panel";

    elements.plStatusToggle.title = connectionLabel;
    elements.plStatusToggle.setAttribute("aria-label", connectionLabel);
    elements.plStatusToggle.setAttribute("aria-pressed", showOverlay ? "true" : "false");
    elements.plStatusToggle.setAttribute("aria-disabled", forcedOverlay ? "true" : "false");
    elements.plStatusToggle.classList.toggle("is-disabled", forcedOverlay);
    elements.plStatusToggle.classList.toggle("is-active", showOverlay);
  }

  updateWebviewNavigationButtons(elements);
}
