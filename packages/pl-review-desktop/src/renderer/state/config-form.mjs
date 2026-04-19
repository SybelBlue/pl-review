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

export function getCourseDirectoryEntriesFromConfig(config) {
  const directories = normalizeCourseDirectories(config?.courseDirectories);
  const exclusions = Array.isArray(config?.courseDirectoryExclusions) ? config.courseDirectoryExclusions.map(Boolean) : [];

  return directories.map((directory, index) => ({
    directory,
    excluded: Boolean(exclusions[index])
  }));
}

export function getCourseDirectoriesFromConfig(config) {
  const entries = getCourseDirectoryEntriesFromConfig(config);
  if (entries.length > 0) {
    return entries.map((entry) => entry.directory);
  }

  const legacyCourseDirectory = String(config?.courseDirectory || "").trim();
  return legacyCourseDirectory ? [legacyCourseDirectory] : [];
}

export function getCourseDirectoryEntriesFromForm(elements) {
  return Array.from(elements.courseDirectoriesList?.querySelectorAll(".course-directory-row") || []).map((row) => {
    const input = row.querySelector("[data-course-directory-input]");
    const excludeInput = row.querySelector("[data-course-directory-exclude]");

    return {
      directory: String(input?.value || "").trim(),
      excluded: !Boolean(excludeInput?.checked)
    };
  });
}

export function getCourseDirectoriesFromForm(elements) {
  return getCourseDirectoryEntriesFromForm(elements)
    .filter((entry) => entry.directory && !entry.excluded)
    .map((entry) => entry.directory)
    .slice(0, MAX_COURSE_DIRECTORIES);
}

export function getConfigFromForm({ elements, state, buildStructuredCommand }) {
  const commandMode = getCommandModeFromForm(elements);
  const courseDirectoryEntries = getCourseDirectoryEntriesFromForm(elements).filter((entry) => entry.directory);
  const courseDirectories = courseDirectoryEntries.map((entry) => entry.directory);
  const courseDirectoryExclusions = courseDirectoryEntries.map((entry) => entry.excluded);
  const courseDirectory = courseDirectoryEntries.find((entry) => !entry.excluded)?.directory || "";
  const jobsDirectory = String(state.config.jobsDirectory || "").trim();
  const customStartCommand = elements.startCommandInput.value.trim();
  const startCommand =
    commandMode === "custom"
      ? customStartCommand
      : commandMode === "structured"
        ? buildStructuredCommand({ courseDirectories, courseDirectoryExclusions, jobsDirectory })
        : "";

  return {
    ...state.config,
    baseUrl: elements.baseUrlInput?.value.trim() || state.config.baseUrl || "http://127.0.0.1:3000",
    commandMode,
    autoLoadFromDiskOnConnect: elements.autoLoadFromDiskOnConnectInput?.checked !== false,
    courseDirectory,
    courseDirectories,
    courseDirectoryExclusions,
    jobsDirectory,
    customStartCommand,
    startCommand
  };
}
