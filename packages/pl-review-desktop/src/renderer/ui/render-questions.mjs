import { createQuestionItemNode } from "../dom/templates.mjs";

export function renderQuestionList({ elements, session, onSelect }) {
  elements.questionList.innerHTML = "";

  if (!session || session.questions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "question-item-meta";
    empty.textContent = "No mapped questions yet. Use New Question or Capture Current View.";
    elements.questionList.append(empty);
    return;
  }

  session.questions.forEach((question, index) => {
    elements.questionList.append(
      createQuestionItemNode(elements.questionItemTemplate, {
        question,
        index,
        isActive: question.id === session.currentQuestionId,
        onSelect
      })
    );
  });
}

export function renderQuestionEditor({ elements, question, session, pdf, currentPdfPage }) {
  const disabled = !question;

  elements.questionTitleInput.disabled = disabled;
  elements.questionPathInput.disabled = disabled;
  elements.questionPdfPageInput.disabled = disabled;
  elements.questionTagsInput.disabled = disabled;
  elements.questionFlaggedInput.disabled = disabled;
  elements.questionNotesInput.disabled = disabled;
  elements.deleteQuestionButton.disabled = disabled;
  elements.captureViewButton.disabled = !session || !pdf;
  elements.applyPageButton.disabled = disabled;
  elements.previousQuestionButton.disabled = !session || session.questions.length < 2;
  elements.nextQuestionButton.disabled = !session || session.questions.length < 2;

  if (!question) {
    elements.questionTitleInput.value = "";
    elements.questionPathInput.value = "";
    elements.questionPdfPageInput.value = "";
    elements.questionTagsInput.value = "";
    elements.questionFlaggedInput.checked = false;
    elements.questionNotesInput.value = "";
    return;
  }

  elements.questionTitleInput.value = question.label || "";
  elements.questionPathInput.value = question.prairielearnPath || "";
  elements.questionPdfPageInput.value = String(question.pdfPage || currentPdfPage || 1);
  elements.questionTagsInput.value = question.tags || "";
  elements.questionFlaggedInput.checked = Boolean(question.flagged);
  elements.questionNotesInput.value = question.notes || "";
}
