import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const NEUTRAL_PATHS = ['engine', 'tests'];
const CONTENT_MODULE_IMPORT = /(?:@\/content\/|(?:\.\.\/)+content\/)/u;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.json']);

function sourceFiles(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) return sourceFiles(child);
    const dot = entry.name.lastIndexOf('.');
    return SOURCE_EXTENSIONS.has(dot >= 0 ? entry.name.slice(dot) : '') ? [child] : [];
  });
}

const violations = [];

for (const relativePath of NEUTRAL_PATHS) {
  for (const file of sourceFiles(resolve(ROOT, relativePath))) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (CONTENT_MODULE_IMPORT.test(line)) {
        violations.push(`${file.slice(ROOT.length + 1)}:${index + 1} ${line.trim()}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error('엔진 또는 규칙 테스트가 콘텐츠 모듈을 직접 참조합니다.');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exit(1);
}

console.log('콘텐츠 경계 확인: 엔진과 규칙 테스트가 콘텐츠 모듈을 직접 참조하지 않음');
