import resolve from '@rollup/plugin-node-resolve';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import babel from '@rollup/plugin-babel';

import globby from 'fast-glob';
import path from 'path';
const extensions = ['.js', '.ts'];
const babelIncludes = ['./src/**/*'];
const configs = globby.sync(['./src/**/*', '!./src/**/*.stories.tsx', '!./src/**/*.mdx']);
const getRollupConfig =
	({ isBrowser = false } = {}) =>
	(input) => {
		return {
			input,
			output: {
				file: path.join(
					'./dist',
					isBrowser ? 'browser' : 'node',
					input.replace('/src', '').replace(/\.(tsx|ts)/, '.js')
				),
				format: 'esm',
			},
			external(id) {
				if (id.endsWith(input.replace('./', '/'))) {
					return false;
				}
				return true;
			},
			plugins: [
				resolve({
					extensions,
					browser: isBrowser,
				}),
				babel({
					extensions,
					babelHelpers: 'runtime',
					include: babelIncludes,
				}),
				peerDepsExternal(),
			],
		};
	};
export default [...configs.map(getRollupConfig()), ...configs.map(getRollupConfig({ isBrowser: true }))];
