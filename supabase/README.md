# Database and authorization

Apply `migrations/20261015000100_brand_pr_core.sql` to a **new Supabase project** with the Supabase CLI (`supabase db push`) or SQL editor. The migration adds a personal workspace when an Auth user signs up and backfills existing Auth users. Never apply the migration with an application user's credentials.

The browser's Supabase client can read its workspaces and memberships, manage its own conversations, insert its own `user` messages, and read its own messages. It cannot insert `assistant` messages, change memberships directly, read connector credentials, or write audit logs. A server-only service-role client stores AI replies, encrypted external-service credentials, and audit events **after** it has validated the signed-in user's workspace membership and conversation ownership. The service-role key must never be sent to a browser.

`connector_credentials.encrypted_secret` stores an opaque encrypted envelope created by the application. The database does not encrypt it. The application must keep its encryption key in a server-side environment variable and never put tokens in `metadata` or audit events. The database audits membership and credential changes automatically; application-level chat and OAuth events should be written to `audit_logs` with the service-role client. Audit rows cannot be updated or deleted through the service role. Tenant deletion requires a separate audited retention procedure because audit rows restrict deletion.

`public.add_existing_member_by_email(p_tenant_id, p_email, p_role)` returns the existing Auth user's UUID. The user must register first. Owners and admins may add members; only owners can appoint admins or change existing roles. The owner role is immutable. `public.consume_rate_limit(p_tenant_id, p_action)` returns a boolean for the authenticated user's tenant: `chat` allows 20 requests per minute, `connector_oauth` 5, and `membership_change` 10. The limits are fixed in the database so a caller cannot request a larger allowance. The application must call this RPC with the user's session, not its service-role key.

Run the RLS and role tests against a disposable local Supabase stack:

```sh
supabase start
supabase db reset
supabase test db
```

The tests simulate several users and assert cross-tenant and cross-user isolation, role controls, secret and audit grants, and rate limits. They run in a rollback transaction. Supabase's CLI and Docker are required to run them. To retire old rate-limit buckets, periodically delete `private.rate_buckets` rows older than the retention period with a trusted maintenance connection; the application roles have no direct access to that table.

References: [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), [database function security](https://supabase.com/docs/guides/database/functions), and [database testing](https://supabase.com/docs/guides/local-development/testing/overview).
