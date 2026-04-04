const sessionPrefix = "pl-review-session:";

const elements = {
  choosePdfButton: document.getElementById("choose-pdf-button"),
  restartPlButton: document.getElementById("restart-pl-button"),
  stopPlButton: document.getElementById("stop-pl-button"),
  openBrowserButton: document.getElementById("open-browser-button"),
  saveConfigButton: document.getElementById("save-config-button"),
  startConfiguredButton: document.getElementById("start-configured-button"),
  pdfName: document.getElementById("pdf-name"),
  plStatus: document.getElementById("pl-status"),
  currentUrl: document.getElementById("current-url"),
  baseUrlInput: document.getElementById("base-url-input"),
  commandModeStructured: document.getElementById("command-mode-structured"),
  commandModeCustom: document.getElementById("command-mode-custom"),
  commandModeReconnect: document.getElementById("command-mode-reconnect"),
  structuredCommandEditor: document.getElementById("structured-command-editor"),
  customCommandEditor: document.getElementById("custom-command-editor"),
  reconnectCommandEditor: document.getElementById("reconnect-command-editor"),
  courseDirectoryInput: document.getElementById("course-directory-input"),
  chooseCourseDirectoryButton: document.getElementById("choose-course-directory-button"),
  refreshRunningContainersButton: document.getElementById("refresh-running-containers-button"),
  runningContainersPreview: document.getElementById("running-containers-preview"),
  generatedCommandAccordion: document.getElementById("generated-command-accordion"),
  generatedCommandPreview: document.getElementById("generated-command-preview"),
  startCommandInput: document.getElementById("start-command-input"),
  configPanel: document.getElementById("config-panel"),
  dockerOutputAccordion: document.getElementById("docker-output-accordion"),
  dockerOutputLog: document.getElementById("docker-output-log"),
  dropOverlay: document.getElementById("drop-overlay"),
  skipOverlayButton: document.getElementById("skip-overlay-button"),
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
  dockerLog: ""
};

let dragDepth = 0;
let removeDockerOutputListener = null;
const maxDockerLogChars = 180000;
let isPrairieLearnCommandRunning = false;

function setPrairieLearnRunState(isRunning) {
  isPrairieLearnCommandRunning = isRunning;
  const canStop = isRunning || state.prairieLearnReady;
  elements.stopPlButton.hidden = !canStop;
  elements.stopPlButton.disabled = !canStop;
  elements.restartPlButton.disabled = isRunning;
  elements.startConfiguredButton.disabled = isRunning;
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

function showDropOverlay() {
  elements.dropOverlay.hidden = false;
}

function hideDropOverlay() {
  elements.dropOverlay.hidden = true;
}

function dismissDropOverlay() {
  dragDepth = 0;
  hideDropOverlay();
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

function setPrairieLearnStatus(message) {
  elements.plStatus.textContent = message;
}

function setCurrentUrl(url) {
  state.currentPrairieLearnUrl = url || "";
  elements.currentUrl.textContent = url || "Not loaded";
}

function collapseConnectionPanelOnSuccessfulPlUrl(url) {
  if (!url || url === "about:blank") {
    return;
  }

  try {
    const current = new URL(url);
    const base = new URL(state.config.baseUrl || "http://127.0.0.1:3000");
    if (current.origin === base.origin) {
      elements.configPanel.open = false;
    }
  } catch (error) {
    // Ignore parse failures for transient webview URLs.
  }
}

function renderDockerLog() {
  elements.dockerOutputLog.textContent = state.dockerLog || "No output yet.";
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

function buildStructuredCommandParts(config) {
  const courseDirectory = (config.courseDirectory || "").trim();
  const jobsDirectory = (config.jobsDirectory || "").trim();
  if (!courseDirectory) {
    return [];
  }

  const jobsDirectoryValue = jobsDirectory || "<auto-temp-pl_ag_jobs>";

  return [
    "docker run --rm",
    "-p 3000:3000",
    `-v ${shellQuote(courseDirectory)}:/course`,
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
    return "Choose a course directory to generate the Docker command.";
  }

  return parts.map((part, index) => (index < parts.length - 1 ? `${part} \\` : part)).join("\n");
}

function updateCommandEditorState() {
  const mode = getCommandModeFromForm();
  const generatedCommandParts = buildStructuredCommandParts({
    courseDirectory: elements.courseDirectoryInput.value,
    jobsDirectory: state.config.jobsDirectory
  });

  elements.generatedCommandPreview.value = formatCommandPreview(generatedCommandParts);
  const usingStructured = mode === "structured";
  const usingCustom = mode === "custom";
  const usingReconnect = mode === "reconnect";

  elements.structuredCommandEditor.classList.toggle("is-inactive", !usingStructured);
  elements.customCommandEditor.classList.toggle("is-inactive", !usingCustom);
  elements.reconnectCommandEditor.classList.toggle("is-inactive", !usingReconnect);
  elements.courseDirectoryInput.disabled = !usingStructured;
  elements.chooseCourseDirectoryButton.disabled = !usingStructured;
  elements.generatedCommandAccordion.classList.toggle("is-inactive", !usingStructured);
  elements.generatedCommandPreview.disabled = !usingStructured;
  elements.startCommandInput.disabled = !usingCustom;
  elements.refreshRunningContainersButton.disabled = !usingReconnect;
  elements.startConfiguredButton.textContent = getStartButtonLabelForMode(mode);
}

function renderConfig() {
  elements.baseUrlInput.value = state.config.baseUrl;
  elements.commandModeStructured.checked = state.config.commandMode === "structured";
  elements.commandModeCustom.checked = state.config.commandMode === "custom";
  elements.commandModeReconnect.checked = state.config.commandMode === "reconnect";
  elements.courseDirectoryInput.value = state.config.courseDirectory || "";
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
    elements.configPanel.open = true;
  }
}

function getConfigFromForm() {
  const commandMode = getCommandModeFromForm();
  const courseDirectory = elements.courseDirectoryInput.value.trim();
  const jobsDirectory = (state.config.jobsDirectory || "").trim();
  const customStartCommand = elements.startCommandInput.value.trim();
  const startCommand =
    commandMode === "custom"
      ? customStartCommand
      : commandMode === "structured"
        ? buildStructuredCommand({ courseDirectory, jobsDirectory })
        : "";

  return {
    baseUrl: elements.baseUrlInput.value.trim() || "http://127.0.0.1:3000",
    commandMode,
    courseDirectory,
    jobsDirectory,
    customStartCommand,
    startCommand
  };
}

async function refreshRunningContainers() {
  const listed = await window.reviewApi.listPrairieLearnContainers();
  if (!listed?.ok) {
    elements.runningContainersPreview.textContent =
      listed?.error || "Could not list running PrairieLearn containers.";
    return;
  }

  if (!listed.containers || listed.containers.length === 0) {
    elements.runningContainersPreview.textContent = "No running PrairieLearn containers found.";
    return;
  }

  elements.runningContainersPreview.textContent = listed.containers
    .map(
      (container) =>
        `${container.id}  ${container.image}\n${container.names || "unnamed"}  ${container.ports || "no ports"}  ${container.status || ""}`
    )
    .join("\n\n");
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
    elements.pdfName.textContent = "No file selected";
    return;
  }

  elements.pdfName.textContent = state.pdf.name;
  elements.pdfPageInput.value = String(state.currentPdfPage);
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
  state.config = getConfigFromForm();
  state.config = await ensureStructuredJobsDirectory(state.config);

  const title = mode === "reconnect" ? "Reconnecting to PrairieLearn..." : "Starting PrairieLearn...";
  setPrairieLearnStatus(title);
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
    setPrairieLearnStatus(result.warning ? "PrairieLearn ready (with warning)" : "PrairieLearn ready");
    setPrairieLearnRunState(isPrairieLearnCommandRunning);
    elements.configPanel.open = false;
    const question = getCurrentQuestion();
    if (question?.prairielearnPath) {
      loadPrairieLearn(question.prairielearnPath);
    } else {
      loadPrairieLearn(state.config.baseUrl);
    }
  } else {
    state.prairieLearnReady = false;
    setPrairieLearnRunState(isPrairieLearnCommandRunning);
    setPrairieLearnStatus(result.error || "Unable to connect to PrairieLearn");
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
  setPrairieLearnStatus("Connection saved");
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

function bindWebviewEvents() {
  elements.webview.addEventListener("dom-ready", () => {
    const url = elements.webview.getURL();
    setCurrentUrl(url);
    collapseConnectionPanelOnSuccessfulPlUrl(url);
  });

  elements.webview.addEventListener("did-navigate", (event) => {
    setCurrentUrl(event.url);
    collapseConnectionPanelOnSuccessfulPlUrl(event.url);
  });

  elements.webview.addEventListener("did-navigate-in-page", (event) => {
    setCurrentUrl(event.url);
    collapseConnectionPanelOnSuccessfulPlUrl(event.url);
  });

  elements.webview.addEventListener("page-title-updated", (event) => {
    state.currentPrairieLearnTitle = event.title;
  });

  elements.webview.addEventListener("did-fail-load", () => {
    setPrairieLearnStatus("PrairieLearn view could not load. Check the container and URL.");
  });
}

function bindEvents() {
  elements.questionForm.addEventListener("submit", (event) => {
    event.preventDefault();
  });
  elements.choosePdfButton.addEventListener("click", choosePdf);
  elements.restartPlButton.addEventListener("click", restartPrairieLearn);
  elements.stopPlButton.addEventListener("click", async () => {
    if (!isPrairieLearnCommandRunning && !state.prairieLearnReady) {
      return;
    }

    elements.stopPlButton.disabled = true;

    if (isPrairieLearnCommandRunning) {
      setPrairieLearnStatus("Stopping PrairieLearn start...");
      const result = await window.reviewApi.stopPrairieLearnStart();
      if (!result?.ok) {
        setPrairieLearnStatus(result?.error || "Unable to stop PrairieLearn start.");
      } else {
        setPrairieLearnStatus("PrairieLearn start stopped.");
        elements.configPanel.open = true;
        await refreshRunningContainers();
      }
      setPrairieLearnRunState(isPrairieLearnCommandRunning);
      return;
    }

    setPrairieLearnStatus("Stopping connected PrairieLearn container...");
    const result = await window.reviewApi.stopConnectedPrairieLearn(state.config.baseUrl);
    if (!result?.ok) {
      setPrairieLearnStatus(result?.error || "Unable to stop PrairieLearn container.");
    } else {
      state.prairieLearnReady = false;
      setPrairieLearnStatus("PrairieLearn container stopped.");
      elements.webview.src = "about:blank";
      setCurrentUrl("");
      elements.configPanel.open = true;
      await refreshRunningContainers();
    }
    setPrairieLearnRunState(isPrairieLearnCommandRunning);
  });
  elements.openBrowserButton.addEventListener("click", () => {
    const target = state.currentPrairieLearnUrl || state.config.baseUrl;
    window.reviewApi.openExternal(target);
  });
  elements.saveConfigButton.addEventListener("click", saveConfig);
  elements.startConfiguredButton.addEventListener("click", async () => {
    await saveConfig();
    await startPrairieLearn();
  });
  elements.commandModeStructured.addEventListener("change", updateCommandEditorState);
  elements.commandModeCustom.addEventListener("change", updateCommandEditorState);
  elements.commandModeReconnect.addEventListener("change", async () => {
    updateCommandEditorState();
    await refreshRunningContainers();
  });
  elements.courseDirectoryInput.addEventListener("input", updateCommandEditorState);
  elements.startCommandInput.addEventListener("input", updateCommandEditorState);
  elements.chooseCourseDirectoryButton.addEventListener("click", async () => {
    const selectedDirectory = await window.reviewApi.selectDirectory();
    if (!selectedDirectory) {
      return;
    }

    elements.courseDirectoryInput.value = selectedDirectory;
    updateCommandEditorState();
  });
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

  elements.previousPageButton.addEventListener("click", () => setPdfPage(state.currentPdfPage - 1));
  elements.nextPageButton.addEventListener("click", () => setPdfPage(state.currentPdfPage + 1));
  elements.pdfPageInput.addEventListener("change", (event) => setPdfPage(event.target.value));
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

  window.addEventListener("dragenter", (event) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    dragDepth += 1;
    showDropOverlay();
  });

  window.addEventListener("dragover", (event) => {
    if (!hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    showDropOverlay();
  });

  window.addEventListener("dragleave", (event) => {
    if (!event.dataTransfer?.types?.includes("Files")) {
      return;
    }

    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      hideDropOverlay();
    }
  });

  window.addEventListener("drop", async (event) => {
    event.preventDefault();
    dismissDropOverlay();

    const selected = await getDroppedPdfSelection(event);
    if (!selected?.path) {
      setPrairieLearnStatus("Drop a single PDF file to load it.");
      return;
    }

    await loadPdfSelection(selected);
  });

  elements.skipOverlayButton.addEventListener("click", dismissDropOverlay);

  bindQuestionInputs();
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
  await refreshRunningContainers();
  renderDockerLog();
  renderAll();
  setPrairieLearnRunState(false);
}

init();
