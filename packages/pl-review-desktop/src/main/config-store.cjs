const SETTINGS_FILE = "settings.json";

const DEFAULT_CONFIG = {
  baseUrl: "http://127.0.0.1:3000",
  commandMode: "structured",
  autoLoadFromDiskOnConnect: true,
  courseDirectory: "",
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
};

function normalizeConfig(config = {}) {
  const hasLegacyStartCommand =
    typeof config.startCommand === "string" &&
    config.startCommand.trim() &&
    typeof config.commandMode !== "string" &&
    typeof config.customStartCommand !== "string";

  return {
    ...DEFAULT_CONFIG,
    ...config,
    autoLoadFromDiskOnConnect:
      typeof config.autoLoadFromDiskOnConnect === "boolean"
        ? config.autoLoadFromDiskOnConnect
        : DEFAULT_CONFIG.autoLoadFromDiskOnConnect,
    reviewManifestPath: typeof config.reviewManifestPath === "string" ? config.reviewManifestPath : DEFAULT_CONFIG.reviewManifestPath,
    reviewSourceType: ["sidecar", "manifest"].includes(config.reviewSourceType)
      ? config.reviewSourceType
      : DEFAULT_CONFIG.reviewSourceType,
    reviewSequenceId: typeof config.reviewSequenceId === "string" ? config.reviewSequenceId : DEFAULT_CONFIG.reviewSequenceId,
    reviewBankSlug: typeof config.reviewBankSlug === "string" ? config.reviewBankSlug : DEFAULT_CONFIG.reviewBankSlug,
    reviewStateRoot: typeof config.reviewStateRoot === "string" ? config.reviewStateRoot : DEFAULT_CONFIG.reviewStateRoot,
    reviewReviewedRoot:
      typeof config.reviewReviewedRoot === "string" ? config.reviewReviewedRoot : DEFAULT_CONFIG.reviewReviewedRoot,
    reviewErroneousRoot:
      typeof config.reviewErroneousRoot === "string" ? config.reviewErroneousRoot : DEFAULT_CONFIG.reviewErroneousRoot,
    reviewWaitingRoot:
      typeof config.reviewWaitingRoot === "string" ? config.reviewWaitingRoot : DEFAULT_CONFIG.reviewWaitingRoot,
    reviewErroneousAssessmentSlug:
      typeof config.reviewErroneousAssessmentSlug === "string"
        ? config.reviewErroneousAssessmentSlug
        : DEFAULT_CONFIG.reviewErroneousAssessmentSlug,
    reviewErroneousAssessmentTitle:
      typeof config.reviewErroneousAssessmentTitle === "string"
        ? config.reviewErroneousAssessmentTitle
        : DEFAULT_CONFIG.reviewErroneousAssessmentTitle,
    reviewErroneousAssessmentNumber:
      typeof config.reviewErroneousAssessmentNumber === "string"
        ? config.reviewErroneousAssessmentNumber
        : DEFAULT_CONFIG.reviewErroneousAssessmentNumber,
    reviewWaitingAssessmentSlug:
      typeof config.reviewWaitingAssessmentSlug === "string"
        ? config.reviewWaitingAssessmentSlug
        : DEFAULT_CONFIG.reviewWaitingAssessmentSlug,
    reviewWaitingAssessmentTitle:
      typeof config.reviewWaitingAssessmentTitle === "string"
        ? config.reviewWaitingAssessmentTitle
        : DEFAULT_CONFIG.reviewWaitingAssessmentTitle,
    reviewWaitingAssessmentNumber:
      typeof config.reviewWaitingAssessmentNumber === "string"
        ? config.reviewWaitingAssessmentNumber
        : DEFAULT_CONFIG.reviewWaitingAssessmentNumber,
    commandMode: hasLegacyStartCommand
      ? "custom"
      : ["structured", "custom", "reconnect"].includes(config.commandMode)
        ? config.commandMode
        : DEFAULT_CONFIG.commandMode,
    customStartCommand: hasLegacyStartCommand ? config.startCommand : config.customStartCommand || ""
  };
}

function createConfigStore({ app, fs, path, settingsFile = SETTINGS_FILE }) {
  function getSettingsPath() {
    return path.join(app.getPath("userData"), settingsFile);
  }

  async function readConfig() {
    try {
      const raw = await fs.readFile(getSettingsPath(), "utf8");
      return normalizeConfig(JSON.parse(raw));
    } catch (error) {
      return { ...DEFAULT_CONFIG };
    }
  }

  async function writeConfig(config) {
    const normalized = normalizeConfig(config);
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    await fs.writeFile(getSettingsPath(), JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  }

  return {
    getSettingsPath,
    readConfig,
    writeConfig
  };
}

module.exports = {
  SETTINGS_FILE,
  DEFAULT_CONFIG,
  normalizeConfig,
  createConfigStore
};
