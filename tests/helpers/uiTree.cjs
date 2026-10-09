function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children),
    ...nodes(tree.props?.ListHeaderComponent), ...nodes(tree.props?.ListFooterComponent),
    ...nodes(tree.props?.ListEmptyComponent)];
}

function flattenStyle(style) {
  return Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean).map(flattenStyle)) : style ?? {};
}

module.exports = { nodes, flattenStyle };
