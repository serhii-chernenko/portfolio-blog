import {
	createClient,
	type ClientPerspective,
	type ContentSourceMapParsedPath,
	type FilterDefault,
	type SanityClient,
} from '@sanity/client';
import { apiVersion, dataset, projectId, studioUrl } from './config';

const STEGA_TOP_LEVEL_FIELDS = new Set([
	'title',
	'description',
	'siteName',
	'tagline',
	'heroEyebrow',
	'heroTitle',
	'heroSubtitle',
	'aboutTitle',
	'aboutBody',
	'aboutCta',
]);

const STEGA_NESTED_FIELDS = new Set(['label', 'text', 'alt', 'caption']);

const LOCALIZED_VALUE_FIELD = 'value';

const STEGA_LOCALIZED_FIELDS = new Set([
	'label',
	'siteName',
	'tagline',
	'description',
	'heroEyebrow',
	'heroTitle',
	'heroSubtitle',
	'aboutTitle',
	'aboutBody',
	'aboutCta',
	'entries',
]);

function isLocalizedHumanCopy(sourcePath: ContentSourceMapParsedPath): boolean {
	return (
		sourcePath.at(-1) === LOCALIZED_VALUE_FIELD &&
		sourcePath
			.slice(0, -1)
			.some((segment) => typeof segment === 'string' && STEGA_LOCALIZED_FIELDS.has(segment))
	);
}

const encodeHumanCopyOnly: FilterDefault = (props) => {
	const fieldName = props.sourcePath.at(-1);
	if (typeof fieldName !== 'string') return false;
	const isHumanCopy =
		isLocalizedHumanCopy(props.sourcePath) ||
		(props.sourcePath.length === 1
			? STEGA_TOP_LEVEL_FIELDS.has(fieldName)
			: STEGA_NESTED_FIELDS.has(fieldName));
	return isHumanCopy && props.filterDefault(props);
};

export const publishedClient = createClient({
	projectId,
	dataset,
	apiVersion,
	useCdn: false,
	perspective: 'published',
});

export function previewClient(token: string, perspective: ClientPerspective): SanityClient {
	return createClient({
		projectId,
		dataset,
		apiVersion,
		useCdn: false,
		token,
		perspective,
		stega: { enabled: true, studioUrl, filter: encodeHumanCopyOnly },
	});
}
