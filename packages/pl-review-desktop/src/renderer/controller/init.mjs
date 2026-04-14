import { getElements } from "../dom/elements.mjs";
import { createCourseDirectoryRow } from "../dom/templates.mjs";
import { loadSession, saveSession as persistSession } from "../state/session-store.mjs";
import {
  addQuestion as addQuestionState,
  applyCurrentPageToQuestion as applyPageToQuestionState,
  captureCurrentViewIntoQuestion as captureViewState,
  deleteCurrentQuestion as deleteCurrentQuestionState,
  ensureCurrentQuestionSelection,
  getCurrentQuestion,
  moveBetweenQuestions as moveBetweenQuestionsState,
  setCurrentQuestion as setCurrentQuestionState,
  updateCurrentQuestion as updateCurrentQuestionState
} from "../state/questions.mjs";
import {
  MAX_COURSE_DIRECTORIES,
  getConfigFromForm,
  getCourseDirectoriesFromForm
} from "../state/config-form.mjs";
import { buildStructuredCommand } from "../services/command-builder.mjs";
import { formatDockerLogHtml } from "../services/docker-log-format.mjs";
import { resolvePrairieLearnUrl } from "../services/prairielearn-url.mjs";
import {
  areDockerPrerequisitesPassing,
  renderConfig,
  renderConfigSteps,
  renderDependencyChecklist,
  setIndicatorState,
  syncConfigStepOpenState,
  updateCommandEditorState,
  updateCourseDirectoryInputState
} from "../ui/render-config.mjs";
import { renderPdf } from "../ui/render-pdf.mjs";
import {
  collapseConnectionPanelOnSuccessfulPlUrl,
  isPrairieLearnWaitingForConfiguration,
  renderPrairieLearnSurface,
  setConfigOverlayOpen,
  setCurrentUrl,
  setPrairieLearnStatus,
  updateWebviewNavigationButtons
} from "../ui/render-prairielearn.mjs";
import { renderQuestionEditor, renderQuestionList } from "../ui/render-questions.mjs";
import { bindEvents } from "./events.mjs";

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

const maxDockerLogChars = 180000;

export async function init({
  documentRef = document,
  windowRef = window,
  localStorageRef = localStorage,
  cryptoRef = crypto
} = {}) {
  const elements = getElements(documentRef);
  const state = {
    config: {
      baseUrl: "http://127.0.0.1:3000",
      commandMode: "structured",
      autoLoadFromDiskOnConnect: true,
      courseDirectory: "",
      courseDirectories: [],
      reviewManifestPath: "questions/review/_transpile_manifest.json",
      reviewSourceType: "sidecar",
      reviewSequenceId: "",
      reviewBankSlug: "",
      reviewStateRoot: ".automation/review_state",
      reviewReviewedRoot: "questions/reviewed",
      reviewErroneousRoot: "questions/erroneous",
      reviewWaitingRoot: "questions/waiting",
      reviewErroneousAssessmentSlug: "erroneous",
      reviewErroneousAssessmentTitle: "Erroneous Questions",
      reviewErroneousAssessmentNumber: "ERR",
      reviewWaitingAssessmentSlug: "waiting",
      reviewWaitingAssessmentTitle: "Waiting Questions",
      reviewWaitingAssessmentNumber: "WAIT",
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
    },
    dependencies: {
      docker: null,
      git: null,
      gh: null
    },
    review: {
      context: null,
      directoryEntries: [],
      directoryQuery: "",
      message: "Review workflow idle."
    }
  };

  let pdfDropDragDepth = 0;
  let removeDockerOutputListener = null;
  let removePrairieLearnAutomationListener = null;
  let isPrairieLearnCommandRunning = false;
  let isPrairieLearnStopping = false;
  let hasReconnectOptions = false;
  let hasAppliedContainerModeDefault = false;
  let draggedCourseRowIndex = null;
  let autoLoadFromDiskPending = false;
  let autoLoadFromDiskInFlight = false;
  let attachedPrairieLearnWebContentsId = null;
  let attachPrairieLearnWebviewPromise = null;

  function saveSession() {
    persistSession(localStorageRef, state.pdf, state.session, state.currentPdfPage);
  }

  function renderConfigStepsLocal() {
    renderConfigSteps({
      elements,
      state,
      isPrairieLearnCommandRunning,
      isPrairieLearnStopping,
      hasReconnectOptions
    });
  }

  function updateCommandEditorStateLocal() {
    updateCommandEditorState({
      elements,
      state,
      isPrairieLearnCommandRunning,
      isPrairieLearnStopping,
      hasReconnectOptions
    });
  }

  function renderPrairieLearnSurfaceLocal() {
    renderPrairieLearnSurface({ elements, state });
  }

  function setPrairieLearnStatusLocal(message, level = "idle") {
    setPrairieLearnStatus({ elements, state, message, level });
  }

  function setCurrentUrlLocal(url) {
    setCurrentUrl({ elements, state, url });
  }

  function setConfigOverlayOpenLocal(isOpen) {
    setConfigOverlayOpen({ elements, state, isOpen });
  }

  function collapseConnectionPanelOnSuccessfulPlUrlLocal(url) {
    collapseConnectionPanelOnSuccessfulPlUrl({ elements, state, url });
  }

  function isPrairieLearnWaitingForConfigurationLocal() {
    return isPrairieLearnWaitingForConfiguration({ state });
  }

  function setPrairieLearnRunState(isRunning) {
    isPrairieLearnCommandRunning = isRunning;
    const canStop = !isPrairieLearnStopping && (isRunning || state.prairieLearnReady);
    elements.stopPlButton.disabled = !canStop;
    if (elements.restartPlButton) {
      elements.restartPlButton.disabled = isRunning;
    }
    updateCommandEditorStateLocal();
    elements.startConfiguredButton.classList.toggle("is-loading", isRunning);
    elements.startConfiguredButton.setAttribute("aria-busy", isRunning ? "true" : "false");
    renderConfigStepsLocal();
    renderPrairieLearnSurfaceLocal();
  }

  function setDockerCheckState(stepKey, status, message) {
    state.dockerChecks[stepKey] = { status, message };
    renderConfigStepsLocal();
  }

  function renderQuestionListLocal() {
    renderQuestionList({
      elements,
      session: state.session,
      onSelect: (questionId) => setCurrentQuestion(questionId, { sync: true })
    });
  }

  function renderQuestionEditorLocal() {
    renderQuestionEditor({
      elements,
      question: getCurrentQuestion(state.session),
      session: state.session,
      pdf: state.pdf,
      currentPdfPage: state.currentPdfPage
    });
  }

  function renderPdfLocal() {
    renderPdf({
      elements,
      pdf: state.pdf,
      currentPdfPage: state.currentPdfPage,
      buildPdfUrl: windowRef.reviewApi.buildPdfUrl,
      setIndicatorState
    });
  }

  function renderConfigLocal() {
    renderConfig({
      elements,
      state,
      renderCourseDirectoryRows,
      updateCommandEditorStateArgs: {
        elements,
        state,
        isPrairieLearnCommandRunning,
        isPrairieLearnStopping,
        hasReconnectOptions
      },
      setConfigOverlayOpen: setConfigOverlayOpenLocal
    });
    renderConfigStepsLocal();
  }

  function renderAll() {
    renderConfigLocal();
    renderReviewLocal();
    renderQuestionListLocal();
    renderQuestionEditorLocal();
    renderPdfLocal();
  }

  function mergeReviewConfigFromSnapshot(snapshot) {
    if (!snapshot?.config) {
      return;
    }

    state.config.reviewManifestPath = snapshot.config.manifestPath || state.config.reviewManifestPath || "";
    state.config.reviewStateRoot = snapshot.config.stateRoot || state.config.reviewStateRoot || "";
    state.config.reviewReviewedRoot = snapshot.config.reviewedRoot || state.config.reviewReviewedRoot || "";
    state.config.reviewErroneousRoot = snapshot.config.erroneousRoot || state.config.reviewErroneousRoot || "";
    state.config.reviewWaitingRoot = snapshot.config.waitingRoot || state.config.reviewWaitingRoot || "";
    state.config.reviewErroneousAssessmentSlug =
      snapshot.config.erroneousAssessmentSlug || state.config.reviewErroneousAssessmentSlug || "";
    state.config.reviewErroneousAssessmentTitle =
      snapshot.config.erroneousAssessmentTitle || state.config.reviewErroneousAssessmentTitle || "";
    state.config.reviewErroneousAssessmentNumber =
      snapshot.config.erroneousAssessmentNumber || state.config.reviewErroneousAssessmentNumber || "";
    state.config.reviewWaitingAssessmentSlug =
      snapshot.config.waitingAssessmentSlug || state.config.reviewWaitingAssessmentSlug || "";
    state.config.reviewWaitingAssessmentTitle =
      snapshot.config.waitingAssessmentTitle || state.config.reviewWaitingAssessmentTitle || "";
    state.config.reviewWaitingAssessmentNumber =
      snapshot.config.waitingAssessmentNumber || state.config.reviewWaitingAssessmentNumber || "";
    state.config.reviewSequenceId = snapshot.currentSequenceId || state.config.reviewSequenceId || "";
    state.config.reviewBankSlug = snapshot.currentBankSlug || state.config.reviewBankSlug || "";
    state.config.reviewSourceType = snapshot.sourceType || state.config.reviewSourceType || "sidecar";
  }

  function applyReviewSnapshot(snapshot, message = "") {
    state.review.context = snapshot || null;
    state.review.directoryEntries = snapshot?.session?.directoryEntries || [];
    if (message) {
      state.review.message = message;
    }
    mergeReviewConfigFromSnapshot(snapshot);
    renderReviewLocal();
  }

  async function jumpToReviewQuestion(questionIndex) {
    const sequenceId = elements.reviewBankSelect?.value || state.config.reviewSequenceId || state.config.reviewBankSlug || "";
    if (!sequenceId) {
      return;
    }
    const snapshot = await windowRef.reviewApi.jumpToReviewQuestion(sequenceId, questionIndex);
    applyReviewSnapshot(snapshot, `Jumped to question ${Number(questionIndex) + 1}.`);
    if (state.review.directoryQuery) {
      state.review.directoryEntries = await windowRef.reviewApi.searchReviewQuestions(sequenceId, state.review.directoryQuery);
      renderReviewLocal();
    }
  }

  function renderReviewDirectoryEntries() {
    const container = elements.reviewDirectoryList;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    const entries = state.review.directoryEntries || [];
    if (entries.length === 0) {
      const empty = documentRef.createElement("div");
      empty.className = "question-item-meta";
      empty.textContent = "No remaining questions match this filter.";
      container.append(empty);
      return;
    }

    entries.forEach((entry) => {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "question-item";
      button.dataset.reviewQuestionIndex = String(entry.index);

      const title = documentRef.createElement("span");
      title.className = "question-item-title";
      title.textContent = entry.title || entry.relpath;

      const meta = documentRef.createElement("span");
      meta.className = "question-item-meta";
      meta.textContent = `${entry.pendingIndex}. ${entry.relpath}${entry.skipped ? " • skipped" : ""}`;

      button.append(title, meta);
      button.addEventListener("click", () => {
        void jumpToReviewQuestion(entry.index);
      });
      container.append(button);
    });
  }

  function renderReviewLocal() {
    if (elements.reviewManifestInput) {
      elements.reviewManifestInput.value = state.config.reviewManifestPath || "";
    }

    const snapshot = state.review.context;
    const banks = snapshot?.sequences || snapshot?.banks || [];
    if (elements.reviewBankSelect) {
      elements.reviewBankSelect.innerHTML = "";
      const placeholder = documentRef.createElement("option");
      placeholder.value = "";
      placeholder.textContent = banks.length > 0 ? "Choose a sequence..." : "No sequences loaded";
      elements.reviewBankSelect.append(placeholder);
      banks.forEach((bank) => {
        const option = documentRef.createElement("option");
        option.value = bank.sequenceId || bank.bankSlug;
        option.textContent = `${bank.sequenceTitle || bank.bankTitle} (${bank.summary.done}/${bank.summary.total})`;
        option.selected =
          option.value ===
          (snapshot?.currentSequenceId || state.config.reviewSequenceId || snapshot?.currentBankSlug || state.config.reviewBankSlug);
        elements.reviewBankSelect.append(option);
      });
    }

    if (elements.reviewStatus) {
      elements.reviewStatus.textContent = state.review.message || "Review workflow idle.";
    }

    const session = snapshot?.session || null;
    if (elements.reviewSummary) {
      elements.reviewSummary.textContent = session
        ? `approved=${session.summary.approved} waiting=${session.summary.waiting} erroneous=${session.summary.erroneous} pending=${session.summary.pending}`
        : "Load a live sequence or manifest fallback to start review.";
    }

    const item = session?.currentItem || null;
    if (elements.reviewCurrentTitle) {
      elements.reviewCurrentTitle.textContent = item
        ? `${item.title || "(no title)"}`
        : session?.finished
          ? "All questions reviewed."
          : "No current review item.";
    }
    if (elements.reviewCurrentPath) {
      elements.reviewCurrentPath.textContent = item
        ? `${session.currentIndex + 1}/${session.totalQuestions} • ${item.relpath}`
        : "";
    }
    if (elements.reviewCurrentTags) {
      elements.reviewCurrentTags.textContent = item?.reviewTags?.length > 0 ? `Review tags: ${item.reviewTags.join(", ")}` : "Review tags: (none)";
    }
    if (elements.reviewCurrentFiles) {
      elements.reviewCurrentFiles.textContent = item?.reviewFiles?.length > 0 ? item.reviewFiles.join("\n") : "";
    }
    if (elements.reviewTagInput) {
      elements.reviewTagInput.value = item?.reviewTags?.join(", ") || "";
      elements.reviewTagInput.disabled = !item;
    }
    if (elements.reviewDirectorySearchInput) {
      elements.reviewDirectorySearchInput.value = state.review.directoryQuery || "";
    }

    [
      elements.reviewSaveTagsButton,
      elements.reviewApproveButton,
      elements.reviewApproveFormatButton,
      elements.reviewWaitingButton,
      elements.reviewErroneousButton,
      elements.reviewSkipButton
    ].forEach((button) => {
      if (button) {
        button.disabled = !item;
      }
    });
    if (elements.reviewUndoButton) {
      elements.reviewUndoButton.disabled = !session?.canUndo;
    }

    renderReviewDirectoryEntries();
  }

  function renderDockerLog() {
    elements.dockerOutputLog.innerHTML = formatDockerLogHtml(state.dockerLog);
    const accordion = elements.dockerOutputAccordion;
    if (accordion?.open) {
      elements.dockerOutputLog.scrollTop = elements.dockerOutputLog.scrollHeight;
    }
  }

  function resetDockerLog() {
    state.dockerLog = "";
    renderDockerLog();
  }

  function appendDockerLog(text) {
    state.dockerLog = `${state.dockerLog}${text || ""}`.slice(-maxDockerLogChars);
    renderDockerLog();
  }

  function handleDockerOutput(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }

    if (payload.type === "reset") {
      resetDockerLog();
      return;
    }

    if (payload.type === "chunk") {
      appendDockerLog(payload.text || "");
    }
  }

  async function runDockerInstalledCheck() {
    setDockerCheckState("installed", "working", "Checking command-line dependencies...");
    const result = await windowRef.reviewApi.checkCliDependencies();
    state.dependencies.docker = Boolean(result?.docker?.ok);
    state.dependencies.git = Boolean(result?.git?.ok);
    state.dependencies.gh = Boolean(result?.gh?.installed);
    renderDependencyChecklist({ elements, state });

    if (result?.ok) {
      const base = "Docker + Git detected.";
      const warningText =
        Array.isArray(result.warnings) && result.warnings.length > 0 ? ` Warning: ${result.warnings.join(" ")}` : "";
      setDockerCheckState("installed", "success", `${base}${warningText}`);
      return true;
    }

    const missing = [];
    if (!result?.docker?.ok) {
      missing.push("`docker` is missing");
    }
    if (!result?.git?.ok) {
      missing.push("`git` is missing");
    }
    const core = missing.length > 0 ? `${missing.join(" and ")}.` : "Required dependencies are missing.";
    const warningText =
      Array.isArray(result?.warnings) && result.warnings.length > 0 ? ` ${result.warnings.join(" ")}` : "";
    setDockerCheckState("installed", "error", `${core}${warningText}`.trim());
    return false;
  }

  function withDockerDesktopRecommendation(message) {
    const base = String(message || "").trim() || "Docker Engine is not reachable.";
    if (base.toLowerCase().includes("paused")) {
      return `${base} Open Docker Desktop and click Resume. Use Restart Docker Engine only if needed.`;
    }
    return `${base} Start Docker Desktop, then check Step 2 again.`;
  }

  async function runDockerDaemonCheck() {
    setDockerCheckState("daemon", "working", "Checking Docker Engine...");
    const result = await windowRef.reviewApi.checkDockerDaemonRunning();
    if (result?.ok) {
      const suffix = result.version ? ` Server ${result.version}.` : "";
      setDockerCheckState("daemon", "success", `Docker Engine is running.${suffix}`);
      return true;
    }

    setDockerCheckState("daemon", "error", withDockerDesktopRecommendation(result?.error));
    return false;
  }

  async function waitForDockerDaemonReady(maxWaitMs = 15000, intervalMs = 1000) {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const ready = await windowRef.reviewApi.checkDockerDaemonRunning();
      if (ready?.ok) {
        return ready;
      }
      await new Promise((resolve) => windowRef.setTimeout(resolve, intervalMs));
    }

    return null;
  }

  async function startDockerDaemonFromStep(mode = "start") {
    setDockerCheckState("daemon", "working", mode === "restart" ? "Restarting Docker Engine..." : "Starting Docker Engine...");
    const started = await windowRef.reviewApi.startDockerDaemon(mode);
    if (!started?.ok) {
      setDockerCheckState("daemon", "error", withDockerDesktopRecommendation(started?.error));
      return false;
    }

    const ready = await waitForDockerDaemonReady();
    if (!ready?.ok) {
      setDockerCheckState("daemon", "error", "Docker Engine did not become ready yet. Wait a moment, then check again.");
      return false;
    }

    setDockerCheckState("daemon", "success", `Docker Engine is running.${ready.version ? ` Server ${ready.version}.` : ""}`);
    await refreshRunningContainers();
    return true;
  }

  async function ensureDockerPrerequisites() {
    if (areDockerPrerequisitesPassing(state)) {
      return true;
    }

    const installedOk =
      state.dockerChecks.installed.status === "success" ? true : await runDockerInstalledCheck();
    if (!installedOk) {
      return false;
    }

    return state.dockerChecks.daemon.status === "success" ? true : runDockerDaemonCheck();
  }

  function hasDraggedFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  function isPdfFile(file) {
    if (!file) {
      return false;
    }

    const name = String(file.name || "").toLowerCase();
    return file.type === "application/pdf" || name.endsWith(".pdf");
  }

  async function refreshRunningContainers() {
    if (!areDockerPrerequisitesPassing(state)) {
      hasReconnectOptions = false;
      elements.runningContainersPreview.textContent = "Complete Docker checks before refreshing containers.";
      return;
    }

    const listed = await windowRef.reviewApi.listPrairieLearnContainers();
    if (!listed?.ok) {
      hasReconnectOptions = false;
      elements.runningContainersPreview.textContent = listed?.error || "Could not list running PrairieLearn containers.";
      if (!hasAppliedContainerModeDefault) {
        hasAppliedContainerModeDefault = true;
        state.config.commandMode = "structured";
        elements.commandModeStructured.checked = true;
        updateCommandEditorStateLocal();
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
        updateCommandEditorStateLocal();
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
      updateCommandEditorStateLocal();
    }
  }

  async function ensureStructuredJobsDirectory(config) {
    if (config.commandMode !== "structured") {
      return config;
    }

    const jobsDirectory = await windowRef.reviewApi.ensureJobsDirectory(config.jobsDirectory);
    const nextConfig = {
      ...config,
      jobsDirectory
    };

    nextConfig.startCommand = buildStructuredCommand(nextConfig);
    state.config.jobsDirectory = jobsDirectory;
    updateCommandEditorStateLocal();
    return nextConfig;
  }

  function renderCourseDirectoryRows(values = [""]) {
    const normalized = values.slice(0, MAX_COURSE_DIRECTORIES);
    const safeValues = normalized.length > 0 ? normalized : [""];
    elements.courseDirectoriesList.innerHTML = "";

    safeValues.forEach((value, index) => {
      const row = createCourseDirectoryRow(
        elements.courseDirectoryRowTemplate,
        { value, index, total: safeValues.length },
        {
          onInput: ({ input }) => {
            updateCourseDirectoryInputState(input);
            updateCommandEditorStateLocal();
          },
          onChoose: async ({ input }) => {
            if (input.disabled) {
              return;
            }
            const selectedDirectory = await windowRef.reviewApi.selectDirectory();
            if (!selectedDirectory) {
              return;
            }
            input.value = selectedDirectory;
            updateCourseDirectoryInputState(input);
            updateCommandEditorStateLocal();
          },
          onRemove: ({ row: currentRow }) => {
            const rows = Array.from(elements.courseDirectoriesList.querySelectorAll(".course-directory-row"));
            const nextValues = rows
              .filter((entry) => entry !== currentRow)
              .map((entry) => entry.querySelector("[data-course-directory-input]").value);
            renderCourseDirectoryRows(nextValues.length ? nextValues : [""]);
            updateCommandEditorStateLocal();
          },
          onDragStart: ({ event, row: currentRow }) => {
            draggedCourseRowIndex = Number(currentRow.dataset.courseRowIndex);
            event.dataTransfer.effectAllowed = "move";
            currentRow.classList.add("is-dragging");
          },
          onDragEnd: ({ row: currentRow }) => {
            draggedCourseRowIndex = null;
            currentRow.classList.remove("is-dragging");
            elements.courseDirectoriesList.querySelectorAll(".course-directory-row").forEach((entry) => {
              entry.classList.remove("is-drag-target");
            });
          },
          onDragOver: ({ event, row: currentRow }) => {
            event.preventDefault();
            if (draggedCourseRowIndex === null) {
              return;
            }
            currentRow.classList.add("is-drag-target");
          },
          onDragLeave: ({ row: currentRow }) => {
            currentRow.classList.remove("is-drag-target");
          },
          onDrop: ({ event, row: currentRow }) => {
            event.preventDefault();
            const targetIndex = Number(currentRow.dataset.courseRowIndex);
            if (draggedCourseRowIndex === null || Number.isNaN(targetIndex) || targetIndex === draggedCourseRowIndex) {
              currentRow.classList.remove("is-drag-target");
              return;
            }

            const nextValues = Array.from(
              elements.courseDirectoriesList.querySelectorAll("[data-course-directory-input]")
            ).map((entry) => entry.value);
            const [moved] = nextValues.splice(draggedCourseRowIndex, 1);
            nextValues.splice(targetIndex, 0, moved);
            renderCourseDirectoryRows(nextValues);
            updateCommandEditorStateLocal();
          }
        }
      );

      updateCourseDirectoryInputState(row.querySelector("[data-course-directory-input]"));
      elements.courseDirectoriesList.append(row);
    });
  }

  function loadPrairieLearn(url) {
    const targetUrl = resolvePrairieLearnUrl(url, state.config.baseUrl);
    elements.webview.src = targetUrl;
    setCurrentUrlLocal(targetUrl);
    collapseConnectionPanelOnSuccessfulPlUrlLocal(targetUrl);
  }

  function syncToQuestion(question) {
    if (!question) {
      return;
    }

    const targetPage = Number(question.pdfPage) || 1;
    state.currentPdfPage = Math.max(1, targetPage);
    renderPdfLocal();
    renderQuestionEditorLocal();

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

    setCurrentQuestionState(state.session, questionId);
    renderQuestionListLocal();
    renderQuestionEditorLocal();
    saveSession();

    if (options.sync) {
      syncToQuestion(getCurrentQuestion(state.session));
    }
  }

  function updateCurrentQuestion(mutator, options = {}) {
    const question = updateCurrentQuestionState(state.session, mutator);
    if (!question) {
      return;
    }

    if (options.renderList !== false) {
      renderQuestionListLocal();
    }
    if (options.renderEditor) {
      renderQuestionEditorLocal();
    }
    saveSession();
  }

  function addQuestion(fromCurrentView = false) {
    if (!state.session) {
      return;
    }

    const question = addQuestionState(state.session, {
      fromCurrentView,
      currentPrairieLearnUrl: state.currentPrairieLearnUrl,
      currentPdfPage: state.currentPdfPage,
      baseUrl: state.config.baseUrl,
      createId: () => cryptoRef.randomUUID()
    });

    setCurrentQuestion(question.id, { sync: fromCurrentView });
    renderQuestionListLocal();
    saveSession();
  }

  function deleteCurrentQuestion() {
    if (!state.session) {
      return;
    }

    deleteCurrentQuestionState(state.session);
    renderQuestionListLocal();
    renderQuestionEditorLocal();
    saveSession();
  }

  function moveBetweenQuestions(direction) {
    const question = moveBetweenQuestionsState(state.session, direction);
    if (question) {
      setCurrentQuestion(question.id, { sync: true });
    }
  }

  function applyCurrentPageToQuestion() {
    updateCurrentQuestion((question) => {
      applyPageToQuestionState(question, state.currentPdfPage);
    }, { renderEditor: true });
  }

  function captureCurrentViewIntoQuestion() {
    updateCurrentQuestion((question) => {
      captureViewState(question, {
        currentPdfPage: state.currentPdfPage,
        currentPrairieLearnUrl: state.currentPrairieLearnUrl,
        baseUrl: state.config.baseUrl
      });
    }, { renderEditor: true });
  }

  function setPdfPage(page) {
    const nextPage = Math.max(1, Number(page) || 1);
    state.currentPdfPage = nextPage;
    renderPdfLocal();
    saveSession();
  }

  async function connectPrairieLearn(mode) {
    const hasPrerequisites = await ensureDockerPrerequisites();
    if (!hasPrerequisites) {
      setPrairieLearnStatusLocal("Complete Docker setup checks first.", "error");
      return;
    }

    state.config = getConfigFromForm({
      elements,
      state,
      buildStructuredCommand
    });
    state.config = await ensureStructuredJobsDirectory(state.config);

    const title = mode === "reconnect" ? plStatusText.reconnecting : plStatusText.starting;
    setPrairieLearnStatusLocal(title, "working");
    setPrairieLearnRunState(true);

    let result;
    try {
      if (mode === "reconnect") {
        result = await windowRef.reviewApi.reconnectPrairieLearn(state.config);
      } else if (mode === "restart") {
        result = await windowRef.reviewApi.restartPrairieLearn(state.config);
      } else {
        result = await windowRef.reviewApi.startPrairieLearn(state.config);
      }
    } finally {
      setPrairieLearnRunState(false);
    }

    state.config = result.config || state.config;
    renderConfigLocal();

    if (result.ok) {
      state.prairieLearnReady = true;
      setPrairieLearnStatusLocal(result.warning ? plStatusText.readyWithWarning : plStatusText.ready, result.warning ? "warning" : "ready");
      setPrairieLearnRunState(isPrairieLearnCommandRunning);
      setConfigOverlayOpenLocal(false);
      queueAutoLoadFromDiskOnConnect();
      const question = getCurrentQuestion(state.session);
      if (question?.prairielearnPath) {
        loadPrairieLearn(question.prairielearnPath);
      } else {
        loadPrairieLearn(state.config.baseUrl);
      }
    } else {
      autoLoadFromDiskPending = false;
      state.prairieLearnReady = false;
      setPrairieLearnRunState(isPrairieLearnCommandRunning);
      setPrairieLearnStatusLocal(result.error || plStatusText.connectFailed, "error");
      setConfigOverlayOpenLocal(true);
    }
  }

  async function startPrairieLearn() {
    const mode = elements.commandModeReconnect.checked ? "reconnect" : "start";
    await connectPrairieLearn(mode);
  }

  async function restartPrairieLearn() {
    const mode = elements.commandModeReconnect.checked ? "reconnect" : "restart";
    await connectPrairieLearn(mode);
  }

  async function saveConfig() {
    if (isPrairieLearnCommandRunning) {
      return;
    }

    state.config = getConfigFromForm({
      elements,
      state,
      buildStructuredCommand
    });
    state.config = await ensureStructuredJobsDirectory(state.config);
    state.config = await windowRef.reviewApi.saveConfig(state.config);
    renderConfigLocal();
    setPrairieLearnStatusLocal(plStatusText.connectionSaved, state.prairieLearnReady ? "ready" : "idle");
  }

  async function choosePdf() {
    const selected = await windowRef.reviewApi.selectPdf();
    if (selected) {
      await loadPdfSelection(selected);
    }
  }

  async function loadPdfSelection(selected) {
    if (!selected?.path) {
      return;
    }

    state.pdf = selected;
    state.session = loadSession(localStorageRef, selected.path);
    state.currentPdfPage = Number(state.session.currentPdfPage) || 1;
    ensureCurrentQuestionSelection(state.session);

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

    const resolvedPath = windowRef.reviewApi.getPathForFile(file);
    if (!resolvedPath) {
      return null;
    }

    return {
      path: resolvedPath,
      name: file.name || resolvedPath.split("/").pop()
    };
  }

  function queueAutoLoadFromDiskOnConnect() {
    autoLoadFromDiskPending = state.config.autoLoadFromDiskOnConnect !== false;
  }

  async function ensurePrairieLearnWebviewAttached() {
    if (elements.webview.hidden) {
      return null;
    }

    const webContentsId = elements.webview.getWebContentsId?.();
    if (!webContentsId) {
      return null;
    }

    if (attachedPrairieLearnWebContentsId === webContentsId) {
      return windowRef.reviewApi.getPrairieLearnStatus();
    }

    if (attachPrairieLearnWebviewPromise) {
      return attachPrairieLearnWebviewPromise;
    }

    attachPrairieLearnWebviewPromise = windowRef.reviewApi
      .attachPrairieLearnWebview(webContentsId)
      .then((result) => {
        attachedPrairieLearnWebContentsId = result?.webContentsId || webContentsId;
        const status = result?.status || null;
        if (status?.url) {
          setCurrentUrlLocal(status.url);
        }
        if (status?.title) {
          state.currentPrairieLearnTitle = status.title;
        }
        return result;
      })
      .finally(() => {
        attachPrairieLearnWebviewPromise = null;
      });

    return attachPrairieLearnWebviewPromise;
  }

  async function resetPrairieLearnWebviewAttachment() {
    attachedPrairieLearnWebContentsId = null;
    attachPrairieLearnWebviewPromise = null;
    try {
      await windowRef.reviewApi.detachPrairieLearnWebview();
    } catch (error) {
      // Ignore detach failures during teardown and reconnect flows.
    }
  }

  async function tryAutoLoadFromDiskOnConnect() {
    if (!autoLoadFromDiskPending || autoLoadFromDiskInFlight) {
      return;
    }

    autoLoadFromDiskInFlight = true;
    try {
      await ensurePrairieLearnWebviewAttached();
      await windowRef.reviewApi.reloadPrairieLearnFromDisk();
      autoLoadFromDiskPending = false;
    } catch (error) {
      setPrairieLearnStatusLocal(error?.message || plStatusText.viewFailed, "error");
    } finally {
      autoLoadFromDiskInFlight = false;
    }
  }

  function handlePrairieLearnAutomationEvent(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }

    if (payload.type === "attached" && payload.status) {
      if (payload.status.url) {
        setCurrentUrlLocal(payload.status.url);
      }
      if (payload.status.title) {
        state.currentPrairieLearnTitle = payload.status.title;
      }
    }
  }

  async function handleStopPrairieLearn() {
    if (isPrairieLearnStopping || (!isPrairieLearnCommandRunning && !state.prairieLearnReady)) {
      return;
    }

    isPrairieLearnStopping = true;
    elements.stopPlButton.disabled = true;

    if (isPrairieLearnCommandRunning) {
      setPrairieLearnStatusLocal(plStatusText.stoppingStart, "working");
      const result = await windowRef.reviewApi.stopPrairieLearnStart();
      if (!result?.ok) {
        setPrairieLearnStatusLocal(result?.error || plStatusText.stopStartFailed, "error");
      } else {
        setPrairieLearnStatusLocal(plStatusText.startStopped, "idle");
        setConfigOverlayOpenLocal(true);
        await refreshRunningContainers();
      }
      isPrairieLearnStopping = false;
      setPrairieLearnRunState(isPrairieLearnCommandRunning);
      return;
    }

    setPrairieLearnStatusLocal(plStatusText.stoppingContainer, "working");
    const result = await windowRef.reviewApi.stopConnectedPrairieLearn(state.config.baseUrl);
    if (!result?.ok) {
      setPrairieLearnStatusLocal(result?.error || plStatusText.stopContainerFailed, "error");
    } else {
      state.prairieLearnReady = false;
      setPrairieLearnStatusLocal(plStatusText.containerStopped, "idle");
      await resetPrairieLearnWebviewAttachment();
      elements.webview.src = "about:blank";
      setCurrentUrlLocal("");
      setConfigOverlayOpenLocal(true);
      await refreshRunningContainers();
    }

    isPrairieLearnStopping = false;
    setPrairieLearnRunState(isPrairieLearnCommandRunning);
  }

  async function runInitialDockerChecks() {
    renderConfigStepsLocal();
    const installedOk = await runDockerInstalledCheck();
    if (installedOk) {
      await runDockerDaemonCheck();
    } else {
      setDockerCheckState("daemon", "idle", "Waiting on step 1.");
    }
    syncConfigStepOpenState(elements, state);
    updateCommandEditorStateLocal();
    if (areDockerPrerequisitesPassing(state)) {
      await refreshRunningContainers();
    } else {
      elements.runningContainersPreview.textContent = "Complete Docker checks before listing containers.";
    }
  }

  const app = {
    elements,
    state,
    windowRef,
    documentRef,
    plStatusText,
    maxCourseDirectories: MAX_COURSE_DIRECTORIES,
    choosePdf,
    restartPrairieLearn,
    handleStopPrairieLearn,
    saveConfig,
    startPrairieLearn,
    runDockerInstalledCheck,
    runDockerDaemonCheck,
    startDockerDaemonFromStep,
    updateCommandEditorState: updateCommandEditorStateLocal,
    refreshRunningContainers,
    addQuestion,
    captureCurrentViewIntoQuestion,
    getCurrentQuestion: () => getCurrentQuestion(state.session),
    deleteCurrentQuestion,
    moveBetweenQuestions,
    setPdfPage,
    applyCurrentPageToQuestion,
    loadPdfSelection,
    getDroppedPdfSelection,
    setPrairieLearnStatus: setPrairieLearnStatusLocal,
    hasDraggedFiles,
    setDockerCheckState,
    syncConfigStepOpenState: () => syncConfigStepOpenState(elements, state),
    setConfigOverlayOpen: setConfigOverlayOpenLocal,
    isPrairieLearnWaitingForConfiguration: isPrairieLearnWaitingForConfigurationLocal,
    ensurePrairieLearnWebviewAttached,
    tryAutoLoadFromDiskOnConnect,
    collapseConnectionPanelOnSuccessfulPlUrl: collapseConnectionPanelOnSuccessfulPlUrlLocal,
    setCurrentUrl: setCurrentUrlLocal,
    updateWebviewNavigationButtons: () => updateWebviewNavigationButtons(elements),
    saveSession,
    updateCurrentQuestion,
    renderCourseDirectoryRows,
    loadReviewContext: async () => {
      try {
        const snapshot = await windowRef.reviewApi.loadReviewContext();
        applyReviewSnapshot(snapshot, "Review workflow loaded.");
      } catch (error) {
        state.review.message = error?.message || "Could not load review workflow.";
        renderReviewLocal();
      }
    },
    selectReviewManifest: async () => {
      const selected = await windowRef.reviewApi.selectReviewManifest();
      if (!selected) {
        return;
      }
      state.config = await windowRef.reviewApi.saveConfig({
        ...state.config,
        reviewManifestPath: selected
      });
      const snapshot = await windowRef.reviewApi.loadReviewContext();
      applyReviewSnapshot(snapshot, "Loaded review manifest.");
    },
    reloadReviewContext: async () => {
      state.config = await windowRef.reviewApi.saveConfig({
        ...state.config,
        reviewManifestPath: elements.reviewManifestInput?.value.trim() || state.config.reviewManifestPath || "",
        reviewSequenceId: elements.reviewBankSelect?.value || state.config.reviewSequenceId || "",
        reviewBankSlug: ""
      });
      const snapshot = await windowRef.reviewApi.loadReviewContext();
      applyReviewSnapshot(snapshot, "Reloaded review context.");
    },
    selectReviewSequence: async (sequenceId) => {
      state.config = await windowRef.reviewApi.saveConfig({
        ...state.config,
        reviewManifestPath: elements.reviewManifestInput?.value.trim() || state.config.reviewManifestPath || "",
        reviewSequenceId: sequenceId || "",
        reviewBankSlug: ""
      });
      const snapshot = sequenceId ? await windowRef.reviewApi.selectReviewSequence(sequenceId) : await windowRef.reviewApi.loadReviewContext();
      applyReviewSnapshot(snapshot, sequenceId ? `Loaded sequence ${sequenceId}.` : "Review sequence cleared.");
    },
    searchReviewQuestions: async (query) => {
      state.review.directoryQuery = query;
      const sequenceId = elements.reviewBankSelect?.value || state.config.reviewSequenceId || state.config.reviewBankSlug || "";
      if (!sequenceId) {
        state.review.directoryEntries = [];
        renderReviewLocal();
        return;
      }
      state.review.directoryEntries = await windowRef.reviewApi.searchReviewQuestions(sequenceId, query);
      renderReviewLocal();
    },
    saveReviewTags: async () => {
      const sequenceId = elements.reviewBankSelect?.value || state.config.reviewSequenceId || state.config.reviewBankSlug || "";
      if (!sequenceId) {
        return;
      }
      const tags = String(elements.reviewTagInput?.value || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const snapshot = await windowRef.reviewApi.updateReviewTags(sequenceId, tags);
      applyReviewSnapshot(snapshot, "Updated review tags.");
      if (state.review.directoryQuery) {
        state.review.directoryEntries = await windowRef.reviewApi.searchReviewQuestions(sequenceId, state.review.directoryQuery);
        renderReviewLocal();
      }
    },
    applyReviewAction: async (action) => {
      const sequenceId = elements.reviewBankSelect?.value || state.config.reviewSequenceId || state.config.reviewBankSlug || "";
      if (!sequenceId) {
        return;
      }
      const result = await windowRef.reviewApi.applyReviewAction(sequenceId, action);
      applyReviewSnapshot(result?.snapshot, result?.message || `Applied ${action}.`);
      if (state.review.directoryQuery) {
        state.review.directoryEntries = await windowRef.reviewApi.searchReviewQuestions(sequenceId, state.review.directoryQuery);
        renderReviewLocal();
      }
    },
    undoReviewAction: async () => {
      const sequenceId = elements.reviewBankSelect?.value || state.config.reviewSequenceId || state.config.reviewBankSlug || "";
      if (!sequenceId) {
        return;
      }
      const result = await windowRef.reviewApi.undoReviewAction(sequenceId);
      applyReviewSnapshot(result?.snapshot, result?.message || "Undid review action.");
      if (state.review.directoryQuery) {
        state.review.directoryEntries = await windowRef.reviewApi.searchReviewQuestions(sequenceId, state.review.directoryQuery);
        renderReviewLocal();
      }
    },
    jumpToReviewQuestion,
    navigatePrairieLearnReview: async (direction) => {
      await ensurePrairieLearnWebviewAttached();
      if (direction === "previous") {
        await windowRef.reviewApi.goToPreviousPrairieLearnQuestion();
      } else {
        await windowRef.reviewApi.goToNextPrairieLearnQuestion();
      }
      const current = await windowRef.reviewApi.getPrairieLearnCurrent();
      if (current?.url) {
        setCurrentUrlLocal(current.url);
      }
      if (current?.title) {
        state.currentPrairieLearnTitle = current.title;
      }
      state.review.message = `Moved PrairieLearn ${direction}.`;
      renderReviewLocal();
    },
    incrementPdfDropDragDepth: () => {
      pdfDropDragDepth += 1;
    },
    decrementPdfDropDragDepth: () => {
      pdfDropDragDepth = Math.max(0, pdfDropDragDepth - 1);
    },
    resetPdfDropDragDepth: () => {
      pdfDropDragDepth = 0;
    },
    getPdfDropDragDepth: () => pdfDropDragDepth
  };

  bindEvents(app);
  removeDockerOutputListener = windowRef.reviewApi.onDockerOutput(handleDockerOutput);
  removePrairieLearnAutomationListener = windowRef.reviewApi.onPrairieLearnAutomationEvent(handlePrairieLearnAutomationEvent);

  windowRef.addEventListener("beforeunload", () => {
    if (typeof removeDockerOutputListener === "function") {
      removeDockerOutputListener();
      removeDockerOutputListener = null;
    }
    if (typeof removePrairieLearnAutomationListener === "function") {
      removePrairieLearnAutomationListener();
      removePrairieLearnAutomationListener = null;
    }
    void windowRef.reviewApi.detachPrairieLearnWebview();
  });

  state.config = await windowRef.reviewApi.getConfig();
  state.config = await ensureStructuredJobsDirectory(state.config);
  renderDockerLog();
  renderAll();
  await app.loadReviewContext();
  renderDependencyChecklist({ elements, state });
  setCurrentUrlLocal(state.currentPrairieLearnUrl);
  setPrairieLearnStatusLocal(plStatusText.waitingForConfiguration, "idle");
  setConfigOverlayOpenLocal(true);
  setPrairieLearnRunState(false);
  void runInitialDockerChecks();

  return app;
}
