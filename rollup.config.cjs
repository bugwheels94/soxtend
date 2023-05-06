'use strict';

var pluginNodeResolve = require('@rollup/plugin-node-resolve');
var peerDepsExternal = require('rollup-plugin-peer-deps-external');
var pluginBabel = require('@rollup/plugin-babel');
var json = require('@rollup/plugin-json');
var commonjs = require('@rollup/plugin-commonjs');
var replace = require('@rollup/plugin-replace');
var globby = require('fast-glob');
var path = require('path');
var terser = require('@rollup/plugin-terser');

const extensions = ['.js', '.ts', '.jsx', '.tsx'];
const babelIncludes = ['./src/**/*'];
const bundleNpmWorkspacePackages = [];
const bundlePackages = [];
const neverBundlePackages = [];
const shouldBundleLocalFilesTogether = false;
const shouldBundleNodeModules = false;
const isDevelopment = process.env.ROLLUP_WATCH;
const decorators = false;
process.env.NODE_ENV === 'production';
const isPackageDependency = (pkg, path, importer = '') => {
	return path.includes('/' + pkg + '/') || (importer.includes('/' + pkg + '/') && path.startsWith('.')) || path === pkg;
};
const getRollupConfig =
	(
		{ isBrowser = false, format = 'esm' } = {
			isBrowser: false,
			format: 'esm',
		}
	) =>
	(localInput) => {
		const input = localInput;
		return {
			input,
			output: {
				file: path.join(
					'./dist',
					format,
					// isBrowser ? '' : 'server',
					localInput.replace('/src', '').replace(/\.(tsx|ts)/, format === 'cjs' ? '.js' : '.js')
				),
				format,
			},
			external(id, second = '') {
				const sanitizedId = id.split('?')[0];
				const isNodeModule = id.includes('node_modules');
				if (id.endsWith('.json')) return false;
				if (sanitizedId.endsWith(input.replace('./', '/'))) {
					return false;
				}
				// No need to pass second because the entry will be stopped
				if (neverBundlePackages.find((pkg) => isPackageDependency(pkg, id))) {
					return true;
				}
				if (bundlePackages.find((pkg) => isPackageDependency(pkg, id, second))) {
					return false;
				}
				if (
					!id.includes('node_modules') &&
					!second.includes('node_modules') &&
					bundleNpmWorkspacePackages.find((pkg) => id.includes('/' + pkg + '/') || second.includes('/' + pkg + '/'))
				) {
					return false;
				}
				if (isNodeModule) {
					return !shouldBundleNodeModules;
				}
				return !shouldBundleLocalFilesTogether;
			},
			plugins: [
				replace({
					preventAssignment: true,
					'process.env.NODE_ENV': `'${process.env.NODE_ENV}'`,
				}),
				json(),
				pluginNodeResolve.nodeResolve({
					extensions,
					preferBuiltins: true,
					browser: isBrowser ? true : false,
				}),
				commonjs(),
				peerDepsExternal(),
				pluginBabel.babel({
					extensions,
					babelHelpers: 'runtime',
					include: babelIncludes,
				}),
				isDevelopment
					? undefined
					: terser({
							keep_fnames: decorators,
					  }),
			],
		};
	};
const inputs = [
	{ include: ['./src/**', '!./src/client/**'], name: 'server' },
	{ include: ['./src/client/**'], name: 'server2', browser: true },
];

/**[
	{
		include: ['./src/**', '!./src/client/**'],
		entry: `./src/index.ts`,
		name: 'server',
	},
	{
		include: ['./src/client/**'],
		entry: `./src/client/index.ts`,
		name: 'server',
		browser: true,
	},
];
*/
const wow = inputs.reduce((acc, input) => {
	const files = globby.sync([...input.include, '!*.json'], {
		// cwd: process.env.FOLDER_PATH,
	});
	// const tempp = files.map((file) => path.join(process.env.FOLDER_PATH, file));
	const formats = ['cjs', 'esm'];
	return [
		...acc,
		...formats.reduce((acc, format) => {
			return [
				...acc,
				...files.map(
					getRollupConfig({
						isBrowser: input.browser,
						format,
					})
				),
			];
		}, []),
	];
}, []);

module.exports = wow;
