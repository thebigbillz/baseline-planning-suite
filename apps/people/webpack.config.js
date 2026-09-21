// @ts-check
const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;
const { dependencies } = require('./package.json');

/**
 * One build, two ways to run it:
 *   index.html      standalone, with a small harness standing in for the shell
 *   remoteEntry.js  hosted, exposing ./mount to whoever loads it
 */
module.exports = (_env, argv) => {
  const production = argv.mode === 'production';
  return {
    entry: './src/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: production ? '[name].[contenthash:8].js' : '[name].js',
      // Chunks load from wherever remoteEntry.js was served, which only the host's runtime config knows.
      publicPath: 'auto',
      uniqueName: 'baseline_people',
      clean: true,
    },
    devtool: production ? 'source-map' : 'eval-cheap-module-source-map',
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
    module: {
      rules: [
        { test: /\.tsx?$/, exclude: /node_modules/, use: { loader: 'swc-loader', options: { jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' } } } },
        { test: /\.module\.css$/, use: ['style-loader', { loader: 'css-loader', options: { modules: { localIdentName: 'pl-[local]-[hash:base64:4]', namedExport: false } } }] },
        { test: /\.css$/, exclude: /\.module\.css$/, use: ['style-loader', 'css-loader'] },
      ],
    },
    plugins: [
      new ModuleFederationPlugin({
        name: 'baseline_people',
        filename: 'remoteEntry.js',
        exposes: { './mount': './src/mount.tsx' },
        shared: {
          react: { singleton: true, strictVersion: true, requiredVersion: dependencies.react },
          'react-dom': { singleton: true, strictVersion: true, requiredVersion: dependencies['react-dom'] },
        },
      }),
      new HtmlWebpackPlugin({ template: './public/index.html', excludeChunks: ['baseline_people'] }),
    ],
    devServer: {
      port: 8081,
      hot: false,
      historyApiFallback: true,
      headers: { 'Access-Control-Allow-Origin': '*' },
      proxy: [
        { context: ['/api/people'], target: 'http://localhost:4001' },
        { context: ['/api/delivery'], target: 'http://localhost:4002' },
      ],
    },
  };
};
