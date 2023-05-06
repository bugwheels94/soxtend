const { NODE_ENV, BABEL_ENV } = process.env;
const cjs = NODE_ENV === 'test' || BABEL_ENV === 'commonjs';
const loose = true;

module.exports = {
	presets: [
		[
			'@babel/preset-env',
			{
				loose,
				targets: {
					chrome: 80,
				},
				modules: false,
				exclude: ['@babel/plugin-transform-regenerator'],
			},
		],
		...(true ? ['@babel/preset-typescript'] : []),
	],
	plugins: [
		false && ['@babel/plugin-proposal-decorators', { decoratorsBeforeExport: true }],
		[
			'const-enum',
			{
				transform: 'constObject',
			},
		],
		cjs && ['@babel/transform-modules-commonjs', { loose }],
		runtime === 'runtime' && [
			'@babel/transform-runtime',
			{
				// useESModules: !cjs, @babe
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				version: require('./package.json').dependencies['@babel/runtime'].replace(/^[^0-9]*/, ''),
			},
		],
	].filter(Boolean),
};
