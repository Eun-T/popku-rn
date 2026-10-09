const ts = require('typescript');

// Deliberately narrow: resolve import/local symbols, inspect literal dependency
// arrays only. Unknown wrappers, data flow and React-external helpers stay legal.
function inspectI18nUi(source, filename = 'fixture.tsx') {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const host = ts.createCompilerHost({ noLib: true, noResolve: true });
  host.getSourceFile = name => name === filename ? file : undefined;
  const program = ts.createProgram([filename], { noLib: true, noResolve: true }, host), checker = program.getTypeChecker();
  const globals = new Set(), namespaces = new Set(), translators = new Map(), issues = [];
  const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)); };
  const symbol = node => checker.getSymbolAtLocation(node);
  for (const statement of file.statements) if (ts.isImportDeclaration(statement) && /(?:^|\/)locales(?:\/index)?$/.test(statement.moduleSpecifier.text)) {
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) if ((el.propertyName ?? el.name).text === 't') globals.add(symbol(el.name));
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(symbol(bindings.name));
  }
  const globalCall = node => ts.isCallExpression(node) && (
    ts.isIdentifier(node.expression) && globals.has(symbol(node.expression)) ||
    ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 't' && namespaces.has(symbol(node.expression.expression)));
  const component = node => {
    if (!ts.isFunctionDeclaration(node) && !ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;
    let binding = node.parent;
    if (ts.isCallExpression(binding) && /^(?:React\.)?memo$/.test(binding.expression.getText(file))) binding = binding.parent;
    const name = ts.isFunctionDeclaration(node) ? node.name?.text :
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(binding) ? binding.name.getText(file) : '';
    if (!/^[A-Z]/.test(name ?? '')) return false;
    let jsx = false;walk(node, n => { if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) jsx = true; });return jsx;
  };
  const emit = (node, rule) => issues.push({ rule, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
  walk(file, node => {
    if (!ts.isVariableDeclaration(node) || !ts.isObjectBindingPattern(node.name) || !node.initializer ||
      !ts.isCallExpression(node.initializer) || node.initializer.expression.getText(file) !== 'useTranslation') return;
    const elements = node.name.elements, language = elements.find(el => (el.propertyName ?? el.name).getText(file) === 'resolvedLanguage');
    for (const el of elements) if ((el.propertyName ?? el.name).getText(file) === 't') translators.set(symbol(el.name), language && symbol(language.name));
  });
  const translationCalls = (node, skipFunctions = false) => { const found = [];const visit = n => {
    if (skipFunctions && (ts.isArrowFunction(n) || ts.isFunctionExpression(n))) return;
    if (globalCall(n)) found.push({ node:n, sym:symbol(n.expression), language:undefined });
    else if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && translators.has(symbol(n.expression))) found.push({node:n,sym:symbol(n.expression),language:translators.get(symbol(n.expression))});
    ts.forEachChild(n,visit);
  };if (node) visit(node);return found; };
  walk(file, node => {
    if (component(node)) walk(node, n => { if (globalCall(n)) emit(n,'global-t-in-react'); });
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isVariableDeclarationList(node.parent) && ts.isVariableStatement(node.parent.parent) &&
      node.parent.parent.parent === file && translationCalls(node.initializer,true).length) emit(node,'module-translation');
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
    const name = node.expression.text, calls = translationCalls(node.arguments[0]);
    if (!calls.length) return;
    if (name === 'useState') emit(node,'translated-initial-state');
    if ((name === 'useMemo' || name === 'useCallback') && node.arguments[1] && ts.isArrayLiteralExpression(node.arguments[1])) {
      const deps = node.arguments[1].elements;
      // Spread/computed expressions need human review; never guess their contents.
      if (!deps.every(ts.isIdentifier)) return;
      const syms = new Set(deps.map(symbol));
      if (calls.some(c => !syms.has(c.sym) && (!c.language || !syms.has(c.language)))) emit(node,'translation-without-language-dependency');
    }
  });
  return issues;
}
module.exports = { inspectI18nUi };
