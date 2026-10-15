-- Run against a disposable local Supabase database: supabase test db.
-- The transaction rolls back fixture users, tenants, and records.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(38);

-- Auth insert fires the personal-workspace trigger.
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@brand-pr.test', 'fixture', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@brand-pr.test', 'fixture', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'charlie@brand-pr.test', 'fixture', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dave@brand-pr.test', 'fixture', now(), now(), now());

select ok(
  (select count(*) = 4 from public.tenants
   where owner_id in (
     '00000000-0000-4000-8000-000000000001',
     '00000000-0000-4000-8000-000000000002',
     '00000000-0000-4000-8000-000000000003',
     '00000000-0000-4000-8000-000000000004'
   )),
  'Auth signup creates one personal workspace per new user'
);
select ok(
  (select count(*) = 4 from public.memberships
   where user_id in (
     '00000000-0000-4000-8000-000000000001',
     '00000000-0000-4000-8000-000000000002',
     '00000000-0000-4000-8000-000000000003',
     '00000000-0000-4000-8000-000000000004'
   ) and role = 'owner'),
  'Each new user is owner of their personal workspace'
);

-- Named team workspaces keep fixture IDs stable across test runs.
insert into public.tenants(id, name, owner_id) values
  ('00000000-0000-4000-8000-000000000101', 'Alice team',
   '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000102', 'Bob team',
   '00000000-0000-4000-8000-000000000002');

insert into public.conversations(id, tenant_id, user_id, title) values
  ('00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000001', 'Alice private chat'),
  ('00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000002', 'Bob private chat in Alice team'),
  ('00000000-0000-4000-8000-000000000203',
   '00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000002', 'Bob private chat in Bob team');
insert into public.messages(id, conversation_id, tenant_id, user_id, role, content) values
  ('00000000-0000-4000-8000-000000000301',
   '00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000001', 'user', 'Alice secret question'),
  ('00000000-0000-4000-8000-000000000302',
   '00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000002', 'user', 'Bob secret question'),
  ('00000000-0000-4000-8000-000000000303',
   '00000000-0000-4000-8000-000000000203',
   '00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000002', 'assistant', 'Bob private response');
insert into public.connector_credentials
  (id, tenant_id, provider, encrypted_secret, metadata, created_by)
values
  ('00000000-0000-4000-8000-000000000401',
   '00000000-0000-4000-8000-000000000101', 'notion',
   'encrypted-test-envelope', '{"workspace_name":"Test workspace"}'::jsonb,
   '00000000-0000-4000-8000-000000000001');

select ok((select count(*) = 1 from public.audit_logs where
  target_id = '00000000-0000-4000-8000-000000000401'
  and action = 'connector.created'),
  'Connector writes produce an automatic audit event');
select ok(not exists(select 1 from public.audit_logs where
  metadata::text like '%encrypted-test-envelope%'),
  'Credential ciphertext is absent from audit metadata');
select throws_ok($sql$
  delete from public.memberships where
    tenant_id = '00000000-0000-4000-8000-000000000101'
    and user_id = '00000000-0000-4000-8000-000000000001'
$sql$, '23514');

select ok(
  (select count(*) = 7 from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where (n.nspname, c.relname) in (
     ('public', 'tenants'), ('public', 'memberships'),
     ('public', 'conversations'), ('public', 'messages'),
     ('public', 'connector_credentials'), ('public', 'audit_logs'),
     ('private', 'rate_buckets')
   ) and c.relrowsecurity),
  'RLS is enabled on every application table'
);
select ok(not has_table_privilege('anon', 'public.tenants', 'SELECT'),
  'Anonymous clients cannot read tenant data');
select ok(not has_table_privilege('authenticated', 'public.connector_credentials', 'SELECT'),
  'Signed-in clients cannot read encrypted connector credentials');
select ok(not has_table_privilege('authenticated', 'public.connector_credentials', 'INSERT'),
  'Signed-in clients cannot write connector credentials');
select ok(not has_table_privilege('authenticated', 'private.rate_buckets', 'SELECT'),
  'Signed-in clients cannot inspect rate-limit buckets');
select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'INSERT'),
  'Signed-in clients cannot forge audit events');
select ok(not has_table_privilege('service_role', 'public.audit_logs', 'UPDATE'),
  'Service role cannot rewrite audit events');
select ok(not has_table_privilege('service_role', 'public.audit_logs', 'DELETE'),
  'Service role cannot delete audit events');
select ok(not has_column_privilege(
  'authenticated', 'public.conversations', 'tenant_id', 'UPDATE'),
  'Client cannot move a conversation to another tenant');

set local role authenticated;
select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000001', true);

select is((select count(*) from public.tenants where id in (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102')), 1::bigint,
  'Alice sees her team, not Bob team');
select is((select count(*) from public.conversations where tenant_id =
  '00000000-0000-4000-8000-000000000101'), 1::bigint,
  'Alice cannot read Bob conversation even in the same tenant');
select is((select count(*) from public.messages where tenant_id =
  '00000000-0000-4000-8000-000000000101'), 1::bigint,
  'Alice cannot read Bob messages even in the same tenant');
select throws_ok($sql$
  insert into public.conversations(tenant_id, user_id, title)
  values ('00000000-0000-4000-8000-000000000102',
          '00000000-0000-4000-8000-000000000001', 'Cross tenant')
$sql$, '42501');
select throws_ok($sql$
  insert into public.messages(conversation_id, tenant_id, user_id, role, content)
  values ('00000000-0000-4000-8000-000000000201',
          '00000000-0000-4000-8000-000000000101',
          '00000000-0000-4000-8000-000000000001', 'assistant', 'Forged answer')
$sql$, '42501');
select is(
  (with deleted as (
    delete from public.conversations where id =
      '00000000-0000-4000-8000-000000000202' returning id
   ) select count(*) from deleted),
  0::bigint, 'Alice cannot delete Bob conversation in her team'
);
select lives_ok($sql$
  select public.add_existing_member_by_email(
    '00000000-0000-4000-8000-000000000101',
    'bob@brand-pr.test', 'member')
$sql$, 'Owner can invite an existing registered user');
select throws_ok($sql$
  select public.add_existing_member_by_email(
    '00000000-0000-4000-8000-000000000101',
    'dave@brand-pr.test', 'owner')
$sql$, '22023');
select lives_ok($sql$
  select public.add_existing_member_by_email(
    '00000000-0000-4000-8000-000000000101',
    'charlie@brand-pr.test', 'admin')
$sql$, 'Owner can appoint an admin');
select ok((select count(*) > 0 from public.audit_logs where tenant_id =
  '00000000-0000-4000-8000-000000000101'),
  'Owner can read team audit history');

select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.conversations where tenant_id =
  '00000000-0000-4000-8000-000000000101'), 1::bigint,
  'Bob sees his own team-A chat but cannot see Alice chat');
select is((select count(*) from public.audit_logs where tenant_id =
  '00000000-0000-4000-8000-000000000101'), 0::bigint,
  'Regular member cannot read tenant audit history');
select throws_ok($sql$
  update public.memberships set role = 'admin'
  where tenant_id = '00000000-0000-4000-8000-000000000101'
    and user_id = '00000000-0000-4000-8000-000000000002'
$sql$, '42501');
select throws_ok($sql$
  select public.add_existing_member_by_email(
    '00000000-0000-4000-8000-000000000101',
    'dave@brand-pr.test', 'member')
$sql$, '42501');

select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.conversations where tenant_id =
  '00000000-0000-4000-8000-000000000101'), 0::bigint,
  'Admin still cannot read another user conversations');
select ok((select count(*) > 0 from public.audit_logs where tenant_id =
  '00000000-0000-4000-8000-000000000101'),
  'Admin can read audit history for their tenant');
select is((select count(*) from public.audit_logs where tenant_id =
  '00000000-0000-4000-8000-000000000102'), 0::bigint,
  'Admin cannot read another tenant audit history');
select throws_ok($sql$
  select public.add_existing_member_by_email(
    '00000000-0000-4000-8000-000000000102',
    'dave@brand-pr.test', 'member')
$sql$, '42501');
select throws_ok($sql$
  select public.add_existing_member_by_email(
    '00000000-0000-4000-8000-000000000101',
    'dave@brand-pr.test', 'admin')
$sql$, '42501');
select lives_ok($sql$
  select public.add_existing_member_by_email(
    '00000000-0000-4000-8000-000000000101',
    'dave@brand-pr.test', 'member')
$sql$, 'Admin may invite a regular member');
select ok(not public.consume_rate_limit(
  '00000000-0000-4000-8000-000000000102', 'chat'),
  'Non-member cannot spend another tenant rate bucket');

select set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000001', true);
select ok((select bool_and(public.consume_rate_limit(
  '00000000-0000-4000-8000-000000000101', 'connector_oauth'))
  from generate_series(1, 5)),
  'Five OAuth attempts fit the fixed per-user window');
select ok(not public.consume_rate_limit(
  '00000000-0000-4000-8000-000000000101', 'connector_oauth'),
  'Sixth OAuth attempt is rate limited');
select throws_ok($sql$
  select public.consume_rate_limit(
    '00000000-0000-4000-8000-000000000101', 'custom_unlimited_action')
$sql$, '22023');

reset role;
select * from finish();
rollback;
