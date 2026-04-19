import { getCourseDirectoryEntriesFromConfig } from "../state/config-form.mjs";

export function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
}

export function buildStructuredCommandParts(config) {
  const courseDirectories = getCourseDirectoryEntriesFromConfig(config).filter((entry) => entry.directory && !entry.excluded);
  const jobsDirectory = String(config?.jobsDirectory || "").trim();
  if (courseDirectories.length === 0) {
    return [];
  }

  const jobsDirectoryValue = jobsDirectory || "<auto-temp-pl_ag_jobs>";
  const courseMountParts = courseDirectories.map((entry, index) => {
    const mountPath = index === 0 ? "/course" : `/course${index + 1}`;
    return `-v ${shellQuote(entry.directory)}:${mountPath}`;
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

export function buildStructuredCommand(config) {
  const parts = buildStructuredCommandParts(config);
  return parts.length > 0 ? parts.join(" ") : "";
}

export function formatCommandPreview(parts) {
  if (!parts || parts.length === 0) {
    return "Add at least one course directory to generate the Docker command.";
  }

  return parts.map((part, index) => (index < parts.length - 1 ? `${part} \\` : part)).join("\n");
}
