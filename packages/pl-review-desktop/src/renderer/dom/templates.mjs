export function createQuestionItemNode(template, { question, index, isActive, onSelect }) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.questionId = question.id;
  node.classList.toggle("is-active", isActive);
  node.querySelector(".question-item-title").textContent = question.label || `Question ${index + 1}`;

  const parts = [`Page ${question.pdfPage || "?"}`];
  if (question.flagged) {
    parts.push("Flagged");
  }
  if (question.tags) {
    parts.push(question.tags);
  }

  node.querySelector(".question-item-meta").textContent = parts.join(" • ");
  node.addEventListener("click", () => onSelect(question.id));
  return node;
}

export function createCourseDirectoryRow(template, { value = "", index = 0, total = 1, excluded = false }, handlers = {}) {
  const row = template.content.firstElementChild.cloneNode(true);
  const mountLabel = index === 0 ? "/course" : `/course${index + 1}`;
  row.dataset.courseRowIndex = String(index);
  row.draggable = true;

  const mountNode = row.querySelector(".course-directory-mount");
  const input = row.querySelector("[data-course-directory-input]");
  const excludeInput = row.querySelector("[data-course-directory-exclude]");
  const chooseButton = row.querySelector("[data-course-choose]");
  const removeButton = row.querySelector("[data-course-remove]");

  mountNode.textContent = excluded ? "Excluded" : mountLabel;
  input.value = value || "";
  if (excludeInput) {
    excludeInput.checked = !excluded;
  }
  row.classList.toggle("is-excluded", excluded);
  removeButton.disabled = total <= 1;

  if (handlers.onInput) {
    input.addEventListener("input", () => handlers.onInput({ row, input, chooseButton, removeButton }));
  }
  if (handlers.onExcludeChange && excludeInput) {
    excludeInput.addEventListener("change", () =>
      handlers.onExcludeChange({ row, input, chooseButton, removeButton, excludeInput })
    );
  }
  if (handlers.onChoose) {
    chooseButton.addEventListener("click", () => handlers.onChoose({ row, input, chooseButton, removeButton }));
  }
  if (handlers.onRemove) {
    removeButton.addEventListener("click", () => handlers.onRemove({ row, input, chooseButton, removeButton }));
  }
  if (handlers.onDragStart) {
    row.addEventListener("dragstart", (event) => handlers.onDragStart({ event, row }));
  }
  if (handlers.onDragEnd) {
    row.addEventListener("dragend", () => handlers.onDragEnd({ row }));
  }
  if (handlers.onDragOver) {
    row.addEventListener("dragover", (event) => handlers.onDragOver({ event, row }));
  }
  if (handlers.onDragLeave) {
    row.addEventListener("dragleave", () => handlers.onDragLeave({ row }));
  }
  if (handlers.onDrop) {
    row.addEventListener("drop", (event) => handlers.onDrop({ event, row }));
  }

  return row;
}
