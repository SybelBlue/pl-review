export function renderPdf({ elements, pdf, currentPdfPage, buildPdfUrl, setIndicatorState }) {
  if (elements.workspace) {
    elements.workspace.classList.toggle("is-pdf-empty", !pdf);
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
    return;
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
