const path = require("node:path");
const { spawn } = require("node:child_process");

const electronBinary = require("electron");
const forwardedArgs = process.argv.slice(2);
const electronArgs = forwardedArgs.length > 0 ? forwardedArgs : ["."];
const env = { ...process.env };

delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, electronArgs, {
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
