const test = require('node:test');
const assert = require('node:assert/strict');
const { getCourseNumberFromUrl } = require('../src/prairielearn/page-actions');

test('getCourseNumberFromUrl extracts the course number from a course path', () => {
  assert.equal(
    getCourseNumberFromUrl('http://localhost:3000/pl/course/17/course_admin/questions'),
    17
  );
  assert.equal(
    getCourseNumberFromUrl('http://localhost:3000/pl/course/17/questions/preview'),
    17
  );
});

test('getCourseNumberFromUrl returns null when no course path is present', () => {
  assert.equal(getCourseNumberFromUrl('http://localhost:3000/pl/course_instance/9/questions'), null);
  assert.equal(getCourseNumberFromUrl('http://localhost:3000/'), null);
});
