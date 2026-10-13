import { WarningOutlineIcon } from '@sanity/icons/WarningOutline';
import { Badge, Box, Button, Card, Flex, Stack, Text } from '@sanity/ui';
import { useEffect, useState } from 'react';
import { getPublishedId, useClient } from 'sanity';
import { useIntentLink } from 'sanity/router';
import { LANGUAGES, type LanguageId } from '../languages';

const API_VERSION = '2026-10-01';
const REFETCH_DELAY_MS = 400;

const LINKED_TRANSLATIONS_QUERY = `*[_type == "translation.metadata" && references($id)][0].translations[]{
	language,
	"document": value->{_id, _type, title, "slug": slug.current, _updatedAt}
}`;

const OTHER_DOCUMENTS_LISTEN_QUERY = `*[_type in ["post", "page", "translation.metadata"] && !(_id in [$id, $draftId])]`;

interface LinkedDocument {
	_id: string;
	_type: string;
	title?: string;
	slug?: string;
	_updatedAt: string;
}

interface LinkedTranslation {
	language: LanguageId;
	document: LinkedDocument | null;
}

type PanelState =
	| { status: 'loading' }
	| { status: 'error' }
	| { status: 'ready'; translations: LinkedTranslation[] };

interface TranslationsPanelProps {
	documentId: string;
	language?: LanguageId;
	updatedAt?: string;
}

const languageTitle = (language: LanguageId) =>
	LANGUAGES.find(({ id }) => id === language)?.title ?? language;

const isNewerThan = (candidate: string, reference?: string) =>
	Boolean(reference) && Date.parse(candidate) > Date.parse(reference as string);

function useLinkedTranslations(publishedId: string): PanelState {
	const client = useClient({ apiVersion: API_VERSION });
	const [state, setState] = useState<PanelState>({ status: 'loading' });

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const params = { id: publishedId, draftId: `drafts.${publishedId}` };

		const load = () => {
			client
				.fetch<LinkedTranslation[] | null>(LINKED_TRANSLATIONS_QUERY, params, {
					perspective: 'drafts',
				})
				.then((translations) => {
					if (!cancelled) {
						setState({ status: 'ready', translations: translations ?? [] });
					}
				})
				.catch(() => {
					if (!cancelled) {
						setState({ status: 'error' });
					}
				});
		};

		const scheduleLoad = () => {
			clearTimeout(timer);
			timer = setTimeout(load, REFETCH_DELAY_MS);
		};

		setState({ status: 'loading' });
		load();
		const subscription = client
			.listen(OTHER_DOCUMENTS_LISTEN_QUERY, params, {
				includeResult: false,
				visibility: 'query',
				tag: 'translations-panel',
			})
			.subscribe(scheduleLoad);

		return () => {
			cancelled = true;
			clearTimeout(timer);
			subscription.unsubscribe();
		};
	}, [client, publishedId]);

	return state;
}

function OpenDocumentButton({ id, type }: { id: string; type: string }) {
	const { onClick, href } = useIntentLink({ intent: 'edit', params: { id, type } });
	return <Button as="a" href={href} onClick={onClick} mode="ghost" text="Відкрити" />;
}

function TranslationRow({
	language,
	linked,
	updatedAt,
}: {
	language: LanguageId;
	linked?: LinkedTranslation;
	updatedAt?: string;
}) {
	const document = linked?.document;
	const isStale = document ? isNewerThan(document._updatedAt, updatedAt) : false;

	return (
		<Card border padding={3} radius={2} tone={isStale ? 'caution' : 'default'}>
			<Stack gap={3}>
				<Flex align="center" gap={3}>
					<Badge tone={document ? 'positive' : 'default'}>{language.toUpperCase()}</Badge>
					<Box flex={1}>
						{document ? (
							<Stack gap={2}>
								<Text size={1} weight="semibold">
									{document.title || document._id}
								</Text>
								{document.slug ? (
									<Text size={1} muted>
										/{document.slug}
									</Text>
								) : null}
							</Stack>
						) : (
							<Stack gap={2}>
								<Text size={1} weight="semibold">
									{linked ? 'Документ недоступний' : 'немає перекладу'}
								</Text>
								<Text size={1} muted>
									{linked
										? 'Пара посилається на документ, якого не існує або який ще не опубліковано.'
										: `Використай кнопку «Translations» у шапці документа, щоб створити переклад (${languageTitle(language)}) або зв’язати існуючий.`}
								</Text>
							</Stack>
						)}
					</Box>
					{document ? (
						<OpenDocumentButton id={getPublishedId(document._id)} type={document._type} />
					) : null}
				</Flex>
				{isStale ? (
					<Flex align="center" gap={2}>
						<Text size={1}>
							<WarningOutlineIcon />
						</Text>
						<Text size={1}>Пару оновлено пізніше — перевір, чи переклад актуальний</Text>
					</Flex>
				) : null}
			</Stack>
		</Card>
	);
}

export function TranslationsPanel({ documentId, language, updatedAt }: TranslationsPanelProps) {
	const state = useLinkedTranslations(getPublishedId(documentId));
	const otherLanguages = LANGUAGES.filter(({ id }) => id !== language);

	return (
		<Stack gap={3}>
			<Text size={1} weight="semibold">
				Переклади
			</Text>
			{state.status === 'loading' ? (
				<Text size={1} muted>
					Завантаження…
				</Text>
			) : null}
			{state.status === 'error' ? (
				<Card padding={3} radius={2} tone="critical">
					<Text size={1}>Не вдалося завантажити переклади</Text>
				</Card>
			) : null}
			{state.status === 'ready'
				? otherLanguages.map(({ id }) => (
						<TranslationRow
							key={id}
							language={id}
							linked={state.translations.find((translation) => translation.language === id)}
							updatedAt={updatedAt}
						/>
					))
				: null}
		</Stack>
	);
}
