import { blockContent } from './blockContent';
import { callout } from './callout';
import { navigation } from './navigation';
import { navItem } from './navItem';
import { page } from './page';
import { post } from './post';
import { siteSettings } from './siteSettings';
import { uiStrings } from './uiStrings';
import { youtube } from './youtube';

export const schemaTypes = [
	post,
	page,
	navigation,
	siteSettings,
	uiStrings,
	blockContent,
	navItem,
	callout,
	youtube,
];
