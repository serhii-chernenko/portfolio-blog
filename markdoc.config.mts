import { defineMarkdocConfig, component, nodes } from '@astrojs/markdoc/config';
import shiki from '@astrojs/markdoc/shiki';

export default defineMarkdocConfig({
	// Shiki transforms ```lang fenced blocks into the dual-theme HTML emitted by
	// Astro core (<pre class="astro-code github-light"> + <pre class="astro-code github-dark">).
	// We DO NOT override the `fence` node — overriding it discards Shiki's output.
	// Language badge + copy button are layered on by `src/components/CodeBlockEnhancer.astro`
	// (or vanilla JS in BaseLayout) — see styles in src/styles/global.css.
	extends: [
		shiki({ 
			themes: { 
				light: 'github-light', 
				dark: 'github-dark' 
			},
			wrap: true, 
		})
	],
	nodes: {
		// Body `![]()` images. Keystatic authors them as `/src/assets/posts/...`
		// source paths (its `publicPath`), which the default image node ships
		// verbatim — no file emitted, 404 in prod. MarkdocImage.astro resolves
		// that string to the hashed, base-aware `_astro` URL via the asset
		// pipeline. `...nodes.image` keeps the default src/alt/title attributes.
		image: {
			...nodes.image,
			render: component('./src/components/markdoc/MarkdocImage.astro'),
		},
	},
	tags: {
		youtube: {
			render: component('./src/components/markdoc/YouTube.astro'),
			attributes: {
				id: { type: String, required: true },
				title: { type: String },
			},
		},
		callout: {
			render: component('./src/components/markdoc/Callout.astro'),
			attributes: {
				type: {
					type: String,
					default: 'info',
					matches: ['info', 'warn', 'tip', 'danger'],
				},
			},
		},
	},
});
