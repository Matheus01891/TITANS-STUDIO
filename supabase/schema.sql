-- Execute this script in Supabase Dashboard → SQL Editor.
-- The delivery bucket must remain PRIVATE. Never expose a service-role key in the site.

create extension if not exists pgcrypto;

create table if not exists public.store_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.store_admins enable row level security;
drop policy if exists "Admins can see their own role" on public.store_admins;
create policy "Admins can see their own role" on public.store_admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.store_admins a where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to anon, authenticated;

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
drop policy if exists "Published products are visible" on public.products;
create policy "Published products are visible" on public.products
  for select to anon, authenticated using (published = true or public.is_store_admin());
drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products" on public.products
  for all to authenticated using (public.is_store_admin()) with check (public.is_store_admin());
drop trigger if exists store_products_audit on public.products;
create trigger store_products_audit
  after insert or update or delete on public.products
  for each row execute function public.log_store_product_audit();

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
  for insert to authenticated with check (bucket_id = 'titans-deliveries' and public.is_store_admin());
drop policy if exists "Store admins update delivery files" on storage.objects;
create policy "Store admins update delivery files" on storage.objects
  for update to authenticated using (bucket_id = 'titans-deliveries' and public.is_store_admin())
  with check (bucket_id = 'titans-deliveries' and public.is_store_admin());
drop policy if exists "Store admins delete delivery files" on storage.objects;
create policy "Store admins delete delivery files" on storage.objects
  for delete to authenticated using (bucket_id = 'titans-deliveries' and public.is_store_admin());

-- Create the first owner row only after signing into the customer page once:
-- insert into public.store_admins (user_id) values ('AUTH USER UUID FROM AUTHENTICATION → USERS');
