// Copies game.js into index.html between the two marker comments, so the page stays one
// self-contained file. Run by build.sh; game.test.js checks the result is up to date.
const fs = require('node:fs');
const path = require('node:path');

const OPEN = '/* <<< game.js (inlined by build.sh: edit game.js, not this block) */';
const CLOSE = '/* >>> game.js */';

function inline(html, js) {
  const a = html.indexOf(OPEN), b = html.indexOf(CLOSE);
  if (a < 0 || b < a) throw new Error('index.html: game.js markers not found');
  return html.slice(0, a + OPEN.length) + '\n' + js.trim() + '\n' + html.slice(b);
}

if (require.main === module) {
  const file = path.join(__dirname, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const out = inline(html, fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8'));
  if (out !== html) fs.writeFileSync(file, out);
  console.log(out === html ? 'index.html: game.js already current' : 'index.html: game.js inlined');
}

module.exports = { inline, OPEN, CLOSE };
