import { Card, Select, Stack, Text } from '@sanity/ui';
import {
	useCallback,
	useEffect,
	useState,
	type ChangeEvent,
	type FocusEventHandler,
	type Ref,
} from 'react';
import { set, unset, useClient, type StringInputProps } from 'sanity';

const API_VERSION = '2026-10-01';

const PAGE_KEYS_QUERY = `array::unique(*[_type == "page" && defined(key)].key)`;

type PageKeysState =
	{ status: 'loading' } | { status: 'error' } | { status: 'ready'; keys: string[] };

function usePageKeys(): PageKeysState {
	const client = useClient({ apiVersion: API_VERSION });
	const [state, setState] = useState<PageKeysState>({ status: 'loading' });

	useEffect(() => {
		let cancelled = false;
		client
			.fetch<string[] | null>(PAGE_KEYS_QUERY, {}, { perspective: 'drafts' })
			.then((keys) => {
				if (!cancelled) {
					setState({ status: 'ready', keys: [...(keys ?? [])].sort() });
				}
			})
			.catch(() => {
				if (!cancelled) {
					setState({ status: 'error' });
				}
			});
		return () => {
			cancelled = true;
		};
	}, [client]);

	return state;
}

export function PageKeyInput(props: StringInputProps) {
	const { value, onChange, readOnly, elementProps } = props;
	const state = usePageKeys();
	const keys = state.status === 'ready' ? state.keys : [];
	const options = value && !keys.includes(value) ? [value, ...keys] : keys;

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLSelectElement>) => {
			const next = event.currentTarget.value;
			onChange(next ? set(next) : unset());
		},
		[onChange],
	);

	return (
		<Stack gap={2}>
			<Select
				id={elementProps.id}
				ref={elementProps.ref as Ref<HTMLSelectElement>}
				onFocus={elementProps.onFocus as FocusEventHandler<HTMLSelectElement>}
				onBlur={elementProps.onBlur as FocusEventHandler<HTMLSelectElement>}
				value={value ?? ''}
				onChange={handleChange}
				readOnly={readOnly}
				disabled={readOnly || state.status === 'loading'}
			>
				<option value="">{state.status === 'loading' ? 'Завантаження…' : 'Обери сторінку'}</option>
				{options.map((key) => (
					<option key={key} value={key}>
						{key}
					</option>
				))}
			</Select>
			{state.status === 'error' ? (
				<Card padding={2} radius={2} tone="critical">
					<Text size={1}>Не вдалося завантажити ключі сторінок</Text>
				</Card>
			) : null}
		</Stack>
	);
}
