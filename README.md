# bookmarks

Personal bookmark manager. Bookmarks live in [`bookmarks.json`](./bookmarks.json) and are processed by GitHub Actions — each URL gets its title, description, and semantic tags fetched automatically.

## Setup

1. Create a GitHub Personal Access Token with `repo` + `workflow` scopes → [generate one here](https://github.com/settings/tokens/new?scopes=repo,workflow&description=bookmark-manager)
2. Open `bookmarks.html` in your browser (or host it on your tools site)
3. Click ⚙ Settings, paste your token and repo name (`jubilancy/bookmarks`)
4. Paste URLs into the add panel — hundreds at a time is fine
5. GitHub Actions processes them in the background (~30–60s), then click refresh

## How it works

- **Frontend** (`bookmarks.html`) reads `bookmarks.json` via the GitHub API and renders the UI
- **Adding bookmarks** triggers the `process-bookmarks.yml` workflow via `workflow_dispatch`
- **The workflow** runs `.github/scripts/process.mjs` which:
  - Fetches each page's `<title>`, `og:description`, `og:image`, and favicon
  - Assigns semantic tags based on a keyword taxonomy (no AI key needed)
  - Adds domain-based tag hints (e.g. `github.com` → `open-source`, `devtools`)
  - Commits the updated `bookmarks.json` back to the repo
- **Deletions and pins** are written directly to `bookmarks.json` via the GitHub Contents API

## Storage

Everything is in `bookmarks.json` — a flat array of bookmark objects:

```json
{
  "id": "uuid",
  "url": "https://example.com",
  "title": "Page Title",
  "description": "Page description from og:description or meta",
  "image": "https://og-image-url.com/img.png",
  "favicon": "https://example.com/favicon.ico",
  "domain": "example.com",
  "tags": ["web-dev", "reference", "tool"],
  "collection": "reading",
  "added": "2026-06-22T00:00:00.000Z",
  "pinned": false
}
```
