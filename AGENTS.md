# Agent notes

## CMS

Content lives in [EmDash](https://emdashcms.com), running inside this Worker (admin at `/_emdash/admin`). Read [`docs/CMS.md`](./docs/CMS.md) before changing the content model, the data layer (`src/lib/cms/`), the site plugin (`plugins/emdash-site/`) or the routing (`src/pages/blog/`, no Astro `base`).

The EmDash agent skills are installed in `.agents/skills/`: `building-emdash-site`, `creating-plugins`, `emdash-cli` and `upgrading-emdash`. Use them for EmDash work.

## Documentation

Look up EmDash documentation via the `emdash-docs` MCP server when you need to verify an API, hook, config option, or pattern. Prefer the docs MCP over assumptions from training data -- the docs reflect the current published behaviour.
