import { defineCliConfig } from 'sanity/cli';
import { DATASET, PROJECT_ID, STUDIO_HOST } from './src/project';

export default defineCliConfig({
	api: {
		projectId: PROJECT_ID,
		dataset: DATASET,
	},
	studioHost: STUDIO_HOST,
	deployment: {
		autoUpdates: true,
	},
});
