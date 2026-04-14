import { getRelativePrairieLearnPath } from "../services/prairielearn-url.mjs";

export function getCurrentQuestion(session) {
  if (!session?.currentQuestionId) {
    return null;
  }

  return session.questions.find((question) => question.id === session.currentQuestionId) || null;
}

export function getQuestionIndex(session, questionId) {
  return session?.questions?.findIndex((question) => question.id === questionId) ?? -1;
}

export function ensureCurrentQuestionSelection(session) {
  if (!session) {
    return null;
  }

  if (!session.currentQuestionId && session.questions.length > 0) {
    session.currentQuestionId = session.questions[0].id;
  }

  return session.currentQuestionId;
}

export function setCurrentQuestion(session, questionId) {
  if (!session) {
    return null;
  }

  session.currentQuestionId = questionId;
  return getCurrentQuestion(session);
}

export function createQuestionFromCurrentView({
  session,
  currentPrairieLearnUrl,
  currentPdfPage,
  baseUrl,
  createId = () => crypto.randomUUID()
}) {
  const questionNumber = (session?.questions.length || 0) + 1;
  return {
    id: createId(),
    label: `Question ${questionNumber}`,
    prairielearnPath: getRelativePrairieLearnPath(currentPrairieLearnUrl, baseUrl),
    pdfPage: currentPdfPage,
    tags: "",
    notes: "",
    flagged: false
  };
}

export function updateCurrentQuestion(session, mutator) {
  const question = getCurrentQuestion(session);
  if (!question) {
    return null;
  }

  mutator(question);
  return question;
}

export function addQuestion(session, options) {
  if (!session) {
    return null;
  }

  const question = createQuestionFromCurrentView({
    session,
    currentPrairieLearnUrl: options.currentPrairieLearnUrl,
    currentPdfPage: options.currentPdfPage,
    baseUrl: options.baseUrl,
    createId: options.createId
  });

  if (!options.fromCurrentView) {
    question.prairielearnPath = "";
  }

  session.questions.push(question);
  session.currentQuestionId = question.id;
  return question;
}

export function deleteCurrentQuestion(session) {
  if (!session?.currentQuestionId) {
    return null;
  }

  const index = getQuestionIndex(session, session.currentQuestionId);
  if (index === -1) {
    return null;
  }

  session.questions.splice(index, 1);
  const nextQuestion = session.questions[index] || session.questions[index - 1] || null;
  session.currentQuestionId = nextQuestion?.id || null;
  return nextQuestion;
}

export function moveBetweenQuestions(session, direction) {
  if (!session || session.questions.length < 2) {
    return getCurrentQuestion(session);
  }

  const currentIndex = Math.max(0, getQuestionIndex(session, session.currentQuestionId));
  const nextIndex =
    direction === "next"
      ? (currentIndex + 1) % session.questions.length
      : (currentIndex - 1 + session.questions.length) % session.questions.length;

  session.currentQuestionId = session.questions[nextIndex].id;
  return session.questions[nextIndex];
}

export function applyCurrentPageToQuestion(question, currentPdfPage) {
  if (!question) {
    return null;
  }

  question.pdfPage = currentPdfPage;
  return question;
}

export function captureCurrentViewIntoQuestion(question, { currentPdfPage, currentPrairieLearnUrl, baseUrl }) {
  if (!question) {
    return null;
  }

  question.pdfPage = currentPdfPage;
  question.prairielearnPath = getRelativePrairieLearnPath(currentPrairieLearnUrl, baseUrl);
  return question;
}
