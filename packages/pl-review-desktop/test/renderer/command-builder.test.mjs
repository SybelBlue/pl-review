import test from "node:test";
import assert from "node:assert/strict";
import { buildStructuredCommand, buildStructuredCommandParts, formatCommandPreview, shellQuote } from "../../src/renderer/services/command-builder.mjs";

test("command-builder quotes paths and builds multi-course structured commands", () => {
  assert.equal(shellQuote("/tmp/it's fine"), `'/tmp/it'\\''s fine'`);

  const parts = buildStructuredCommandParts({
    courseDirectories: ["/repo/course-a", "/repo/course b"],
    jobsDirectory: "/tmp/jobs"
  });

  assert.match(parts.join(" "), /\/course2/);
  assert.match(parts.join(" "), /HOST_JOBS_DIR/);
});

test("command-builder formats preview and structured command text", () => {
  const command = buildStructuredCommand({
    courseDirectories: ["/repo/course-a"],
    jobsDirectory: ""
  });
  assert.match(command, /docker run --rm/);
  assert.match(command, /<auto-temp-pl_ag_jobs>/);

  const preview = formatCommandPreview(["docker run", "-p 3000:3000"]);
  assert.match(preview, /\\$/m);
});
