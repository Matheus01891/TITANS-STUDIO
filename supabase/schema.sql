-- Execute this script in Supabase Dashboard → SQL Editor.
-- The delivery bucket must remain PRIVATE. Never expose a service-role key in the site.

create extension if not exists pgcrypto;

create table if not exists public.store_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','editor','support')),
  created_at timestamptz not null default now()
);
alter table public.store_admins add column if not exists role text not null default 'owner';
alter table public.store_admins drop constraint if exists store_admins_role_check;
alter table public.store_admins add constraint store_admins_role_check check (role in ('owner','editor','support'));
alter table public.store_admins enable row level security;

create or replace function public.is_store_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.store_admins a where a.user_id=(select auth.uid()) and a.role='owner');
$$;

create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.store_admins a where a.user_id = (select auth.uid()));
$$;

revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to anon, authenticated;
revoke all on function public.is_store_owner() from public;
grant execute on function public.is_store_owner() to authenticated;

create or replace function public.can_manage_products()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.store_admins a where a.user_id=(select auth.uid()) and a.role in ('owner','editor'));
$$;
revoke all on function public.can_manage_products() from public;
grant execute on function public.can_manage_products() to authenticated;

drop policy if exists "Owner manages staff roles" on public.store_admins;
create policy "Owner manages staff roles" on public.store_admins for all to authenticated
  using (public.is_store_owner()) with check (public.is_store_owner());
drop policy if exists "Admins can see their own role" on public.store_admins;
create policy "Admins can see their own role" on public.store_admins
  for select to authenticated using (user_id = (select auth.uid()) or public.is_store_owner());

-- Append-only administrative audit trail for product changes.
create table if not exists public.store_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.store_audit_logs enable row level security;
drop policy if exists "Admins can read store audit logs" on public.store_audit_logs;
create policy "Admins can read store audit logs" on public.store_audit_logs
  for select to authenticated using (public.is_store_admin());
grant select on public.store_audit_logs to authenticated;

create or replace function public.log_store_staff_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare action_name text; target_id uuid; old_role text; new_role text;
begin
  if tg_op='DELETE' then target_id:=old.user_id; old_role:=old.role; action_name:='staff_access_removed';
  elsif tg_op='INSERT' then target_id:=new.user_id; new_role:=new.role; action_name:='staff_access_granted';
  else target_id:=new.user_id; old_role:=old.role; new_role:=new.role; action_name:='staff_role_changed'; end if;
  insert into public.store_audit_logs(actor_id,actor_email,action,entity_type,entity_id,details)
  values((select auth.uid()),(select auth.jwt()->>'email'),action_name,'staff_role',target_id,
    jsonb_build_object('old_role',old_role,'new_role',new_role));
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public.log_store_staff_audit() from public,anon,authenticated;
drop trigger if exists store_staff_audit on public.store_admins;
create trigger store_staff_audit after insert or update or delete on public.store_admins
  for each row execute function public.log_store_staff_audit();

create or replace function public.prevent_last_store_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role='owner' and (tg_op='DELETE' or new.role is distinct from 'owner') and not exists(
    select 1 from public.store_admins a where a.role='owner' and a.user_id<>old.user_id
  ) then
    raise exception 'A loja precisa manter pelo menos um perfil de dono.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public.prevent_last_store_owner() from public,anon,authenticated;
drop trigger if exists store_keep_owner on public.store_admins;
create trigger store_keep_owner before update or delete on public.store_admins
  for each row execute function public.prevent_last_store_owner();
grant select,insert,update,delete on public.store_admins to authenticated;

create or replace function public.log_store_product_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_action text;
  event_id uuid;
  event_details jsonb;
begin
  if tg_op = 'INSERT' then
    event_action := 'product_created';
    event_id := new.id;
    event_details := jsonb_build_object('name', new.name, 'slug', new.slug, 'published', new.published);
  elsif tg_op = 'DELETE' then
    event_action := 'product_deleted';
    event_id := old.id;
    event_details := jsonb_build_object('name', old.name, 'slug', old.slug, 'published', old.published);
  else
    event_id := new.id;
    if old.published is distinct from new.published then
      event_action := case when new.published then 'product_published' else 'product_unpublished' end;
    else
      event_action := 'product_updated';
    end if;
    event_details := jsonb_build_object('name', new.name, 'slug', new.slug, 'published', new.published);
  end if;

  insert into public.store_audit_logs (actor_id, actor_email, action, entity_type, entity_id, details)
  values ((select auth.uid()), (select auth.jwt() ->> 'email'), event_action, 'product', event_id, event_details);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.log_store_product_audit() from public, anon, authenticated;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null default 'utilidades',
  description text not null default '',
  price_brl numeric(10,2) not null check (price_brl >= 0),
  frameworks text[] not null default '{}',
  is_featured boolean not null default false,
  is_new boolean not null default true,
  published boolean not null default false,
  image_url text,
  delivery_path text not null,
  current_version text not null default '1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products add column if not exists current_version text not null default '1.0.0';
grant select on public.products to anon;
grant select,insert,update,delete on public.products to authenticated;

alter table public.products enable row level security;
drop policy if exists "Published products are visible" on public.products;
create policy "Published products are visible" on public.products
  for select to anon, authenticated using (published = true or public.is_store_admin());
drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products" on public.products
  for all to authenticated using (public.can_manage_products()) with check (public.can_manage_products());
drop trigger if exists store_products_audit on public.products;
create trigger store_products_audit
  after insert or update or delete on public.products
  for each row execute function public.log_store_product_audit();

-- Version history and release notes for each script.
create table if not exists public.product_releases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  version text not null,
  notes text not null check (char_length(notes) between 5 and 3000),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  created_at timestamptz not null default now(),
  unique(product_id, version)
);
grant select,insert on public.product_releases to authenticated;
grant select on public.product_releases to anon;
alter table public.product_releases enable row level security;
drop policy if exists "Published release notes are visible" on public.product_releases;
create policy "Published release notes are visible" on public.product_releases for select to anon, authenticated
  using (exists(select 1 from public.products p where p.id=product_id and p.published=true) or public.is_store_admin());
drop policy if exists "Editors publish release notes" on public.product_releases;
create policy "Editors publish release notes" on public.product_releases for insert to authenticated
  with check (public.can_manage_products() and actor_id=(select auth.uid()));

create or replace function public.log_store_release_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare product_name text;
begin
  select name into product_name from public.products where id=new.product_id;
  insert into public.store_audit_logs(actor_id,actor_email,action,entity_type,entity_id,details)
  values((select auth.uid()),(select auth.jwt()->>'email'),'release_created','product_release',new.id,
    jsonb_build_object('name',product_name,'version',new.version,'notes',new.notes));
  return new;
end; $$;
revoke all on function public.log_store_release_audit() from public,anon,authenticated;
drop trigger if exists store_release_audit on public.product_releases;
create trigger store_release_audit after insert on public.product_releases
  for each row execute function public.log_store_release_audit();

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  code text not null unique,
  status text not null default 'pending' check (status in ('pending','paid','fulfilled','cancelled','refunded')),
  currency text not null default 'BRL',
  total_brl numeric(10,2) not null check (total_brl >= 0),
  payment_reference text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  fulfilled_at timestamptz
);
grant select on public.orders to authenticated;
alter table public.orders enable row level security;
drop policy if exists "Customers read own orders; admins read all" on public.orders;
create policy "Customers read own orders; admins read all" on public.orders
  for select to authenticated using (user_id = (select auth.uid()) or public.is_store_admin());

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 99),
  unit_price_brl numeric(10,2) not null check (unit_price_brl >= 0)
);
grant select on public.order_items to authenticated;
alter table public.order_items enable row level security;
drop policy if exists "Customers read own order items; admins read all" on public.order_items;
create policy "Customers read own order items; admins read all" on public.order_items
  for select to authenticated using (
    public.is_store_admin() or exists (
      select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())
    )
  );

-- Create a PRIVATE Storage bucket named "titans-deliveries" in the Supabase dashboard.
-- Only verified store admins can upload or remove delivery packages. Customer files are
-- served later through a short-lived signed URL issued only after the payment webhook
-- verifies the order. The anon/authenticated roles receive no direct download policy.
drop policy if exists "Store admins upload delivery files" on storage.objects;
create policy "Store admins upload delivery files" on storage.objects
  for insert to authenticated with check (bucket_id = 'titans-deliveries' and public.can_manage_products());
drop policy if exists "Store admins update delivery files" on storage.objects;
create policy "Store admins update delivery files" on storage.objects
  for update to authenticated using (bucket_id = 'titans-deliveries' and public.can_manage_products())
  with check (bucket_id = 'titans-deliveries' and public.can_manage_products());
drop policy if exists "Store admins delete delivery files" on storage.objects;
create policy "Store admins delete delivery files" on storage.objects
  for delete to authenticated using (bucket_id = 'titans-deliveries' and public.can_manage_products());

-- Create the first owner row only after signing into the customer page once:
-- insert into public.store_admins (user_id) values ('AUTH USER UUID FROM AUTHENTICATION → USERS');
