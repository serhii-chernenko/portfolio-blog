/**
 * Path prefix of every blog URL (`/blog/en/...`). The routes live under `src/pages/blog/` rather
 * than behind Astro's `base` option: EmDash mounts its admin and API at the host root
 * (`/_emdash/...`) and does not support a base path, so the app itself runs at `/` and only the
 * blog pages carry the prefix. Production binds `/blog*` and `/_emdash/*` to this Worker.
 */
export const BASE_PATH: string = '/blog';
