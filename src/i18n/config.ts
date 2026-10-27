export const locales = ['en', 'uk'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const htmlLangAttribute: Record<Locale, string> = {
	en: 'en',
	uk: 'uk-UA',
};

/** BCP 47 tag for `Intl` date formatting. */
export const dateLocale: Record<Locale, string> = {
	en: 'en-US',
	uk: 'uk-UA',
};

export const ogLocale: Record<Locale, string> = {
	en: 'en_US',
	uk: 'uk_UA',
};

export const localeLabels: Record<Locale, string> = {
	en: 'English',
	uk: 'Українська',
};

export function isLocale(value: string): value is Locale {
	return (locales as readonly string[]).includes(value);
}
