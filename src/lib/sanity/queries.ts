const TRANSLATIONS_PROJECTION = `*[_type == "translation.metadata" && references(^._id)][0].translations[].value->{
	_type,
	language,
	"slug": slug.current,
	publishedAt
}`;

const BODY_PROJECTION = `body[]{
	...,
	_type == "image" => {
		...,
		"asset": asset->{ _id, url, metadata { dimensions { width, height, aspectRatio } } }
	}
}`;

const CALLOUT_TEXT = `pt::text(body[_type == "callout"].body[])`;

const CODE_TEXT = `array::join(body[_type == "code" && defined(code)].code, " ")`;

const SEARCHABLE_CALLOUT_TEXT = `body[].body[].children[].text`;

const SEARCHABLE_CODE = `body[].code`;

const WORD_COUNT = `coalesce(length(string::split(pt::text(body), " ")), 0) +
		coalesce(length(string::split(${CALLOUT_TEXT}, " ")), 0) +
		coalesce(length(string::split(${CODE_TEXT}, " ")), 0)`;

const PUBLISHED_POST_FILTER = `_type == "post" && defined(slug.current) && defined(publishedAt) && ($includeFuture || publishedAt <= now())`;

const POST_SUMMARY_FIELDS = `
	"id": _id,
	"isDraft": defined(_originalId) && _originalId in path("drafts.**"),
	language,
	"slug": slug.current,
	title,
	description,
	publishedAt,
	updatedAt,
	"tags": coalesce(tags, []),
	heroImage{ asset, hotspot, crop, alt },
	"wordCount": ${WORD_COUNT},
	"translations": ${TRANSLATIONS_PROJECTION}
`;

export const POSTS_BY_LOCALE_QUERY = `*[${PUBLISHED_POST_FILTER} && language == $locale] | order(publishedAt desc) {${POST_SUMMARY_FIELDS}}`;

export const ALL_POSTS_QUERY = `*[${PUBLISHED_POST_FILTER}] | order(publishedAt desc) {${POST_SUMMARY_FIELDS}}`;

export const POST_BY_SLUG_QUERY = `*[${PUBLISHED_POST_FILTER} && language == $locale && slug.current == $slug][0]{
	${POST_SUMMARY_FIELDS},
	${BODY_PROJECTION}
}`;

const PLAIN_TEXT_BODY_PROJECTION = `"body": body[_type in ["block", "code", "callout", "image", "youtube"]]{
		...,
		_type == "image" => { _type, alt, caption }
	}`;

export const POST_PLAIN_TEXT_QUERY = `*[${PUBLISHED_POST_FILTER} && language == $locale && slug.current == $slug][0]{
	${POST_SUMMARY_FIELDS},
	${PLAIN_TEXT_BODY_PROJECTION}
}`;

export const POSTS_WITH_PLAIN_TEXT_BODY_QUERY = `*[${PUBLISHED_POST_FILTER} && language == $locale] | order(publishedAt desc) {
	${POST_SUMMARY_FIELDS},
	${PLAIN_TEXT_BODY_PROJECTION}
}`;

const PAGE_SUMMARY_FIELDS = `
	"id": _id,
	language,
	key,
	"slug": slug.current,
	title,
	description,
	"category": coalesce(category, "static"),
	updatedAt,
	"translations": ${TRANSLATIONS_PROJECTION}
`;

const PAGE_FILTER = `_type == "page" && defined(slug.current) && defined(key)`;

export const PAGES_BY_LOCALE_QUERY = `*[${PAGE_FILTER} && language == $locale] | order(title asc) {${PAGE_SUMMARY_FIELDS}}`;

export const PAGE_BY_SLUG_QUERY = `*[${PAGE_FILTER} && language == $locale && slug.current == $slug][0]{
	${PAGE_SUMMARY_FIELDS},
	${BODY_PROJECTION}
}`;

export const PAGE_BY_KEY_QUERY = `*[${PAGE_FILTER} && language == $locale && key == $key][0]{${PAGE_SUMMARY_FIELDS}}`;

const NAV_ITEM_PROJECTION = `{
	_key,
	label,
	linkType,
	route,
	url,
	icon,
	openInNewTab,
	"internal": internal->{ _type, language, "slug": slug.current }
}`;

export const LAYOUT_QUERY = `{
	"settings": *[_id == $settingsId][0]{
		siteName,
		tagline,
		description,
		heroEyebrow,
		heroTitle,
		heroSubtitle,
		aboutTitle,
		aboutBody,
		aboutCta,
		defaultOgImage{ asset, hotspot, crop }
	},
	"header": *[_id == $headerId][0].items[]${NAV_ITEM_PROJECTION},
	"footer": *[_id == $footerId][0].items[]${NAV_ITEM_PROJECTION},
	"aboutSlug": *[${PAGE_FILTER} && language == $locale && key == "about"][0].slug.current
}`;

export const SEARCH_POSTS_QUERY = `*[
	_type == "post" &&
	language == $locale &&
	defined(slug.current) &&
	publishedAt <= now() &&
	(
		title match $terms ||
		description match $terms ||
		tags match $terms ||
		pt::text(body) match $terms ||
		${SEARCHABLE_CALLOUT_TEXT} match $terms ||
		${SEARCHABLE_CODE} match $terms
	)
]
| score(
	boost(title match $terms, 4),
	boost(tags match $terms, 3),
	boost(description match $terms, 2),
	pt::text(body) match $terms,
	${SEARCHABLE_CALLOUT_TEXT} match $terms,
	${SEARCHABLE_CODE} match $terms
)
| order(_score desc, publishedAt desc)[0...$limit]{
	title,
	description,
	language,
	"slug": slug.current,
	publishedAt
}`;
