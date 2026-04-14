export function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function ansiCodesToClass(codes) {
  const classes = [];

  codes.forEach((rawCode) => {
    const code = Number(rawCode);
    if (Number.isNaN(code)) {
      return;
    }

    if (code === 0) {
      classes.length = 0;
      return;
    }

    if (code === 1) {
      classes.push("ansi-bold");
      return;
    }

    if (code === 2) {
      classes.push("ansi-dim");
      return;
    }

    if (code === 3) {
      classes.push("ansi-italic");
      return;
    }

    if (code === 4) {
      classes.push("ansi-underline");
      return;
    }

    if (code >= 30 && code <= 37) {
      classes.push(`ansi-fg-${code - 30}`);
      return;
    }

    if (code >= 90 && code <= 97) {
      classes.push(`ansi-fg-${code - 90 + 8}`);
    }
  });

  classes.push("ansi-fg-default");
  return classes.join(" ");
}

export function formatDockerLogHtml(text) {
  const source = String(text || "");
  const pattern = /\u001b\[([0-9;]*)m/g;
  let html = "";
  let lastIndex = 0;
  let activeClass = "ansi-fg-default";
  let match;

  while ((match = pattern.exec(source))) {
    const chunk = source.slice(lastIndex, match.index);
    const safeChunk = escapeHtml(chunk);
    html += activeClass ? `<span class="${activeClass}">${safeChunk}</span>` : safeChunk;
    activeClass = ansiCodesToClass(match[1].split(";").filter(Boolean));
    lastIndex = pattern.lastIndex;
  }

  const tail = source.slice(lastIndex);
  const safeTail = escapeHtml(tail);
  html += activeClass ? `<span class="${activeClass}">${safeTail}</span>` : safeTail;
  return html || '<span class="ansi-fg-default">No output yet.</span>';
}
