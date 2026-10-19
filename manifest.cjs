const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.join(__dirname, 'dist');
const manifestPath = path.join(root, 'manifest.json');
const allowed = new Set(['.html', '.css', '.js', '.mjs', '.json', '.png', '.mp4']);
const forbiddenText = [
  ['private-key-block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['credential-prefix', /(?:sk-proj-|ghp_|gho_|github_pat_)[A-Za-z0-9_-]{8,}/],
  ['cookie-header', /(?:^|\n)Cookie:\s*[^\n]+/i]
];

function list(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(dir, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Symlink in static package: ${relative}`);
    if (entry.isDirectory()) return list(absolute, relative);
    if (!entry.isFile()) throw new Error(`Unsupported static entry: ${relative}`);
    if (relative === 'manifest.json') return [];
    if (!allowed.has(path.extname(entry.name).toLowerCase())) throw new Error(`Unexpected file type: ${relative}`);
    if (stat.size > 10 * 1024 * 1024) throw new Error(`File exceeds 10 MiB: ${relative}`);
    return [{ absolute, relative }];
  });
}

function receipt(file) {
  const bytes = fs.readFileSync(file.absolute);
  if (['.html', '.css', '.js', '.mjs', '.json'].includes(path.extname(file.absolute).toLowerCase())) {
    const source = bytes.toString('utf8');
    for (const [kind, pattern] of forbiddenText) if (pattern.test(source)) throw new Error(`${kind} marker in ${file.relative}`);
  }
  return { path: file.relative, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

function currentFiles() {
  return list(root).sort((a, b) => a.relative.localeCompare(b.relative, 'en')).map(receipt);
}

if (process.argv[2] === 'build') {
  const files = currentFiles();
  const manifest = {
    schema: 'C_DROHNE_STATIC_PACKAGE_V1',
    generatedAt: new Date().toISOString(),
    scope: 'Bytes of this local static package only; no authorship, deployment or field-effect claim',
    files
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Wrote dist/manifest.json for ${files.length} static files.`);
} else if (process.argv[2] === 'verify') {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schema, 'C_DROHNE_STATIC_PACKAGE_V1');
  assert.deepEqual(currentFiles(), manifest.files);
  console.log(`PASS dist/manifest.json: ${manifest.files.length} files match length and SHA-256.`);
} else {
  console.error('Usage: node manifest.cjs build|verify');
  process.exitCode = 2;
}
