export function bindQuestionInputs(app) {
  const { elements } = app;

  elements.questionTitleInput.addEventListener("input", (event) => {
    app.updateCurrentQuestion((question) => {
      question.label = event.target.value;
    }, { renderEditor: false });
  });

  elements.questionPathInput.addEventListener("input", (event) => {
    app.updateCurrentQuestion((question) => {
      question.prairielearnPath = event.target.value;
    }, { renderEditor: false });
  });

  elements.questionPdfPageInput.addEventListener("input", (event) => {
    const nextPage = Math.max(1, Number(event.target.value) || 1);
    app.updateCurrentQuestion((question) => {
      question.pdfPage = nextPage;
    }, { renderEditor: false });
    app.setPdfPage(nextPage);
  });

  elements.questionTagsInput.addEventListener("input", (event) => {
    app.updateCurrentQuestion((question) => {
      question.tags = event.target.value;
    }, { renderEditor: false });
  });

  elements.questionFlaggedInput.addEventListener("change", (event) => {
    app.updateCurrentQuestion((question) => {
      question.flagged = Boolean(event.target.checked);
    }, { renderEditor: false });
  });

  elements.questionNotesInput.addEventListener("input", (event) => {
    app.updateCurrentQuestion((question) => {
      question.notes = event.target.value;
    }, { renderEditor: false });
  });
}

export function bindCommandEditorSelection(app) {
  const { elements, windowRef } = app;
  const mappings = [
    { editor: elements.reconnectCommandEditor, radio: elements.commandModeReconnect },
    { editor: elements.structuredCommandEditor, radio: elements.commandModeStructured },
    { editor: elements.customCommandEditor, radio: elements.commandModeCustom }
  ];

  mappings.forEach(({ editor, radio }) => {
    if (!editor || !radio) {
      return;
    }

    editor.addEventListener("click", (event) => {
      const interactiveTarget = event.target.closest("input, textarea, button, summary, label, a");
      if (interactiveTarget && interactiveTarget !== radio) {
        return;
      }

      if (!radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new windowRef.Event("change", { bubbles: true }));
      }
    });
  });
}

export function bindWebviewEvents(app) {
  const { elements } = app;

  elements.webview.addEventListener("dom-ready", async () => {
    const url = elements.webview.getURL();
    app.setCurrentUrl(url);
    app.collapseConnectionPanelOnSuccessfulPlUrl(url);
    app.updateWebviewNavigationButtons();

    try {
      await app.ensurePrairieLearnWebviewAttached();
      await app.tryAutoLoadFromDiskOnConnect();
    } catch (error) {
      app.setPrairieLearnStatus(error?.message || app.plStatusText.viewFailed, "error");
    }
  });

  elements.webview.addEventListener("did-navigate", (event) => {
    app.setCurrentUrl(event.url);
    app.collapseConnectionPanelOnSuccessfulPlUrl(event.url);
    app.updateWebviewNavigationButtons();
  });

  elements.webview.addEventListener("did-navigate-in-page", (event) => {
    app.setCurrentUrl(event.url);
    app.collapseConnectionPanelOnSuccessfulPlUrl(event.url);
    app.updateWebviewNavigationButtons();
  });

  elements.webview.addEventListener("page-title-updated", (event) => {
    app.state.currentPrairieLearnTitle = event.title;
  });

  elements.webview.addEventListener("did-fail-load", () => {
    app.setPrairieLearnStatus(app.plStatusText.viewFailed, "error");
  });
}

export function bindEvents(app) {
  const { elements, state, windowRef, documentRef } = app;

  if (elements.reviewChooseManifestButton) {
    elements.reviewChooseManifestButton.addEventListener("click", app.selectReviewManifest);
  }
  if (elements.reviewReloadButton) {
    elements.reviewReloadButton.addEventListener("click", app.reloadReviewContext);
  }
  if (elements.reviewBankSelect) {
    elements.reviewBankSelect.addEventListener("change", (event) => app.selectReviewSequence(event.target.value));
  }
  if (elements.reviewDirectorySearchInput) {
    elements.reviewDirectorySearchInput.addEventListener("input", (event) => app.searchReviewQuestions(event.target.value));
  }
  if (elements.reviewSaveTagsButton) {
    elements.reviewSaveTagsButton.addEventListener("click", app.saveReviewTags);
  }
  if (elements.reviewEditTagsButton) {
    elements.reviewEditTagsButton.addEventListener("click", () => app.toggleReviewTagEditor(true));
  }
  if (elements.reviewTagCloseButton) {
    elements.reviewTagCloseButton.addEventListener("click", () => app.toggleReviewTagEditor(false));
  }
  if (elements.reviewTagCancelButton) {
    elements.reviewTagCancelButton.addEventListener("click", () => app.toggleReviewTagEditor(false));
  }
  if (elements.reviewTagPopover) {
    elements.reviewTagPopover.addEventListener("click", (event) => {
      if (event.target === elements.reviewTagPopover) {
        app.toggleReviewTagEditor(false);
      }
    });
  }
  if (elements.reviewApproveButton) {
    elements.reviewApproveButton.addEventListener("click", () => app.applyReviewAction("approve"));
  }
  if (elements.reviewApproveFormatButton) {
    elements.reviewApproveFormatButton.addEventListener("click", () => app.applyReviewAction("approve-format"));
  }
  if (elements.reviewWaitingButton) {
    elements.reviewWaitingButton.addEventListener("click", () => app.applyReviewAction("waiting"));
  }
  if (elements.reviewErroneousButton) {
    elements.reviewErroneousButton.addEventListener("click", () => app.applyReviewAction("erroneous"));
  }
  if (elements.reviewSkipButton) {
    elements.reviewSkipButton.addEventListener("click", () => app.applyReviewAction("skip"));
  }
  if (elements.reviewUndoButton) {
    elements.reviewUndoButton.addEventListener("click", app.undoReviewAction);
  }
  if (elements.reviewPlPrevButton) {
    elements.reviewPlPrevButton.addEventListener("click", () => app.navigateReviewSequence("previous"));
  }
  if (elements.reviewPlNextButton) {
    elements.reviewPlNextButton.addEventListener("click", () => app.navigateReviewSequence("next"));
  }

  elements.questionForm.addEventListener("submit", (event) => {
    event.preventDefault();
  });
  elements.choosePdfButton.addEventListener("click", app.choosePdf);
  if (elements.pdfPaneToggleButton) {
    elements.pdfPaneToggleButton.addEventListener("click", app.togglePdfPane);
  }
  if (elements.restartPlButton) {
    elements.restartPlButton.addEventListener("click", app.restartPrairieLearn);
  }
  elements.stopPlButton.addEventListener("click", app.handleStopPrairieLearn);
  elements.openBrowserButton.addEventListener("click", () => {
    const target = state.currentPrairieLearnUrl || state.config.baseUrl;
    windowRef.reviewApi.openExternal(target);
  });

  documentRef.querySelectorAll("a[data-external-link='true']").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const href = link.getAttribute("href");
      if (href) {
        windowRef.reviewApi.openExternal(href);
      }
    });
  });

  elements.plStatusToggle.addEventListener("click", () => {
    if (app.isPrairieLearnWaitingForConfiguration()) {
      return;
    }
    app.setConfigOverlayOpen(!state.isConfigOverlayOpen);
  });
  elements.plStatusToggle.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    if (app.isPrairieLearnWaitingForConfiguration()) {
      return;
    }
    app.setConfigOverlayOpen(!state.isConfigOverlayOpen);
  });

  if (elements.saveConfigButton) {
    elements.saveConfigButton.addEventListener("click", app.saveConfig);
  }
  elements.startConfiguredButton.addEventListener("click", async () => {
    const savedConfig = await app.saveConfig({ render: false });
    await app.startPrairieLearn(savedConfig || undefined);
  });

  if (elements.checkDockerInstalledButton) {
    elements.checkDockerInstalledButton.addEventListener("click", async () => {
      const installedOk = await app.runDockerInstalledCheck();
      if (!installedOk) {
        app.setDockerCheckState("daemon", "idle", "Waiting on step 1.");
      } else if (state.dockerChecks.daemon.status !== "success") {
        await app.runDockerDaemonCheck();
      }
      app.syncConfigStepOpenState();
      app.updateCommandEditorState();
    });
  }

  if (elements.checkDockerDaemonButton) {
    elements.checkDockerDaemonButton.addEventListener("click", async () => {
      const installedOk =
        state.dockerChecks.installed.status === "success" ? true : await app.runDockerInstalledCheck();
      if (!installedOk) {
        app.setDockerCheckState("daemon", "idle", "Waiting on step 1.");
      } else {
        await app.runDockerDaemonCheck();
      }
      app.syncConfigStepOpenState();
      app.updateCommandEditorState();
    });
  }

  if (elements.startDockerDaemonButton) {
    elements.startDockerDaemonButton.addEventListener("click", () => app.startDockerDaemonFromStep("start"));
  }
  if (elements.restartDockerDaemonButton) {
    elements.restartDockerDaemonButton.addEventListener("click", () => app.startDockerDaemonFromStep("restart"));
  }

  elements.commandModeStructured.addEventListener("change", app.updateCommandEditorState);
  elements.commandModeCustom.addEventListener("change", app.updateCommandEditorState);
  elements.commandModeReconnect.addEventListener("change", async () => {
    app.updateCommandEditorState();
    await app.refreshRunningContainers();
  });

  elements.addCourseDirectoryButton.addEventListener("click", () => {
    const currentValues = Array.from(elements.courseDirectoriesList.querySelectorAll("[data-course-directory-input]")).map(
      (entry) => entry.value
    );
    if (currentValues.length >= app.maxCourseDirectories) {
      return;
    }
    app.renderCourseDirectoryRows([...currentValues, ""]);
    app.updateCommandEditorState();
  });

  elements.startCommandInput.addEventListener("input", app.updateCommandEditorState);
  elements.refreshRunningContainersButton.addEventListener("click", app.refreshRunningContainers);

  elements.newQuestionButton.addEventListener("click", () => app.addQuestion(false));
  elements.captureViewButton.addEventListener("click", () => {
    if (!app.getCurrentQuestion()) {
      app.addQuestion(true);
      return;
    }
    app.captureCurrentViewIntoQuestion();
  });
  elements.deleteQuestionButton.addEventListener("click", app.deleteCurrentQuestion);
  elements.previousQuestionButton.addEventListener("click", () => app.moveBetweenQuestions("previous"));
  elements.nextQuestionButton.addEventListener("click", () => app.moveBetweenQuestions("next"));

  if (elements.previousPageButton) {
    elements.previousPageButton.addEventListener("click", () => app.setPdfPage(state.currentPdfPage - 1));
  }
  if (elements.nextPageButton) {
    elements.nextPageButton.addEventListener("click", () => app.setPdfPage(state.currentPdfPage + 1));
  }
  if (elements.pdfPageInput) {
    elements.pdfPageInput.addEventListener("change", (event) => app.setPdfPage(event.target.value));
  }
  elements.applyPageButton.addEventListener("click", app.applyCurrentPageToQuestion);

  elements.webviewBackButton.addEventListener("click", () => {
    if (elements.webview.canGoBack()) {
      elements.webview.goBack();
    }
  });
  elements.webviewForwardButton.addEventListener("click", () => {
    if (elements.webview.canGoForward()) {
      elements.webview.goForward();
    }
  });
  elements.webviewReloadButton.addEventListener("click", () => {
    elements.webview.reload();
  });

  elements.pdfDropZone.addEventListener("dragenter", (event) => {
    if (!app.hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    app.incrementPdfDropDragDepth();
    elements.pdfDropZone.classList.add("is-dragging");
  });

  elements.pdfDropZone.addEventListener("dragover", (event) => {
    if (!app.hasDraggedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    elements.pdfDropZone.classList.add("is-dragging");
  });

  elements.pdfDropZone.addEventListener("dragleave", (event) => {
    if (!event.dataTransfer?.types?.includes("Files")) {
      return;
    }

    app.decrementPdfDropDragDepth();
    if (app.getPdfDropDragDepth() === 0) {
      elements.pdfDropZone.classList.remove("is-dragging");
    }
  });

  elements.pdfDropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    app.resetPdfDropDragDepth();
    elements.pdfDropZone.classList.remove("is-dragging");

    const selected = await app.getDroppedPdfSelection(event);
    if (!selected?.path) {
      app.setPrairieLearnStatus(app.plStatusText.dropSinglePdf, "warning");
      return;
    }

    await app.loadPdfSelection(selected);
  });

  bindQuestionInputs(app);
  bindCommandEditorSelection(app);
  bindWebviewEvents(app);
  documentRef.addEventListener("keydown", (event) => {
    app.handleGlobalKeydown(event);
  });
  windowRef.addEventListener("beforeunload", app.saveSession);
}
