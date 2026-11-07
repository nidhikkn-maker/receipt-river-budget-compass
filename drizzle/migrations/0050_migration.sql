create table public.demo_sessions (
  owner_id uuid primary key,
  label text not null,
  created_at timestamptz not null default now()
);
grant select on public.demo_sessions to authenticated;
grant all on public.demo_sessions to service_role;
alter table public.demo_sessions enable row level security;
create policy "demo owner reads own" on public.demo_sessions for select to authenticated using (owner_id = auth.uid());

create or replace function public.start_demo_workspace(_label text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sav uuid; card uuid; cur uuid; d date := current_date;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false then
    raise exception 'Demo is only for visitor sessions';
  end if;
  if _label is null or length(_label) > 254 or _label !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if exists (select 1 from demo_sessions where owner_id = uid) then return; end if;
  if (select count(*) from demo_sessions where created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Too many demos are starting right now — try again in a few minutes';
  end if;
  if exists (select 1 from accounts where owner_id = uid) then raise exception 'This session already has records'; end if;
  insert into demo_sessions(owner_id, label) values (uid, lower(trim(_label)));

  insert into accounts(owner_id, name, kind, opening_balance, issuer) values (uid, 'Demo Savings', 'savings', 185000, 'Sample Bank') returning id into sav;
  insert into accounts(owner_id, name, kind, opening_balance, issuer) values (uid, 'Demo Current', 'current', 420000, 'Sample Bank') returning id into cur;
  insert into accounts(owner_id, name, kind, opening_balance, issuer, last_four, credit_limit, statement_day, due_day)
    values (uid, 'Demo Rewards Card', 'credit_card', 0, 'Sample Card Co', '4242', 300000, 5, 25) returning id into card;

  insert into expenses(employee_id, title, amount, category, expense_date, account_id, txn_type, scope, payment_method, merchant) values
    (uid, 'Salary', 145000, 'Salary', d - 28, sav, 'income', 'personal', 'bank_transfer', 'Acme Pvt Ltd'),
    (uid, 'Client invoice — Northwind', 260000, 'Sales', d - 20, cur, 'income', 'business', 'bank_transfer', 'Northwind Traders'),
    (uid, 'Groceries', 4820.50, 'Groceries', d - 26, card, 'expense', 'personal', 'credit_card', 'FreshMart'),
    (uid, 'Electricity bill', 3210, 'Utilities', d - 24, sav, 'expense', 'personal', 'upi', 'City Power'),
    (uid, 'Team lunch', 6750, 'Meals', d - 21, card, 'expense', 'business', 'credit_card', 'Spice Route'),
    (uid, 'Flight to Bengaluru', 12480, 'Travel', d - 18, card, 'expense', 'business', 'credit_card', 'SkyAir'),
    (uid, 'Hotel — 2 nights', 15600, 'Travel', d - 17, card, 'expense', 'business', 'credit_card', 'Lakeview Hotel'),
    (uid, 'Cab to airport', 940, 'Transport', d - 18, sav, 'expense', 'business', 'upi', 'QuickCab'),
    (uid, 'Office software subscription', 8999, 'Software', d - 15, cur, 'expense', 'business', 'debit_card', 'CloudSuite'),
    (uid, 'Fuel', 3500, 'Transport', d - 12, card, 'expense', 'personal', 'credit_card', 'Highway Fuels'),
    (uid, 'Restaurant dinner', 2860, 'Dining', d - 9, card, 'expense', 'personal', 'credit_card', 'Olive Garden Bistro'),
    (uid, 'Mobile recharge', 799, 'Utilities', d - 7, sav, 'expense', 'personal', 'upi', 'TelcoOne'),
    (uid, 'Stationery', 1240, 'Office supplies', d - 5, cur, 'expense', 'business', 'debit_card', 'PaperWorks'),
    (uid, 'Pharmacy', 1585, 'Health', d - 3, sav, 'expense', 'personal', 'upi', 'WellCare Pharmacy'),
    (uid, 'Coffee with client', 640, 'Meals', d - 1, card, 'expense', 'business', 'credit_card', 'Bean There');
  insert into expenses(employee_id, title, amount, category, expense_date, account_id, to_account_id, txn_type, scope, payment_method) values
    (uid, 'Card bill payment', 20000, 'Card payment', d - 2, sav, card, 'card_payment', 'personal', 'bank_transfer');
end $$;
revoke all on function public.start_demo_workspace(text) from public, anon;
grant execute on function public.start_demo_workspace(text) to authenticated;

create or replace function public.expired_demo_owners()
returns setof uuid language sql security definer set search_path = public as $$
  select owner_id from demo_sessions where created_at < now() - interval '24 hours' limit 200
$$;
revoke all on function public.expired_demo_owners() from public, anon, authenticated;
grant execute on function public.expired_demo_owners() to service_role;