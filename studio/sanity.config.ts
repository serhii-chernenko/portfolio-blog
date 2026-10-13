import { assist } from '@sanity/assist';
import { codeInput } from '@sanity/code-input';
import { documentInternationalization } from '@sanity/document-internationalization';
import { visionTool } from '@sanity/vision';
import { defineConfig } from 'sanity';
import { presentationTool } from 'sanity/presentation';
import { structureTool } from 'sanity/structure';
import { RootInputWithTranslations } from './src/components/RootInputWithTranslations';
import { LANGUAGE_FIELD, LANGUAGES, LOCALIZED_DOCUMENT_TYPES } from './src/languages';
import { resolve } from './src/presentation/resolve';
import { BLOG_BASE_PATH, DATASET, PROJECT_ID, SITE_ORIGIN } from './src/project';
import { schemaTypes } from './src/schemaTypes';
import { SINGLETON_TEMPLATES, SINGLETON_TYPES } from './src/singletons';
import { structure } from './src/structure';
import { TRANSLATION_METADATA_TYPE, withReadablePreview } from './src/translationMetadata';

const PREVIEW_ORIGIN = process.env.SANITY_STUDIO_PREVIEW_ORIGIN || SITE_ORIGIN;

const WORKERS_DEV_PREVIEW_ORIGIN = 'https://*.chernenko.workers.dev';
const LOCAL_PREVIEW_ORIGIN = 'http://localhost:*';

const ALLOWED_PREVIEW_ORIGINS = [
	SITE_ORIGIN,
	WORKERS_DEV_PREVIEW_ORIGIN,
	...(process.env.NODE_ENV === 'production' ? [] : [LOCAL_PREVIEW_ORIGIN]),
];

const HIDDEN_TEMPLATE_IDS = [
	...LOCALIZED_DOCUMENT_TYPES,
	...LOCALIZED_DOCUMENT_TYPES.map((type) => `${type}-parameterized`),
	...SINGLETON_TYPES,
	...SINGLETON_TEMPLATES.map(({ id }) => id),
	TRANSLATION_METADATA_TYPE,
];

const RESTRICTED_SINGLETON_ACTIONS = ['publish', 'discardChanges', 'restore'];

export default defineConfig({
	name: 'default',
	title: 'Serhii Chernenko Blog',
	projectId: PROJECT_ID,
	dataset: DATASET,
	plugins: [
		structureTool({ structure }),
		presentationTool({
			previewUrl: {
				initial: `${PREVIEW_ORIGIN}${BLOG_BASE_PATH}/en/`,
				previewMode: {
					enable: `${BLOG_BASE_PATH}/api/draft-mode/enable`,
					disable: `${BLOG_BASE_PATH}/api/draft-mode/disable`,
				},
			},
			allowOrigins: ALLOWED_PREVIEW_ORIGINS,
			resolve,
		}),
		documentInternationalization({
			supportedLanguages: LANGUAGES,
			schemaTypes: LOCALIZED_DOCUMENT_TYPES,
			languageField: LANGUAGE_FIELD,
		}),
		assist({
			translate: {
				document: {
					languageField: LANGUAGE_FIELD,
					documentTypes: LOCALIZED_DOCUMENT_TYPES,
				},
			},
		}),
		codeInput(),
		visionTool({ defaultApiVersion: '2026-10-01' }),
	],
	schema: {
		types: (prev) => [...prev.map(withReadablePreview), ...schemaTypes],
		templates: (prev) => [...prev, ...SINGLETON_TEMPLATES],
	},
	form: {
		components: {
			input: RootInputWithTranslations,
		},
	},
	document: {
		newDocumentOptions: (prev) =>
			prev.filter(({ templateId }) => !HIDDEN_TEMPLATE_IDS.includes(templateId)),
		actions: (prev, { schemaType }) => {
			if (schemaType === TRANSLATION_METADATA_TYPE) {
				return [];
			}
			return SINGLETON_TYPES.includes(schemaType)
				? prev.filter(({ action }) => action && RESTRICTED_SINGLETON_ACTIONS.includes(action))
				: prev;
		},
	},
});
