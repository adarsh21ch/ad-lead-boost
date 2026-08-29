# Prompt 18 — Ad account identity everywhere + performance drill-down

## Ground rules
Database, tables, views, RPCs, triggers and cron are already built and correct.
**ZERO migrations. ZERO DDL.** Do not create, alter or drop any table, view, column, policy,
index or function. Everything you need already exists and is named below. If you think you
need a new database object, stop and say so instead of creating it.

Do not touch `LEAD_ENRICHMENT_ENABLED`. It stays `"false"`.

## What changed in the database since Prompt 17 (read this, it is what the UI is for)
- `accounts.meta_ad_account_name` — human name of the ad account, e.g. `SAGAR ADS 1`.
  Already populated for existing accounts.
- `ad_performance_daily` now has **38 columns**, gaining `meta_ad_account_id` and
  `meta_ad_account_name` immediately after `account_id`.
- Every warehouse row now records which Meta ad account it came from, so performance data can
  be segregated per ad account. This is real, not aspirational: the database currently holds
  230 entities from `act_2447097022359700` and 3 from `act_863995570089897`, correctly separated.

## Task A — Never show a bare `act_` number again
An id like `act_2447097022359700` is not something a person can recognise. Everywhere an ad
account appears, lead with the **name** and make the id secondary:

> **SAGAR ADS 1**
> `act_2447097022359700`

Apply on: the Integration "Ad account" card, the ad-account picker list, and anywhere the
Ad performance screen names an ad account. `meta_ad_account_name` may be NULL for an account
that has never synced — fall back to the id alone, never to an empty space or "Unknown".

When the user picks an ad account, **write `meta_ad_account_name` from the same Graph
response you already fetch for validation** (`GET {act_id}?fields=id,name,...`). You are
already retrieving the name and discarding it. Keep writing `meta_ad_account_timezone = NULL`
on change, exactly as now.

## Task B — Fix the picker interaction
Today "Change ad account" navigates to a full page with **no way back** — the user has to
click Integration in the sidebar to escape. Two problems: the navigation is heavier than the
task deserves, and the dead end is a bug.

Preferred: open the chooser as a **dialog/sheet on the Integration page**, so the user never
leaves their context. Keep `/dashboard/select-ad-account` working as a route for first
connect and for deep links.

**Do not end up with two picker implementations.** Extract the list into ONE shared component
and render it in both places. If you cannot do that cleanly, then keep the route and simply
add a visible "Back to Integration" control — a working back button beats a half-duplicated
dialog. Say which of the two you chose and why.

## Task C — Ad performance: make the hierarchy explorable
Right now the screen shows a flat view. Give it the structure the data already has.

**1. Ad account selector.** Read distinct `meta_ad_account_id` / `meta_ad_account_name` from
`ad_performance_daily`. If there is exactly one, show it as a label — do not make someone
choose from a list of one. If there is more than one, it is a real selector, and every number
on the screen must be scoped to the choice.

**2. Drill-down: campaign -> adset -> ad.** `ad_performance_daily` carries `level`
(`campaign`/`adset`/`ad`), `entity_id`, `entity_name`, `parent_id`, `effective_status` and
`creative_thumbnail_url`. Start at campaign level; clicking a campaign filters to adsets whose
`parent_id` is that campaign, and so on down to ads. Show a breadcrumb, and let the user climb
back up.

**3. Creative.** At ad level show `creative_thumbnail_url` next to the ad name. That is what
makes the screen answer "which creative is working", which is the question people actually have.

**4. `effective_status`, not `status`.** An ad can be ACTIVE while its adset is paused; only
`effective_status` says whether it is really running. Show it, and visually de-emphasise
anything not currently delivering.

### Arithmetic rules that must not be broken
- **Never sum across levels.** Campaign, adset and ad rows each already count the same leads.
  Adding them together multiplies the same lead three times.
- **Aggregating a date range means summing ingredients then dividing** —
  `sum(spend)/sum(qualified)`, never `avg(cost_per_qualified_lead)`. Averaging a ratio weights
  a ₹50 day the same as a ₹5,000 day. Recompute `low_sample` on the aggregate too.
- **Absence is not zero.** With no rows, show an empty state. NULL ratios render as "—",
  never `0` or `₹0.00`.
- Keep showing `low_sample` beside any ranking, and `attribution_window` + `snapshot_at` in
  the provenance footer.

## Task D — Do not assume exactly one account
A user may own more than one AdsPro account row, each with its own Page, ad account and
dataset. The data model already supports this and RLS already scopes it. Build every screen to
render a LIST and handle N — showing a single account as a plain label when N is 1. This is
what stops agency mode from being a rewrite later.

You are NOT being asked to build account creation or an onboarding flow for a second account.
Just stop assuming there is only ever one.

## Requirements that are easy to get wrong
1. **Never clobber `meta_dataset_id`** when changing the ad account. Still true.
2. **Always null `meta_ad_account_timezone`** when `meta_ad_account_id` changes. Still true.
3. **Reads and writes go through the logged-in user's session, not the service role.** The
   views are `security_invoker` over RLS tables and that is the real boundary.
4. **`ad_performance_daily` is driven from the spend side.** An ad account with no spend in
   range produces no rows — that is correct, not a failure. Show an empty state saying no
   spend was recorded for the selected period, not a grid of zeros.

## Definition of done — answer every item explicitly
1. Confirm **zero** migrations and **zero** schema changes.
2. Name every file changed.
3. Confirm the ad account name is shown wherever an ad account appears, and state the fallback
   when it is NULL.
4. Confirm the picker save writes `meta_ad_account_name`, and that it still nulls
   `meta_ad_account_timezone` and leaves `meta_dataset_id` untouched.
5. State whether you built the dialog or the back button, and why.
6. Describe how drill-down filters each level, and confirm you never sum across levels.
7. Confirm range aggregation sums ingredients before dividing, and that `low_sample` is
   recomputed on aggregates.
8. Confirm every screen handles more than one account without assuming a single row.
9. Confirm reads/writes use the logged-in user's session.
10. State whether it is published to adsproindia.com. **Publish it** — Prompt 17 was left in
    preview and is not live.
