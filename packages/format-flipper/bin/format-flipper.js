#!/usr/bin/env node
'use strict';

// format-flipper CLI — the same 12-format engine as the browser tool,
// for pipelines, scripts, and batch conversion. Your data is processed
// on this machine; nothing is sent anywhere.

const fs = require('node:fs');
const path = require('node:path');
const ff = require('../index.js');

const USAGE = `format-flipper — convert between 12 data formats

Usage:
  format-flipper --from <fmt> --to <fmt> [file]        one file (or stdin) to stdout
  format-flipper --to <fmt> [files...]                 formats inferred from extensions
  format-flipper --to <fmt> --out-dir <dir> [files...] batch: write one output per input

Formats:
  ${ff.FORMATS.join(', ')}

Options:
  -f, --from <fmt>        source format (default: inferred from input extension)
  -t, --to <fmt>          target format (required)
  -o, --out <file>        write output to a file instead of stdout (single input only)
  -d, --out-dir <dir>     write each converted file into <dir> with the target extension
      --indent <n>        indent for JSON/YAML/XML output
      --strict            strict parsing: malformed CSV/TSV/Markdown rows throw
      --no-coerce         keep every tabular cell as the exact string it was
      --delimiter <name>  CSV delimiter, both sides: comma | semicolon | pipe | tab
      --sql-table <name>  table name for SQL output
      --sql-quote <style> SQL identifier quoting: backtick | ansi | bracket
  -h, --help              show this help
  -v, --version           print the package version

Examples:
  cat users.json | format-flipper -f json -t csv
  format-flipper -t yaml config.toml -o config.yaml
  format-flipper -t json --out-dir out/ data/*.csv
`;

function fail(msg) {
  process.stderr.write('format-flipper: ' + msg + '\n');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { files: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) fail(`missing value for ${a}`);
      return argv[++i];
    };
    switch (a) {
      case '-h': case '--help': process.stdout.write(USAGE); process.exit(0); break;
      case '-v': case '--version':
        process.stdout.write(require('../package.json').version + '\n');
        process.exit(0); break;
      case '-f': case '--from': args.from = next(); break;
      case '-t': case '--to': args.to = next(); break;
      case '-o': case '--out': args.out = next(); break;
      case '-d': case '--out-dir': args.outDir = next(); break;
      case '--strict': args.opts.strictParse = true; break;
      case '--no-coerce': args.opts.coerceTypes = false; break;
      case '--indent': {
        const n = parseInt(next(), 10);
        if (!Number.isFinite(n) || n < 0 || n > 8) fail('--indent must be 0–8');
        args.opts.jsonIndent = n; args.opts.yamlIndent = Math.max(1, n); args.opts.xmlIndent = n;
        break;
      }
      case '--delimiter': {
        const d = next();
        if (!['comma', 'semicolon', 'pipe', 'tab'].includes(d)) {
          fail('--delimiter must be comma, semicolon, pipe, or tab');
        }
        args.opts.csvDelimiterIn = d; args.opts.csvDelimiterOut = d;
        break;
      }
      case '--sql-table': args.opts.sqlTable = next(); break;
      case '--sql-quote': {
        const q = next();
        if (!['backtick', 'ansi', 'bracket'].includes(q)) {
          fail('--sql-quote must be backtick, ansi, or bracket');
        }
        args.opts.sqlQuote = q;
        break;
      }
      default:
        if (a.startsWith('-') && a !== '-') fail(`unknown option ${a} (see --help)`);
        args.files.push(a);
    }
  }
  return args;
}

function inferFormat(file, explicit, role) {
  if (explicit) {
    if (!ff.FORMATS.includes(explicit)) fail(`unknown ${role} format: ${explicit}`);
    return explicit;
  }
  const fmt = ff.formatForExtension(path.extname(file || ''));
  if (!fmt) fail(`cannot infer ${role} format${file ? ' from ' + JSON.stringify(file) : ''} — pass --${role === 'source' ? 'from' : 'to'}`);
  return fmt;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.to) fail('--to is required (see --help)');
  if (!ff.FORMATS.includes(args.to)) fail(`unknown target format: ${args.to}`);
  if (args.out && args.files.length > 1) fail('--out only works with a single input; use --out-dir for batches');
  if (args.outDir && args.files.length === 0) fail('--out-dir needs input files');

  // stdin mode
  if (args.files.length === 0 || (args.files.length === 1 && args.files[0] === '-')) {
    if (!args.from) fail('--from is required when reading stdin');
    const input = fs.readFileSync(0, 'utf8');
    const output = ff.convert(input, inferFormat(null, args.from, 'source'), args.to, args.opts);
    if (args.out) fs.writeFileSync(args.out, output.endsWith('\n') ? output : output + '\n');
    else process.stdout.write(output.endsWith('\n') ? output : output + '\n');
    return;
  }

  if (args.outDir) fs.mkdirSync(args.outDir, { recursive: true });

  let failures = 0;
  for (const file of args.files) {
    let output;
    try {
      const input = fs.readFileSync(file, 'utf8');
      const from = inferFormat(file, args.from, 'source');
      output = ff.convert(input, from, args.to, args.opts);
    } catch (err) {
      failures++;
      process.stderr.write(`format-flipper: ${file}: ${err.message}\n`);
      continue;
    }
    if (!output.endsWith('\n')) output += '\n';
    if (args.outDir) {
      const base = path.basename(file, path.extname(file));
      const target = path.join(args.outDir, base + '.' + ff.FORMAT_EXT[args.to]);
      fs.writeFileSync(target, output);
      process.stderr.write(`${file} -> ${target}\n`);
    } else if (args.out) {
      fs.writeFileSync(args.out, output);
    } else {
      process.stdout.write(output);
    }
  }
  if (failures > 0) process.exit(1);
}

main();
