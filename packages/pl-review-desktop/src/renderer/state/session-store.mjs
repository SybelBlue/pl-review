export const sessionPrefix = "pl-review-session:";

export function createEmptySession(pdfPath) {
  return {
    version: 1,
    pdfPath,
    currentPdfPage: 1,
    currentQuestionId: null,
    questions: []
  };
}

export function getSessionKey(pdfPath) {
  return `${sessionPrefix}${pdfPath}`;
}

export function loadSession(storage, pdfPath) {
  const raw = storage.getItem(getSessionKey(pdfPath));
  if (!raw) {
    return createEmptySession(pdfPath);
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      ...createEmptySession(pdfPath),
      ...parsed,
      pdfPath,
      questions: Array.isArray(parsed.questions) ? parsed.questions : []
    };
  } catch (error) {
    return createEmptySession(pdfPath);
  }
}

export function saveSession(storage, pdf, session, currentPdfPage) {
  if (!session || !pdf) {
    return;
  }

  session.currentPdfPage = currentPdfPage;
  storage.setItem(getSessionKey(pdf.path), JSON.stringify(session));
}
