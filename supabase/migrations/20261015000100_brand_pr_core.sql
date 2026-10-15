-- Brand PR Agent: one personal workspace per Supabase Auth user.
-- Run with the Supabase CLI or SQL editor as the migration owner (postgres).

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.member_role as enum ('owner', 'admin', 'member');
create type public.message_role as enum ('user', 'assistant');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index memberships_user_id_idx on public.memberships(user_id, tenant_id);
create unique index memberships_one_owner_per_tenant_idx
  on public.memberships(tenant_id) where role = 'owner';

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation'
    check (char_length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, user_id)
);
create index conversations_owner_updated_idx
  on public.conversations(tenant_id, user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  tenant_id uuid not null,
  user_id uuid not null,
  role public.message_role not null,
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, tenant_id, user_id)
    references public.conversations(id, tenant_id, user_id) on delete cascade
);
create index messages_conversation_created_idx
  on public.messages(conversation_id, created_at, id);

-- encrypted_secret is an opaque AES-GCM envelope made by the server.
-- Never place an access token, refresh token, or API key in metadata.
create table public.connector_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,63}$'),
  encrypted_secret text not null check (char_length(encrypted_secret) > 0),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_user_id uuid,
  action text not null check (char_length(btrim(action)) between 1 and 100),
  target_type text not null check (char_length(btrim(target_type)) between 1 and 100),
  target_id text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_created_idx
  on public.audit_logs(tenant_id, created_at desc);

-- This schema is intentionally absent from PostgREST's exposed schemas.
create table private.rate_buckets (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  bucket_start timestamptz not null,
  hit_count integer not null check (hit_count > 0),
  primary key (tenant_id, user_id, action, bucket_start)
);
create index rate_buckets_start_idx on private.rate_buckets(bucket_start);

create function private.is_member(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = (select auth.uid())
  );
$$;

create function private.has_role(p_tenant_id uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and m.role = any(p_roles)
  );
$$;

create function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger conversations_touch_updated_at before update on public.conversations
  for each row execute function private.touch_updated_at();
create trigger credentials_touch_updated_at before update on public.connector_credentials
  for each row execute function private.touch_updated_at();

create function private.create_owner_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.memberships(tenant_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;
create trigger tenants_create_owner after insert on public.tenants
  for each row execute function private.create_owner_membership();

create function private.guard_owner_membership()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      raise exception 'Owner membership cannot be deleted' using errcode = '23514';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.role = 'owner' and
     (new.role <> 'owner' or new.user_id <> old.user_id or
      new.tenant_id <> old.tenant_id) then
    raise exception 'Owner membership cannot be reassigned'
      using errcode = '23514';
  end if;
  if new.role = 'owner' and not exists (
    select 1 from public.tenants t
    where t.id = new.tenant_id and t.owner_id = new.user_id
  ) then
    raise exception 'Owner membership must match tenant owner'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger memberships_guard_owner before insert or update or delete
  on public.memberships for each row execute function private.guard_owner_membership();

create function private.guard_tenant_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Tenant owner is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger tenants_guard_owner before update of owner_id on public.tenants
  for each row execute function private.guard_tenant_owner();

create function private.on_auth_user_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tenants(name, owner_id) values ('Personal workspace', new.id);
  return new;
end;
$$;
create trigger brand_pr_auth_user_created after insert on auth.users
  for each row execute function private.on_auth_user_created();

-- Existing Auth users receive a personal workspace on first installation.
insert into public.tenants(name, owner_id)
select 'Personal workspace', u.id from auth.users u
where not exists (select 1 from public.tenants t where t.owner_id = u.id);

create function private.audit_membership_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row public.memberships%rowtype;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  insert into public.audit_logs
    (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    v_row.tenant_id, (select auth.uid()),
    case tg_op when 'INSERT' then 'membership.created'
               when 'UPDATE' then 'membership.updated'
               else 'membership.deleted' end,
    'membership', v_row.user_id::text,
    pg_catalog.jsonb_build_object('role', v_row.role::text)
  );
  return v_row;
end;
$$;
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function private.audit_membership_change();

create function private.audit_credential_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row public.connector_credentials%rowtype;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  insert into public.audit_logs
    (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    v_row.tenant_id, coalesce((select auth.uid()), v_row.created_by),
    case tg_op when 'INSERT' then 'connector.created'
               when 'UPDATE' then 'connector.updated'
               else 'connector.deleted' end,
    'connector', v_row.id::text,
    pg_catalog.jsonb_build_object('provider', v_row.provider)
  );
  return v_row;
end;
$$;
create trigger connector_credentials_audit
  after insert or update or delete on public.connector_credentials
  for each row execute function private.audit_credential_change();

-- Public RPCs are invokers. Their privileged implementations live in private.
create function private.add_existing_member_by_email(
  p_tenant_id uuid, p_email text, p_role public.member_role
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_target uuid;
  v_existing public.member_role;
begin
  if v_actor is null or not private.has_role(
    p_tenant_id, array['owner', 'admin']::public.member_role[]
  ) then
    raise exception 'Not authorized to manage this workspace' using errcode = '42501';
  end if;
  if p_role is null or p_role = 'owner' then
    raise exception 'Invalid membership role' using errcode = '22023';
  end if;
  if p_role = 'admin' and not private.has_role(
    p_tenant_id, array['owner']::public.member_role[]
  ) then
    raise exception 'Only an owner can appoint admins' using errcode = '42501';
  end if;
  if p_email is null or char_length(btrim(p_email)) > 320 then
    raise exception 'Invalid email' using errcode = '22023';
  end if;

  select u.id into v_target from auth.users u
  where pg_catalog.lower(u.email) = pg_catalog.lower(btrim(p_email))
  limit 1;
  if v_target is null then
    raise exception 'User must register before joining this workspace'
      using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.tenants t
    where t.id = p_tenant_id and t.owner_id = v_target
  ) then
    raise exception 'Owner role cannot be changed' using errcode = '42501';
  end if;

  select m.role into v_existing from public.memberships m
  where m.tenant_id = p_tenant_id and m.user_id = v_target for update;

  if v_existing is not null and not private.has_role(
    p_tenant_id, array['owner']::public.member_role[]
  ) then
    raise exception 'Only an owner can change an existing member'
      using errcode = '42501';
  end if;
  if v_existing is null then
    insert into public.memberships(tenant_id, user_id, role)
    values (p_tenant_id, v_target, p_role);
  else
    update public.memberships m set role = p_role
    where m.tenant_id = p_tenant_id and m.user_id = v_target;
  end if;
  return v_target;
end;
$$;

create function public.add_existing_member_by_email(
  p_tenant_id uuid, p_email text, p_role public.member_role default 'member'
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.add_existing_member_by_email(p_tenant_id, p_email, p_role);
$$;

create function private.consume_rate_limit(p_tenant_id uuid, p_action text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_window_seconds integer;
  v_limit integer;
  v_start timestamptz;
  v_hits integer;
begin
  if v_user_id is null or not private.is_member(p_tenant_id) then
    return false;
  end if;
  case p_action
    when 'chat' then v_limit := 20; v_window_seconds := 60;
    when 'connector_oauth' then v_limit := 5; v_window_seconds := 60;
    when 'membership_change' then v_limit := 10; v_window_seconds := 60;
    else raise exception 'Unknown rate-limit action' using errcode = '22023';
  end case;

  v_start := pg_catalog.to_timestamp(
    pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp())
      / v_window_seconds) * v_window_seconds
  );
  insert into private.rate_buckets as rb
    (tenant_id, user_id, action, bucket_start, hit_count)
  values (p_tenant_id, v_user_id, p_action, v_start, 1)
  on conflict (tenant_id, user_id, action, bucket_start)
  do update set hit_count = rb.hit_count + 1
    where rb.hit_count < v_limit
  returning hit_count into v_hits;
  return v_hits is not null;
end;
$$;

create function public.consume_rate_limit(p_tenant_id uuid, p_action text)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select private.consume_rate_limit(p_tenant_id, p_action);
$$;

-- RLS and SQL grants are both required. service_role is used only server-side.
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.connector_credentials enable row level security;
alter table public.audit_logs enable row level security;
alter table private.rate_buckets enable row level security;

revoke all on public.tenants, public.memberships, public.conversations,
  public.messages, public.connector_credentials, public.audit_logs
  from public, anon, authenticated;
revoke all on public.audit_logs from service_role;
revoke all on private.rate_buckets from public, anon, authenticated;

grant select on public.tenants, public.memberships to authenticated;
grant select, insert, delete on public.conversations to authenticated;
grant update(title) on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant select on public.audit_logs to authenticated;
grant select, insert on public.audit_logs to service_role;
grant all on public.tenants, public.memberships, public.conversations,
  public.messages, public.connector_credentials to service_role;

create policy tenants_select_member on public.tenants for select to authenticated
  using (private.is_member(id));
create policy memberships_select_visible on public.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid()) or
    private.has_role(tenant_id, array['owner', 'admin']::public.member_role[])
  );
create policy conversations_select_own on public.conversations
  for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy conversations_insert_own on public.conversations
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy conversations_update_own on public.conversations
  for update to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id))
  with check (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy conversations_delete_own on public.conversations
  for delete to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy messages_select_own on public.messages
  for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(tenant_id));
create policy messages_insert_user_own on public.messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and private.is_member(tenant_id)
    and role = 'user'
  );
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (private.has_role(
    tenant_id, array['owner', 'admin']::public.member_role[]
  ));

-- Functions are executable by PUBLIC by default. Revoke each explicitly.
revoke execute on function private.is_member(uuid),
  private.has_role(uuid, public.member_role[]),
  private.touch_updated_at(),
  private.create_owner_membership(),
  private.guard_owner_membership(),
  private.guard_tenant_owner(),
  private.on_auth_user_created(),
  private.audit_membership_change(),
  private.audit_credential_change(),
  private.add_existing_member_by_email(uuid, text, public.member_role),
  private.consume_rate_limit(uuid, text)
  from public, anon, authenticated;
grant execute on function private.is_member(uuid),
  private.has_role(uuid, public.member_role[]),
  private.add_existing_member_by_email(uuid, text, public.member_role),
  private.consume_rate_limit(uuid, text)
  to authenticated;
revoke execute on function public.add_existing_member_by_email(
  uuid, text, public.member_role), public.consume_rate_limit(uuid, text)
  from public, anon;
grant execute on function public.add_existing_member_by_email(
  uuid, text, public.member_role), public.consume_rate_limit(uuid, text)
  to authenticated;
