import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath, URL} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(root + path, 'utf8');
const dir = 'public/fonts/pretendard/subset/';
const faces = [...read('src/pretendard.css').matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => ({
  family: body.match(/font-family:\s*"([^"]+)"/)?.[1],
  file: body.match(/url\("\/fonts\/pretendard\/subset\/([^"]+)"\)/)?.[1],
  ranges: (body.match(/unicode-range:\s*([^;]+);/)?.[1] ?? '').split(',').map(part => {
    const [start, end = start] = part.trim().replace(/^U\+/, '').split('-');
    return [parseInt(start, 16), parseInt(end, 16)];
  }),
}));
const covers = (face, cp) => face.ranges.some(([start, end]) => cp >= start && cp <= end);

test('every Pretendard slice is declared once and named by its content hash', () => {
  assert.ok(faces.length > 1);
  assert.ok(faces.every(face => face.family === 'Pretendard Variable' && face.file && face.ranges.every(([a, b]) => a <= b)));
  assert.deepEqual(faces.map(face => face.file).sort(), readdirSync(root + dir).sort());
  for (const {file} of faces) {
    const digest = createHash('sha256').update(readFileSync(root + dir + file)).digest('hex').slice(0, 10);
    assert.match(file, new RegExp(`\\.${digest}\\.woff2$`), `${file} must be renamed after its content changes`);
  }
});

test('Pretendard slices never claim the same character', () => {
  const ranges = faces.flatMap(face => face.ranges.map(range => [...range, face.file])).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) assert.ok(ranges[i][0] > ranges[i - 1][1], `${ranges[i][2]} overlaps ${ranges[i - 1][2]}`);
});

test('the UI preloads the common slice and every character in current code is covered', () => {
  const html = read('index.html'), common = faces.find(face => face.file.startsWith('pretendard-common.'));
  assert.ok(common);
  assert.ok(html.includes(`href="/fonts/pretendard/subset/${common.file}"`));
  assert.ok(!html.includes('PretendardVariable.woff2') && !read('src/styles.css').includes('PretendardVariable.woff2'));
  const ts = JSON.parse(read('tsconfig.json').replace(/^\s*\/\/.*$/gm, ''));
  const css = readdirSync(root + 'src', {recursive: true}).filter(file => file.endsWith('.css')).map(file => 'src/' + file);
  const text = [...ts.files, ...css, 'index.html'].filter(file => existsSync(root + file)).map(read).join('');
  const missing = [...new Set(text)].filter(char => char.codePointAt(0) >= 0x20 && !faces.some(face => covers(face, char.codePointAt(0))));
  assert.deepEqual(missing, []);
});
