export const MAX_COURSE_DIRECTORIES = 10;

export function getCommandModeFromForm(elements) {
  if (elements.commandModeReconnect?.checked) {
    return "reconnect";
  }
  if (elements.commandModeCustom?.checked) {
    return "custom";
  }
  return "structured";
}

export function getStartButtonLabelForMode(mode) {
  if (mode === "reconnect") {
    return "Save + Reconnect";
  }
  return "Save + Start";
}

export function normalizeCourseDirectories(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, MAX_COURSE_DIRECTORIES);
}

export function getCourseDirectoriesFromConfig(config) {
  const directories = normalizeCourseDirectories(config?.courseDirectories);
  if (directories.length > 0) {
    return directories;
  }

  const legacyCourseDirectory = String(config?.courseDirectory || "").trim();
  return legacyCourseDirectory ? [legacyCourseDirectory] : [];
}

export function getCourseDirectoriesFromForm(elements) {
  return normalizeCourseDirectories(
    Array.from(elements.courseDirectoriesList?.querySelectorAll("[data-course-directory-input]") || []).map(
      (entry) => entry.value
    )
  );
}

export function getConfigFromForm({ elements, state, buildStructuredCommand }) {
  const commandMode = getCommandModeFromForm(elements);
  const courseDirectories = getCourseDirectoriesFromForm(elements);
  const courseDirectory = courseDirectories[0] || "";
  const jobsDirectory = String(state.config.jobsDirectory || "").trim();
  const customStartCommand = elements.startCommandInput.value.trim();
  const startCommand =
    commandMode === "custom"
      ? customStartCommand
      : commandMode === "structured"
        ? buildStructuredCommand({ courseDirectories, jobsDirectory })
        : "";

  return {
    ...state.config,
    baseUrl: elements.baseUrlInput?.value.trim() || state.config.baseUrl || "http://127.0.0.1:3000",
    commandMode,
    autoLoadFromDiskOnConnect: elements.autoLoadFromDiskOnConnectInput?.checked !== false,
    courseDirectory,
    courseDirectories,
    jobsDirectory,
    customStartCommand,
    startCommand
  };
}
