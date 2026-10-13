import type { SomePortableTextComponents } from 'astro-portabletext/types';
import Link from './Link.astro';

export const inlineComponents: SomePortableTextComponents = {
	mark: { link: Link },
};
