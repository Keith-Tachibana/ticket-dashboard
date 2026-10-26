module.exports = function (webpackConfig) {
  if (!webpackConfig.module) { webpackConfig.module = { rules: [] }; }
  if (!webpackConfig.module.rules) { webpackConfig.module.rules = []; }

  // Let strict ES modules (MUI's .mjs files) resolve imports like
  // 'react/jsx-runtime' without a file extension.
  webpackConfig.module.rules.push({
    test: /\.m?js$/,
    resolve: { fullySpecified: false }
  });

  return webpackConfig;
};
