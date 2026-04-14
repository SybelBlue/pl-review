import test from "node:test";
import assert from "node:assert/strict";
import {
  addQuestion,
  applyCurrentPageToQuestion,
  captureCurrentViewIntoQuestion,
  deleteCurrentQuestion,
  ensureCurrentQuestionSelection,
  getCurrentQuestion,
  moveBetweenQuestions,
  updateCurrentQuestion
} from "../../src/renderer/state/questions.mjs";

function createSession() {
  return {
    version: 1,
    pdfPath: "/tmp/test.pdf",
    currentPdfPage: 1,
    currentQuestionId: null,
    questions: []
  };
}

test("questions add, select, and update question data", () => {
  const session = createSession();
  const question = addQuestion(session, {
    fromCurrentView: true,
    currentPrairieLearnUrl: "http://127.0.0.1:3000/pl/course/1",
    currentPdfPage: 3,
    baseUrl: "http://127.0.0.1:3000",
    createId: () => "q1"
  });

  assert.equal(question.id, "q1");
  assert.equal(question.prairielearnPath, "/pl/course/1");
  assert.equal(getCurrentQuestion(session).id, "q1");

  updateCurrentQuestion(session, (current) => {
    current.label = "Updated";
  });
  assert.equal(getCurrentQuestion(session).label, "Updated");
});

test("questions move, capture current view, and apply current page", () => {
  const session = createSession();
  addQuestion(session, {
    fromCurrentView: false,
    currentPrairieLearnUrl: "",
    currentPdfPage: 2,
    baseUrl: "http://127.0.0.1:3000",
    createId: () => "q1"
  });
  addQuestion(session, {
    fromCurrentView: false,
    currentPrairieLearnUrl: "",
    currentPdfPage: 4,
    baseUrl: "http://127.0.0.1:3000",
    createId: () => "q2"
  });

  const moved = moveBetweenQuestions(session, "previous");
  assert.equal(moved.id, "q1");

  captureCurrentViewIntoQuestion(moved, {
    currentPdfPage: 7,
    currentPrairieLearnUrl: "http://127.0.0.1:3000/pl/question/2?mode=edit",
    baseUrl: "http://127.0.0.1:3000"
  });
  applyCurrentPageToQuestion(moved, 9);
  assert.equal(moved.pdfPage, 9);
  assert.equal(moved.prairielearnPath, "/pl/question/2?mode=edit");
});

test("questions delete and fall back to a surviving current question", () => {
  const session = createSession();
  addQuestion(session, {
    fromCurrentView: false,
    currentPrairieLearnUrl: "",
    currentPdfPage: 1,
    baseUrl: "http://127.0.0.1:3000",
    createId: () => "q1"
  });
  addQuestion(session, {
    fromCurrentView: false,
    currentPrairieLearnUrl: "",
    currentPdfPage: 2,
    baseUrl: "http://127.0.0.1:3000",
    createId: () => "q2"
  });

  deleteCurrentQuestion(session);
  assert.equal(session.currentQuestionId, "q1");

  session.currentQuestionId = null;
  ensureCurrentQuestionSelection(session);
  assert.equal(session.currentQuestionId, "q1");
});
