# Bases Input View (Obsidian Plugin)

A minimal custom Bases view for Obsidian that displays your notes’ properties as rows and files as columns, with simple inline editing for frontmatter-backed values.

This view aims to feel familiar if you use the basic Table view in Bases, but transposed to make bulk property updates easier.

## Requirements
- Obsidian `1.10.0` or later (custom Bases views are supported in Early Access and onward).

## Installation

### From Release / BRAT
- Install via BRAT: add `Mistmage/Single-file-base-view`.
- Or manually download the latest release assets (`manifest.json`, `main.js`, `styles.css`) and place them into `Vault/.obsidian/plugins/bases-input-view/`.
- Enable the plugin in Obsidian.

### From Source
- `npm install`
- Build: `node esbuild.config.mjs production` (emits `main.js`).
- Copy `manifest.json`, `main.js`, `styles.css` into your vault plugin folder.

## Usage
- Open a Base in Obsidian.
- In the view picker, select “Input view”.
- The table shows:
  - Left column: property names (rows).
  - Top header: files (columns).
  - Cells: current property values for each file.
- Edit a cell and blur/change to write the value back to the note’s frontmatter.

## Behavior and Notes
- Properties come from the current Base view configuration when available; otherwise, the plugin derives them from the union of note property keys it sees in the query results.
- Computed fields (e.g., `file.*`, formulas) are not editable and are excluded from rows.
- Arrays render as comma-separated strings; complex objects prefer their `value` field when present.
- Editing currently targets frontmatter-backed keys only; if your property is not mapped to frontmatter, it won’t be changed.

## Release Packaging
- When publishing a release for BRAT, upload:
  - `manifest.json`
  - `main.js`
  - `styles.css`
- Tag must match `manifest.json`’s `version` exactly (no `v` prefix).
- GitHub auto-generates source archives (zip/tar.gz); you don’t need to upload them manually.

## Troubleshooting
- If you only see headers and no rows:
  - Ensure your notes have frontmatter properties.
  - Check the Base’s query and view config contains properties or that notes share some property keys.
- If edits don’t persist:
  - Verify the property maps to a frontmatter key (non-`file.*`, non-formula).
  - Confirm the vault allows writing frontmatter for the selected file.

## License
MIT
