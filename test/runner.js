'use strict';

// Tiny zero-dependency test framework. Test files call test(name, fn) at
// require time; run.js requires them all and then calls run().

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function fail(message) {
  throw new Error(message);
}

function show(v) {
  if (v instanceof Date) return 'Date(' + v.toISOString() + ')';
  try {
    const s = JSON.stringify(v);
    return s && s.length > 220 ? s.slice(0, 220) + '…' : s;
  } catch (e) {
    return String(v);
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

function assert(cond, message) {
  if (!cond) fail(message || 'assertion failed');
}

function assertEq(actual, expected, message) {
  if (!deepEqual(actual, expected)) {
    fail((message ? message + ' — ' : '') + 'expected ' + show(expected) + ', got ' + show(actual));
  }
}

function assertThrows(fn, pattern, message) {
  let threw = null;
  try {
    fn();
  } catch (err) {
    threw = err;
  }
  if (!threw) fail((message ? message + ' — ' : '') + 'expected an exception, none was thrown');
  if (pattern && !pattern.test(threw.message)) {
    fail(
      (message ? message + ' — ' : '') +
      'exception message ' + show(threw.message) + ' does not match ' + pattern
    );
  }
  return threw;
}

function run(fileCount) {
  const failures = [];
  for (const t of tests) {
    try {
      t.fn();
    } catch (err) {
      failures.push({ name: t.name, err });
    }
  }
  for (const f of failures) {
    console.error(`FAIL  ${f.name}`);
    console.error(`      ${f.err.message}`);
  }
  const passed = tests.length - failures.length;
  console.log(`\n${passed}/${tests.length} tests passed (${fileCount} files)`);
  process.exit(failures.length ? 1 : 0);
}

module.exports = { test, assert, assertEq, assertThrows, deepEqual, run };
