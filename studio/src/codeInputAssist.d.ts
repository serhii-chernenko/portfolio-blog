import '@sanity/code-input';
import type { AssistOptions } from '@sanity/assist';

declare module '@sanity/code-input' {
	interface CodeOptions extends AssistOptions {}
}
