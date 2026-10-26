'use strict';

// Test 4.18: a failing unit test must stop the pipeline before build.
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('deliberately failing test (4.18)', () => {
  assert.equal(1 + 1, 3);
});
