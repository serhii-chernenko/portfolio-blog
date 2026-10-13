import { Stack } from '@sanity/ui';
import { isSanityDocument, type InputProps } from 'sanity';
import { LOCALIZED_DOCUMENT_TYPES, type LanguageId } from '../languages';
import { TranslationsPanel } from './TranslationsPanel';

interface LocalizedDocumentValue {
	_id: string;
	_updatedAt?: string;
	language?: LanguageId;
}

export function RootInputWithTranslations(props: InputProps) {
	const { value } = props;
	const isLocalizedRoot =
		props.id === 'root' &&
		LOCALIZED_DOCUMENT_TYPES.includes(props.schemaType.name) &&
		isSanityDocument(value);

	if (!isLocalizedRoot) {
		return props.renderDefault(props);
	}

	const { _id, _updatedAt, language } = value as LocalizedDocumentValue;

	return (
		<Stack gap={5}>
			<TranslationsPanel documentId={_id} language={language} updatedAt={_updatedAt} />
			{props.renderDefault(props)}
		</Stack>
	);
}
