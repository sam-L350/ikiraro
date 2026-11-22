# Ikiraro UI design guidelines

Reference studied: [jamiewindell.com](https://www.jamiewindell.com/) on 22 Nov 2026 (Framer, published 20 Nov 2026).
Stack: Tailwind v4 and shadcn (`radix-nova`) in `web/`. Tokens live in `web/src/index.css`. Primitives live in `web/src/components/ui/`.

This is a working system for Ikiraro, extracted from that site’s structure and practice. It is not a license to copy Jamie Windell’s name, photography, case studies, or sentences.

Read this before building or restyling any screen. The functional spec in `docs/Ikiraro_System_Functionalities.md` decides what a screen must do. This document decides how it looks and how it is composed.

---

## 1. What the reference actually does

The site is one long editorial page, not a dashboard. A sticky wordmark stays put. Almost everything else is a sequence of full-width moments:

1. Hero. Centered oversized headline, one sentence of plain speech, one sticker button. Small photos and a tilted sticker sit off the type, not in a card grid.
2. Proof marquees. Two saturated bands (green, then sky) overlap and scroll opposite facts in all-caps display type.
3. Split statement. A portrait on one side, a short stacked headline and one paragraph on the other.
4. Monument type. Three lines of enormous type, the last line pushed to the right. One sticker button.
5. Help bubbles. A short prompt and a loose cluster of pill-shaped needs, not a feature grid.
6. Method cards. Wide saturated cards (orange, yellow, sky, magenta, green) scroll sideways. Each card is a headline plus one paragraph. Ink type on the color, never white type on these brights.
7. Proof field. Floating ink pills with a colored icon dot. A portrait is cut against a flat color blob. “Coming soon” items stay visible and are not styled as errors.
8. Case study panel. Choosing a pill opens a tall overlay: who, where, engagement type, the work, three numbers, one quote. The page underneath does not change language.
9. Person plus tool. A short bio, then a dark chat panel with suggested questions as pills.
10. One quote at a time. Large quotation, name, place. Not five testimonials in a row.
11. Teaching cards. A tilted sticker eyebrow (“Branding 101”), one heading, three taupe cards.
12. Two offers, not a pricing table. Checks on the paper, the offer itself on a large ink slab with one green pill button.
13. Short FAQ, then a closing line and the same sticker button again.
14. Footer. An ink sheet with a large top radius, sitting on the paper. Link groups, then a small human detail (local time).

The method is consistent: say one thing big, prove it with a number or a named person, offer one next step, and let color be a physical object (band, card, sticker, pill) instead of a tint behind gray UI.

---

## 2. Principles

Follow these in order. If two rules conflict, the earlier one wins.

1. **One idea per view.** A screen has one headline and one primary action. Secondary links are text, not a second filled button.
2. **Paper and ink first.** The page is warm paper. Type is warm near-black. Color is reserved for objects: the action, a proof band, a method card, a status pill.
3. **Type does the layout.** Hierarchy comes from scale and case, not from boxes around every block. Display lines are uppercase. Explanations are sentence case.
4. **Proof is specific.** Numbers, names, places, and outcomes. If a claim cannot be named, it does not get a giant treatment.
5. **Objects, not chrome.** Buttons, stickers, pills, and cards look like things placed on the page: solid fill, clear radius, hard offset shadow on the things you can press.
6. **Color never carries meaning alone.** A green band or a violet dot always has a word next to it. Required for status, language, and low-literacy use.
7. **Motion is ambient.** Marquees, slow sticker rotation, and a sideways card track. Nothing the user must read is allowed to move. Pressed controls sink into their shadow.
8. **The same materials in the product.** Learner and staff screens use this paper, ink, type, and sticker action. They do not switch to a separate gray admin theme.

---

## 3. How this applies to Ikiraro

Public pages (home, about, center directory, passport verification, donor summary) may use the full editorial scale: large display type, marquees, sideways cards, overlays.

Product pages (login, course, task, evidence upload, review, allocation, inventory) use the same materials at a quieter scale:

- Display type stops at `text-4xl` or `text-5xl`. Do not use the 118px or 176px monument sizes inside a task or a form.
- The next action is always a sticker button, visible without hover, at least 44px tall.
- Status (pending, verified, rejected, synced, offline) is a labeled pill. Do not encode it only as a poster color.
- Critical facts are not placed in a marquee. Marquees are decorative echoes of facts that also appear in static text.
- Shared-device screens show who is signed in and offer a one-tap logout. That chrome stays visible. Do not hide it inside a marketing menu.
- Kinyarwanda and English must both fit. Display headlines that will be translated stay in the body face, not in Anton. Anton is uppercase Latin display and is a poor fit for running text in either language.

Do not import the reference’s personality (founder-consultant, “book a call”, AI chat as the product) into Ikiraro. The product is a trust and allocation system: evidence, verification, passport, fair allocation. The voice is direct and concrete. “Submit this photo” beats “Let’s team up”.

---

## 4. Tokens

Measured from the live site. Put these in `web/src/index.css` and use the semantic names in components. Do not sprinkle raw hex through JSX.

| Role | Hex | RGB measured | Use |
|---|---|---|---|
| `--canvas` | `#f4f0ec` | 244, 240, 236 | Page background |
| `--surface` | `#eee9e4` | 238, 233, 228 | Inset panels, quiet chips |
| `--surface-2` | `#fafafa` | 250, 250, 250 | Text on ink, input fill on dark |
| `--taupe` | `#d7cdc5` | 215, 205, 197 | Quiet teaching cards |
| `--ink` | `#252122` | 37, 33, 34 | Text, footer, dark slabs, pill fills |
| `--ink-2` | `#3a3637` | 58, 54, 55 | Hover on ink |
| `--fg-muted` | `#827e7f` | 130, 126, 127 | Secondary sentences |
| `--fg-subtle` | `#b2afb0` | 178, 175, 176 | Meta on ink, timestamps |
| `--yellow` | `#f1e044` | 241, 224, 68 | Primary sticker, one method card. Near-twin `#f2e144` appears on some stickers; use `#f1e044` only |
| `--green` | `#25d572` | 37, 213, 114 | Marquee, confirm button on ink |
| `--sky` | `#91ceef` | 145, 206, 239 | Marquee, sticker, method card |
| `--orange` | `#fc5702` | 252, 87, 2 | Method card, portrait blob |
| `--magenta` | `#f380e7` | 243, 128, 231 | Method card, portrait blob |
| `--violet` | `#664ff1` | 102, 79, 241 | Pill icon dot, method accent |

The reference has no error color. Ikiraro adds one:

| Role | Hex | Use |
|---|---|---|
| `--danger` | `#d92d20` | Errors, rejections, destructive confirm |
| `--danger-soft` | `#fde8e6` | Error banner on paper |

Map shadcn variables to these, do not leave the default neutral gray theme in place:

- `--background` = `--canvas`
- `--foreground` = `--ink`
- `--card` = `--surface` for quiet cards. Poster cards set their own fill.
- `--primary` = `--yellow`, `--primary-foreground` = `--ink`
- `--secondary` = `--surface`
- `--muted-foreground` = `--fg-muted`
- `--destructive` = `--danger`
- `--border` = a 12% mix of `--ink` on `--canvas`. Borders are rare; do not outline every region.
- `--ring` = `--ink`
- `--radius` = `1.25rem` (20px), the card radius. Pills and sticker buttons use `rounded-full` on top of that.

Shadows, measured:

- Sticker button: `4px 4px 0 #000`
- Circular sticker: `2px 4px 0 #252122`
- Disabled or secondary hard edge: `4px 4px 0 #6e686a`
- Overlay only: a soft shadow is allowed behind a panel (`-24px 0 60px rgb(0 0 0 / 25%)`). Do not use soft shadows on cards in the page flow.

Dark mode, if kept: the page becomes `--ink`, text becomes `--canvas`, and the yellow sticker stays yellow with ink text. Poster colors stay the same. Do not invent a second neon palette. Product UI must remain readable in both themes.

### Type

Three families. Load them the same way Geist is loaded now (fontsource, in `web/src/index.css`), weights only as listed.

| Token | Family | Weights | Job |
|---|---|---|---|
| `--font-display` | Anton | 400 | Uppercase headlines, marquee lines, big numbers. Already visually black. Do not bold it further |
| `--font-sans` | Montserrat Alternates | 400, 500, 600, 700 | Body, UI, quotes, names. This is the face for Kinyarwanda and English sentences |
| `--font-meta` | Inter Tight | 500, 600 | Uppercase labels, button text, eyebrows, table meta |

Lexend is loaded by the reference and is not part of the visible system. Do not add it.

Desktop sizes measured on the marketing page, and the size to use in product UI:

| Style | Reference | Product cap | Face | Case | Leading |
|---|---|---|---|---|---|
| Hero | 118px / 130px | `text-5xl` to `text-7xl` | Display | uppercase | ~1.1 |
| Statement | 76px / 80px | `text-4xl` to `text-5xl` | Display | uppercase | ~1.05 |
| Monument | 176px / 180px | Do not use in the app | Display | uppercase | ~1.02 |
| Card title | 48px / 52px | `text-3xl` | Display | uppercase | ~1.1 |
| Quote | 39–48px | `text-2xl` | Sans 700 | sentence | ~1.2 |
| Body | 18–20px | `text-base` or `text-lg` | Sans 600 | sentence | 1.35–1.5 |
| Button | 14px | `text-sm` | Meta 600 | uppercase | 1 |
| Eyebrow | 12–14px | `text-xs` | Meta 600 | uppercase, tracking ~0.08em | 1 |
| Pill title | 16px | `text-sm` | Sans 500 | sentence | 1.25 |

Body copy on the reference is often semibold (600), not regular. Use 600 for short paragraphs. Use 400 or 500 for long text, form help, and anything over about 40 words. Use 700 for quotes and names.

### Space and shape

Measured at a 1440px desktop viewport.

- Page gutter: 48px (`px-6` on small screens, `px-12` from `lg`).
- Hero content width: about 1048px, centered.
- Section padding top: 112px, 128px, or 160px. In the app, use 48–80px between regions (`py-12` to `py-20`). Do not stack sections with 16px gaps.
- Card padding: 40–48px. In the app, 24–32px (`p-6` to `p-8`).
- Grid gap for teaching cards: 20px.
- Footer: padding `96px 48px 0`, column gap 96px, top radius 48px.
- Button: height 44px, padding `16px 20px`, radius 40px (full pill).
- Cards and photos: radius 20px for cards, 10px for small photos.
- Entity pills: radius 32px, padding `8px 20px 8px 8px`, icon circle 26px.
- Menu button: yellow squircle, about 44px, hard shadow.

Layout widths:

- Reading column: `max-w-3xl`.
- Editorial hero: `max-w-5xl` centered, text centered.
- Split sections: two columns from `lg`, stacked before that. Copy and media are not equal cards; one side is type, the other is a photo or a color object.
- Product tools (tables, review queues, forms) use a 12-column frame with a `max-w-6xl` content width. They still sit on `--canvas`.

---

## 5. Components

Extend the primitives in `web/src/components/ui/`. Do not restyle a one-off button in a page. Icons are Lucide, 16px in buttons, 20px in empty states. Match the reference’s line icons: simple, not illustrated.

### Button

Primary (the sticker):

- Fill `--yellow`, text `--ink`, `rounded-full`, `h-11`, `px-5`, `font-meta`, `text-sm`, `font-semibold`, `uppercase`, `tracking-wide`.
- Shadow `4px 4px 0 #000`.
- Hover: translate `1px 1px`, shadow `3px 3px 0 #000`.
- Active: translate `4px 4px`, shadow none.
- One primary button per view. Label is a verb plus a short object: “Submit evidence”, “Verify”, “Sign out”. An arrow is allowed after the label. Do not add a second arrow button beside it.

On ink (the green confirm):

- Fill `--green`, text `--ink`, same pill and a `2px 3px 0` darker green or ink shadow.
- Use on dark slabs and in the footer area only.

Quiet:

- No fill, no shadow. Sans or meta, ink, underline on hover. This is “How it works”, “Read more”, footer links.

Destructive:

- `--danger` fill, white text, same pill and hard shadow. Always behind a confirm. Never the default button on a form.

Disabled: opacity 50, no shadow movement, `pointer-events-none`.

Every button keeps a visible focus ring: 3px `--ink` at 40% opacity, offset 2px.

### Sticker

A small colored label, rotated between -6deg and 6deg, used as an eyebrow or a seal (“For learners”, “Verified”). Sky or yellow fill, ink text, meta uppercase, optional hard shadow.

Do not use stickers for table status, form errors, or anything in a repeating row. Rotation on a list makes scanning harder.

### Badge and status pill

Use `Badge` for status. Ink text on a soft tint, or ink fill with paper text. Always include the word.

Suggested mapping:

| Status | Fill | Text |
|---|---|---|
| Verified, synced | `--green` at 20% on paper | `--ink` |
| Pending, queued | `--yellow` | `--ink` |
| Needs action | `--orange` at 18% | `--ink` |
| Info | `--sky` at 35% | `--ink` |
| Rejected, failed | `--danger-soft` | `--danger` |
| Neutral, draft | `--surface` | `--fg-muted` |

### Card

Three kinds. Do not mix them in one group.

- **Poster card.** Saturated fill, radius 20px, padding 48px (32px in the app), display title, one short paragraph in sans 600. Text is `--ink`. Used for a method, a principle, or a lesson — a handful per page, not a catalog of twenty.
- **Quiet card.** `--taupe` or `--surface`, same radius, same type scale one step down. Used for explanations.
- **Ink slab.** `--ink` fill, paper text, radius 28px or larger, one green sticker button. Used for the single decision on a page (start, confirm allocation, sign out of a shared device).

Hover does not lift poster cards with a soft shadow. If a card is clickable, the whole card is the hit target and the label says where it goes.

### Entity pill

The case-study control: ink capsule, colored circle with a plus or icon, short name. Selecting it opens the overlay. In Ikiraro this pattern fits courses, centers, evidence items, and devices when the user is choosing one object from a loose set.

Inside a data table, use a normal row, not a floating pill.

### Marquee

Full-bleed band, height about 100–130px, display uppercase at 20px, duplicated track, linear scroll. Two bands may overlap and counter-scroll. Pause on hover. `prefers-reduced-motion`: static, no scroll.

Mark it `aria-hidden` when the same facts are in the heading or a stats row. If it is the only source of a fact, do not make it a marquee.

### Navigation

Marketing and public:

- Sticky bar on the paper. Wordmark at left in display uppercase, about 20–24px, no container.
- Right side is either the primary sticker or a yellow menu button. Do not show eight links in the bar.
- The menu is a short list: the real sections, plus the primary action again.

Product:

- Same wordmark.
- One line that says who is signed in and which center.
- Sign out is always reachable in one tap (`FR-IAM-05`).
- Staff tools may use a left rail. The rail is paper or ink, with the same type. Active item is an ink pill or a yellow sticker, not a gray rectangle.

Do not put the theme toggle, OpenAPI, and a row of icon links in the learner header. Those belong on an admin or engineer surface.

### Overlay

Case studies open over the page. Match that for evidence detail, passport checks, and allocation rationale:

- Full-height panel, paper or ink, 48px top radius on small screens (a sheet) and a right-side panel from `lg`.
- Close control is text (“Close”) plus a mark, always visible.
- Order inside: name, role, place, one-line outcome, the work, three stats, one quote or the audit reason.
- Do not open a second overlay from the first.

### Quote

One at a time. Sans 700, large, then name in sans 600 and place in sans 500. No star row, no logo cloud, no carousel dots that hide the other quotes. Arrows or a simple next control are enough.

### Offers and choices

When the user picks between two paths (for example assisted registration vs self-serve, or a free check vs a full review):

- Left or top: who it is for, three to six checks, plain language.
- Right or below: one ink slab with the name of the offer in display type and one button.
- Do not build a four-column feature matrix.

### FAQ and disclosure

shadcn `Accordion`. Question in sans 600 at 18–20px. Answer in sans 400–500, muted, max about 60 characters wide per line. The page heading can be plain (“Questions”) rather than clever.

### Forms

- Labels above the field, meta uppercase, 12px.
- Inputs at least 44px tall, radius 12–16px, paper or white fill, ink text, 1px ink at 20% border. Focus border becomes full ink.
- Help text under the field, one sentence.
- Errors under the field in `--danger`, in words (“Enter the code we sent”), with `aria-invalid`.
- One sticker submit. If the form is long, the submit sticks to the bottom of the panel on small screens.
- OTP and phone entry use large type (`text-2xl`, tabular nums), letter spacing, and a single field group. This is the front door for learners.

### Empty, loading, error

- Empty: one display line, one sentence, one sticker action. A sticker or a single Lucide icon is enough. No illustration scene.
- Loading: a quiet pulse on the paper. Do not use a marquee or a spinner as the hero.
- Error: ink text on `--danger-soft`, what happened, what to do, one button. Keep the signed-in banner if the person is in the app.

### Tables and lists

Staff queues (reviews, devices, audit) need density the marketing site does not have. Rules:

- Paper page, no zebra of gray stripes. Separate rows with a 1px line at 12% ink, or with 8px of space.
- Header cells are meta uppercase, 11–12px, `--fg-muted`.
- Numbers are tabular.
- The row’s action is text or a small pill, not a yellow sticker on every row. The page still has one primary sticker for the main job (“Start review”).
- On small screens, a row becomes a stacked card with the name first and the status pill visible. Do not shrink the table until it scrolls sideways for a learner.

---

## 6. Page recipes

Use these compositions before inventing a new layout.

### Public home

1. Sticky wordmark and one sticker (“Check a passport” or “Find a center”).
2. Centered display headline, one sentence, one sticker.
3. A stats row or a single marquee of real counts (centers, verified tasks, devices in use). Counts must come from data.
4. One split: what Ikiraro is, in three display lines, plus a short paragraph.
5. Three to five poster cards for the principles that matter to a visitor (evidence, fair allocation, works offline).
6. Proof: named centers or learner outcomes as entity pills opening an overlay. No fake logos.
7. Closing line and the same sticker.

### Learner home

1. Who is signed in, center name, sign out.
2. Display line: the next task, not a dashboard greeting.
3. One sticker: continue that task.
4. A short list of what is waiting, as quiet rows with status pills.
5. Offline state is a banner in words (“Saved on this device. It will send when the network returns.”), not an icon alone.

### Task and evidence

1. Course and task name as sans, not a monument headline.
2. Instructions in short paragraphs, 18px, with audio control when the content has narration.
3. The evidence action (photo, file, note) is the sticker.
4. Show the rubric criteria as a quiet list, not a poster card per criterion.

### Verification review (trainer)

1. Page title is the learner’s task, with a status pill.
2. Evidence first, rubric second, decision last.
3. The decision sits on an ink slab: pass, or send back, each explained in one line. Pass is the green-on-ink button. Send back is quiet or danger, and it requires a reason.

### Public passport check

1. Paper page, no app navigation.
2. Display name, photo, center, badges as labeled pills.
3. One sentence a stranger can trust: what was verified, by whom, when.
4. If the link is invalid, say that in a full sentence. Do not show a generic 404 illustration.

### Allocation and donor views

1. Lead with the decision and the reason.
2. Numbers in display type, labels in meta.
3. An outsider should see why this person, why this round, and what happened after. That is the layout. Do not hide the rationale behind a chart.

### Auth

1. Centered column, `max-w-md`.
2. Wordmark, one sentence, phone or email, one sticker.
3. Assisted registration shows the trainer’s name on the page so the learner can see who created the account.

---

## 7. Motion

- Sticker press: 150ms, ease-out, transform and shadow only.
- Marquee: linear, slow enough to read if someone insists. Duplicated content so the loop has no gap.
- Sideways cards: native horizontal scroll or a pinned track. Show that more exists with a clipped next card, not with dots only.
- Entrance: optional 8–12px rise, 400ms, once. Do not stagger ten items.
- `prefers-reduced-motion: reduce`: no marquee, no rotation, no rise, no autoplay. The reference’s spinning badges (“Chief of getting things done”) do not ship in Ikiraro if motion is reduced, and they are optional even when motion is allowed. A static sticker is enough.

---

## 8. Accessibility

- Ink `#252122` on paper `#f4f0ec` is the default text pair. Keep it for paragraphs.
- Ink on yellow, green, sky, orange, magenta, and taupe is the card and button pair. Do not put paper-white text on yellow, sky, or green.
- Paper text on ink is the dark-slab pair.
- Muted gray is for meta only, never for instructions.
- Target size is at least 44 by 44px. The reference primary button is 44px tall.
- Focus is always visible. Do not remove outlines.
- Every icon button has an accessible name (“Menu”, “Close”, “Sign out”).
- Do not convey state by rotation, position in a marquee, or color alone.
- Display headlines that wrap use `text-wrap: balance` where it helps. Body uses `text-pretty`.

---

## 9. Voice, in the interface

Short, spoken, specific. The reference writes the way a person talks, then sets the important words in enormous type.

- Headlines: few words, concrete. “Submit the shop photo.” “This passport is verified.”
- Buttons: verb first.
- Empty and error: say what is wrong and the next step.
- No “unlock your potential”, no “seamless”, no “next-gen”.
- Numbers use a space or comma consistently, and a unit (“12 tasks waiting”).
- Bilingual UI: do not put only the English line in display type and the Kinyarwanda line in small gray type. They share the body face. Display type is for a single chosen language at a time, following the user’s language.

---

## 10. Tailwind and shadcn practice

- Style through tokens: `bg-canvas`, `text-ink`, `bg-yellow`, `font-display`, `font-sans`, `font-meta`. Add the colors in `@theme inline` inside `web/src/index.css` so utilities exist.
- Variants belong in `cva` on the primitive (`button.tsx`, `badge.tsx`, `card.tsx`). Pages compose primitives.
- shadcn components to prefer: `Button`, `Badge`, `Card`, `Input`, `Accordion`, `Sheet` (overlays), `Dialog` (short confirms only). A confirm that needs a reason is a sheet, not a tiny dialog.
- Do not add a new component library. Do not restyle with inline `style` except for a dynamic marquee duration or a measured rotation.
- Radius: `rounded-full` for buttons, badges, and entity pills. `rounded-[20px]` for cards. `rounded-t-[48px]` for the footer sheet.
- Shadow utilities: `shadow-sticker` = `4px 4px 0 #000`, `shadow-sticker-sm` = `2px 4px 0 var(--ink)`. Define them once in CSS.
- Spacing scale to actually use: 2, 3, 4, 6, 8, 12, 16, 20, 24. Avoid one-off `p-[13px]`.
- Section pattern:

```tsx
<section className="px-6 py-16 lg:px-12 lg:py-24">
  <div className="mx-auto max-w-5xl">
    {/* one headline, one action, one proof */}
  </div>
</section>
```

- Sticker button pattern, once it exists as `variant="sticker"`:

```tsx
<Button variant="sticker" size="lg">
  Submit evidence
  <ArrowRight aria-hidden />
</Button>
```

Until that variant exists, add it to `buttonVariants` rather than copying classes into the page.

---

## 11. Do and do not

Do:

- Start every view with the sentence the user needs, then the proof, then one action.
- Keep paper as the ground and put color on objects.
- Use Anton only for short uppercase display lines that are not translated mid-sentence.
- Use Montserrat Alternates for anything a person must read, in either language.
- Let a pressed button sit down into its shadow.
- Repeat the same primary action at the end of a long public page.
- Leave empty paper. The reference is confident because most of the viewport is unused.

Do not:

- Build a gray SaaS shell with a left nav, top search, and four equal stat cards as the default Ikiraro look.
- Use soft drop shadows, glass, or 1px borders on every box.
- Use gradient meshes, dotted grids, or glow behind heroes. Those are in the current starter (`bg-grid`, `bg-glow` in `index.css`) and they are not part of this system.
- Put two filled yellow buttons side by side.
- Use poster colors as the background of a form, a table, or a whole app page.
- Animate required text.
- Copy the reference’s layout pixel for pixel onto a data-heavy staff screen. Use the materials; change the density, as in section 5 (tables).
- Add a floating AI chat because the reference has one. Ikiraro does not need that pattern unless a requirement asks for it.

---

## 12. Checklist before a screen is done

- One headline, one primary sticker, paper ground.
- Colors come from the token table. No new hex in the component.
- Body text is Montserrat Alternates. Labels are Inter Tight uppercase. Display is Anton uppercase and short.
- Status has a word. The next action is at least 44px and does not depend on hover.
- Kinyarwanda still fits, wraps, and uses the body face.
- A shared device can see who is signed in and can sign out.
- Motion respects `prefers-reduced-motion`.
- Empty, error, and offline states are designed, not leftover starter styles.
- The screen still matches the functional spec for that role.

When an existing starter screen (home, dashboard, todos) is rebuilt, replace the Geist / green-glow look with these tokens. Do not leave both systems on the same page.
