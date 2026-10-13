import { defineCliConfig } from 'sanity/cli';
import { DATASET, PROJECT_ID, STUDIO_APP_ID } from './src/project';

export default defineCliConfig({
	api: {
		projectId: PROJECT_ID,
		dataset: DATASET,
	},
	deployment: {
		appId: STUDIO_APP_ID,
		autoUpdates: false,
	},
});
