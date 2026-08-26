# Fix the Meta ad account and dataset picker

## Findings

- On mount, `/dashboard/select-ad-account` reads the workspace ID from `?account=...` and calls the authenticated `listMetaAdAccounts` server function through TanStack Query. The server verifies `accounts.owner_user_id` with `getOwnedAccountToken`, decrypts `meta_access_token_encrypted`, and calls `GET /v21.0/me/adaccounts`. The token is sent to Meta in an `Authorization: Bearer` header and is not returned to the browser.
- `/dashboard` is a parent route in the generated route tree. The previous blank-child bug is fixed in the current source: `dashboard.tsx` renders `<Outlet />`, while the dashboard screen lives in `dashboard.index.tsx`.
- Selecting an ad account calls another authenticated server function for `GET /{ad_account_id}/adspixels`. Clicking “Use this dataset” calls `saveAdAccountSelection`, which updates `meta_ad_account_id`, `meta_dataset_id`, and `status`, then navigates to `/dashboard`.
- The concrete gaps are on the dataset/save path: only ad-account-attached pixels are queried, so business-owned datasets are invisible; Meta errors are reduced to one string and the raw response is lost; code 190 does not mark the token expired; the error panel is not dismissible; and the update does not request/validate a returned row, so an ownership/RLS no-op can be reported as success. The current ad-account request also omits the required `business` field.

## Implementation

1. **Structured Meta errors and filtered logs**
   - Extend the server-only Graph helper to preserve Meta `message`, `code`, `error_subcode`, `fbtrace_id`, HTTP status, and full raw response.
   - Prefix every server log on this flow with `[select-ad-account]`; log the complete response body for every non-2xx response.
   - Keep tokens exclusively in server-side helpers and Authorization headers.

2. **Owner-scoped account and dataset discovery**
   - Keep authenticated server functions and explicitly verify the requested account belongs to `context.userId` before token decryption/use.
   - Fetch ad accounts with exactly `fields=id,name,account_status,business`.
   - For the selected ad account, combine and deduplicate datasets from `/{ad_account_id}/adspixels` and its Business portfolio’s dataset/pixel edges, so Business-owned assets are available as well as directly attached pixels.
   - Return typed success/error DTOs to the page so Meta details and raw responses survive the RPC boundary.

3. **Expired-token handling and safe persistence**
   - On Meta error code `190`, update only the signed-in owner’s account to `status = 'token_expired'`.
   - Normalize the selected ad account ID to `act_...` and update both IDs in one authenticated, owner-scoped statement.
   - Require the update to return the saved row; treat zero updated rows and database errors as visible failures rather than success.

4. **Picker states and recovery UI**
   - Preserve explicit loading, populated, empty, and error states for both steps.
   - Show dismissible Meta error panels with message, code, subcode, trace ID, and collapsed raw response details.
   - Show the exact required empty-state copy for no ad accounts.
   - For code 190, show a “Reconnect Meta” action.
   - Keep the picker open when saving fails and display the database error inline; show a distinct saving state on the chosen dataset control.

5. **Verification**
   - Verify the current preview build and authenticated picker interaction in the browser.
   - Check the database row after a successful selection to confirm both IDs persisted and the dashboard displays them.
   - If the available authenticated Meta user has no accessible ad account/dataset, verify the real empty/error state and explicitly report that end-to-end persistence could not be completed rather than claiming it.
