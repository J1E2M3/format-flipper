'use strict';

// Test entry point: node test/run.js
// Discovers and runs every *.test.js file in this directory.

const fs = require('node:fs');
const path = require('node:path');
const runner = require('./runner');

const files = fs
  .readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .sort();

if (files.length === 0) {
  console.error('no *.test.js files found in test/');
  process.exit(1);
}

for (const f of files) require(path.join(__dirname, f));
runner.run(files.length);
