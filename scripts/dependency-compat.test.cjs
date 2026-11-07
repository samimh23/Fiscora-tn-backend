const assert = require('node:assert/strict');
const { test } = require('node:test');
const { join } = require('node:path');
const { createRequire } = require('node:module');
const { once } = require('node:events');

const fixtures = join(__dirname, 'fixtures/dependency-compat');
const logger = { log() {} };

test('patched glob retains the CommonJS sync API used by TypeORM and archiver', async () => {
  for (const consumer of ['typeorm', 'archiver-utils']) {
    const fromConsumer = createRequire(require.resolve(consumer));
    const glob = fromConsumer('glob');
    assert.equal(fromConsumer('glob/package.json').version, '14.0.2');
    assert.deepEqual(glob.sync('*.cjs', { cwd: fixtures }), ['sample.cjs']);
  }
  const { importClassesFromDirectories, importJsonsFromDirectories } = require('typeorm/util/DirectoryExportedClassesLoader');
  const classes = await importClassesFromDirectories(logger, [join(fixtures, '*.cjs').replaceAll('\\', '/')]);
  assert.deepEqual(classes.map(value => value.name), ['DependencyCompatibilityFixture']);
  assert.deepEqual(importJsonsFromDirectories([join(__dirname, '../package.json').replaceAll('\\', '/')]).map(value => value.name), ['accounting-backend-nest']);
});

test('archiver still writes ZIP entries discovered by glob', async () => {
  const archive = require('archiver')('zip');
  const chunks = [];
  archive.on('data', chunk => chunks.push(chunk));
  const ended = once(archive, 'end');
  archive.glob('*.cjs', { cwd: fixtures });
  await archive.finalize();
  await ended;
  const zip = Buffer.concat(chunks);
  assert.equal(zip.subarray(0, 2).toString(), 'PK');
  assert.ok(zip.includes(Buffer.from('sample.cjs')));
});

test('patched Express parser and Multer accept JSON and bounded multipart uploads', async t => {
  const express = require('express');
  const multer = require('multer');
  const app = express();
  app.use(express.json());
  app.post('/json', (req, res) => res.json(req.body));
  app.post('/upload', multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 } }).single('file'), (req, res) => {
    res.json({ name: req.file.originalname, text: req.file.buffer.toString() });
  });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = await fetch(`${base}/json`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: 1191 }) });
  assert.equal(json.status, 200);
  assert.deepEqual(await json.json(), { amount: 1191 });
  const form = new FormData();
  form.append('file', new Blob(['test-only']), 'invoice.txt');
  const uploaded = await fetch(`${base}/upload`, { method: 'POST', body: form });
  assert.equal(uploaded.status, 200);
  assert.deepEqual(await uploaded.json(), { name: 'invoice.txt', text: 'test-only' });
});

test('Nodemailer can compose an email locally without contacting an SMTP server', async () => {
  const transport = require('nodemailer').createTransport({ streamTransport: true, buffer: true });
  const message = await transport.sendMail({ from: 'sender@example.invalid', to: 'recipient@example.invalid', subject: 'Compatibility check', text: 'No real email is sent.' });
  assert.deepEqual(message.envelope.to, ['recipient@example.invalid']);
  assert.ok(message.message.includes(Buffer.from('Compatibility check')));
  transport.close();
});
