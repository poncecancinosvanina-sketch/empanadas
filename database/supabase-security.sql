-- Run after schema.sql. Safe to re-run after the schema has been initialized.
-- Only users explicitly mapped to a partner with role 'owner' can access business data.

CREATE TABLE IF NOT EXISTS partner_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL UNIQUE REFERENCES partners(id),
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON partner_profiles FROM anon, authenticated;
GRANT SELECT ON partner_profiles TO authenticated;
DROP POLICY IF EXISTS partner_profiles_read_own ON partner_profiles;
CREATE POLICY partner_profiles_read_own ON partner_profiles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION is_partner_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_profiles
    WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
  );
$$;
REVOKE ALL ON FUNCTION is_partner_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_partner_owner() TO authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'partners', 'stock_items', 'recipes', 'recipe_ingredients',
    'production_orders', 'customer_orders', 'customer_order_items',
    'inventory_movements', 'financial_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
    EXECUTE format('DROP POLICY IF EXISTS partner_owner_access ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY partner_owner_access ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_partner_owner())) WITH CHECK ((SELECT public.is_partner_owner()))',
      table_name
    );
  END LOOP;
END;
$$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER VIEW inventory_alerts SET (security_invoker = true);
ALTER VIEW admin_daily_metrics SET (security_invoker = true);
ALTER VIEW partner_profit_distribution SET (security_invoker = true);
ALTER VIEW products SET (security_invoker = true);
ALTER VIEW ingredients SET (security_invoker = true);
REVOKE ALL ON inventory_alerts, admin_daily_metrics, partner_profit_distribution, products, ingredients FROM PUBLIC, anon;
GRANT SELECT ON inventory_alerts, admin_daily_metrics, partner_profit_distribution, products, ingredients TO authenticated;

CREATE OR REPLACE FUNCTION require_partner_owner()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_partner_owner() THEN
    RAISE EXCEPTION 'Acceso reservado a socios' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION require_partner_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION require_partner_owner() TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.apply_production_order(uuid,numeric,uuid,text)') IS NOT NULL
     AND to_regprocedure('public.apply_production_order_impl(uuid,numeric,uuid,text)') IS NULL THEN
    ALTER FUNCTION public.apply_production_order(uuid, numeric, uuid, text) RENAME TO apply_production_order_impl;
  END IF;
  IF to_regprocedure('public.confirm_customer_order(uuid,uuid)') IS NOT NULL
     AND to_regprocedure('public.confirm_customer_order_impl(uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.confirm_customer_order(uuid, uuid) RENAME TO confirm_customer_order_impl;
  END IF;
  IF to_regprocedure('public.cancel_customer_order(uuid)') IS NOT NULL
     AND to_regprocedure('public.cancel_customer_order_impl(uuid)') IS NULL THEN
    ALTER FUNCTION public.cancel_customer_order(uuid) RENAME TO cancel_customer_order_impl;
  END IF;
  IF to_regprocedure('public.record_expense(financial_entry_kind,text,text,numeric,date,uuid,uuid)') IS NOT NULL
     AND to_regprocedure('public.record_expense_impl(financial_entry_kind,text,text,numeric,date,uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.record_expense(financial_entry_kind, text, text, numeric, date, uuid, uuid) RENAME TO record_expense_impl;
  END IF;
  IF to_regprocedure('public.receive_stock(uuid,numeric,numeric,uuid)') IS NOT NULL
     AND to_regprocedure('public.receive_stock_impl(uuid,numeric,numeric,uuid)') IS NULL THEN
    ALTER FUNCTION public.receive_stock(uuid, numeric, numeric, uuid) RENAME TO receive_stock_impl;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.apply_production_order_impl(uuid,numeric,uuid,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.apply_production_order_impl(uuid, numeric, uuid, text) FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.confirm_customer_order_impl(uuid,uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.confirm_customer_order_impl(uuid, uuid) FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.cancel_customer_order_impl(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.cancel_customer_order_impl(uuid) FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.record_expense_impl(public.financial_entry_kind,text,text,numeric,date,uuid,uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_expense_impl(public.financial_entry_kind, text, text, numeric, date, uuid, uuid) FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.receive_stock_impl(uuid,numeric,numeric,uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.receive_stock_impl(uuid, numeric, numeric, uuid) FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION apply_production_order(
  p_product_id uuid,
  p_quantity numeric,
  p_user_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  PERFORM public.require_partner_owner();
  RETURN public.apply_production_order_impl(p_product_id, p_quantity, p_user_id, p_notes);
END;
$$;

CREATE OR REPLACE FUNCTION confirm_customer_order(p_order_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  PERFORM public.require_partner_owner();
  PERFORM public.confirm_customer_order_impl(p_order_id, p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION cancel_customer_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  PERFORM public.require_partner_owner();
  PERFORM public.cancel_customer_order_impl(p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION record_expense(
  p_kind financial_entry_kind,
  p_category text,
  p_description text,
  p_amount numeric,
  p_occurred_on date DEFAULT current_date,
  p_partner_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  PERFORM public.require_partner_owner();
  RETURN public.record_expense_impl(p_kind, p_category, p_description, p_amount, p_occurred_on, p_partner_id, p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION receive_stock(
  p_stock_item_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  PERFORM public.require_partner_owner();
  RETURN public.receive_stock_impl(p_stock_item_id, p_quantity, p_unit_cost, p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION apply_production_order(uuid, numeric, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION confirm_customer_order(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION cancel_customer_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION record_expense(financial_entry_kind, text, text, numeric, date, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION receive_stock(uuid, numeric, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION apply_production_order(uuid, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_customer_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_customer_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION record_expense(financial_entry_kind, text, text, numeric, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION receive_stock(uuid, numeric, numeric, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
