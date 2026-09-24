import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative, dirname, sep } from 'node:path';
const root = resolve(process.argv[2] ?? '.');
const owners = {
  'guide-content': 'content',
  core: 'core',
  contracts: 'contracts',
  database: 'database',
  testing: 'testing',
  ui: 'ui',
  'guide-ui': 'guide-ui',
  'design-tokens': 'design-tokens',
};
const allowed = {
  content: [],
  contracts: ['content'],
  database: ['content', 'core', 'contracts'],
  core: ['content'],
  testing: ['core', 'content'],
  ui: ['design-tokens'],
  'guide-ui': ['content', 'ui', 'design-tokens'],
  web: Object.values(owners),
  operator: ['content', 'core', 'contracts', 'database'],
};
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name.startsWith('.next') ||
      ['node_modules', '.git', 'test-results'].includes(entry.name)
    )
      return [];
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(path) : /\.([cm]?[jt]sx?)$/.test(entry.name) ? [path] : [];
  });
}
const errors = [];
const graph = new Map();
const owner = (file) => {
  const parts = relative(root, file).split(sep);
  return parts[0] === 'apps' ? parts[1] : parts[0] === 'packages' ? owners[parts[1]] : null;
};
for (const file of walk(root)) {
  const from = owner(file);
  if (!from || file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  function check(specifier) {
    const label = relative(root, file);
    let to;
    if (specifier.startsWith('@guide/')) {
      const parts = specifier.slice(7).split('/');
      to = parts[0];
      if (parts.length > 1 && !(to === 'design-tokens' && parts[1] === 'tokens.css'))
        errors.push(`${label}: deep package import ${specifier}`);
    } else if (specifier.startsWith('.')) {
      to = owner(resolve(dirname(file), specifier));
      if (to && to !== from) errors.push(`${label}: cross-package relative import ${specifier}`);
    } else {
      if (
        (from !== 'web' && /^next(\/|$)/.test(specifier)) ||
        (from !== 'database' && /^(pg|drizzle-orm|better-auth)(\/|$)/.test(specifier))
      )
        errors.push(`${label}: forbidden infrastructure dependency ${specifier}`);
      if (
        ['core', 'content', 'contracts'].includes(from) &&
        /^(react|react-dom)(\/|$)/.test(specifier)
      )
        errors.push(`${label}: framework dependency ${specifier}`);
    }
    if (to && to !== from) {
      if (!allowed[from]?.includes(to)) errors.push(`${label}: ${from} cannot import ${to}`);
      graph.set(from, new Set([...(graph.get(from) ?? []), to]));
    }
    if (
      /^["']use client["'];?/.test(source.text.trim()) &&
      ['@guide/core', '@guide/testing', '@guide/database'].includes(specifier)
    )
      errors.push(`${label}: client entry cannot import server query/fixture modules`);
  }
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      check(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) check(arg.text);
      else errors.push(`${relative(root, file)}: nonliteral runtime import is not allowed`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
function cycle(node, path = []) {
  if (path.includes(node)) {
    errors.push(`Package cycle: ${[...path, node].join(' → ')}`);
    return;
  }
  for (const next of graph.get(node) ?? []) cycle(next, [...path, node]);
}
for (const node of graph.keys()) cycle(node);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log('Import boundaries and package graph pass.');
