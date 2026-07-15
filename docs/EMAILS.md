# Email templates — local visual editor

Notion-style WYSIWYG editor for transactional email templates, built on
`@react-email/editor` and modeled on the existing Keystatic-for-blog flow.

## Quick start

```bash
pnpm dev
# open http://127.0.0.1:4321/admin/emails
```

The list page shows all templates in `src/emails/`. Click one to open the
editor, edit, click **Save**. Click **New template** to create one.

## How it works

- **Storage**: each template is a single JSON file in `src/emails/{slug}.json`.
  It holds the TipTap `JSONContent` (editor source of truth), pre-rendered
  HTML (for previews and for the mail sender), a required plain-text version,
  plus metadata (`name`, `subject`, `locale`, `updatedAt`).
- **Editor**: `src/components/EmailEditorIsland.tsx` mounts `<EmailEditor>`
  as a React island (`client:only="react"` — TipTap needs DOM).
- **API**: `src/pages/api/emails/templates*` provides REST CRUD. All routes
  are guarded by `PUBLIC_KEYSTATIC_MODE === 'local'`, so they 403 in
  production (the Cloudflare Worker doesn't have `fs` anyway).
- **CSRF**: Astro 6 blocks cross-origin mutating requests. Browsers send
  `Origin` automatically; curl needs `-H 'origin: http://127.0.0.1:4321'`.

## Variables

Use `{{variableName}}` anywhere in the editor — they pass through to the
rendered HTML untouched. Detected placeholders are shown as badges above
the editor. Keep the same variables in the plain-text field. Existing seed
templates use `{{confirmUrl}}`, `{{manageUrl}}`, and `{{privacyUrl}}`.

## Consuming a template from app code

```ts
import { readTemplate } from '../lib/emails-store';

const tpl = await readTemplate('welcome-en');
if (!tpl) throw new Error('Missing template');

const html = tpl.html.replace('{{manageUrl}}', manageUrl);
const text = tpl.text.replace('{{manageUrl}}', manageUrl);

await env.SEND_EMAIL.send({
	from: '…',
	to: subscriber,
	subject: tpl.subject,
	html,
	text,
});
```

This module reads from disk, so it only works in the Node dev server. For
production sending from the Cloudflare Worker, bundle the JSON files (e.g.
import them statically) or move the registry into D1.

## Routes

| Method | Path                           | Notes                                              |
| ------ | ------------------------------ | -------------------------------------------------- |
| GET    | `/admin/emails`                | List + create UI                                   |
| GET    | `/admin/emails/[slug]`         | Editor UI                                          |
| GET    | `/api/emails/templates`        | `{ templates: Summary[] }`                         |
| POST   | `/api/emails/templates`        | Create. Body: `{slug,name,subject,locale}`         |
| GET    | `/api/emails/templates/[slug]` | Full template (json + html + text)                 |
| PUT    | `/api/emails/templates/[slug]` | Save. Body: `{name,subject,locale,json,html,text}` |
| DELETE | `/api/emails/templates/[slug]` | 204                                                |
