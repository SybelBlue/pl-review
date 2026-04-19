export function renderPdf({
  elements,
  pdf,
  currentPdfPage,
  buildPdfUrl,
  setIndicatorState,
  isPdfPaneCollapsed
}) {
  if (elements.workspace) {
    elements.workspace.classList.toggle("is-pdf-empty", !pdf);
    elements.workspace.classList.toggle("is-pdf-collapsed", Boolean(isPdfPaneCollapsed));
  }

  if (elements.pdfPaneToggleButton) {
    const collapsed = Boolean(isPdfPaneCollapsed);
    const label = collapsed ? "Show PDF section" : "Collapse PDF section";
    elements.pdfPaneToggleButton.title = label;
    elements.pdfPaneToggleButton.setAttribute("aria-label", label);
    elements.pdfPaneToggleButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  if (!pdf) {
    elements.pdfFrame.src = "about:blank";
    elements.pdfFrame.hidden = true;
    elements.pdfOverlay.hidden = false;
    elements.pdfDropZone.classList.remove("is-dragging");
    if (elements.pdfName) {
      elements.pdfName.textContent = "No file selected";
      elements.pdfName.title = "No file selected";
    }
    setIndicatorState(elements.pdfIndicator, "idle");
    if (elements.pdfColumnBody) {
      elements.pdfColumnBody.hidden = Boolean(isPdfPaneCollapsed);
    }
    return;
  }

  if (elements.pdfColumnBody) {
    elements.pdfColumnBody.hidden = Boolean(isPdfPaneCollapsed);
  }
  elements.pdfOverlay.hidden = true;
  elements.pdfFrame.hidden = false;
  elements.pdfDropZone.classList.remove("is-dragging");
  if (elements.pdfName) {
    elements.pdfName.textContent = pdf.name;
    elements.pdfName.title = pdf.path;
  }
  setIndicatorState(elements.pdfIndicator, "ready");
  if (elements.pdfPageInput) {
    elements.pdfPageInput.value = String(currentPdfPage);
  }
  elements.pdfFrame.src = buildPdfUrl(pdf.path, currentPdfPage);
}
