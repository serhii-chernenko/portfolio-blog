import { createHighlighterCoreSync, type ShikiTransformer } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import css from 'shiki/langs/css.mjs';
import html from 'shiki/langs/html.mjs';
import javascript from 'shiki/langs/javascript.mjs';
import json from 'shiki/langs/json.mjs';
import shellscript from 'shiki/langs/shellscript.mjs';
import sql from 'shiki/langs/sql.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import githubDark from 'shiki/themes/github-dark.mjs';
import githubLight from 'shiki/themes/github-light.mjs';

const PLAIN_TEXT_LANGUAGE = 'text';
const WRAP_STYLE = 'overflow-x: auto; white-space: pre-wrap; word-wrap: break-word;';

const highlighter = createHighlighterCoreSync({
	themes: [githubLight, githubDark],
	langs: [javascript, typescript, json, shellscript, sql, html, css],
	engine: createJavaScriptRegexEngine({ forgiving: true }),
});

const loadedLanguages = new Set(highlighter.getLoadedLanguages());

function astroCodeTransformer(language: string | undefined): ShikiTransformer {
	return {
		pre(node) {
			node.properties.class = 'astro-code astro-code-themes github-light github-dark';
			node.properties.style = `${node.properties.style ?? ''}; ${WRAP_STYLE}`;
			if (language) node.properties['data-language'] = language;
		},
	};
}

export function highlightCode(code: string, language: string | undefined): string {
	const requested = language?.trim().toLowerCase() || undefined;
	const lang = requested && loadedLanguages.has(requested) ? requested : PLAIN_TEXT_LANGUAGE;
	return highlighter.codeToHtml(code, {
		lang,
		themes: { light: 'github-light', dark: 'github-dark' },
		defaultColor: 'light',
		transformers: [astroCodeTransformer(requested)],
	});
}
