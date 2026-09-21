// @ts-check
const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('webpack').container;
const { dependencies } = require('./package.json');

/**
 * The shell declares no remotes. It learns their URLs at runtime from
 * /config.json (see src/remotes), so no remote address is ever in a bundle.
 */
module.exports = (_env, argv) => {
  const production = argv.mode === 'production';
  return {
    entry: './src/index.ts',
    output: { path: path.resolve(__dirname, 'dist'), filename: production ? '[name].[contenthash:8].js' : '[name].js', publicPath: '/', clean: true },
    devtool: production ? 'source-map' : 'eval-cheap-module-source-map',
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
    module: {
      rules: [
        { test: /\.tsx?$/, exclude: /node_modules/, use: { loader: 'swc-loader', options: { jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' } } } },
        { test: /\.module\.css$/, use: ['style-loader', { loader: 'css-loader', options: { modules: { localIdentName: 'sh-[local]-[hash:base64:4]', namedExport: false } } }] },
        { test: /\.css$/, exclude: /\.module\.css$/, use: ['style-loader', 'css-loader'] },
      ],
    },
    plugins: [
      new ModuleFederationPlugin({
        name: 'baseline_shell',
        shared: {
          react: { singleton: true, strictVersion: true, requiredVersion: dependencies.react },
          'react-dom': { singleton: true, strictVersion: true, requiredVersion: dependencies['react-dom'] },
        },
      }),
      new HtmlWebpackPlugin({ template: './public/index.html' }),
    ],
    devServer: {
      port: 8080,
      historyApiFallback: true,
      hot: false,
      proxy: [
        { context: ['/api/people'], target: 'http://localhost:4001' },
        { context: ['/api/delivery'], target: 'http://localhost:4002' },
      ],
      // In development the dev server plays the container: it serves the same /config.json from the same env vars.
      setupMiddlewares: (middlewares, server) => {
        server.app?.get('/config.json', (_request, response) => {
          response.json({
            remotes: {
              people: process.env.PEOPLE_REMOTE_URL ?? 'http://localhost:8081/remoteEntry.js',
              delivery: process.env.DELIVERY_REMOTE_URL ?? 'http://localhost:8082/remoteEntry.js',
            },
          });
        });
        return middlewares;
      },
    },
  };
};
