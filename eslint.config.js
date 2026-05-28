// @ts-check
import tseslint from 'typescript-eslint';
import eslintPluginAstro from 'eslint-plugin-astro';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
	// Global ignores
	{
		ignores: ['dist/', '.astro/', '.wrangler/', 'node_modules/', 'patches/', 'scripts/'],
	},

	// TypeScript files
	...tseslint.configs.recommended,

	// Astro files
	...eslintPluginAstro.configs.recommended,

	// Prettier must come last — disables all formatting rules that conflict
	prettierConfig,

	// Project-specific overrides (personal blog: pragmatic, not pedantic)
	{
		rules: {
			// TypeScript: relax rules that are noisy for a personal project
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					// Silence unused catch-binding variables (e.g. catch (e) {})
					caughtErrorsIgnorePattern: '.*',
				},
			],
			// Allow non-null assertions (common in Astro component scripts)
			'@typescript-eslint/no-non-null-assertion': 'off',
			// Allow require() in config files / scripts
			'@typescript-eslint/no-require-imports': 'warn',
			// `var` is intentionally used in some inline/vanilla JS snippets
			// (e.g. Giscus loader, pre-paint IIFE)
			'no-var': 'off',
			// Standard Astro/Cloudflare pattern: empty interface extending a type
			'@typescript-eslint/no-empty-object-type': 'off',
		},
	},

	// Astro env.d.ts uses the standard triple-slash reference pattern required
	// by the Astro type generation pipeline — disable that rule for .d.ts files
	{
		files: ['**/*.d.ts'],
		rules: {
			'@typescript-eslint/triple-slash-reference': 'off',
		},
	},
);
