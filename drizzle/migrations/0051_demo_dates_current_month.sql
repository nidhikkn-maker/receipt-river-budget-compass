create or replace function public.start_demo_workspace(_label text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sav uuid; card uuid; cur uuid; d date := current_date; m date := date_trunc('month', current_date)::date;
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
    (uid, 'Salary', 145000, 'Salary', (m + floor((d - m) * 0.067)::int), sav, 'income', 'personal', 'bank_transfer', 'Acme Pvt Ltd'),
    (uid, 'Client invoice — Northwind', 260000, 'Sales', (m + floor((d - m) * 0.333)::int), cur, 'income', 'business', 'bank_transfer', 'Northwind Traders'),
    (uid, 'Groceries', 4820.50, 'Groceries', (m + floor((d - m) * 0.133)::int), card, 'expense', 'personal', 'credit_card', 'FreshMart'),
    (uid, 'Electricity bill', 3210, 'Utilities', (m + floor((d - m) * 0.200)::int), sav, 'expense', 'personal', 'upi', 'City Power'),
    (uid, 'Team lunch', 6750, 'Meals', (m + floor((d - m) * 0.300)::int), card, 'expense', 'business', 'credit_card', 'Spice Route'),
    (uid, 'Flight to Bengaluru', 12480, 'Travel', (m + floor((d - m) * 0.400)::int), card, 'expense', 'business', 'credit_card', 'SkyAir'),
    (uid, 'Hotel — 2 nights', 15600, 'Travel', (m + floor((d - m) * 0.433)::int), card, 'expense', 'business', 'credit_card', 'Lakeview Hotel'),
    (uid, 'Cab to airport', 940, 'Transport', (m + floor((d - m) * 0.400)::int), sav, 'expense', 'business', 'upi', 'QuickCab'),
    (uid, 'Office software subscription', 8999, 'Software', (m + floor((d - m) * 0.500)::int), cur, 'expense', 'business', 'debit_card', 'CloudSuite'),
    (uid, 'Fuel', 3500, 'Transport', (m + floor((d - m) * 0.600)::int), card, 'expense', 'personal', 'credit_card', 'Highway Fuels'),
    (uid, 'Restaurant dinner', 2860, 'Dining', (m + floor((d - m) * 0.700)::int), card, 'expense', 'personal', 'credit_card', 'Olive Garden Bistro'),
    (uid, 'Mobile recharge', 799, 'Utilities', (m + floor((d - m) * 0.767)::int), sav, 'expense', 'personal', 'upi', 'TelcoOne'),
    (uid, 'Stationery', 1240, 'Office supplies', (m + floor((d - m) * 0.833)::int), cur, 'expense', 'business', 'debit_card', 'PaperWorks'),
    (uid, 'Pharmacy', 1585, 'Health', (m + floor((d - m) * 0.900)::int), sav, 'expense', 'personal', 'upi', 'WellCare Pharmacy'),
    (uid, 'Coffee with client', 640, 'Meals', (m + floor((d - m) * 0.967)::int), card, 'expense', 'business', 'credit_card', 'Bean There');
  -- Last month's activity so balances and comparisons look realistic.
  insert into expenses(employee_id, title, amount, category, expense_date, account_id, txn_type, scope, payment_method, merchant) values
    (uid, 'Salary', 145000, 'Salary', m - 28, sav, 'income', 'personal', 'bank_transfer', 'Acme Pvt Ltd'),
    (uid, 'Groceries', 5210, 'Groceries', m - 20, card, 'expense', 'personal', 'credit_card', 'FreshMart'),
    (uid, 'Office rent', 35000, 'Rent', m - 25, cur, 'expense', 'business', 'bank_transfer', 'Sample Estates'),
    (uid, 'Internet', 1199, 'Utilities', m - 12, sav, 'expense', 'personal', 'upi', 'FiberNet');
  insert into expenses(employee_id, title, amount, category, expense_date, account_id, to_account_id, txn_type, scope, payment_method) values
    (uid, 'Card bill payment', 20000, 'Card payment', (m + floor((d - m) * 0.933)::int), sav, card, 'card_payment', 'personal', 'bank_transfer');
end $$;