# Blogs Section — Functional & UX Reference Specification

## 1. Purpose

This document captures the **functional behavior, workflows, information architecture, and UX patterns** of the existing **BM CMS Admin Blogs** system in this repository (`bm-promo` / Budding Mariners).

It is intended as an **implementation reference** for building or improving a Blogs section with **equivalent (or better) capabilities**, while allowing a completely independent visual design system (colors, typography, branding, spacing, component chrome).

**Important context:** This repository contains **one** Blogs CMS implementation (admin under `/admin/blogs`, public under `/blog`). There is **no separate “other website” package**. That single implementation is the reference analyzed here.

---

## 2. Scope

### In scope

- Admin Blogs listing, create, edit, preview, publish/unpublish, delete
- TipTap rich editor behavior (toolbar, bubble menus, slash commands, links, images, embeds, tables)
- Draft autosave, revisions, scheduling, archival status
- Tags, slugs, SEO helpers, accessibility checks
- Media library / media picker integration for cover and inline images
- Public blog listing and post rendering relationship
- Backend models, APIs, validation, sanitization (high level)

### Out of scope (explicitly not copied)

- Visual branding (yellow/black BM CMS theme, exact typography, card radii, etc.)
- Exact Tailwind class names or CSS selectors
- Pixel-perfect layout cloning

### Evidence standard

- Statements below are based on **verified code behavior**.
- Items that could not be confirmed are marked **`Unknown`**, **`Not verified`**, or **`Needs investigation`**.
- No invented product features.

---

## 3. Reference System Overview

| Surface | Routes | Purpose |
| -------- | ------ | ------- |
| Admin CMS | `/admin/*` (auth-gated) | Manage leads, blogs, media |
| Admin Blogs | `/admin/blogs`, `/admin/blogs/new`, `/admin/blogs/:id/edit` | List / create / edit posts |
| Admin Media | `/admin/media` | Standalone media library (also used via picker modals) |
| Public Blog | `/blog`, `/blog/:slug` | Reader-facing listing and article pages |

**Product chrome name:** “BM CMS”  
**Editor stack:** TipTap v3 + ProseMirror extensions  
**Media storage:** Cloudinary (folder root `bm-blog`) + `MediaAsset` MongoDB records  
**Auth:** Single admin credential pair (email/password env) → Bearer HMAC token; **no multi-role permission matrix verified**

### Core product idea

Administrators author posts in a **document-oriented rich editor**. The **TipTap JSON document (`contentBlocks`)** is the source of truth. On save, the server renders sanitized HTML (`contentHtml`), plain text, word count, reading time, and media usage. Drafts can autosave **without overwriting published content**. Public pages only show posts that pass a **visibility filter** (published / due scheduled, not expired).

---

## 4. Information Architecture

```text
Admin Panel (BM CMS)
├── Leads
├── Blogs
│   ├── Blog List          (/admin/blogs)
│   ├── Create Post        (/admin/blogs/new)
│   └── Edit Post          (/admin/blogs/:id/edit)
│       ├── Editor canvas (or in-page Preview)
│       ├── Post settings sidebar
│       ├── Featured media sidebar
│       ├── SEO sidebar
│       ├── Accessibility sidebar
│       ├── Revisions sidebar (edit only)
│       └── MediaPicker modal (cover / insert / replace)
└── Media
    └── Media Library      (/admin/media)
```

### Navigation

- Desktop: left sidebar with **Leads / Blogs / Media** + Logout.
- Mobile (`md` breakpoint): sidebar hidden; horizontal pill nav under a compact header.
- Within Blogs: list → **New Post** or **Edit**; editor has **Back** to list.
- There is **no** dedicated Categories admin section, Tags admin section, or Blog Settings page.
- Preview is **in-page toggle** on the editor (not a separate route).

### Screen relationships

| From | Action | To |
| ---- | ------ | -- |
| Blog List | New Post | Create editor |
| Blog List | Edit | Edit editor |
| Blog List | Publish / Unpublish | Stays on list; updates card status |
| Blog List | Delete | Removes card after confirm |
| Editor | Back | Blog List |
| Editor | First successful create save | Navigates to Edit URL (`replace`) |
| Editor | Preview | Same page; editor hidden, `BlogContent` shown |
| Editor | Choose cover / insert / replace image | MediaPicker modal |
| Media nav | Standalone library | Independent of a specific blog |

---

## 5. Blog Listing

**File:** `client/src/admin/pages/BlogsPage.tsx`  
**API:** `GET /api/admin/blogs` (returns all blogs, sorted server-side)

### Layout

1. **Header**
   - Title: “Blogs”
   - Subtitle: “Manage published posts and drafts”
   - Actions: **Refresh**, **New Post**
2. **Feedback strip**
   - Error text (red) and success message (green) above the list
3. **Content**
   - Loading text, empty state, or vertical stack of post cards

### Card information displayed (verified)

For each blog:

| Field | Shown | Notes |
| ----- | ----- | ----- |
| Thumbnail | Yes | `thumbnailUrl` or “No thumbnail” placeholder |
| Featured badge | Yes | If `featured` |
| Status | Yes | `status` string, else fallback from `published` |
| Created date | Yes | `createdAt` via `formatDate` |
| Reading time | Yes | If `readingTimeMinutes` set |
| Title | Yes | |
| Author | Yes | “By {author}” |
| Public path | Yes | `/blog/{slug}` when slug exists |
| Description / excerpt | Yes | `description`, line-clamped |
| Tags | No | Not shown on list |
| Categories | No | Not shown |
| Views / analytics | No | Schema has `stats`, not used in UI |
| Updated / published dates | No | Not shown on list cards |

### List layout pattern

- Card grid: thumbnail column (~180px on `md+`) + content column.
- Not a data table; no row checkboxes; no bulk toolbar.

### Actions on the listing page

| Action | Where | Behavior | Confirmation | After success |
| ------ | ----- | -------- | ------------ | ------------- |
| Refresh | Header button | Re-fetches all blogs | No | Replaces list; clears into loading |
| New Post | Header link | Navigates to `/admin/blogs/new` | No | — |
| Publish / Unpublish | Per card | `PATCH /api/admin/blogs/:id` with `{ published: next }` | No | Card replaced with returned blog; message “Post published.” / “Post set to draft.” |
| Edit | Per card | Navigates to edit route | No | — |
| Delete | Per card | `DELETE /api/admin/blogs/:id` | Browser `confirm('Delete this blog post?')` | Card removed; message “Blog deleted.” |

**Notes on Publish/Unpublish from list:**

- Uses boolean `published`, not the full status enum UI.
- Server maps `published: false` → status `draft`, `published: true` → status `published`.
- Scheduling / archived nuances are **not** controlled from the list toggle.

### Empty / loading / error

- **Loading:** centered “Loading blogs...”
- **Empty:** dashed panel — “No blogs yet. Create your first post with the rich editor.”
- **Error:** “Unable to load blogs right now.” (list cleared)

### Not present on Blog List (verified absence)

- Search
- Filters (status/category/author/date/tags)
- Sorting UI
- Pagination
- Bulk selection / bulk actions
- Duplicate / archive / restore from list
- Preview from list

---

## 6. Search

### Admin Blog List

**Does not exist.** The list loads the full collection with no search field.

### Related: Media Library search (adjacent capability)

Media Library (`MediaLibrary.tsx`) **does** provide search:

- Location: search input “Search assets…”
- Debounced ~250ms when search non-empty
- Sent as `search` query param to `GET /api/admin/media`
- Works with kind filter + pagination
- Exact fields searched server-side: **Needs investigation** beyond “search” query support existing

### Public Blog List

**No search.** Fetches all publicly visible posts.

---

## 7. Filtering

### Admin Blog List

**No filters.**

### Media Library filters (related)

- Kind filter chips: All / Images / Videos / Audio / Documents
- Single-select (one kind or all)
- Combined with search
- Resets to page 1 when search changes

### Public Blog List

- Server applies visibility filter only.
- Client separates featured vs remaining posts; not an admin filter.

---

## 8. Sorting

### Admin Blog List

- **No UI sorting controls.**
- Server default sort (`blogService`): `{ featured: -1, createdAt: -1 }`.

### Persistence

- Sort is fixed server-side; not user-configurable. **Not verified** whether clients can pass sort params (admin list endpoint does not appear to accept them).

---

## 9. Create Blog

### Entry

1. Admin opens **Blogs**.
2. Clicks **New Post** → `/admin/blogs/new`.

### Initial state

| Field | Default |
| ----- | ------- |
| Title | Empty |
| Status | `draft` |
| Featured | `false` |
| Author | `BM Team` |
| Slug | Empty (auto-fills from title once typing begins, until slug manually touched) |
| Meta description | Empty |
| Tags | Empty string (comma-separated input) |
| YouTube URL | Empty |
| Thumbnail URL | Empty |
| Scheduled for | Empty |
| Expires at | Empty |
| Editor content | Empty doc / placeholder “Start writing… Type / for blocks” |

### Local draft recovery on create

- On create page load, editor attempts to restore `localStorage` key `bm_editor_draft`.
- If present and parseable, restores title, settings, and content JSON.
- Corrupt drafts are ignored silently.

### Required vs optional (create/save path)

| Field | Client | Server |
| ----- | ------ | ------ |
| Title | Required (`trim` check + HTML `required`) | Required; empty rejected |
| Description | Not a separate editor field | Required on create; auto-built as excerpt from content text if omitted |
| Author | Optional in UI; falls back to `BM Team` | Defaults to `BM Team` if missing |
| Content blocks | Optional for draft UX, but excerpt/description still needed | Create requires description; derived from content when blocks provided |
| Slug | Optional; auto-generated from title if missing | Auto-unique slug from title if not supplied |
| Tags / media / SEO / schedule | Optional | Optional with validation rules when set |

### Save / publish from create

- **Save draft** → `save('draft')` → `POST /api/admin/blogs` with `status: 'draft'`, `published: false`.
- **Publish** → `save('published')` → same endpoint with `status: 'published'`, `published: true`.
- Form submit (Enter in title, etc.) calls `save()` using **current status dropdown value**.
- On success for a new post: clears local draft key, shows message, **navigates to** `/admin/blogs/{id}/edit` with `replace: true`.

### Autosave during create

- Interval every **30 seconds** if title or HTML content exists.
- Writes localStorage draft.
- Server draft endpoint is only called when `id` exists (so **server draft autosave starts after first successful create**).

---

## 10. Blog Editor

**File:** `client/src/admin/pages/BlogEditorPage.tsx`  
**Editor:** `client/src/components/RichEditor/*` (TipTap)

### Layout

- Max width ~1400px.
- **Main column:** large title input + RichEditor (or Preview).
- **Right sidebar (320px on `xl+`):** Post settings, Featured media, SEO, Accessibility, Revisions (edit only).
- Top bar: Back, title (New/Edit), autosave/word-count status, Preview, Save draft, Publish.

### Editor model

- Source of truth in storage: TipTap JSON (`contentBlocks`).
- Client keeps HTML, JSON, word count, character count in memory.
- On save, JSON is prepared via `prepareContentBlocksForSave` and sent to API.
- Server re-renders HTML with shared schema + `sanitize-html`; **does not trust client HTML**.

### Edit load behavior

When opening an existing post:

1. Loads `GET /api/admin/blogs/:id`.
2. If `draft.contentBlocks` and `draft.savedAt` exist → **loads draft content/title** and shows recovery message with draft timestamp.
3. Otherwise loads published/live `contentBlocks`.
4. Loads revision summaries.

### Preview toggle

- Button switches between Edit and Preview.
- Before entering Preview, flushes pending image toolbar changes and refreshes content snapshot.
- Preview renders `renderBlogContentHtml(content.json)` through `BlogContent` (same public body styles).
- Preview uses **current in-memory editor content**, including unsaved changes.
- Works for drafts and published posts equally (no separate public URL required).

### What the editor supports (verified)

See sections 11–14 for detail. High-level:

- Block types: paragraphs, H1–H4 (UI exposes H1–H3), lists, task lists, blockquotes, code blocks, tables, horizontal rules, callouts, YouTube embeds, images
- Marks: bold, italic, underline, strike, highlight, inline code, links, font family
- Alignment: left/center/right/justify (with heading restrictions for justify)
- Images: upload / library insert, replace, resize handles, layouts, spacing, alt, caption, image hyperlinks
- Slash command menu (`/`)
- Selection bubble toolbar + image bubble toolbar

### Not verified / not exposed in UI

- Subscript / Superscript extensions are registered, but **no toolbar buttons** found.
- Heading 4 is allowed by schema; toolbar/slash menu only expose H1–H3.
- Callout **variant switching UI** beyond default `info` insert: **Needs investigation** (insert defaults to `info`; no obvious variant picker in toolbar).
- Unsaved-navigation warning (`beforeunload`): **not found** in admin blog code.

---

## 11. Editor Toolbar

**File:** `EditorToolbar.tsx`  
Fixed top toolbar above the canvas.

### Toolbar layout (left → right groups)

1. Undo / Redo  
2. Heading 1 / 2 / 3  
3. Font family selector  
4. Bold / Italic / Underline / Strike / Highlight / Inline code  
5. Align left / center / right / justify  
6. Bullet list / Ordered list / Blockquote / Table insert  
7. Link / Insert image / YouTube  

### Control catalog

| Control | Purpose | Interaction | Available when | Result |
| ------- | ------- | ----------- | -------------- | ------ |
| Undo | History back | Click | Editor focused/history available (TipTap) | Undoes last change |
| Redo | History forward | Click | — | Redoes |
| H1/H2/H3 | Toggle heading level | Click; active state when current | Always | Sets/toggles heading |
| Font family | Apply font mark | Dropdown | Always | Applies registry font to selection |
| Bold/Italic/Underline/Strike/Highlight/Code | Inline marks | Toggle; `is-active` class | Always | Toggles mark |
| Align L/C/R/J | Block alignment | Click; disabled when alignment unsupported | Disabled if selection cannot align; Justify disabled on headings | Sets textAlign |
| Bullet / Ordered list | Lists | Toggle | Always | Toggles list |
| Blockquote | Quote block | Toggle | Always | Toggles blockquote |
| Table | Insert table | Opens grid popover (up to 8×8) | Always | Inserts table with header |
| Link | Text hyperlink | Opens `LinkPopover` | Enabled if non-empty text selection **or** cursor in existing link | Apply/remove/open/copy URL |
| Image | Insert image | Opens MediaPicker if callback provided; else file input | Disabled while uploading | Inserts image node |
| YouTube | Embed video | `window.prompt` for URL | Always | Inserts YouTube node |

### Active / disabled behavior

- Formatting buttons use TipTap `isActive(...)` for pressed styling.
- Link disabled when selection empty and not already in a link.
- Alignment disabled when `selectionAlign === null` (e.g. unsupported nodes).
- Image button shows “Uploading…” title and disables during direct upload path.

### Contextual toolbars (not in main bar)

- **Text BubbleToolbar:** appears on text selection (bold/italic/underline/strike/code/highlight/link + align menu).
- **Image BubbleToolbar:** appears when an image node is selected.

---

## 12. Text Formatting

### Verified formatting features

| Feature | Available | How |
| ------- | --------- | --- |
| Bold | Yes | Toolbar + bubble |
| Italic | Yes | Toolbar + bubble |
| Underline | Yes | Toolbar + bubble |
| Strikethrough | Yes | Toolbar + bubble |
| Highlight | Yes | Toolbar + bubble (single color; multicolor false) |
| Inline code | Yes | Toolbar + bubble |
| Headings H1–H3 | Yes | Toolbar + slash |
| Heading H4 | Schema yes | UI limited; **not in toolbar** |
| Paragraph | Yes | Slash + default |
| Blockquote | Yes | Toolbar + slash |
| Bullet list | Yes | Toolbar + slash |
| Ordered list | Yes | Toolbar + slash |
| Task / checklist list | Yes | Slash command |
| Code block | Yes | Slash command |
| Divider (HR) | Yes | Slash command |
| Font family | Yes | FontFamilySelector (registry: sans/serif/system featured sets) |
| Font size | **No dedicated control verified** | — |
| Text color | **No** | — |
| Indentation controls | **No dedicated UI verified** | Lists may nest via TipTap defaults — **Needs investigation** |
| Alignment | Yes | left/center/right/justify |
| Subscript/Superscript | Extensions present | **No UI controls verified** |

### Slash commands (`/`)

Groups and items:

- **Text:** Paragraph, H1, H2, H3, Bullet List, Ordered List, Task List, Blockquote, Code Block, Table (3×3), Divider  
- **Media:** YouTube Video (prompt for URL)  
- **Layout:** Callout (variant `info`)

Keyboard in slash menu: ArrowUp/ArrowDown, Enter, Escape. Filter by title/description/group substring.

---

## 13. Links

### Text links

**Entry points:** main toolbar Link button; bubble toolbar Link button.

**Behavior:**

1. Requires non-empty selection to create a new link (unless already inside a link).
2. Selection range is captured before popover opens (so focus move doesn’t lose selection).
3. `LinkPopover` validates via `validateLinkUrl` / `sanitizeLinkUrl`.
4. Apply sets TipTap link mark with sanitized `href`.
5. Remove unsets link mark.
6. Open opens URL in new tab (`noopener,noreferrer`).
7. Copy writes sanitized URL to clipboard.

**Allowed URL shapes (verified):**

- `http:` / `https:`
- Relative paths starting with `/`
- Hash anchors `#...`
- `mailto:` / `tel:`
- Domain-like strings auto-prefixed with `https://`
- Bare emails auto-prefixed with `mailto:`

**Blocked:** `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, protocol-relative `//...`, null bytes, etc.

**Rendered public attributes:** external http(s) links get `target="_blank"` and `rel="noopener noreferrer nofollow"` (shared link utils / server renderer path).

### Image links

- Image bubble → Link panel uses same `LinkPopover`.
- Stored as image node `href` attribute (not wrapping mark).
- Remove clears `href`.

---

## 14. Images & Media

### Inline images in the editor

**Insert paths:**

1. Toolbar image → MediaPicker (preferred from Blog Editor) → select existing or upload → insert.
2. Toolbar image fallback file input (`accept="image/*"`) → `POST /api/admin/media` → insert.
3. Image bubble **Replace** → MediaPicker (`inline-replace`) → `replaceImage` (preserves config by default).

**Image node capabilities (verified):**

| Capability | Exists | Details |
| ---------- | ------ | ------- |
| Upload | Yes | Media API / Cloudinary |
| Library select | Yes | MediaPicker + MediaLibrary |
| Replace | Yes | Preserve layout/size config by default |
| Delete | Yes | Bubble delete removes selection |
| Resize | Yes | Drag handles (N/S/E/W/corners) in `ImageNodeView`; width clamp 80–1200px |
| Alignment | Yes | left / center / right |
| Layout | Yes | inline, wrap-left, wrap-right, full-width |
| Size presets | Yes | small(240), medium(480), large(720), original, full-width, custom W/H |
| Lock aspect ratio | Yes | Default true |
| Spacing | Yes | small / medium / large (Advanced panel) |
| Alt text | Yes | Advanced panel; also checked by a11y analyzer |
| Caption | Yes | Advanced panel |
| Image hyperlink | Yes | Bubble link panel |
| Base64 images | No | `allowBase64: false` |

### Featured / cover media (post settings)

- Choose cover via MediaPicker → sets `thumbnailUrl` to asset URL.
- Or paste thumbnail URL manually.
- Optional YouTube URL field.
- Server `resolveThumbnailUrl`: if thumbnail empty and YouTube URL valid, derives YouTube `hqdefault` thumbnail.
- Cover preview image shown in sidebar when URL present.
- Structured `coverImage` object exists in schema/API, but the editor UI primarily drives **`thumbnailUrl`** (coverImage wiring from picker: **Not fully verified in UI**).

### Media library standalone

- Full CRUD-ish UX: search, kind filter, pagination (24/page), upload single/batch, metadata edit (displayName/alt/caption/tags), delete.
- Delete: soft-delete DB record + remove from Cloudinary (`mediaService`).
- Usage tracking against blogs via `mediaPublicIds` / `usedInBlogs`.

### Upload constraints (server constants)

| Kind | Max size |
| ---- | -------- |
| Image | 15 MB |
| Video | 100 MB |
| Audio | 30 MB |
| Document | 25 MB |

Allowed image MIME types include JPEG, PNG, GIF, WebP, AVIF, SVG.  
Max files per batch request: 10.

---

## 15. Metadata

Fields available in the **Blog Editor UI**:

| Field | Purpose | Required | Validation / behavior |
| ----- | ------- | -------- | --------------------- |
| Title | Primary headline | Yes | Client blocks empty save; drives slug until slug touched |
| Author | Byline | Optional (defaults BM Team) | Trimmed |
| Status | Lifecycle | Yes (select) | draft / published / scheduled / archived |
| Scheduled for | Publish datetime | Required if status=scheduled | `datetime-local`; server rejects scheduled without date |
| Expires at | Auto-hide after | Optional | Parsed as date; public filter excludes expired |
| Slug | Public URL segment | Optional (auto) | Client normalizes via `generateSlug`; server uniqueness + format |
| Featured | Highlight on public list | Optional | Only one featured post enforced server-side |
| Thumbnail URL | Cover image | Optional | URL input or picker |
| YouTube URL | Featured video / thumb fallback | Optional | Used for thumb derivation |
| Meta description | SEO snippet | Optional | Hard-capped at 160 chars in UI; SEO tips panel |
| Tags | Taxonomy labels | Optional | Comma-separated → lowercase unique array |

### Schema/API fields with limited or no editor UI

| Field | Exists in model/API | Admin UI |
| ----- | ------------------- | -------- |
| `categories[]` | Yes | **No UI field** |
| `seo.metaTitle` | Yes | **Not in editor UI** (public falls back to title) |
| `seo.canonicalUrl` | Yes | **Not in editor UI** |
| `seo.ogImageUrl` | Yes | **Not in editor UI** (public can fall back to thumbnail) |
| `seo.noIndex` | Yes | **Not in editor UI** |
| `stats.*` | Yes | **Not used**; comments say later phase |
| `description` | Yes | Auto excerpt from content; not a separate sidebar field in rich editor |
| `coverImage` object | Yes | UI uses `thumbnailUrl` primarily |

---

## 16. Categories

### Verified

- `categories: string[]` on Blog model.
- Server normalizes like tags (trim, lowercase, unique) when provided in API body.
- Revisions store categories.
- **No admin UI** to create, edit, assign, list, or filter by categories.
- **No dedicated Category collection/model** found — categories are freeform strings on the blog document.

### Conclusion

Categories are a **backend-capable but UI-unimplemented** feature in this reference system.

---

## 17. Tags

### Verified admin behavior

- Single text input: “Tags (comma separated)”.
- On save, split on commas → trim → lowercase → drop empties → send array.
- Server also dedupes via `Set`.
- No autocomplete, no tag manager screen, no rename/merge tools.
- Tags indexed in MongoDB.
- Public post page displays tags as `#tag` chips when present.
- Admin list does **not** show or filter by tags.

### Duplicate prevention

- Case-insensitive dedupe on save (because lowercased).
- No global taxonomy uniqueness beyond per-post array dedupe.

---

## 18. Slugs

### Generation

- Client: as title changes, if `slugTouched` is false, slug auto-updates via `generateSlug(title)`.
- Manual slug edits set `slugTouched = true` and re-normalize through `generateSlug`.
- Rules: NFKD normalize, strip diacritics, lowercase, keep `[a-z0-9]`, spaces/underscores → hyphens, max length **80**, trim edge hyphens.

### Server

- Validates with `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.
- Unique sparse index on `slug`.
- If slug omitted on create (or first assignment), `buildUniqueSlug` appends `-2`, `-3`, … until free.
- Duplicate slug → `400` “That slug is already in use.”
- Invalid slug → `400` with guidance message.

### URL behavior

- Public route: `/blog/:slug`.
- Admin list shows `/blog/{slug}` hint.
- SEO preview shows `buddingmariners.com/blog/{slug}`.
- **Redirects on slug change:** Not verified / not found in code. Changing a published slug likely breaks old URLs unless handled elsewhere (**Needs investigation** outside this CMS).

---

## 19. Draft & Publishing

### States (verified enum)

```text
draft ⇄ published
  ↑         ↓
scheduled   archived
```

Exact transition matrix is flexible via status select + Save/Publish buttons; not a hard state machine UI.

| Status | Meaning (from code) | Public visibility |
| ------ | ------------------- | ----------------- |
| `draft` | Not live; `published=false` | Hidden |
| `published` | Live; sets `publishedAt` on first publish | Visible (if not expired) |
| `scheduled` | Requires `scheduledFor`; `published` boolean false until status published | Visible **when** `scheduledFor <= now` (evaluated at read time) |
| `archived` | Stored status | Hidden from public filter (not published/scheduled-due) |

### Dual draft layers

1. **Document status `draft`** — official unpublished post.
2. **Server `blog.draft` autosave bag** — `{ title, contentBlocks, savedAt }` that does **not** overwrite live `contentBlocks` until explicit save.
3. **localStorage `bm_editor_draft`** — browser recovery for new/in-progress sessions.

Autosave interval: **30s**. Status indicator: Saving draft… / Draft saved / word count.

Explicit save clears server draft fields when content is written.  
`DELETE /api/admin/blogs/:id/draft` exists (discard draft API); **no dedicated Discard Draft button** found in editor UI.

### Publishing actions

| Action | Where | Effect |
| ------ | ----- | ------ |
| Publish button | Editor | Forces `status=published` save |
| Save draft button | Editor | Forces `status=draft` save |
| Status dropdown + form save | Editor | Saves selected status (incl. scheduled/archived) |
| Publish/Unpublish toggle | List | PATCH boolean published |

### Revisions

- On create and contentful updates, server records a `BlogRevision` snapshot (max **50** per blog; oldest pruned).
- Editor shows up to 8 recent revisions with restore.
- Restore confirms, snapshots current content first (“Snapshot before restoring…”), then writes revision content forward as new live content.

---

## 20. Preview

| Question | Answer |
| -------- | ------ |
| How launched? | Editor top-bar **Preview** toggle |
| Where? | Same route; in-page |
| What shown? | Title remains; body via `BlogContent` with client-rendered HTML from current JSON |
| Unsaved content? | Yes — uses current editor state after flush |
| Drafts? | Yes |
| Public chrome (nav/footer)? | No — content styles only inside bordered preview panel |
| Close? | Toggle back to **Edit** |
| Separate window/tab? | No |

Also includes a **Google-like SEO snippet preview** in the SEO sidebar (title, fake URL, meta description), independent of the body Preview toggle.

---

## 21. Public Blog

### Listing (`/blog`)

- `GET /api/blogs` → publicly visible posts only.
- Shows featured hero (first featured, else first post) + remaining grid.
- Uses title, description, author, thumbnail, youtube, reading time, created date, slug.
- Posts without slug are not linkable (`PostLink` renders a non-link wrapper).

### Post page (`/blog/:slug`)

- `GET /api/blogs/:slug` with visibility filter.
- Renders cover thumbnail, featured badge, date, reading time, title, author, tags, HTML body.
- Helmet SEO: title, description, canonical, robots noindex if set, Open Graph fields.
- Reading progress bar; copy link; WhatsApp share.
- Body prefers `contentHtml`; falls back to escaped `description` paragraph for legacy posts.

### Relationship to admin fields

| Admin field | Public use |
| ----------- | ---------- |
| title | H1 + SEO |
| author | Byline |
| thumbnailUrl | Cover + OG image fallback |
| contentHtml | Article body |
| tags | Chips |
| featured | Listing emphasis + badge |
| slug | Route |
| seo.* | Meta tags when present |
| status / scheduled / expires | Gate visibility |
| categories | **Not displayed** on public pages verified |

---

## 22. Validation

### Client-side

- Title required before save.
- Meta description truncated to 160.
- Slug continuously normalized.
- Link popover validates URLs with actionable error text.
- Image dimension inputs validate min/max width/height with inline error.
- SEO tips + accessibility issues are **advisory** (do not block publish).

### Server-side

- Title non-empty.
- Status must be in enum.
- Scheduled requires `scheduledFor`.
- Slug format + uniqueness.
- Content must be renderable (`assertRenderable`) — invalid nodes rejected.
- Draft autosave also runs render validation early.
- SEO meta description sliced to 160.
- Media uploads constrained by MIME + size.

### Accessibility advisory checks (`contentChecks.ts`)

- Heading level skips (warning)
- Images missing alt (error severity in panel)
- Embeds missing title/caption (warning)

### SEO advisory checks

- Title length guidance (30–60)
- Missing slug / meta
- Meta length guidance
- Body under 100 words tip

---

## 23. Error Handling

| Situation | UX |
| --------- | -- |
| List load failure | Red text; empty list |
| Save failure | Red text with server/error message; stays on editor |
| Delete failure | Red text on list |
| Publish toggle failure | Red text on list |
| Image upload failure | `alert(...)` in toolbar path; red text in MediaPicker |
| Link invalid | Inline popover error (`role="alert"`) |
| Auth expired | `onUnauthorized` handler (session teardown) — exact UX in `AdminAuthContext` |
| Revision restore failure | Red text on editor |
| Public load failure | Error page with back link |

No toast system; feedback is primarily **inline text messages** (and occasional `window.alert` / `window.confirm` / `window.prompt`).

---

## 24. Loading & Empty States

### Loading

| Context | UI |
| ------- | -- |
| Blog list | “Loading blogs...” |
| Editor load | “Loading editor...” |
| Saving | Buttons disabled (`opacity-60`); autosave status text |
| Media library | Loading indicator within library (**verified pattern exists**; exact copy in component) |
| Media upload | “Uploading…” |

### Empty

| Context | UI |
| ------- | -- |
| No blogs | Dashed empty panel with CTA guidance |
| No revisions | “No revisions yet.” |
| Preview with no content | “Nothing to preview yet.” |
| Slash no matches | “No matches” |
| A11y clean | “No accessibility issues detected.” |
| SEO clean | “SEO looks solid.” |

### Error recovery

- Refresh button on list.
- Re-attempt save after fixing fields.
- Media picker can close/reopen.
- **No automatic retry queues verified.**

---

## 25. Destructive Actions

| Action | Confirm | Permanent? | Undo |
| ------ | ------- | ---------- | ---- |
| Delete blog | `confirm` | Yes — hard delete blog + delete revisions + release media usage | No undo; revisions deleted with blog |
| Delete media asset | `confirm` with name | Soft-delete record + Cloudinary delete | No restore UI verified |
| Delete inline image | No confirm | Removes from document only | Editor undo may recover |
| Unpublish | No confirm | Status change | Re-publish |
| Restore revision | `confirm` | Overwrites live content after snapshotting current | Can restore another revision |
| Clear local draft | On successful save | Removes localStorage key | — |

Archive is a **status**, not a separate destructive flow with confirm.

---

## 26. Bulk Operations

**None on Blogs list.**

Media library supports multi-file upload batch, but not bulk blog publish/delete.

---

## 27. Permissions

| Topic | Finding |
| ----- | ------- |
| Auth gate | All `/api/admin/blogs*` and `/api/admin/media*` require admin Bearer token |
| Roles | Single admin identity from env credentials |
| Per-action ACL (editor vs publisher) | **Not present** |
| Draft visibility by role | N/A — any authenticated admin |
| Public endpoints | Read-only published visibility filter; no auth |

If multiple staff need different privileges, that would be a **new** requirement relative to this reference.

---

## 28. UI/UX Analysis

### Information hierarchy

- Editor prioritizes **title + canvas** as primary work surface.
- Publishing controls are persistent in the top-right (high discoverability).
- Secondary concerns (SEO, a11y, schedule, revisions) sit in a right rail — available without leaving the writing context.
- List prioritizes thumbnail + title + status + quick publish/edit/delete.

### Navigation efficiency

- Common path List → Edit → Preview → Publish is short.
- Media is both global (nav) and contextual (picker), which reduces context switching for image insertion.
- Lack of list search/filter becomes costly as post count grows.

### Feedback quality

- Clear success/error text on list/editor.
- Autosave status reduces anxiety for long edits.
- Heavy reliance on browser dialogs (`confirm`/`prompt`/`alert`) is functional but dated.

### Consistency

- TipTap toolbars share button classes and active states.
- Link popover reused for text and images.
- Public and preview share `BlogContent` / `bm-content` styles — strong WYSIWYG parity for body content.

### Efficiency

- Autosave (local + server) is a major win.
- Slash commands speed block insertion.
- No bulk ops / no list filters / no keyboard shortcut cheat sheet in UI.

### Error prevention

- Link scheme sanitization prevents javascript: links.
- Server-side HTML sanitization and schema assert prevent storing unsafe/unrenderable docs.
- Revision restore confirms.
- Delete confirms.
- **Missing:** leave-page unsaved warning; publish not blocked by a11y errors; list unpublish has no confirm.

---

## 29. Micro-interactions

Verified patterns worth preserving functionally:

- Autosave status transitions (saving → saved → idle after ~2.5s)
- Active mark/alignment button states
- Link popover auto-focus + select URL; Escape closes; outside click closes
- Table size hover grid preview (`rows × cols`)
- Slash menu keyboard navigation + tippy positioning
- Image resize drag handles with aspect lock
- Image bubble advanced panel expand/collapse
- SEO character counter `n/160`
- Featured single-post exclusivity (server clears other featured flags)
- Draft recovery message when server draft loaded
- Copy-to-clipboard temporary “Copied” states (links / public share)

**Not found:** toast stack, command palette beyond slash, collaborative cursors.

---

## 30. Responsive Behavior

Verified from layout classes:

| Area | Desktop | Smaller viewports |
| ---- | ------- | ----------------- |
| Admin shell | Fixed left sidebar | Hidden sidebar; horizontal nav pills |
| Blog list cards | 2-col thumbnail+content | Stacked single column |
| Editor | 2-col main + 320px aside (`xl`) | Single column; aside stacks below |
| Title input | Larger type on `md+` | Slightly smaller |
| Media picker | Modal max-width 5xl | Full-width with padding |

Editor toolbar wrapping/overflow behavior under narrow widths: **Needs investigation** (CSS may wrap; no dedicated mobile editor layout found).

---

## 31. Accessibility

### Present

- Many toolbar controls have `title` and/or `aria-label` / `aria-pressed`
- Alignment groups use `role="group"` / menus with `menuitemradio`
- Link popover is `role="dialog"` with labelled input and `aria-invalid`
- Image dimension errors use `role="alert"`
- Editor canvas `spellcheck="true"`, `lang="en"`
- Live a11y issue panel for alt text / heading skips / embeds
- Public content wrapper `lang="en"`

### Gaps / unknowns

- Full keyboard operability of bubble menus and tippy slash UI: **Not fully verified**
- Focus trap in MediaPicker modal: **Not verified**
- Color is used for status, but text labels also exist
- No claim of WCAG compliance is made here

---

## 32. Technical Architecture

### Frontend (admin)

| Piece | Location |
| ----- | -------- |
| Router | `client/src/admin/AdminApp.tsx` |
| Layout/nav | `AdminLayout.tsx` |
| List | `pages/BlogsPage.tsx` |
| Editor page | `pages/BlogEditorPage.tsx` |
| Rich editor | `components/RichEditor/*` |
| Media UI | `components/MediaLibrary.tsx`, `MediaPicker.tsx`, `pages/MediaPage.tsx` |
| Types | `types/blog.ts`, `types/media.ts` |
| Client helpers | `lib/slug.ts`, `lib/contentChecks.ts`, `lib/renderBlogContent.ts`, `lib/linkUtils.ts`, `lib/api.ts` |

State: React local component state + refs; no Redux/Zustand for blogs verified.

### Backend

| Piece | Location |
| ----- | -------- |
| Routes | `server/src/routes/blogRoutes.js`, `mediaRoutes.js` |
| Controllers | `blogController.js`, `mediaController.js` |
| Services | `blogService.js`, `mediaService.js` |
| Models | `Blog.js`, `BlogRevision.js`, `MediaAsset.js` |
| Content pipeline | `server/src/content/renderer.js` + extensions + `sanitizeOptions.js` |
| Auth | `requireAdminAuth` + `authService` |

### Key APIs

**Public**

- `GET /api/blogs`
- `GET /api/blogs/:slug`

**Admin blogs**

- `GET/POST /api/admin/blogs`
- `GET/PUT/PATCH/DELETE /api/admin/blogs/:id`
- `PUT/DELETE /api/admin/blogs/:id/draft`
- `GET .../revisions`, `GET .../revisions/:n`, `POST .../restore`

**Admin media**

- `GET/POST /api/admin/media`
- `POST /api/admin/media/batch`
- `GET/PATCH/DELETE /api/admin/media/:id`

### Database essentials

- Blog: content + status + slug + tags/categories + draft bag + seo + coverImage + mediaPublicIds + stats + audit
- BlogRevision: numbered snapshots (bounded)
- MediaAsset: Cloudinary metadata + usage + soft delete

### Security highlights

- Admin auth required for mutations
- Link sanitization shared client/server
- HTML sanitized on render
- Content schema assertion rejects unknown nodes
- Admin routes `noindex` via Helmet in `AdminApp`

---

## 33. User Journeys

### Journey 1 — Create Blog

```text
Open /admin/blogs
→ Click New Post
→ (Optional) local draft restored from previous session
→ Enter title (slug auto-fills)
→ Write body (toolbar / slash / bubble tools)
→ Insert images via MediaPicker; add links via Link popover
→ Fill author/tags/meta/cover as needed
→ Save draft  OR  Publish
→ On first save success: redirect to /admin/blogs/:id/edit
→ Autosave continues every 30s (local + server draft)
```

### Journey 2 — Edit Blog

```text
Open list → Edit
→ If server draft exists, editor loads draft + recovery message
→ Modify content/settings
→ Preview to verify rendering
→ Save draft or Publish (or set Scheduled/Archived via status + save)
→ Revisions list updates after save
```

### Journey 3 — Publish Blog

```text
From editor: click Publish (forces published status)
  OR set Status=Published and save
  OR from list: click Publish on a draft card
→ Server sets status=published, published=true, publishedAt if first time
→ Post becomes eligible for GET /api/blogs and /blog/:slug
```

### Journey 4 — Add/Edit Image

```text
Toolbar Image → MediaPicker
→ Choose Existing (search/filter) or Upload New
→ Image inserted into document
→ Select image → Image bubble toolbar
→ Adjust align/layout/size/spacing/alt/caption/link
→ Optional Replace via library
→ Drag handles to resize
→ Save post to persist in contentBlocks + media usage sync
```

### Journey 5 — Add/Edit Link

```text
Select text → Link (toolbar or bubble)
→ Enter URL in popover
→ Apply (validated/sanitized)
→ Later: reopen to edit, Open, Copy, or Remove
Image path: select image → Link panel → Apply/Remove
```

### Journey 6 — Search and Filter Blogs

```text
Not available in Admin Blogs list.
Closest related journey: Admin Media → type search → optional kind chip → paginate.
```

### Journey 7 — Delete Blog

```text
List → Delete → confirm dialog
→ DELETE API → card removed
→ Revisions deleted; media usage released
→ No undo
```

### Journey 8 — Restore Revision

```text
Edit post → Revisions panel → Restore
→ Confirm
→ Current content snapshotted, selected revision applied
→ Editor content refreshed; message shown
```

### Journey 9 — Schedule a Post

```text
Editor → Status = Scheduled
→ Publish at datetime appears → set future time
→ Save (via form submit / save path with that status)
→ Remains non-public until scheduledFor <= now (read-time evaluation)
```

---

## 34. Feature Inventory

| Feature | Exists | Description | Priority | Notes |
| ------- | ------ | ----------- | -------- | ----- |
| Blog creation | Yes | New post editor + POST | High | |
| Blog editing | Yes | PUT full save | High | |
| Blog listing | Yes | Card list all posts | High | No search/pagination |
| Rich text editor | Yes | TipTap document model | High | |
| Text formatting marks | Yes | Bold/italic/etc. | High | |
| Headings/lists/quotes | Yes | | High | |
| Slash commands | Yes | `/` block inserter | Should | Strong UX |
| Tables | Yes | Grid picker + resizable tables | Should | |
| Callouts | Yes | Default info variant | Nice | Variant UI limited |
| Task lists | Yes | Via slash | Nice | |
| Code blocks | Yes | Via slash | Should | |
| Font family | Yes | Registry-based | Should | |
| Text hyperlinks | Yes | Validated popover | High | |
| Image hyperlinks | Yes | | High | |
| Image upload | Yes | Cloudinary via media API | High | |
| Media library | Yes | Search/filter/paginate | High | |
| Image layout/resize | Yes | Advanced controls | High | Differentiator |
| Alt/caption | Yes | | High | |
| YouTube embeds | Yes | Prompt + extension | Should | |
| Cover image | Yes | URL + picker | High | |
| Tags | Yes | Comma input | Medium | No tag manager |
| Categories | Partial | API/schema only | Medium | No admin UI |
| Slug auto + manual | Yes | Unique server-side | High | |
| Draft status | Yes | | High | |
| Autosave draft | Yes | Local + server | High | |
| Scheduled publishing | Yes | Read-time visibility | Should | |
| Expiry | Yes | | Nice | |
| Archive status | Yes | | Medium | |
| In-page preview | Yes | Uses live editor JSON | High | |
| SEO meta description | Yes | + snippet preview | High | |
| Other SEO fields | Partial | In schema; limited UI | Should | |
| Accessibility checks | Yes | Advisory panel | Should | |
| Revisions + restore | Yes | Cap 50 | Should | |
| Publish from list | Yes | Boolean toggle | Medium | |
| Delete blog | Yes | Hard delete | High | |
| Bulk operations | No | | Should (future) | |
| List search/filter/sort UI | No | | High (future) | |
| Multi-role permissions | No | Single admin | Depends | |
| Analytics UI | No | Schema placeholders | Nice | |
| Unsaved leave warning | No | | Should | |
| Public blog pages | Yes | List + post | High | |
| HTML sanitization | Yes | Server render | High | |

---

## 35. Recommended Capabilities

### Must Have

- Authenticated admin blog CRUD
- Document-based rich editor with bold/italic/headings/lists/links
- Image insert from upload/library with alt text
- Draft vs published lifecycle
- Slug generation + uniqueness
- Server-side HTML sanitization / safe render pipeline
- Public listing + post-by-slug gated by publish state
- Basic SEO description support
- Delete with confirmation
- Clear save/publish feedback

### Should Have

- Autosave that does not clobber live published content
- In-editor preview using the same content renderer as public
- Media library with search + reuse across posts
- Image sizing/alignment/layout controls
- Link validation + unsafe scheme blocking
- Tags
- Revisions/history restore
- Scheduling (or a simpler “publish later” equivalent)
- List search + status filter + pagination
- Unsaved-change navigation guard
- SEO title/OG image/canonical controls in UI (schema already anticipates them)

### Nice to Have

- Slash command palette
- Callouts, task lists, font family picker
- Accessibility advisory panel while editing
- Expiry dates
- Featured single-post pinning
- YouTube embeds + auto thumbnail derivation
- WhatsApp/share affordances on public pages
- Reading time estimates

### Reference-Only

- Exact BM yellow/black admin aesthetic
- Hard-coded `buddingmariners.com` preview host string
- `window.prompt` for YouTube URL entry
- Card-based admin list instead of table (either can work; adopt based on your design system)
- Categories as freeform strings without a taxonomy manager (prefer a real taxonomy if categories matter)

---

## 36. Improvement Opportunities

> Distinguishing **observation** from **recommendation**.

### Observations (as implemented)

- Blog list has no search, filters, or pagination.
- Categories exist in data model but not in admin UI.
- Several SEO fields exist server-side but are not editable in the sidebar.
- List publish toggle ignores scheduled/archived nuance.
- Browser-native dialogs used for confirm/prompt/alert.
- No unsaved-change guard when navigating away.
- Accessibility/SEO issues do not block publishing.
- Stats fields unused.
- Subscript/superscript extensions lack UI.
- Discard-draft API exists without UI control.

### Recommendations for a future implementation

1. Add list **search + status filter + pagination** early — operational necessity at scale.
2. Prefer accessible modal confirms over `window.confirm`.
3. Add **unsaved changes** protection.
4. Either expose categories properly or remove them from the product surface to avoid API-only traps.
5. Surface full SEO controls if public meta matters.
6. Consider soft-delete/trash for blogs (reference hard-deletes).
7. Add slug-change redirects if URLs are shared externally.
8. Optionally gate Publish on critical a11y errors (missing alt), or require acknowledgment.
9. Introduce roles only if multiple operators need separation of duties.
10. Keep the dual-renderer architecture (editor JSON → sanitized HTML) — this is a strong technical pattern.

---

## 37. Implementation Considerations

When using this document to implement “our” Blogs section:

1. **Reuse workflows, not pixels.** Map each Must/Should capability onto your design system components.
2. **Keep a single content source of truth** (editor JSON or equivalent blocks), with server-sanitized HTML for public render.
3. **Separate live content from autosave drafts** so autosave cannot silently unpublish or corrupt live posts.
4. **Treat media as a first-class library**, not only per-post file inputs.
5. **Parity matters:** preview should use the same body renderer/CSS contract as public pages.
6. **Validate links and HTML on the server**, even if the client already validates.
7. **Do not assume categories/tags managers** exist unless you build them; this reference’s tags are intentionally lightweight.
8. Plan list scalability (search/filter/page) even if the reference lacks it.
9. Decide explicitly whether scheduling is required; the reference supports it via read-time filters (no cron required).
10. Document your own status model clearly if you simplify away from draft/scheduled/published/archived.

### Key reference files for engineers

- `client/src/admin/pages/BlogsPage.tsx`
- `client/src/admin/pages/BlogEditorPage.tsx`
- `client/src/components/RichEditor/**`
- `server/src/services/blogService.js`
- `server/src/models/Blog.js`
- `server/src/content/renderer.js`
- `client/src/pages/Blog.tsx`, `BlogPost.tsx`

---

## 38. Final Summary

The reference Blogs section is a **full CMS authoring workspace** centered on a TipTap document editor, not a simple title/description form. Administrators create and edit posts with rich formatting, validated links, a capable image system, cover media, tags, slugs, SEO guidance, accessibility guidance, autosave drafts, revisions, scheduling/expiry statuses, and an in-page preview that shares public content rendering.

Operationally, the **editor experience is strong**; the **list/management experience is intentionally minimal** (no search/filter/bulk). Categories and some SEO fields are present in the data layer but not fully realized in UI.

Use this document as the functional checklist for rebuilding equivalent capabilities under your own branding and component system. Prefer verified behaviors above; treat anything marked Unknown / Not verified / Needs investigation as open questions to resolve during implementation planning.

---

## Appendix A — Explicit Non-Features (verified absence)

- Admin blog search / filters / sorting UI / pagination
- Bulk blog actions
- Duplicate post
- Dedicated Categories or Tags management screens
- Multi-admin role permissions
- Collaborative editing
- Comments moderation
- Analytics dashboards for `stats`
- Separate preview route/window
- Automatic old-slug redirects (not found)

## Appendix B — Status Legend Used in This Doc

| Marker | Meaning |
| ------ | ------- |
| Verified / Yes | Confirmed in code paths cited |
| Partial | Data/API exists but UI incomplete (or vice versa) |
| No | Confirmed absent in relevant admin/public surfaces |
| Unknown / Not verified / Needs investigation | Could not conclusively confirm from inspection |
