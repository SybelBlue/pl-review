import {
  MAX_COURSE_DIRECTORIES,
  getCommandModeFromForm,
  getCourseDirectoryEntriesFromConfig,
  getCourseDirectoriesFromForm,
  getStartButtonLabelForMode
} from "../state/config-form.mjs";
import { buildStructuredCommand, buildStructuredCommandParts, formatCommandPreview } from "../services/command-builder.mjs";

export function setIndicatorState(element, level) {
  if (!element) {
    return;
  }

  element.classList.remove("indicator-idle", "indicator-ready", "indicator-working", "indicator-warning", "indicator-error");
  element.classList.add(`indicator-${level}`);
}

export function setConfigStepIndicatorState(element, status) {
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

export function areDockerPrerequisitesPassing(state) {
  return state.dockerChecks.installed.status === "success" && state.dockerChecks.daemon.status === "success";
}

export function syncStartButtonDisabledState({ elements, state, isPrairieLearnCommandRunning, isPrairieLearnStopping, hasReconnectOptions }) {
  const mode = getCommandModeFromForm(elements);
  const prerequisitesPassed = areDockerPrerequisitesPassing(state);
  const courseDirectories = getCourseDirectoriesFromForm(elements);
  const customStartCommand = elements.startCommandInput?.value.trim() || "";

  let canStart = prerequisitesPassed && !isPrairieLearnCommandRunning && !isPrairieLearnStopping;
  if (mode === "structured") {
    canStart = canStart && courseDirectories.length > 0;
  } else if (mode === "custom") {
    canStart = canStart && Boolean(customStartCommand);
  } else if (mode === "reconnect") {
    canStart = canStart && hasReconnectOptions;
  }

  elements.startConfiguredButton.disabled = !canStart;
}

export function syncConfigStepOpenState(elements, state) {
  if (elements.configStepDockerInstalled) {
    elements.configStepDockerInstalled.open = state.dockerChecks.installed.status !== "success";
  }
  if (elements.configStepDockerDaemon) {
    elements.configStepDockerDaemon.open =
      state.dockerChecks.installed.status === "success" && state.dockerChecks.daemon.status !== "success";
  }
  if (elements.configStepConnectionMethod) {
    elements.configStepConnectionMethod.open = areDockerPrerequisitesPassing(state);
  }
}

export function renderConfigSteps({
  elements,
  state,
  isPrairieLearnCommandRunning,
  isPrairieLearnStopping,
  hasReconnectOptions
}) {
  const prereqsPassed = areDockerPrerequisitesPassing(state);

  setConfigStepIndicatorState(elements.dockerInstalledStepIndicator, state.dockerChecks.installed.status);
  setConfigStepIndicatorState(elements.dockerDaemonStepIndicator, state.dockerChecks.daemon.status);
  setConfigStepIndicatorState(elements.connectionMethodStepIndicator, prereqsPassed ? "success" : "idle");

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
    elements.checkDockerDaemonButton.disabled =
      state.dockerChecks.installed.status !== "success" || state.dockerChecks.daemon.status === "working";
  }

  syncStartButtonDisabledState({
    elements,
    state,
    isPrairieLearnCommandRunning,
    isPrairieLearnStopping,
    hasReconnectOptions
  });
}

export function renderDependencyChecklist({ elements, state }) {
  const applyDepVisual = (item, dot, value) => {
    if (item) {
      item.classList.toggle("is-checked", value === true);
      item.classList.toggle("is-missing", value === false);
      item.classList.toggle("is-unknown", value === null);
    }
    if (dot) {
      dot.classList.toggle("is-checked", value === true);
      dot.classList.toggle("is-missing", value === false);
      dot.classList.toggle("is-unknown", value === null);
    }
  };

  applyDepVisual(elements.depDockerItem, elements.depDockerStatus, state.dependencies.docker);
  applyDepVisual(elements.depGitItem, elements.depGitStatus, state.dependencies.git);
  applyDepVisual(elements.depGhItem, elements.depGhStatus, state.dependencies.gh);

  if (elements.dependencyInstallLinks) {
    const missing =
      state.dependencies.docker === false || state.dependencies.git === false || state.dependencies.gh === false;
    elements.dependencyInstallLinks.hidden = !missing;
  }

  if (elements.dockerInstallDocLinks) {
    elements.dockerInstallDocLinks.hidden = state.dependencies.docker === true;
  }
}

export function updateCourseDirectoryInputState(input) {
  if (!input) {
    return;
  }

  input.classList.toggle("is-empty", !String(input.value || "").trim());
}

export function updateCourseDirectoryMountLabels(elements) {
  const rows = Array.from(elements.courseDirectoriesList?.querySelectorAll(".course-directory-row") || []);
  let mountIndex = 0;

  rows.forEach((row) => {
    const mountNode = row.querySelector(".course-directory-mount");
    const excludeInput = row.querySelector("[data-course-directory-exclude]");
    const excluded = !Boolean(excludeInput?.checked);

    row.classList.toggle("is-excluded", excluded);
    if (!mountNode) {
      return;
    }

    if (excluded) {
      mountNode.textContent = "Excluded";
      return;
    }

    mountNode.textContent = mountIndex === 0 ? "/course" : `/course${mountIndex + 1}`;
    mountIndex += 1;
  });
}

export function updateCommandEditorState({
  elements,
  state,
  isPrairieLearnCommandRunning,
  isPrairieLearnStopping,
  hasReconnectOptions
}) {
  const mode = getCommandModeFromForm(elements);
  const connectionUnlocked = areDockerPrerequisitesPassing(state);
  const generatedCommandParts = buildStructuredCommandParts({
    courseDirectories: getCourseDirectoriesFromForm(elements),
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
      !connectionUnlocked ||
      !usingStructured ||
      elements.courseDirectoriesList.querySelectorAll(".course-directory-row").length >= MAX_COURSE_DIRECTORIES;
  }

  elements.courseDirectoriesList
    .querySelectorAll("[data-course-directory-input], [data-course-directory-exclude], [data-course-choose], [data-course-remove]")
    .forEach((control) => {
      control.disabled =
        !connectionUnlocked ||
        !usingStructured ||
        (control.matches("[data-course-remove]") &&
          elements.courseDirectoriesList.querySelectorAll(".course-directory-row").length <= 1);
    });

  elements.generatedCommandAccordion.classList.toggle("is-inactive", !usingStructured);
  elements.generatedCommandPreview.disabled = !connectionUnlocked || !usingStructured;
  elements.startCommandInput.disabled = !connectionUnlocked || !usingCustom;
  elements.refreshRunningContainersButton.disabled = !connectionUnlocked || !usingReconnect;
  elements.commandModeStructured.disabled = !connectionUnlocked;
  elements.commandModeCustom.disabled = !connectionUnlocked;
  elements.commandModeReconnect.disabled = !connectionUnlocked;
  if (elements.autoLoadFromDiskOnConnectInput) {
    elements.autoLoadFromDiskOnConnectInput.disabled = !connectionUnlocked;
  }
  elements.startConfiguredButton.textContent = getStartButtonLabelForMode(mode);

  syncStartButtonDisabledState({
    elements,
    state,
    isPrairieLearnCommandRunning,
    isPrairieLearnStopping,
    hasReconnectOptions
  });
}

export function renderConfig({
  elements,
  state,
  renderCourseDirectoryRows,
  updateCommandEditorStateArgs,
  setConfigOverlayOpen
}) {
  if (elements.baseUrlInput) {
    elements.baseUrlInput.value = state.config.baseUrl;
  }
  elements.commandModeStructured.checked = state.config.commandMode === "structured";
  elements.commandModeCustom.checked = state.config.commandMode === "custom";
  elements.commandModeReconnect.checked = state.config.commandMode === "reconnect";
  if (elements.autoLoadFromDiskOnConnectInput) {
    elements.autoLoadFromDiskOnConnectInput.checked = state.config.autoLoadFromDiskOnConnect !== false;
  }

  const courseDirectoryEntries = getCourseDirectoryEntriesFromConfig(state.config);
  renderCourseDirectoryRows(
    courseDirectoryEntries.length > 0
      ? courseDirectoryEntries.map((entry) => ({
          value: entry.directory,
          excluded: entry.excluded
        }))
      : [{ value: "", excluded: false }]
  );
  elements.startCommandInput.value = state.config.customStartCommand || state.config.startCommand || "";

  updateCommandEditorState(updateCommandEditorStateArgs);

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
}
