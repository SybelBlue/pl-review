const sessionPrefix = "pl-review-session:";
const plStatusText = {
  waitingForConfiguration: "waiting",
  starting: "starting...",
  reconnecting: "reconnecting...",
  ready: "ready",
  readyWithWarning: "ready (with warning)",
  connectionSaved: "saved",
  connectFailed: "conn error",
  viewFailed: "view error",
  stoppingStart: "cancelling...",
  stopStartFailed: "started",
  startStopped: "waiting",
  stoppingContainer: "stopping...",
  stopContainerFailed: "stop failed",
  containerStopped: "waiting",
  dropSinglePdf: "Drop a single PDF file to load it."
};

const elements = {
  choosePdfButton: document.getElementById("choose-pdf-button"),
  restartPlButton: document.getElementById("restart-pl-button"),
  stopPlButton: document.getElementById("stop-pl-button"),
  openBrowserButton: document.getElementById("open-browser-button"),
  plStatusToggle: document.getElementById("pl-status-toggle"),
  saveConfigButton: document.getElementById("save-config-button"),
  startConfiguredButton: document.getElementById("start-configured-button"),
  pdfName: document.getElementById("pdf-name"),
  pdfIndicator: document.getElementById("pdf-indicator"),
  plStatus: document.getElementById("pl-status"),
  plIndicator: document.getElementById("pl-indicator"),
  currentUrl: document.getElementById("current-url"),
  baseUrlInput: document.getElementById("base-url-input"),
  commandModeStructured: document.getElementById("command-mode-structured"),
  commandModeCustom: document.getElementById("command-mode-custom"),
  commandModeReconnect: document.getElementById("command-mode-reconnect"),
  configStepDockerInstalled: document.getElementById("config-step-docker-installed"),
  configStepDockerDaemon: document.getElementById("config-step-docker-daemon"),
  configStepConnectionMethod: document.getElementById("config-step-connection-method"),
  dockerInstalledStepIndicator: document.getElementById("docker-installed-step-indicator"),
  dockerDaemonStepIndicator: document.getElementById("docker-daemon-step-indicator"),
  connectionMethodStepIndicator: document.getElementById("connection-method-step-indicator"),
  dockerInstalledStepStatus: document.getElementById("docker-installed-step-status"),
  dockerDaemonStepStatus: document.getElementById("docker-daemon-step-status"),
  connectionMethodStepStatus: document.getElementById("connection-method-step-status"),
  checkDockerInstalledButton: document.getElementById("check-docker-installed-button"),
  checkDockerDaemonButton: document.getElementById("check-docker-daemon-button"),
  startDockerDaemonButton: document.getElementById("start-docker-daemon-button"),
  restartDockerDaemonButton: document.getElementById("restart-docker-daemon-button"),
  connectionStepContent: document.getElementById("connection-step-content"),
  structuredCommandEditor: document.getElementById("structured-command-editor"),
  customCommandEditor: document.getElementById("custom-command-editor"),
  reconnectCommandEditor: document.getElementById("reconnect-command-editor"),
  courseDirectoriesZone: document.getElementById("course-directories-zone"),
  courseDirectoriesList: document.getElementById("course-directories-list"),
  addCourseDirectoryButton: document.getElementById("add-course-directory-button"),
  refreshRunningContainersButton: document.getElementById("refresh-running-containers-button"),
  runningContainersPreview: document.getElementById("running-containers-preview"),
  generatedCommandAccordion: document.getElementById("generated-command-accordion"),
  generatedCommandPreview: document.getElementById("generated-command-preview"),
  startCommandInput: document.getElementById("start-command-input"),
  configPanel: document.getElementById("config-panel"),
  plConfigOverlay: document.getElementById("pl-config-overlay"),
  pdfOverlay: document.getElementById("pdf-overlay"),
  pdfDropZone: document.getElementById("pdf-drop-zone"),
  dockerOutputAccordion: document.getElementById("docker-output-accordion"),
  dockerOutputLog: document.getElementById("docker-output-log"),
  questionList: document.getElementById("question-list"),
  questionForm: document.getElementById("question-form"),
  questionTitleInput: document.getElementById("question-title-input"),
  questionPathInput: document.getElementById("question-path-input"),
  questionPdfPageInput: document.getElementById("question-pdf-page-input"),
  questionTagsInput: document.getElementById("question-tags-input"),
  questionFlaggedInput: document.getElementById("question-flagged-input"),
  questionNotesInput: document.getElementById("question-notes-input"),
  newQuestionButton: document.getElementById("new-question-button"),
  captureViewButton: document.getElementById("capture-view-button"),
  deleteQuestionButton: document.getElementById("delete-question-button"),
  previousQuestionButton: document.getElementById("previous-question-button"),
  nextQuestionButton: document.getElementById("next-question-button"),
  previousPageButton: document.getElementById("previous-page-button"),
  nextPageButton: document.getElementById("next-page-button"),
  applyPageButton: document.getElementById("apply-page-button"),
  pdfPageInput: document.getElementById("pdf-page-input"),
  pdfFrame: document.getElementById("pdf-frame"),
  webview: document.getElementById("prairielearn-view"),
  webviewBackButton: document.getElementById("webview-back-button"),
  webviewForwardButton: document.getElementById("webview-forward-button"),
  webviewReloadButton: document.getElementById("webview-reload-button"),
  questionItemTemplate: document.getElementById("question-item-template")
};

const state = {
  config: {
    baseUrl: "http://127.0.0.1:3000",
    commandMode: "structured",
    courseDirectory: "",
    courseDirectories: [],
    jobsDirectory: "",
    customStartCommand: "",
    startCommand: ""
  },
  pdf: null,
  session: null,
  currentPdfPage: 1,
  currentPrairieLearnUrl: "",
  currentPrairieLearnTitle: "",
  prairieLearnReady: false,
  prairieLearnStatusLevel: "idle",
  isConfigOverlayOpen: true,
  dockerLog: "",
  dockerChecks: {
    installed: {
      status: "idle",
      message: "Not checked yet."
    },
    daemon: {
      status: "idle",
      message: "Waiting on step 1."
    }
  }
};

let pdfDropDragDepth = 0;
let removeDockerOutputListener = null;
const maxDockerLogChars = 180000;
let isPrairieLearnCommandRunning = false;
let isPrairieLearnStopping = false;
let hasReconnectOptions = false;
let hasAppliedContainerModeDefault = false;
let draggedCourseRowIndex = null;
const maxCourseDirectories = 10;

function setPrairieLearnRunState(isRunning) {
  isPrairieLearnCommandRunning = isRunning;
  const canStop = !isPrairieLearnStopping && (isRunning || state.prairieLearnReady);
  elements.stopPlButton.disabled = !canStop;
  if (elements.restartPlButton) {
    elements.restartPlButton.disabled = isRunning;
  }
  syncStartButtonDisabledState();
  elements.startConfiguredButton.classList.toggle("is-loading", isRunning);
  elements.startConfiguredButton.setAttribute("aria-busy", isRunning ? "true" : "false");
  renderConfigSteps();
  renderPrairieLearnSurface();
}

function createEmptySession(pdfPath) {
  return {
    version: 1,
    pdfPath,
    currentPdfPage: 1,
    currentQuestionId: null,
    questions: []
  };
}

function getSessionKey(pdfPath) {
  return `${sessionPrefix}${pdfPath}`;
}

function loadSession(pdfPath) {
  const raw = localStorage.getItem(getSessionKey(pdfPath));
  if (!raw) {
    return createEmptySession(pdfPath);
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      ...createEmptySession(pdfPath),
      ...parsed,
      pdfPath,
      questions: Array.isArray(parsed.questions) ? parsed.questions : []
    };
  } catch (error) {
    return createEmptySession(pdfPath);
  }
}

function saveSession() {
  if (!state.session || !state.pdf) {
    return;
  }

  state.session.currentPdfPage = state.currentPdfPage;
  localStorage.setItem(getSessionKey(state.pdf.path), JSON.stringify(state.session));
}

function isPdfFile(file) {
  if (!file) {
    return false;
  }

  const name = (file.name || "").toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

function hasDraggedFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function getCurrentQuestion() {
  if (!state.session?.currentQuestionId) {
    return null;
  }

  return state.session.questions.find((question) => question.id === state.session.currentQuestionId) || null;
}

function getQuestionIndex(questionId) {
  return state.session.questions.findIndex((question) => question.id === questionId);
}

function setIndicatorState(element, level) {
  if (!element) {
    return;
  }

  element.classList.remove("indicator-idle", "indicator-ready", "indicator-working", "indicator-warning", "indicator-error");
  element.classList.add(`indicator-${level}`);
}

function setPrairieLearnStatus(message, level = "idle") {
  state.prairieLearnStatusLevel = level;
  elements.plStatus.textContent = message;
  setIndicatorState(elements.plIndicator, level);
}

function setConfigStepIndicatorState(element, status) {
  if (!element) {
    return;
  }

  element.classList.remove(
    "config-step-indicator-idle",
    "config-step-indicator-working",
    "config-step-indicator-success",
    "config-step-indicator-error"
  );
  element.classList.add(`config-step-indicator-${status}`);
}

function areDockerPrerequisitesPassing() {
  return state.dockerChecks.installed.status === "success" && state.dockerChecks.daemon.status === "success";
}

function syncStartButtonDisabledState() {
  if (!elements.startConfiguredButton) {
    return;
  }

  const disabled = isPrairieLearnCommandRunning || !areDockerPrerequisitesPassing();
  elements.startConfiguredButton.disabled = disabled;
  if (!areDockerPrerequisitesPassing()) {
    elements.startConfiguredButton.title = "Complete Docker checks first.";
  } else if (isPrairieLearnCommandRunning) {
    elements.startConfiguredButton.title = "PrairieLearn command is running.";
  } else {
    elements.startConfiguredButton.title = "";
  }
}

function syncConfigStepOpenState() {
  if (!elements.configStepDockerInstalled || !elements.configStepDockerDaemon || !elements.configStepConnectionMethod) {
    return;
  }

  const installedPassed = state.dockerChecks.installed.status === "success";
  const daemonPassed = state.dockerChecks.daemon.status === "success";

  if (!installedPassed) {
    elements.configStepDockerInstalled.open = true;
    elements.configStepDockerDaemon.open = false;
    elements.configStepConnectionMethod.open = false;
    return;
  }

  elements.configStepDockerInstalled.open = false;

  if (!daemonPassed) {
    elements.configStepDockerDaemon.open = true;
    elements.configStepConnectionMethod.open = false;
    return;
  }

  elements.configStepDockerDaemon.open = false;
  elements.configStepConnectionMethod.open = true;
}

function renderConfigSteps() {
  if (!elements.dockerInstalledStepIndicator || !elements.dockerDaemonStepIndicator || !elements.connectionMethodStepIndicator) {
    return;
  }

  const installedStatus = state.dockerChecks.installed.status;
  const daemonStatus = state.dockerChecks.daemon.status;
  const prereqsPassed = areDockerPrerequisitesPassing();
  const connectionStatus = state.prairieLearnReady ? "success" : isPrairieLearnCommandRunning ? "working" : "idle";

  setConfigStepIndicatorState(elements.dockerInstalledStepIndicator, installedStatus);
  setConfigStepIndicatorState(elements.dockerDaemonStepIndicator, daemonStatus);
  setConfigStepIndicatorState(elements.connectionMethodStepIndicator, connectionStatus);

  if (elements.dockerInstalledStepStatus) {
    elements.dockerInstalledStepStatus.textContent = state.dockerChecks.installed.message;
  }
  if (elements.dockerDaemonStepStatus) {
    elements.dockerDaemonStepStatus.textContent = state.dockerChecks.daemon.message;
  }
  if (elements.connectionMethodStepStatus) {
    elements.connectionMethodStepStatus.textContent = prereqsPassed
      ? state.prairieLearnReady
        ? "Configured and connected."
        : "Ready. Choose how to connect."
      : "Complete steps 1 and 2 to continue.";
  }

  if (elements.configStepConnectionMethod) {
    elements.configStepConnectionMethod.classList.toggle("is-locked", !prereqsPassed);
  }
  if (elements.connectionStepContent) {
    elements.connectionStepContent.setAttribute("aria-disabled", prereqsPassed ? "false" : "true");
  }
  if (elements.startDockerDaemonButton) {
    const canStart = state.dockerChecks.installed.status === "success" && state.dockerChecks.daemon.status !== "working";
    elements.startDockerDaemonButton.disabled = !canStart;
  }
  if (elements.restartDockerDaemonButton) {
    const canRestart = state.dockerChecks.installed.status === "success" && state.dockerChecks.daemon.status !== "working";
    elements.restartDockerDaemonButton.disabled = !canRestart;
  }
  if (elements.checkDockerDaemonButton) {
    elements.checkDockerDaemonButton.disabled = state.dockerChecks.installed.status !== "success" || state.dockerChecks.daemon.status === "working";
  }
  syncStartButtonDisabledState();
}

function setDockerCheckState(stepKey, status, message) {
  state.dockerChecks[stepKey] = { status, message };
  renderConfigSteps();
}

function withDockerDesktopRecommendation(message) {
  const base = String(message || "").trim() || "Docker Engine is not reachable.";
  if (base.toLowerCase().includes("paused")) {
    return `${base} Open Docker Desktop and click Resume. Use Restart Docker Engine only if needed.`;
  }
  return `${base} Start Docker Desktop, then check Step 2 again.`;
}

async function runDockerInstalledCheck() {
  setDockerCheckState("installed", "working", "Checking Docker installation...");
  const result = await window.reviewApi.checkDockerInstalled();

  if (result?.ok) {
    const detail = result.version ? `Docker detected: ${result.version}` : "Docker installation check passed.";
    setDockerCheckState("installed", "success", detail);
    return true;
  }

  const message = result?.error || "Docker is not installed or not on PATH.";
  setDockerCheckState("installed", "error", message);
  return false;
}

async function runDockerDaemonCheck() {
  if (state.dockerChecks.installed.status !== "success") {
    setDockerCheckState("daemon", "idle", "Waiting on step 1.");
    return false;
  }

  setDockerCheckState("daemon", "working", "Checking Docker Engine...");
  const result = await window.reviewApi.checkDockerDaemonRunning();
  if (result?.ok) {
    const detail = result.version ? `Docker Engine is running (server ${result.version}).` : "Docker Engine is running.";
    setDockerCheckState("daemon", "success", detail);
    return true;
  }

  const message = result?.error || "Docker Engine is not reachable.";
  setDockerCheckState("daemon", "error", withDockerDesktopRecommendation(message));
  return false;
}

async function waitForDockerDaemonReady(maxWaitMs = 15000, intervalMs = 1000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const ready = await window.reviewApi.checkDockerDaemonRunning();
    if (ready?.ok) {
      const detail = ready.version ? `Docker Engine is running (server ${ready.version}).` : "Docker Engine is running.";
      setDockerCheckState("daemon", "success", detail);
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

async function startDockerDaemonFromStep(mode = "start") {
  if (state.dockerChecks.installed.status !== "success") {
    const installedOk = await runDockerInstalledCheck();
    if (!installedOk) {
      setDockerCheckState("daemon", "idle", "Waiting on step 1.");
      syncConfigStepOpenState();
      updateCommandEditorState();
      return;
    }
  }

  const actionLabel = mode === "restart" ? "Restarting Docker Engine..." : "Starting Docker Engine...";
  setDockerCheckState("daemon", "working", actionLabel);
  const started = await window.reviewApi.startDockerDaemon(mode);
  if (!started?.ok) {
    setDockerCheckState(
      "daemon",
      "error",
      withDockerDesktopRecommendation(started?.error || "Could not start Docker Engine.")
    );
    syncConfigStepOpenState();
    updateCommandEditorState();
    return;
  }

  const waitingMessage = started.alreadyRunning
    ? "Docker Engine already running. Verifying..."
    : mode === "restart"
      ? "Docker restart requested. Waiting for Engine..."
      : "Docker start requested. Waiting for Engine...";
  setDockerCheckState("daemon", "working", waitingMessage);

  const ready = await waitForDockerDaemonReady(15000, 1000);
  if (!ready) {
    setDockerCheckState(
      "daemon",
      "error",
      withDockerDesktopRecommendation("Docker Engine did not become ready within 15 seconds.")
    );
  }

  syncConfigStepOpenState();
  updateCommandEditorState();

  if (areDockerPrerequisitesPassing()) {
    await refreshRunningContainers();
  }
}

async function ensureDockerPrerequisites() {
  const installedOk = await runDockerInstalledCheck();
  if (!installedOk) {
    syncConfigStepOpenState();
    return false;
  }

  const daemonOk = await runDockerDaemonCheck();
  syncConfigStepOpenState();
  return daemonOk;
}

function summarizeUrlForHint(url) {
  if (!url) {
    return "URL details";
  }

  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (error) {
    return url;
  }
}

function setCurrentUrl(url) {
  state.currentPrairieLearnUrl = url || "";
  if (!elements.currentUrl) {
    return;
  }
  const summary = summarizeUrlForHint(url);
  elements.currentUrl.textContent = summary;
  elements.currentUrl.title = url || "Not loaded";
  elements.currentUrl.setAttribute("aria-label", url ? `Current URL: ${url}` : "Current URL not loaded");
  elements.currentUrl.classList.toggle("is-active", Boolean(url));
}

function isPrairieLearnWaitingForConfiguration() {
  return !state.prairieLearnReady;
}

function updateWebviewNavigationButtons() {
  const blocked = elements.webview.hidden;
  elements.webviewBackButton.disabled = blocked || !elements.webview.canGoBack();
  elements.webviewForwardButton.disabled = blocked || !elements.webview.canGoForward();
  elements.webviewReloadButton.disabled = blocked;
}

function renderPrairieLearnSurface() {
  const forcedOverlay = isPrairieLearnWaitingForConfiguration();
  const showOverlay = forcedOverlay || state.isConfigOverlayOpen;

  elements.plConfigOverlay.hidden = !showOverlay;
  elements.webview.hidden = showOverlay;
  elements.webview.setAttribute("aria-hidden", showOverlay ? "true" : "false");
  elements.webview.tabIndex = showOverlay ? -1 : 0;
  elements.openBrowserButton.disabled = forcedOverlay;

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

  updateWebviewNavigationButtons();
}

function setConfigOverlayOpen(isOpen) {
  state.isConfigOverlayOpen = Boolean(isOpen);
  renderPrairieLearnSurface();
}

function collapseConnectionPanelOnSuccessfulPlUrl(url) {
  if (!url || url === "about:blank") {
    return;
  }

  try {
    const current = new URL(url);
    const base = new URL(state.config.baseUrl || "http://127.0.0.1:3000");
    if (current.origin === base.origin) {
      setConfigOverlayOpen(false);
    }
  } catch (error) {
    // Ignore parse failures for transient webview URLs.
  }
}

function renderDockerLog() {
  const text = state.dockerLog || "No output yet.";
  elements.dockerOutputLog.innerHTML = formatDockerLogHtml(text);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ansiCodesToClass(codes) {
  if (!codes || codes.length === 0 || (codes.length === 1 && codes[0] === 0)) {
    return "";
  }

  const classes = [];
  let hasForeground = false;

  for (const code of codes) {
    if (code === 0) {
      classes.length = 0;
      hasForeground = false;
      continue;
    }
    if (code === 1) {
      classes.push("ansi-bold");
      continue;
    }
    if (code === 2) {
      classes.push("ansi-dim");
      continue;
    }
    if (code === 3) {
      classes.push("ansi-italic");
      continue;
    }
    if (code === 4) {
      classes.push("ansi-underline");
      continue;
    }
    if (code === 39) {
      hasForeground = false;
      continue;
    }
    if (code >= 30 && code <= 37) {
      classes.push(`ansi-fg-${code - 30}`);
      hasForeground = true;
      continue;
    }
    if (code >= 90 && code <= 97) {
      classes.push(`ansi-fg-${code - 90 + 8}`);
      hasForeground = true;
      continue;
    }
  }

  if (!hasForeground) {
    classes.push("ansi-fg-default");
  }

  return classes.join(" ");
}

function formatDockerLogHtml(text) {
  const pattern = /\x1b\[([0-9;]*)m/g;
  let html = "";
  let index = 0;
  let activeClass = "";
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const chunk = text.slice(index, match.index);
    if (chunk) {
      const safeChunk = escapeHtml(chunk);
      html += activeClass ? `<span class="${activeClass}">${safeChunk}</span>` : safeChunk;
    }

    const rawCodes = match[1] ? match[1].split(";").map((value) => Number(value || 0)) : [0];
    activeClass = ansiCodesToClass(rawCodes);
    index = match.index + match[0].length;
  }

  const tail = text.slice(index);
  if (tail) {
    const safeTail = escapeHtml(tail);
    html += activeClass ? `<span class="${activeClass}">${safeTail}</span>` : safeTail;
  }

  return html || '<span class="ansi-fg-default">No output yet.</span>';
}

function resetDockerLog() {
  state.dockerLog = "";
  renderDockerLog();
}

function appendDockerLog(text) {
  if (!text) {
    return;
  }

  state.dockerLog += text;
  if (state.dockerLog.length > maxDockerLogChars) {
    state.dockerLog = state.dockerLog.slice(-maxDockerLogChars);
  }
  renderDockerLog();
}

function handleDockerOutput(payload) {
  if (!payload) {
    return;
  }

  if (payload.type === "reset") {
    resetDockerLog();
    elements.dockerOutputAccordion.open = true;
    return;
  }

  if (payload.type === "chunk") {
    appendDockerLog(payload.text || "");
    elements.dockerOutputAccordion.open = true;
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function getCommandModeFromForm() {
  if (elements.commandModeReconnect.checked) {
    return "reconnect";
  }
  if (elements.commandModeCustom.checked) {
    return "custom";
  }
  return "structured";
}

function getStartButtonLabelForMode(mode) {
  if (mode === "custom") {
    return "Save + Start Custom";
  }
  if (mode === "reconnect") {
    return "Save + Reconnect";
  }
  return "Save + Start Generated";
}

function normalizeCourseDirectories(input) {
  if (Array.isArray(input)) {
    return input
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .slice(0, maxCourseDirectories);
  }
  return [];
}

function getCourseDirectoriesFromConfig(config) {
  const listed = normalizeCourseDirectories(config?.courseDirectories);
  if (listed.length > 0) {
    return listed;
  }
  const legacy = String(config?.courseDirectory || "").trim();
  return legacy ? [legacy] : [];
}

function getCourseDirectoriesFromForm() {
  return Array.from(elements.courseDirectoriesList.querySelectorAll("[data-course-directory-input]"))
    .map((input) => String(input.value || "").trim())
    .filter(Boolean)
    .slice(0, maxCourseDirectories);
}

function updateCourseDirectoryInputState(input) {
  if (!input) {
    return;
  }
  input.classList.toggle("is-empty", !String(input.value || "").trim());
}

function createCourseDirectoryRow(value = "", index = 0, total = 1) {
  const row = document.createElement("div");
  row.className = "course-directory-row";
  row.dataset.courseRowIndex = String(index);
  row.draggable = true;

  const mountLabel = index === 0 ? "/course" : `/course${index + 1}`;

  row.innerHTML = `
    <span class="course-directory-handle" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
    <span class="course-directory-mount">${mountLabel}</span>
    <input
      class="ui-input ui-input-sm course-directory-input"
      data-course-directory-input="true"
      type="text"
      placeholder="/absolute/path/to/course"
      value="${String(value || "").replace(/"/g, "&quot;")}"
    />
    <button class="button ui-folder-btn" type="button" data-course-choose title="Choose folder" aria-label="Choose folder">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v1H3z"></path>
        <path d="M3 9h18l-1.5 9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"></path>
      </svg>
    </button>
    <button class="button ui-remove-btn" type="button" data-course-remove title="Remove course" aria-label="Remove course" ${
      total <= 1 ? "disabled" : ""
    }>✕</button>
  `;

  const input = row.querySelector("[data-course-directory-input]");
  const chooseButton = row.querySelector("[data-course-choose]");
  const removeButton = row.querySelector("[data-course-remove]");

  input.addEventListener("input", () => {
    updateCourseDirectoryInputState(input);
    updateCommandEditorState();
  });
  chooseButton.addEventListener("click", async () => {
    if (input.disabled) {
      return;
    }
    const selectedDirectory = await window.reviewApi.selectDirectory();
    if (!selectedDirectory) {
      return;
    }
    input.value = selectedDirectory;
    updateCommandEditorState();
  });
  removeButton.addEventListener("click", () => {
    const rows = Array.from(elements.courseDirectoriesList.querySelectorAll(".course-directory-row"));
    const nextValues = rows
      .filter((entry) => entry !== row)
      .map((entry) => entry.querySelector("[data-course-directory-input]").value);
    renderCourseDirectoryRows(nextValues.length ? nextValues : [""]);
    updateCommandEditorState();
  });

  row.addEventListener("dragstart", (event) => {
    draggedCourseRowIndex = Number(row.dataset.courseRowIndex);
    event.dataTransfer.effectAllowed = "move";
    row.classList.add("is-dragging");
  });
  row.addEventListener("dragend", () => {
    draggedCourseRowIndex = null;
    row.classList.remove("is-dragging");
    elements.courseDirectoriesList.querySelectorAll(".course-directory-row").forEach((entry) => {
      entry.classList.remove("is-drag-target");
    });
  });
  row.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (draggedCourseRowIndex === null) {
      return;
    }
    row.classList.add("is-drag-target");
  });
  row.addEventListener("dragleave", () => {
    row.classList.remove("is-drag-target");
  });
  row.addEventListener("drop", (event) => {
    event.preventDefault();
    const targetIndex = Number(row.dataset.courseRowIndex);
    if (draggedCourseRowIndex === null || Number.isNaN(targetIndex) || targetIndex === draggedCourseRowIndex) {
      row.classList.remove("is-drag-target");
      return;
    }
    const values = Array.from(elements.courseDirectoriesList.querySelectorAll("[data-course-directory-input]")).map((entry) => entry.value);
    const [moved] = values.splice(draggedCourseRowIndex, 1);
    values.splice(targetIndex, 0, moved);
    renderCourseDirectoryRows(values);
    updateCommandEditorState();
  });

  updateCourseDirectoryInputState(input);
  return row;
}

function renderCourseDirectoryRows(values = [""]) {
  const normalized = values.slice(0, maxCourseDirectories);
  const safeValues = normalized.length > 0 ? normalized : [""];
  elements.courseDirectoriesList.innerHTML = "";
  safeValues.forEach((value, index) => {
    elements.courseDirectoriesList.append(createCourseDirectoryRow(value, index, safeValues.length));
  });
}

function buildStructuredCommandParts(config) {
  const courseDirectories = getCourseDirectoriesFromConfig(config);
  const jobsDirectory = (config.jobsDirectory || "").trim();
  if (courseDirectories.length === 0) {
    return [];
  }

  const jobsDirectoryValue = jobsDirectory || "<auto-temp-pl_ag_jobs>";
  const courseMountParts = courseDirectories.map((directory, index) => {
    const mountPath = index === 0 ? "/course" : `/course${index + 1}`;
    return `-v ${shellQuote(directory)}:${mountPath}`;
  });

  return [
    "docker run --rm",
    "-p 3000:3000",
    ...courseMountParts,
    `-v ${shellQuote(jobsDirectoryValue)}:/jobs`,
    `-e HOST_JOBS_DIR=${shellQuote(jobsDirectoryValue)}`,
    "-v /var/run/docker.sock:/var/run/docker.sock",
    "--add-host=host.docker.internal:172.17.0.1",
    "prairielearn/prairielearn:latest"
  ];
}

function buildStructuredCommand(config) {
  const parts = buildStructuredCommandParts(config);
  return parts.length > 0 ? parts.join(" ") : "";
}

function formatCommandPreview(parts) {
  if (!parts || parts.length === 0) {
    return "Add at least one course directory to generate the Docker command.";
  }

  return parts.map((part, index) => (index < parts.length - 1 ? `${part} \\` : part)).join("\n");
}

function updateCommandEditorState() {
  const mode = getCommandModeFromForm();
  const connectionUnlocked = areDockerPrerequisitesPassing();
  const generatedCommandParts = buildStructuredCommandParts({
    courseDirectories: getCourseDirectoriesFromForm(),
    jobsDirectory: state.config.jobsDirectory
  });

  elements.generatedCommandPreview.value = formatCommandPreview(generatedCommandParts);
  const usingStructured = mode === "structured";
  const usingCustom = mode === "custom";
  const usingReconnect = mode === "reconnect";

  elements.structuredCommandEditor.classList.toggle("is-inactive", !usingStructured);
  elements.customCommandEditor.classList.toggle("is-inactive", !usingCustom);
  elements.reconnectCommandEditor.classList.toggle("is-inactive", !usingReconnect);
  if (elements.addCourseDirectoryButton) {
    elements.addCourseDirectoryButton.disabled =
      !connectionUnlocked || !usingStructured || elements.courseDirectoriesList.querySelectorAll(".course-directory-row").length >= maxCourseDirectories;
  }
  elements.courseDirectoriesList
    .querySelectorAll("[data-course-directory-input], [data-course-choose], [data-course-remove]")
    .forEach((control) => {
      control.disabled =
        !connectionUnlocked ||
        !usingStructured ||
        (control.matches("[data-course-remove]") && elements.courseDirectoriesList.querySelectorAll(".course-directory-row").length <= 1);
    });
  elements.generatedCommandAccordion.classList.toggle("is-inactive", !usingStructured);
  elements.generatedCommandPreview.disabled = !connectionUnlocked || !usingStructured;
  elements.startCommandInput.disabled = !connectionUnlocked || !usingCustom;
  elements.refreshRunningContainersButton.disabled = !connectionUnlocked || !usingReconnect;
  elements.commandModeStructured.disabled = !connectionUnlocked;
  elements.commandModeCustom.disabled = !connectionUnlocked;
  elements.commandModeReconnect.disabled = !connectionUnlocked;
  elements.startConfiguredButton.textContent = getStartButtonLabelForMode(mode);
  syncStartButtonDisabledState();
}

function renderConfig() {
  if (elements.baseUrlInput) {
    elements.baseUrlInput.value = state.config.baseUrl;
  }
  elements.commandModeStructured.checked = state.config.commandMode === "structured";
  elements.commandModeCustom.checked = state.config.commandMode === "custom";
  elements.commandModeReconnect.checked = state.config.commandMode === "reconnect";
  const courseDirectories = getCourseDirectoriesFromConfig(state.config);
  renderCourseDirectoryRows(courseDirectories.length > 0 ? courseDirectories : [""]);
  elements.startCommandInput.value = state.config.customStartCommand || state.config.startCommand || "";
  updateCommandEditorState();

  const structuredCommand = buildStructuredCommand(state.config);
  const hasCommand =
    state.config.commandMode === "reconnect"
      ? true
      : state.config.commandMode === "custom"
      ? Boolean((state.config.customStartCommand || state.config.startCommand || "").trim())
      : Boolean(structuredCommand);

  if (!hasCommand) {
    setConfigOverlayOpen(true);
  }
  renderConfigSteps();
}

function getConfigFromForm() {
  const commandMode = getCommandModeFromForm();
  const courseDirectories = getCourseDirectoriesFromForm();
  const courseDirectory = courseDirectories[0] || "";
  const jobsDirectory = (state.config.jobsDirectory || "").trim();
  const customStartCommand = elements.startCommandInput.value.trim();
  const startCommand =
    commandMode === "custom"
      ? customStartCommand
      : commandMode === "structured"
        ? buildStructuredCommand({ courseDirectories, jobsDirectory })
        : "";

  return {
    baseUrl:
      elements.baseUrlInput?.value.trim() ||
      state.config.baseUrl ||
      "http://127.0.0.1:3000",
    commandMode,
    courseDirectory,
    courseDirectories,
    jobsDirectory,
    customStartCommand,
    startCommand
  };
}

async function refreshRunningContainers() {
  if (!areDockerPrerequisitesPassing()) {
    hasReconnectOptions = false;
    elements.runningContainersPreview.textContent = "Complete Docker checks before refreshing containers.";
    return;
  }

  const listed = await window.reviewApi.listPrairieLearnContainers();
  if (!listed?.ok) {
    hasReconnectOptions = false;
    elements.runningContainersPreview.textContent =
      listed?.error || "Could not list running PrairieLearn containers.";
    if (!hasAppliedContainerModeDefault) {
      hasAppliedContainerModeDefault = true;
      state.config.commandMode = "structured";
      elements.commandModeStructured.checked = true;
      updateCommandEditorState();
    }
    return;
  }

  if (!listed.containers || listed.containers.length === 0) {
    hasReconnectOptions = false;
    elements.runningContainersPreview.textContent = "No running PrairieLearn containers found.";
    if (!hasAppliedContainerModeDefault) {
      hasAppliedContainerModeDefault = true;
      state.config.commandMode = "structured";
      elements.commandModeStructured.checked = true;
      updateCommandEditorState();
    }
    return;
  }

  hasReconnectOptions = true;
  elements.runningContainersPreview.textContent = listed.containers
    .map(
      (container) =>
        `${container.id}  ${container.image}\n${container.names || "unnamed"}  ${container.ports || "no ports"}  ${container.status || ""}`
    )
    .join("\n\n");

  if (!hasAppliedContainerModeDefault) {
    hasAppliedContainerModeDefault = true;
    state.config.commandMode = "reconnect";
    elements.commandModeReconnect.checked = true;
    updateCommandEditorState();
  }
}

async function ensureStructuredJobsDirectory(config) {
  if (config.commandMode !== "structured") {
    return config;
  }

  const jobsDirectory = await window.reviewApi.ensureJobsDirectory(config.jobsDirectory);
  const nextConfig = {
    ...config,
    jobsDirectory
  };

  nextConfig.startCommand = buildStructuredCommand(nextConfig);
  state.config.jobsDirectory = jobsDirectory;
  updateCommandEditorState();
  return nextConfig;
}

function renderQuestionList() {
  elements.questionList.innerHTML = "";

  if (!state.session || state.session.questions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "question-item-meta";
    empty.textContent = "No mapped questions yet. Use New Question or Capture Current View.";
    elements.questionList.append(empty);
    return;
  }

  state.session.questions.forEach((question, index) => {
    const node = elements.questionItemTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.questionId = question.id;
    node.classList.toggle("is-active", question.id === state.session.currentQuestionId);
    node.querySelector(".question-item-title").textContent = question.label || `Question ${index + 1}`;

    const parts = [`Page ${question.pdfPage || "?"}`];
    if (question.flagged) {
      parts.push("Flagged");
    }
    if (question.tags) {
      parts.push(question.tags);
    }

    node.querySelector(".question-item-meta").textContent = parts.join(" • ");
    node.addEventListener("click", () => {
      setCurrentQuestion(question.id, { sync: true });
    });
    elements.questionList.append(node);
  });
}

function renderQuestionEditor() {
  const question = getCurrentQuestion();
  const disabled = !question;

  elements.questionTitleInput.disabled = disabled;
  elements.questionPathInput.disabled = disabled;
  elements.questionPdfPageInput.disabled = disabled;
  elements.questionTagsInput.disabled = disabled;
  elements.questionFlaggedInput.disabled = disabled;
  elements.questionNotesInput.disabled = disabled;
  elements.deleteQuestionButton.disabled = disabled;
  elements.captureViewButton.disabled = !state.session || !state.pdf;
  elements.applyPageButton.disabled = disabled;
  elements.previousQuestionButton.disabled = !state.session || state.session.questions.length < 2;
  elements.nextQuestionButton.disabled = !state.session || state.session.questions.length < 2;

  if (!question) {
    elements.questionTitleInput.value = "";
    elements.questionPathInput.value = "";
    elements.questionPdfPageInput.value = "";
    elements.questionTagsInput.value = "";
    elements.questionFlaggedInput.checked = false;
    elements.questionNotesInput.value = "";
    return;
  }

  elements.questionTitleInput.value = question.label || "";
  elements.questionPathInput.value = question.prairielearnPath || "";
  elements.questionPdfPageInput.value = String(question.pdfPage || state.currentPdfPage || 1);
  elements.questionTagsInput.value = question.tags || "";
  elements.questionFlaggedInput.checked = Boolean(question.flagged);
  elements.questionNotesInput.value = question.notes || "";
}

function renderPdf() {
  if (!state.pdf) {
    elements.pdfFrame.src = "about:blank";
    elements.pdfFrame.hidden = true;
    elements.pdfOverlay.hidden = false;
    elements.pdfDropZone.classList.remove("is-dragging");
    if (elements.pdfName) {
      elements.pdfName.textContent = "No file selected";
      elements.pdfName.title = "No file selected";
    }
    setIndicatorState(elements.pdfIndicator, "idle");
    return;
  }

  elements.pdfOverlay.hidden = true;
  elements.pdfFrame.hidden = false;
  elements.pdfDropZone.classList.remove("is-dragging");
  if (elements.pdfName) {
    elements.pdfName.textContent = state.pdf.name;
    elements.pdfName.title = state.pdf.path;
  }
  setIndicatorState(elements.pdfIndicator, "ready");
  if (elements.pdfPageInput) {
    elements.pdfPageInput.value = String(state.currentPdfPage);
  }
  elements.pdfFrame.src = window.reviewApi.buildPdfUrl(state.pdf.path, state.currentPdfPage);
}

function renderAll() {
  renderConfig();
  renderQuestionList();
  renderQuestionEditor();
  renderPdf();
}

function resolvePrairieLearnUrl(value) {
  const trimmed = (value || "").trim();
  const baseUrl = state.config.baseUrl || "http://127.0.0.1:3000";

  if (!trimmed) {
    return baseUrl;
  }

  try {
    return new URL(trimmed).toString();
  } catch (error) {
    return new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, baseUrl).toString();
  }
}

function getRelativePrairieLearnPath(url) {
  if (!url) {
    return "";
  }

  try {
    const absolute = new URL(url);
    const base = new URL(state.config.baseUrl);
    if (absolute.origin === base.origin) {
      return `${absolute.pathname}${absolute.search}${absolute.hash}`;
    }
  } catch (error) {
    return url;
  }

  return url;
}

function loadPrairieLearn(url) {
  const targetUrl = resolvePrairieLearnUrl(url);
  elements.webview.src = targetUrl;
  setCurrentUrl(targetUrl);
  collapseConnectionPanelOnSuccessfulPlUrl(targetUrl);
}

function syncToQuestion(question) {
  if (!question) {
    return;
  }

  const targetPage = Number(question.pdfPage) || 1;
  state.currentPdfPage = Math.max(1, targetPage);
  renderPdf();
  renderQuestionEditor();

  if (question.prairielearnPath) {
    loadPrairieLearn(question.prairielearnPath);
  } else if (state.prairieLearnReady) {
    loadPrairieLearn(state.config.baseUrl);
  }

  saveSession();
}

function setCurrentQuestion(questionId, options = { sync: false }) {
  if (!state.session) {
    return;
  }

  state.session.currentQuestionId = questionId;
  renderQuestionList();
  renderQuestionEditor();
  saveSession();

  if (options.sync) {
    syncToQuestion(getCurrentQuestion());
  }
}

function createQuestionFromCurrentView() {
  const questionNumber = (state.session?.questions.length || 0) + 1;
  return {
    id: crypto.randomUUID(),
    label: `Question ${questionNumber}`,
    prairielearnPath: getRelativePrairieLearnPath(state.currentPrairieLearnUrl),
    pdfPage: state.currentPdfPage,
    tags: "",
    notes: "",
    flagged: false
  };
}

function updateCurrentQuestion(mutator, options = {}) {
  const question = getCurrentQuestion();
  if (!question) {
    return;
  }

  mutator(question);
  if (options.renderList !== false) {
    renderQuestionList();
  }
  if (options.renderEditor) {
    renderQuestionEditor();
  }
  saveSession();
}

function addQuestion(fromCurrentView = false) {
  if (!state.session) {
    return;
  }

  const question = createQuestionFromCurrentView();
  if (!fromCurrentView) {
    question.prairielearnPath = "";
  }

  state.session.questions.push(question);
  setCurrentQuestion(question.id, { sync: fromCurrentView });
  renderQuestionList();
  saveSession();
}

function deleteCurrentQuestion() {
  if (!state.session) {
    return;
  }

  const currentId = state.session.currentQuestionId;
  if (!currentId) {
    return;
  }

  const index = getQuestionIndex(currentId);
  if (index === -1) {
    return;
  }

  state.session.questions.splice(index, 1);
  const nextQuestion = state.session.questions[index] || state.session.questions[index - 1] || null;
  state.session.currentQuestionId = nextQuestion?.id || null;
  renderQuestionList();
  renderQuestionEditor();
  saveSession();
}

function moveBetweenQuestions(direction) {
  if (!state.session || state.session.questions.length < 2) {
    return;
  }

  const currentIndex = Math.max(0, getQuestionIndex(state.session.currentQuestionId));
  const nextIndex =
    direction === "next"
      ? (currentIndex + 1) % state.session.questions.length
      : (currentIndex - 1 + state.session.questions.length) % state.session.questions.length;

  setCurrentQuestion(state.session.questions[nextIndex].id, { sync: true });
}

function applyCurrentPageToQuestion() {
  updateCurrentQuestion((question) => {
    question.pdfPage = state.currentPdfPage;
  }, { renderEditor: true });
}

function captureCurrentViewIntoQuestion() {
  updateCurrentQuestion((question) => {
    question.pdfPage = state.currentPdfPage;
    question.prairielearnPath = getRelativePrairieLearnPath(state.currentPrairieLearnUrl);
  }, { renderEditor: true });
}

function setPdfPage(page) {
  const nextPage = Math.max(1, Number(page) || 1);
  state.currentPdfPage = nextPage;
  renderPdf();
  saveSession();
}

async function connectPrairieLearn(mode) {
  const hasPrerequisites = await ensureDockerPrerequisites();
  if (!hasPrerequisites) {
    setPrairieLearnStatus("Complete Docker setup checks first.", "error");
    return;
  }

  state.config = getConfigFromForm();
  state.config = await ensureStructuredJobsDirectory(state.config);

  const title = mode === "reconnect" ? plStatusText.reconnecting : plStatusText.starting;
  setPrairieLearnStatus(title, "working");
  setPrairieLearnRunState(true);

  let result;
  try {
    if (mode === "reconnect") {
      result = await window.reviewApi.reconnectPrairieLearn(state.config);
    } else if (mode === "restart") {
      result = await window.reviewApi.restartPrairieLearn(state.config);
    } else {
      result = await window.reviewApi.startPrairieLearn(state.config);
    }
  } finally {
    setPrairieLearnRunState(false);
  }

  state.config = result.config || state.config;
  renderConfig();

  if (result.ok) {
    state.prairieLearnReady = true;
    setPrairieLearnStatus(result.warning ? plStatusText.readyWithWarning : plStatusText.ready, result.warning ? "warning" : "ready");
    setPrairieLearnRunState(isPrairieLearnCommandRunning);
    setConfigOverlayOpen(false);
    const question = getCurrentQuestion();
    if (question?.prairielearnPath) {
      loadPrairieLearn(question.prairielearnPath);
    } else {
      loadPrairieLearn(state.config.baseUrl);
    }
  } else {
    state.prairieLearnReady = false;
    setPrairieLearnRunState(isPrairieLearnCommandRunning);
    setPrairieLearnStatus(result.error || plStatusText.connectFailed, "error");
    setConfigOverlayOpen(true);
  }
}

async function startPrairieLearn() {
  const mode = getCommandModeFromForm();
  await connectPrairieLearn(mode === "reconnect" ? "reconnect" : "start");
}

async function restartPrairieLearn() {
  const mode = getCommandModeFromForm();
  await connectPrairieLearn(mode === "reconnect" ? "reconnect" : "restart");
}

async function saveConfig() {
  if (isPrairieLearnCommandRunning) {
    return;
  }
  state.config = getConfigFromForm();
  state.config = await ensureStructuredJobsDirectory(state.config);
  state.config = await window.reviewApi.saveConfig(state.config);
  renderConfig();
  setPrairieLearnStatus(plStatusText.connectionSaved, state.prairieLearnReady ? "ready" : "idle");
}

async function choosePdf() {
  const selected = await window.reviewApi.selectPdf();
  if (!selected) {
    return;
  }

  await loadPdfSelection(selected);
}

async function loadPdfSelection(selected) {
  if (!selected?.path) {
    return;
  }

  state.pdf = selected;
  state.session = loadSession(selected.path);
  state.currentPdfPage = Number(state.session.currentPdfPage) || 1;

  if (!state.session.currentQuestionId && state.session.questions.length > 0) {
    state.session.currentQuestionId = state.session.questions[0].id;
  }

  renderAll();
  saveSession();
  await startPrairieLearn();
}

function getDroppedPdfFile(event) {
  const files = Array.from(event.dataTransfer?.files || []);
  return files.find(isPdfFile) || null;
}

async function getDroppedPdfSelection(event) {
  const file = getDroppedPdfFile(event);
  if (!file) {
    return null;
  }

  const resolvedPath = window.reviewApi.getPathForFile(file);
  if (!resolvedPath) {
    return null;
  }

  return {
    path: resolvedPath,
    name: file.name || resolvedPath.split("/").pop()
  };
}

function bindQuestionInputs() {
  elements.questionTitleInput.addEventListener("input", (event) => {
    updateCurrentQuestion((question) => {
      question.label = event.target.value;
    }, { renderEditor: false });
  });

  elements.questionPathInput.addEventListener("input", (event) => {
    updateCurrentQuestion((question) => {
      question.prairielearnPath = event.target.value;
    }, { renderEditor: false });
  });

  elements.questionPdfPageInput.addEventListener("input", (event) => {
    const nextPage = Math.max(1, Number(event.target.value) || 1);
    updateCurrentQuestion((question) => {
      question.pdfPage = nextPage;
    }, { renderEditor: false });
    setPdfPage(nextPage);
  });

  elements.questionTagsInput.addEventListener("input", (event) => {
    updateCurrentQuestion((question) => {
      question.tags = event.target.value;
    }, { renderEditor: false });
  });

  elements.questionFlaggedInput.addEventListener("change", (event) => {
    updateCurrentQuestion((question) => {
      question.flagged = Boolean(event.target.checked);
    }, { renderEditor: false });
  });

  elements.questionNotesInput.addEventListener("input", (event) => {
    updateCurrentQuestion((question) => {
      question.notes = event.target.value;
    }, { renderEditor: false });
  });
}

function bindCommandEditorSelection() {
  const mappings = [
    { editor: elements.reconnectCommandEditor, radio: elements.commandModeReconnect },
    { editor: elements.structuredCommandEditor, radio: elements.commandModeStructured },
    { editor: elements.customCommandEditor, radio: elements.commandModeCustom }
  ];

  mappings.forEach(({ editor, radio }) => {
    if (!editor || !radio) {
      return;
    }

    editor.addEventListener("click", (event) => {
      const interactiveTarget = event.target.closest("input, textarea, button, summary, label, a");
      if (interactiveTarget && interactiveTarget !== radio) {
        return;
      }

      if (!radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  });
}

function bindWebviewEvents() {
  elements.webview.addEventListener("dom-ready", () => {
    const url = elements.webview.getURL();
    setCurrentUrl(url);
    collapseConnectionPanelOnSuccessfulPlUrl(url);
    updateWebviewNavigationButtons();
  });

  elements.webview.addEventListener("did-navigate", (event) => {
    setCurrentUrl(event.url);
    collapseConnectionPanelOnSuccessfulPlUrl(event.url);
    updateWebviewNavigationButtons();
  });

  elements.webview.addEventListener("did-navigate-in-page", (event) => {
    setCurrentUrl(event.url);
    collapseConnectionPanelOnSuccessfulPlUrl(event.url);
    updateWebviewNavigationButtons();
  });

  elements.webview.addEventListener("page-title-updated", (event) => {
    state.currentPrairieLearnTitle = event.title;
  });

  elements.webview.addEventListener("did-fail-load", () => {
    setPrairieLearnStatus(plStatusText.viewFailed, "error");
  });
}

async function handleStopPrairieLearn() {
  if (isPrairieLearnStopping || (!isPrairieLearnCommandRunning && !state.prairieLearnReady)) {
    return;
  }

  isPrairieLearnStopping = true;
  elements.stopPlButton.disabled = true;

  if (isPrairieLearnCommandRunning) {
    setPrairieLearnStatus(plStatusText.stoppingStart, "working");
    const result = await window.reviewApi.stopPrairieLearnStart();
    if (!result?.ok) {
      setPrairieLearnStatus(result?.error || plStatusText.stopStartFailed, "error");
    } else {
      setPrairieLearnStatus(plStatusText.startStopped, "idle");
      setConfigOverlayOpen(true);
      await refreshRunningContainers();
    }
    isPrairieLearnStopping = false;
    setPrairieLearnRunState(isPrairieLearnCommandRunning);
    return;
  }

  setPrairieLearnStatus(plStatusText.stoppingContainer, "working");
  const result = await window.reviewApi.stopConnectedPrairieLearn(state.config.baseUrl);
  if (!result?.ok) {
    setPrairieLearnStatus(result?.error || plStatusText.stopContainerFailed, "error");
  } else {
    state.prairieLearnReady = false;
    setPrairieLearnStatus(plStatusText.containerStopped, "idle");
    elements.webview.src = "about:blank";
    setCurrentUrl("");
    setConfigOverlayOpen(true);
    await refreshRunningContainers();
  }
  isPrairieLearnStopping = false;
  setPrairieLearnRunState(isPrairieLearnCommandRunning);
}

function bindEvents() {
  elements.questionForm.addEventListener("submit", (event) => {
    event.preventDefault();
  });
  elements.choosePdfButton.addEventListener("click", choosePdf);
  if (elements.restartPlButton) {
    elements.restartPlButton.addEventListener("click", restartPrairieLearn);
  }
  elements.stopPlButton.addEventListener("click", handleStopPrairieLearn);
  elements.openBrowserButton.addEventListener("click", () => {
    const target = state.currentPrairieLearnUrl || state.config.baseUrl;
    window.reviewApi.openExternal(target);
  });
  document.querySelectorAll("a[data-external-link='true']").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const href = link.getAttribute("href");
      if (!href) {
        return;
      }
      window.reviewApi.openExternal(href);
    });
  });
  elements.plStatusToggle.addEventListener("click", () => {
    if (isPrairieLearnWaitingForConfiguration()) {
      return;
    }
    setConfigOverlayOpen(!state.isConfigOverlayOpen);
  });
  elements.plStatusToggle.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    if (isPrairieLearnWaitingForConfiguration()) {
      return;
    }
    setConfigOverlayOpen(!state.isConfigOverlayOpen);
  });
  if (elements.saveConfigButton) {
    elements.saveConfigButton.addEventListener("click", saveConfig);
  }
  elements.startConfiguredButton.addEventListener("click", async () => {
    await saveConfig();
    await startPrairieLearn();
  });
  if (elements.checkDockerInstalledButton) {
    elements.checkDockerInstalledButton.addEventListener("click", async () => {
      const installedOk = await runDockerInstalledCheck();
      if (!installedOk) {
        setDockerCheckState("daemon", "idle", "Waiting on step 1.");
      } else if (state.dockerChecks.daemon.status !== "success") {
        await runDockerDaemonCheck();
      }
      syncConfigStepOpenState();
      updateCommandEditorState();
    });
  }
  if (elements.checkDockerDaemonButton) {
    elements.checkDockerDaemonButton.addEventListener("click", async () => {
      const installedOk =
        state.dockerChecks.installed.status === "success" ? true : await runDockerInstalledCheck();
      if (!installedOk) {
        setDockerCheckState("daemon", "idle", "Waiting on step 1.");
      } else {
        await runDockerDaemonCheck();
      }
      syncConfigStepOpenState();
      updateCommandEditorState();
    });
  }
  if (elements.startDockerDaemonButton) {
    elements.startDockerDaemonButton.addEventListener("click", () => startDockerDaemonFromStep("start"));
  }
  if (elements.restartDockerDaemonButton) {
    elements.restartDockerDaemonButton.addEventListener("click", () => startDockerDaemonFromStep("restart"));
  }
  elements.commandModeStructured.addEventListener("change", updateCommandEditorState);
  elements.commandModeCustom.addEventListener("change", updateCommandEditorState);
  elements.commandModeReconnect.addEventListener("change", async () => {
    updateCommandEditorState();
    await refreshRunningContainers();
  });
  elements.addCourseDirectoryButton.addEventListener("click", () => {
    const currentValues = Array.from(elements.courseDirectoriesList.querySelectorAll("[data-course-directory-input]")).map(
      (entry) => entry.value
    );
    if (currentValues.length >= maxCourseDirectories) {
      return;
    }
    renderCourseDirectoryRows([...currentValues, ""]);
    updateCommandEditorState();
  });
  elements.startCommandInput.addEventListener("input", updateCommandEditorState);
  elements.refreshRunningContainersButton.addEventListener("click", refreshRunningContainers);

  elements.newQuestionButton.addEventListener("click", () => addQuestion(false));
  elements.captureViewButton.addEventListener("click", () => {
    if (!getCurrentQuestion()) {
      addQuestion(true);
      return;
    }
    captureCurrentViewIntoQuestion();
  });
  elements.deleteQuestionButton.addEventListener("click", deleteCurrentQuestion);
  elements.previousQuestionButton.addEventListener("click", () => moveBetweenQuestions("previous"));
  elements.nextQuestionButton.addEventListener("click", () => moveBetweenQuestions("next"));

  if (elements.previousPageButton) {
    elements.previousPageButton.addEventListener("click", () => setPdfPage(state.currentPdfPage - 1));
  }
  if (elements.nextPageButton) {
    elements.nextPageButton.addEventListener("click", () => setPdfPage(state.currentPdfPage + 1));
  }
  if (elements.pdfPageInput) {
    elements.pdfPageInput.addEventListener("change", (event) => setPdfPage(event.target.value));
  }
  elements.applyPageButton.addEventListener("click", applyCurrentPageToQuestion);

  elements.webviewBackButton.addEventListener("click", () => {
    if (elements.webview.canGoBack()) {
      elements.webview.goBack();
    }
  });
  elements.webviewForwardButton.addEventListener("click", () => {
    if (elements.webview.canGoForward()) {
      elements.webview.goForward();
    }
  });
  elements.webviewReloadButton.addEventListener("click", () => {
    elements.webview.reload();
  });

  elements.pdfDropZone.addEventListener("dragenter", (event) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    pdfDropDragDepth += 1;
    elements.pdfDropZone.classList.add("is-dragging");
  });

  elements.pdfDropZone.addEventListener("dragover", (event) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    elements.pdfDropZone.classList.add("is-dragging");
  });

  elements.pdfDropZone.addEventListener("dragleave", (event) => {
    if (!event.dataTransfer?.types?.includes("Files")) {
      return;
    }

    pdfDropDragDepth = Math.max(0, pdfDropDragDepth - 1);
    if (pdfDropDragDepth === 0) {
      elements.pdfDropZone.classList.remove("is-dragging");
    }
  });

  elements.pdfDropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    pdfDropDragDepth = 0;
    elements.pdfDropZone.classList.remove("is-dragging");

    const selected = await getDroppedPdfSelection(event);
    if (!selected?.path) {
      setPrairieLearnStatus(plStatusText.dropSinglePdf, "warning");
      return;
    }

    await loadPdfSelection(selected);
  });

  bindQuestionInputs();
  bindCommandEditorSelection();
  bindWebviewEvents();
  window.addEventListener("beforeunload", saveSession);
}

async function init() {
  bindEvents();
  removeDockerOutputListener = window.reviewApi.onDockerOutput(handleDockerOutput);
  window.addEventListener("beforeunload", () => {
    if (typeof removeDockerOutputListener === "function") {
      removeDockerOutputListener();
      removeDockerOutputListener = null;
    }
  });
  state.config = await window.reviewApi.getConfig();
  state.config = await ensureStructuredJobsDirectory(state.config);
  renderDockerLog();
  renderAll();
  setCurrentUrl(state.currentPrairieLearnUrl);
  setPrairieLearnStatus(plStatusText.waitingForConfiguration, "idle");
  setConfigOverlayOpen(true);
  setPrairieLearnRunState(false);

  void runInitialDockerChecks();
}

async function runInitialDockerChecks() {
  renderConfigSteps();
  const installedOk = await runDockerInstalledCheck();
  if (installedOk) {
    await runDockerDaemonCheck();
  } else {
    setDockerCheckState("daemon", "idle", "Waiting on step 1.");
  }
  syncConfigStepOpenState();
  updateCommandEditorState();
  if (areDockerPrerequisitesPassing()) {
    await refreshRunningContainers();
  } else {
    elements.runningContainersPreview.textContent = "Complete Docker checks before listing containers.";
  }
}

init();
