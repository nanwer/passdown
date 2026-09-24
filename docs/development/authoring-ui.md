# Authoring UI patterns

Use these patterns when extending creation and draft editing. Keep domain rules and persisted content outside presentation components.

- **ChoiceCard** (`@guide/ui`): an entire clickable label around a native radio, with an optional icon, title and description. Keep related cards in a named fieldset and give their inputs the same name. Native checked state, arrow-key navigation and disabled behavior remain intact. A selected card has a colored border, tinted surface and checked indicator; keyboard focus highlights the card. Long configured labels wrap instead of truncating.
- **AuthoringSection** (studio): a bounded panel with a heading, short explanation and optional icon. Use it for related fields, and render adjacent sections as peers. Supply a unique heading ID. The canvas surface separates sections from the quieter preparation item surface; all colors come from semantic tokens.
- **RequirementQuantity** (studio): shared guide and step quantity controls. As-needed amounts show two columns; an exact amount adds a numeric field. Narrow layouts move the amount selector above quantity and unit. Keep native constraints, accessible item-specific labels and explicit quantities.
- **Preparation notes**: optional disclosure beneath the primary item controls. Collapsing preserves the value; existing notes open expanded. Keep the disclosure keyboard-operable with `aria-expanded` and `aria-controls`, and keep its textarea labeled.

Studio defaults distinguish text fields from radio, checkbox and file inputs. Never apply full-width text-field padding or minimum height to choice indicators. A small indicator sits inside a larger clickable label.

Creation uses one column on narrow screens and a secondary draft-guidance column on desktop. The guidance is hidden on mobile; the heading still explains that creation does not publish. Keep primary actions outside optional disclosures. Test at 320px and 390px, in both themes, with keyboard navigation and long names.

Colors are defined in `packages/design-tokens/tokens.json`; shared UI primitives live in `packages/ui`. Do not create a separate palette for one form. A presentation change must preserve typed metadata, catalog selections, warnings, draft saves and publication boundaries.
