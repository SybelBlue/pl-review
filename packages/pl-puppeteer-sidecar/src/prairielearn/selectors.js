const prairieLearnSelectors = Object.freeze({
  loadFromDisk: {
    path: '/pl/loadFromDisk',
    successBadgeSelectors: [
      '.badge.text-bg-success',
      '.badge.bg-success',
      '.badge-success',
    ],
    successTextPattern: /success/i,
  },
  questionsIndex: {
    pathTemplate: '/pl/course/{courseNumber}/course_admin/questions',
    pathPattern: /^\/pl\/course\/(?<courseNumber>\d+)\/course_admin\/questions(?:\/)?$/,
    tableSelectors: [
      'table',
      '.bootstrap-table table',
    ],
    rowSelector: 'tbody tr',
    headerSelector: 'thead th[data-field]',
    requiredFields: ['qid', 'title', 'topic', 'tags'],
  },
  assessmentQuestionsIndex: {
    pathPattern: /^\/pl\/course_instance\/(?<courseInstanceId>\d+)\/instructor\/assessment\/(?<assessmentId>\d+)\/questions(?:\/)?$/,
    tableSelectors: [
      'table',
      '.bootstrap-table table',
    ],
    rowSelector: 'tbody tr, table tr',
    headerSelector: 'thead th[data-field], thead th',
    linkSelector: 'a[href]',
  },
  ready: [
    'main',
    '#content',
    '.question-container',
    '.container',
    '[data-question-id]',
  ],
  busy: [
    '[aria-busy="true"]',
    '.loading',
    '.spinner',
    '.spinner-border',
    '.progress-bar-animated',
  ],
  navigation: {
    next: {
      selectors: [
        'a[rel="next"]',
        'button[rel="next"]',
        'a[aria-label*="next" i]',
        'button[aria-label*="next" i]',
        'a[title*="next" i]',
        'button[title*="next" i]',
        '[data-testid="next"]',
      ],
      textPatterns: [
        /^next$/i,
        /^next question$/i,
        /^continue$/i,
      ],
    },
    prev: {
      selectors: [
        'a[rel="prev"]',
        'a[rel="previous"]',
        'button[rel="prev"]',
        'button[rel="previous"]',
        'a[aria-label*="prev" i]',
        'button[aria-label*="prev" i]',
        'a[aria-label*="previous" i]',
        'button[aria-label*="previous" i]',
        'a[title*="prev" i]',
        'button[title*="prev" i]',
        '[data-testid="previous"]',
      ],
      textPatterns: [
        /^prev$/i,
        /^previous$/i,
        /^previous question$/i,
        /^back$/i,
      ],
    },
  },
});

module.exports = {
  prairieLearnSelectors,
};
