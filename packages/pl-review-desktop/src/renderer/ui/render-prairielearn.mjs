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
  elements.currentUrl.textContent = summarizeUrlForHint(url);
  elements.currentUrl.title = url || "No PrairieLearn page loaded.";
  elements.currentUrl.classList.toggle("is-active", Boolean(url));
}

export function isPrairieLearnWaitingForConfiguration({ state }) {
  return !state.prairieLearnReady && !state.currentPrairieLearnUrl;
}

export function updateWebviewNavigationButtons(elements) {
  elements.webviewBackButton.disabled = !elements.webview.canGoBack();
  elements.webviewForwardButton.disabled = !elements.webview.canGoForward();
}

export function setConfigOverlayOpen({ elements, state, isOpen }) {
  state.isConfigOverlayOpen = isOpen;
  elements.plConfigOverlay.hidden = !isOpen;
  renderPrairieLearnSurface({ elements, state });
}

export function collapseConnectionPanelOnSuccessfulPlUrl({ elements, state, url }) {
  if (!url || !state.prairieLearnReady) {
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
  elements.plStatus.textContent = message;
  setIndicatorState(elements.plIndicator, level);
}

export function renderPrairieLearnSurface({ elements, state }) {
  const showOverlay = state.isConfigOverlayOpen;
  const forcedOverlay = isPrairieLearnWaitingForConfiguration({ state });

  elements.plConfigOverlay.hidden = !(showOverlay || forcedOverlay);
  elements.plStatusToggle.classList.toggle("is-disabled", forcedOverlay);
  elements.plStatusToggle.classList.toggle("is-active", showOverlay);
}
