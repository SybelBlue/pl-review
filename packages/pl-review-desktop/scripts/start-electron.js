const path = require("node:path");
const { spawn } = require("node:child_process");

const electronBinary = require("electron");
const forwardedArgs = process.argv.slice(2);
const devMode = forwardedArgs.includes("--dev");
const electronForwardedArgs = forwardedArgs.filter((arg) => arg !== "--dev");
const env = { ...process.env };

delete env.ELECTRON_RUN_AS_NODE;
if (devMode) {
  env.PL_REVIEW_DEV_WATCH = "1";
}

const child = spawn(electronBinary, electronForwardedArgs.length > 0 ? electronForwardedArgs : ["."], {
  cwd: path.resolve(__dirname, ".."),
  env,
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Electron exited with signal ${signal}`);
    process.exit(1);
    return;
  }

  process.exit(code ?? 0);
});
