const { prairieLearnSelectors } = require('./selectors');

async function waitForPageReady(page, { logger, reason = 'page action', readySelectors = [], timeoutMs = 15000 } = {}) {
  const mergedReadySelectors = uniqueSelectors([
    ...readySelectors,
    ...prairieLearnSelectors.ready,
  ]);

  logger.debug(`Waiting for page readiness after ${reason}`);

  await page.waitForFunction(
    () => document.readyState === 'interactive' || document.readyState === 'complete',
    { timeout: timeoutMs }
  );

  await waitForBusyToClear(page, prairieLearnSelectors.busy, {
    logger,
    timeoutMs,
  });

  if (mergedReadySelectors.length > 0) {
    try {
      await page.waitForFunction(
        (selectors) => {
          return selectors.some((selector) => {
            const elements = safeQuerySelectorAll(selector);
            return elements.some((element) => isVisibleElement(element));
          });

          function safeQuerySelectorAll(selector) {
            try {
              return Array.from(document.querySelectorAll(selector));
            } catch (error) {
              return [];
            }
          }

          function isVisibleElement(element) {
            const style = window.getComputedStyle(element);

            if (
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              style.visibility === 'collapse' ||
              Number(style.opacity) === 0
            ) {
              return false;
            }

            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }
        },
        { timeout: timeoutMs },
        mergedReadySelectors
      );
    } catch (error) {
      logger.warn(`Ready selector wait timed out after ${reason}; continuing with document-ready fallback`);
    }
  }

  if (typeof page.waitForNetworkIdle === 'function') {
    try {
      await page.waitForNetworkIdle({
        idleTime: 400,
        timeout: 2000,
      });
    } catch (error) {
      logger.debug('Network idle wait skipped');
    }
  }
}

async function waitForBusyToClear(page, busySelectors, { logger, timeoutMs }) {
  try {
    await page.waitForFunction(
      (selectors) => {
        return selectors.every((selector) => {
          const elements = safeQuerySelectorAll(selector);
          return elements.every((element) => !isVisibleElement(element));
        });

        function safeQuerySelectorAll(selector) {
          try {
            return Array.from(document.querySelectorAll(selector));
          } catch (error) {
            return [];
          }
        }

        function isVisibleElement(element) {
          const style = window.getComputedStyle(element);

          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.visibility === 'collapse' ||
            Number(style.opacity) === 0
          ) {
            return false;
          }

          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }
      },
      { timeout: timeoutMs },
      busySelectors
    );
  } catch (error) {
    logger.debug('Busy-state selectors did not fully clear before timeout');
  }
}

async function clickNavigation(page, direction, { logger, readySelectors = [] } = {}) {
  const descriptor = prairieLearnSelectors.navigation[direction];

  if (!descriptor) {
    throw new Error(`Unsupported navigation direction: ${direction}`);
  }

  const target = await findNavigationTarget(page, descriptor);

  if (!target) {
    throw new Error(
      `Could not find a visible "${direction}" control. Update src/prairielearn/selectors.js for your PrairieLearn DOM.`
    );
  }

  const beforeUrl = page.url();
  const beforeTitle = await safeGetTitle(page);

  logger.info(`Clicking ${direction} control (${target.strategy}: ${target.label})`);

  const navigationWait = page.waitForNavigation({
    timeout: 10000,
    waitUntil: 'domcontentloaded',
  }).catch(() => null);

  const urlChangeWait = page.waitForFunction(
    (currentUrl) => window.location.href !== currentUrl,
    { timeout: 10000 },
    beforeUrl
  ).catch(() => null);

  await scrollIntoView(target.handle);

  try {
    await target.handle.click();
  } catch (error) {
    logger.warn(`Puppeteer click failed for ${direction}; retrying with DOM click`);
    await target.handle.evaluate((element) => element.click());
  }

  await Promise.race([
    navigationWait,
    urlChangeWait,
    page.waitForFunction(
      (currentUrl, currentTitle) =>
        window.location.href !== currentUrl || document.title !== currentTitle,
      { timeout: 3000 },
      beforeUrl,
      beforeTitle
    ).catch(() => null),
  ]);

  await waitForPageReady(page, {
    logger,
    reason: `${direction} navigation`,
    readySelectors,
    timeoutMs: 20000,
  });

  return {
    action: direction,
    selectorStrategy: target.strategy,
  };
}

async function followLoadFromDisk(page, { logger, readySelectors = [] } = {}) {
  const targetUrl = buildLoadFromDiskUrl(page.url());
  logger.info(`Navigating to load-from-disk endpoint (${targetUrl})`);

  await page.goto(targetUrl, {
    timeout: 30000,
    waitUntil: 'domcontentloaded',
  });

  await waitForPageReady(page, {
    logger,
    reason: 'reload-disk',
    readySelectors,
    timeoutMs: 20000,
  });

  await waitForLoadFromDiskSuccess(page, {
    logger,
    timeoutMs: 30000,
  });

  logger.info('Load-from-disk succeeded; returning via browser history');

  const navigatedBack = await goBackInPageHistory(page);

  if (!navigatedBack) {
    throw new Error('Load-from-disk succeeded, but browser history.back() did not return to the previous page.');
  }

  await waitForPageReady(page, {
    logger,
    reason: 'reload-disk return',
    readySelectors,
    timeoutMs: 20000,
  });

  return {
    action: 'reload-disk',
    selectorStrategy: 'direct-path + history.back()',
  };
}

async function indexQuestionsForCourse(page, courseNumber, { logger, readySelectors = [] } = {}) {
  if (!Number.isInteger(courseNumber) || courseNumber < 1) {
    throw new Error(`Invalid course number: ${courseNumber}`);
  }

  const targetUrl = buildCourseQuestionsUrl(page.url(), courseNumber);
  logger.info(`Navigating to course questions index (${targetUrl})`);

  await page.goto(targetUrl, {
    timeout: 30000,
    waitUntil: 'domcontentloaded',
  });

  await waitForPageReady(page, {
    logger,
    reason: 'index-questions',
    readySelectors: [
      ...readySelectors,
      ...prairieLearnSelectors.questionsIndex.tableSelectors,
    ],
    timeoutMs: 20000,
  });

  await waitForQuestionsIndexTable(page, { logger, timeoutMs: 20000 });

  const embeddedQuestions = await extractQuestionsIndexFromEmbeddedData(page, {
    logger,
    courseNumber,
  });

  if (embeddedQuestions) {
    return {
      action: 'index-questions',
      courseNumber,
      count: embeddedQuestions.length,
      questions: embeddedQuestions,
      selectorStrategy: 'questions-table-data',
      title: await safeGetTitle(page),
      url: page.url(),
    };
  }

  logger.debug('Embedded questions table data was unavailable; falling back to the rendered table');

  await selectQuestionsIndexPageSize(page, {
    logger,
    pageSizeLabel: 'All',
    timeoutMs: 20000,
  });

  await waitForQuestionsIndexTable(page, { logger, timeoutMs: 20000 });

  const questions = await page.evaluate((descriptor, fieldHints) => {
    return extractIndexedTableRows(descriptor, fieldHints);

    function extractIndexedTableRows(tableDescriptor, tableFieldHints = {}) {
      const headerFields = Array.from(document.querySelectorAll(tableDescriptor.headerSelector))
        .map((header, index) => {
          const dataField = header.getAttribute('data-field');
          if (dataField) {
            return dataField;
          }

          const text = normalizeText(header.innerText || header.textContent || '');
          return text ? slugifyHeader(text) : `column_${index}`;
        });

      const rows = Array.from(document.querySelectorAll(tableDescriptor.rowSelector));

      return rows.map((row) => {
        const cells = Array.from(row.querySelectorAll('td'));
        const record = {};

        headerFields.forEach((field, index) => {
          record[field] = extractCellValue(cells[index]);
        });

        const qidField = pickFieldName(record, ['qid', tableFieldHints.qidFieldName]);
        const titleField = pickFieldName(record, ['title', tableFieldHints.titleFieldName]);
        const topicField = pickFieldName(record, ['topic', tableFieldHints.topicFieldName]);
        const tagsField = pickFieldName(record, ['tags', tableFieldHints.tagsFieldName]);
        const qidCell = cells[headerFields.indexOf(qidField)] || cells[0] || null;
        const tagsCell = cells[headerFields.indexOf(tagsField)] || null;
        const linkElement = qidCell ? qidCell.querySelector(tableDescriptor.linkSelector || 'a[href]') : row.querySelector('a[href]');

        return {
          qid: normalizeText(record[qidField]),
          title: normalizeText(record[titleField]),
          topic: normalizeText(record[topicField]),
          tags: extractTags(tagsCell, record[tagsField]),
          link: linkElement ? linkElement.href || linkElement.getAttribute('href') : null,
          raw: record,
        };
      }).filter((row) => row.qid || row.title || row.link);

      function pickFieldName(record, candidates) {
        return candidates.find((candidate) => candidate && Object.prototype.hasOwnProperty.call(record, candidate)) || Object.keys(record)[0] || '';
      }

      function extractCellValue(cell) {
        if (!cell) {
          return '';
        }

        return normalizeText(cell.innerText || cell.textContent || '');
      }

      function extractTags(cell, fallbackValue) {
        if (!cell) {
          return normalizeText(fallbackValue)
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean);
        }

        const badges = Array.from(cell.querySelectorAll('.badge'));
        if (badges.length > 0) {
          return badges
            .map((badge) => normalizeText(badge.innerText || badge.textContent || ''))
            .filter(Boolean);
        }

        return normalizeText(cell.innerText || cell.textContent || '')
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean);
      }

      function slugifyHeader(value) {
        return normalizeText(value)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
      }

      function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
      }
    }
  }, prairieLearnSelectors.questionsIndex, {
    tagsFieldName: 'tags',
    titleFieldName: 'title',
    topicFieldName: 'topic',
    qidFieldName: 'qid',
  });

  return {
    action: 'index-questions',
    courseNumber,
    count: questions.length,
    questions,
    selectorStrategy: 'questions-admin-table',
    title: await safeGetTitle(page),
    url: page.url(),
  };
}

async function indexQuestionsForCurrentAssessment(page, { logger, readySelectors = [] } = {}) {
  const match = getAssessmentQuestionsOverviewMatch(page.url());

  if (!match) {
    throw new Error(
      'index-assessment can only run on an assessment questions overview page like /pl/course_instance/<id>/instructor/assessment/<id>/questions.'
    );
  }

  await waitForPageReady(page, {
    logger,
    reason: 'index-assessment',
    readySelectors: [
      ...readySelectors,
      ...prairieLearnSelectors.assessmentQuestionsIndex.tableSelectors,
    ],
    timeoutMs: 20000,
  });

  await waitForAssessmentQuestionsIndexTable(page, {
    logger,
    timeoutMs: 20000,
  });

  const questions = await page.evaluate((descriptor) => {
    const rows = Array.from(document.querySelectorAll(descriptor.rowSelector));
    const seenLinks = new Set();

    return rows.map((row) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      if (cells.length === 0) {
        return null;
      }

      const links = Array.from(row.querySelectorAll(descriptor.linkSelector || 'a[href]'));
      const linkElement = links.find((link) => {
        const href = link.href || link.getAttribute('href') || '';
        return /\/question\/\d+\/preview/.test(href) || /\/question\//.test(href);
      }) || links[0] || null;

      if (!linkElement) {
        return null;
      }

      const link = linkElement.href || linkElement.getAttribute('href');
      if (!link || seenLinks.has(link)) {
        return null;
      }
      seenLinks.add(link);

      const texts = cells
        .map((cell) => normalizeText(cell.innerText || cell.textContent || ''))
        .filter(Boolean);

      const badgeTexts = Array.from(row.querySelectorAll('.badge'))
        .map((badge) => normalizeText(badge.innerText || badge.textContent || ''))
        .filter(Boolean);

      const qid = normalizeText(linkElement.innerText || linkElement.textContent || texts[0] || '');
      const title = pickTitle(texts, qid);
      const topic = badgeTexts[0] || '';
      const tags = badgeTexts.slice(topic ? 1 : 0);

      return {
        qid,
        title,
        topic,
        tags,
        link,
        raw: {
          cells: texts,
          badges: badgeTexts,
        },
      };

      function pickTitle(values, currentQid) {
        const candidate = values.find((value) => value && value !== currentQid);
        return candidate || '';
      }

      function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
      }
    }).filter(Boolean);
  }, prairieLearnSelectors.assessmentQuestionsIndex);

  return {
    action: 'index-assessment',
    assessmentId: match.assessmentId,
    courseInstanceId: match.courseInstanceId,
    count: questions.length,
    questions,
    selectorStrategy: 'assessment-questions-table',
    title: await safeGetTitle(page),
    url: page.url(),
  };
}

async function findNavigationTarget(page, descriptor) {
  for (const selector of descriptor.selectors) {
    const handle = await page.$(selector);

    if (handle && await isVisible(handle) && !await isDisabled(handle)) {
      return {
        handle,
        label: selector,
        strategy: 'selector',
      };
    }

    if (handle) {
      await handle.dispose();
    }
  }

  const regexes = descriptor.textPatterns.map((pattern) => ({
    flags: pattern.flags,
    source: pattern.source,
  }));

  const handle = await page.evaluateHandle((serializedPatterns) => {
    const patterns = serializedPatterns.map(
      ({ source, flags }) => new RegExp(source, flags)
    );

    const candidates = Array.from(document.querySelectorAll(
      'a, button, [role="button"], input[type="button"], input[type="submit"]'
    ));

    return candidates.find((element) => {
      if (!isCandidateVisible(element) || isCandidateDisabled(element)) {
        return false;
      }

      const tokens = [
        element.innerText,
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('value'),
        element.getAttribute('rel'),
      ]
        .filter(Boolean)
        .map((value) => value.trim());

      return tokens.some((token) => patterns.some((pattern) => pattern.test(token)));
    }) || null;

    function isCandidateDisabled(element) {
      return Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true';
    }

    function isCandidateVisible(element) {
      const style = window.getComputedStyle(element);

      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        Number(style.opacity) === 0
      ) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
  }, regexes);

  const element = handle.asElement();

  if (!element) {
    await handle.dispose();
    return null;
  }

  return {
    handle: element,
    label: 'text-pattern',
    strategy: 'text',
  };
}

async function getPageSnapshot(page) {
  return {
    title: await safeGetTitle(page),
    url: page.url(),
  };
}

async function waitForLoadFromDiskSuccess(page, { logger, timeoutMs = 30000 } = {}) {
  const { successBadgeSelectors, successTextPattern } = prairieLearnSelectors.loadFromDisk;
  const serializedPattern = {
    flags: successTextPattern.flags,
    source: successTextPattern.source,
  };

  logger.debug('Waiting for load-from-disk success indicator');

  await page.waitForFunction(
    (selectors, pattern) => {
      const regex = new RegExp(pattern.source, pattern.flags);

      return selectors.some((selector) => {
        let elements;

        try {
          elements = Array.from(document.querySelectorAll(selector));
        } catch (error) {
          return false;
        }

        return elements.some((element) => {
          const text = (element.innerText || element.textContent || '').trim();
          if (!regex.test(text)) {
            return false;
          }

          const style = window.getComputedStyle(element);
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.visibility === 'collapse' ||
            Number(style.opacity) === 0
          ) {
            return false;
          }

          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      });
    },
    { timeout: timeoutMs },
    successBadgeSelectors,
    serializedPattern
  );
}

async function waitForQuestionsIndexTable(page, { logger, timeoutMs = 20000 } = {}) {
  const descriptor = prairieLearnSelectors.questionsIndex;
  logger.debug('Waiting for questions index table');

  await page.waitForFunction(
    (config) => {
      const headers = Array.from(document.querySelectorAll(config.headerSelector))
        .map((header) => header.getAttribute('data-field'))
        .filter(Boolean);

      const hasRequiredHeaders = config.requiredFields.every((field) => headers.includes(field));
      if (!hasRequiredHeaders) {
        return false;
      }

      const rows = Array.from(document.querySelectorAll(config.rowSelector));
      return rows.length > 0;
    },
    { timeout: timeoutMs },
    descriptor
  );
}

async function extractQuestionsIndexFromEmbeddedData(page, { logger, courseNumber } = {}) {
  try {
    const questions = await page.evaluate((targetCourseNumber) => {
      const table = document.querySelector('#questionsTable');
      if (!table) {
        return null;
      }

      const rawData = table.getAttribute('data-data');
      if (!rawData) {
        return null;
      }

      let records;
      try {
        records = JSON.parse(rawData);
      } catch (error) {
        return null;
      }

      if (!Array.isArray(records)) {
        return null;
      }

      const urlPrefix = getUrlPrefix();
      return records
        .map((record) => {
          const questionId = String(record?.id || '').trim();
          const qid = normalizeText(record?.qid);
          if (!questionId || !qid) {
            return null;
          }

          return {
            qid,
            title: normalizeText(record?.title),
            topic: normalizeText(record?.topic?.name || record?.topic || ''),
            tags: Array.isArray(record?.tags)
              ? record.tags.map((tag) => normalizeText(tag?.name || tag)).filter(Boolean)
              : [],
            link: `${urlPrefix}/question/${encodeURIComponent(questionId)}/preview`,
            raw: record,
          };
        })
        .filter(Boolean);

      function getUrlPrefix() {
        const script = document.querySelector('#questions-table-data');
        if (script) {
          const text = script.textContent || script.innerText || '';
          const trimmed = text.trim();
          if (trimmed) {
            try {
              const decoded = atob(trimmed);
              const parsed = JSON.parse(decoded);
              if (parsed && typeof parsed.urlPrefix === 'string' && parsed.urlPrefix.trim()) {
                return new URL(parsed.urlPrefix, window.location.origin).toString().replace(/\/+$/g, '');
              }
            } catch (error) {
              // Fall through to deriving the prefix from the current page URL.
            }
          }
        }

        const path = window.location.pathname.replace(/\/course_admin\/questions\/?$/, '');
        return `${window.location.origin}${path}`.replace(/\/+$/g, '');
      }

      function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
      }
    }, courseNumber);

    if (Array.isArray(questions) && questions.length > 0) {
      logger.debug('Indexed course questions from embedded table data');
      return questions;
    }
  } catch (error) {
    logger.debug(`Embedded questions table data parse failed: ${error.message}`);
  }

  return null;
}

async function selectQuestionsIndexPageSize(page, { logger, pageSizeLabel = 'All', timeoutMs = 20000 } = {}) {
  const selection = await page.evaluate((targetLabel) => {
    const pageList = document.querySelector('.page-list');
    if (!pageList) {
      return {
        found: false,
        reason: 'missing-page-list',
      };
    }

    const currentLabel = normalizeText(pageList.querySelector('.page-size')?.textContent || '');
    const targetItem = Array.from(pageList.querySelectorAll('.dropdown-item')).find((item) => {
      return normalizeText(item.textContent || '') === normalizeText(targetLabel);
    }) || null;

    if (!targetItem) {
      return {
        found: false,
        reason: 'missing-page-size-option',
        currentLabel,
      };
    }

    if (currentLabel === normalizeText(targetLabel)) {
      return {
        found: true,
        alreadySelected: true,
        currentLabel,
      };
    }

    const toggle = pageList.querySelector('.dropdown-toggle');
    if (toggle && typeof toggle.click === 'function') {
      toggle.click();
    }

    targetItem.click();

    return {
      found: true,
      alreadySelected: false,
      currentLabel,
    };

    function normalizeText(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }
  }, pageSizeLabel);

  if (!selection.found) {
    if (selection.reason === 'missing-page-list') {
      logger.debug('Questions index page-size controls were not found; continuing without changing the page size');
      return {
        action: 'index-questions',
        selectorStrategy: 'questions-admin-table',
      };
    }

    throw new Error(`Could not find the "${pageSizeLabel}" page-size option on the questions index page.`);
  }

  if (selection.alreadySelected) {
    logger.debug(`Questions index page size already set to "${pageSizeLabel}"`);
  } else {
    logger.info(`Selecting "${pageSizeLabel}" rows per page on the questions index`);
  }

  await page.waitForFunction(
    (config) => {
      const pageList = document.querySelector('.page-list');
      if (!pageList) {
        return false;
      }

      const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const currentLabel = normalizeText(pageList.querySelector('.page-size')?.textContent || '');
      if (currentLabel !== config.targetLabel) {
        window.__plQuestionsIndexPageSizeState = null;
        return false;
      }

      const rows = Array.from(document.querySelectorAll(config.rowSelector));
      const state = window.__plQuestionsIndexPageSizeState || {
        rowCount: rows.length,
        lastChangeAt: performance.now(),
      };

      if (state.rowCount !== rows.length) {
        state.rowCount = rows.length;
        state.lastChangeAt = performance.now();
        window.__plQuestionsIndexPageSizeState = state;
        return false;
      }

      window.__plQuestionsIndexPageSizeState = state;
      return performance.now() - state.lastChangeAt >= config.stableMs;
    },
    { timeout: timeoutMs },
    {
      rowSelector: 'tbody tr',
      stableMs: 300,
      targetLabel: pageSizeLabel,
    }
  );
}

async function waitForAssessmentQuestionsIndexTable(page, { logger, timeoutMs = 20000 } = {}) {
  const descriptor = prairieLearnSelectors.assessmentQuestionsIndex;
  logger.debug('Waiting for assessment questions table');

  await page.waitForFunction(
    (config) => {
      const rows = Array.from(document.querySelectorAll(config.rowSelector));
      if (rows.length === 0) {
        return false;
      }

      const hasLink = rows.some((row) => row.querySelector(config.linkSelector));
      return hasLink;
    },
    { timeout: timeoutMs },
    descriptor
  );
}

async function safeGetTitle(page) {
  try {
    return await page.title();
  } catch (error) {
    return '(title unavailable)';
  }
}

async function scrollIntoView(handle) {
  await handle.evaluate((element) => {
    element.scrollIntoView({
      behavior: 'auto',
      block: 'center',
      inline: 'center',
    });
  });
}

async function isVisible(handle) {
  return handle.evaluate((element) => {
    const style = window.getComputedStyle(element);

    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      Number(style.opacity) === 0
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

async function isDisabled(handle) {
  return handle.evaluate((element) => {
    return Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true';
  });
}

function buildLoadFromDiskUrl(currentUrl) {
  const url = new URL(currentUrl);
  url.pathname = prairieLearnSelectors.loadFromDisk.path;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function buildCourseQuestionsUrl(currentUrl, courseNumber) {
  const url = new URL(currentUrl);
  url.pathname = prairieLearnSelectors.questionsIndex.pathTemplate.replace('{courseNumber}', String(courseNumber));
  url.search = '';
  url.hash = '';
  return url.toString();
}

function getAssessmentQuestionsOverviewMatch(urlString) {
  const url = new URL(urlString);
  const match = url.pathname.match(prairieLearnSelectors.assessmentQuestionsIndex.pathPattern);

  if (!match || !match.groups) {
    return null;
  }

  return {
    assessmentId: Number(match.groups.assessmentId),
    courseInstanceId: Number(match.groups.courseInstanceId),
  };
}

function getCourseQuestionsIndexMatch(urlString) {
  const url = new URL(urlString);
  const match = url.pathname.match(prairieLearnSelectors.questionsIndex.pathPattern);

  if (!match || !match.groups) {
    return null;
  }

  return {
    courseNumber: Number(match.groups.courseNumber),
  };
}

function getCourseNumberFromUrl(urlString) {
  if (!urlString) {
    return null;
  }

  const url = new URL(urlString);
  const match = url.pathname.match(/\/pl\/course\/(?<courseNumber>\d+)(?:\/|$)/);

  if (!match || !match.groups) {
    return null;
  }

  const courseNumber = Number(match.groups.courseNumber);
  return Number.isInteger(courseNumber) && courseNumber > 0 ? courseNumber : null;
}

async function goBackInPageHistory(page) {
  const beforeUrl = page.url();

  const navigationWait = page.waitForNavigation({
    timeout: 15000,
    waitUntil: 'domcontentloaded',
  }).catch(() => null);

  const urlChangeWait = page.waitForFunction(
    (currentUrl) => window.location.href !== currentUrl,
    { timeout: 15000 },
    beforeUrl
  ).catch(() => null);

  await page.evaluate(() => {
    window.history.back();
  });

  const result = await Promise.race([
    navigationWait,
    urlChangeWait,
  ]);

  return Boolean(result) || page.url() !== beforeUrl;
}

function uniqueSelectors(selectors) {
  return [...new Set(selectors.filter(Boolean))];
}

module.exports = {
  clickNavigation,
  followLoadFromDisk,
  getAssessmentQuestionsOverviewMatch,
  getCourseQuestionsIndexMatch,
  getCourseNumberFromUrl,
  getPageSnapshot,
  indexQuestionsForCurrentAssessment,
  indexQuestionsForCourse,
  extractQuestionsIndexFromEmbeddedData,
  selectQuestionsIndexPageSize,
  waitForPageReady,
};
