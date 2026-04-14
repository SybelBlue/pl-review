const SETTINGS_FILE = "settings.json";

const DEFAULT_CONFIG = {
  baseUrl: "http://127.0.0.1:3000",
  commandMode: "structured",
  autoLoadFromDiskOnConnect: true,
  courseDirectory: "",
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
