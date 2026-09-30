-- Run after schema.sql and supabase-security.sql. Safe to re-run.
BEGIN;

ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS unit_sale_price numeric(14,2) CHECK (unit_sale_price IS NULL OR unit_sale_price >= 0);

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS app_private.seed_runs (
  seed_name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app_private.seed_runs FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  seed record;
  item_id uuid;
  item_stock numeric(14,3);
  has_movements boolean;
  initial_seed_pending boolean;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1 FROM app_private.seed_runs WHERE seed_name = 'empanada-costing-stock-v1'
  ) INTO initial_seed_pending;

  FOR seed IN
    SELECT * FROM (VALUES
      ('ingredient-flour', 'Harina', 'kg', 18::numeric, 890::numeric),
      ('ingredient-beef-fat', 'Grasa Bovina', 'kg', 12::numeric, 3700::numeric),
      ('ingredient-clean-beef', 'Carne Limpia', 'kg', 11::numeric, 17000::numeric),
      ('ingredient-eggs', 'Huevos', 'unit', 30::numeric, 200::numeric),
      ('ingredient-onion', 'Cebolla', 'kg', 20::numeric, 1350::numeric),
      ('ingredient-peppers', 'Pimientos Veteados', 'kg', 8::numeric, 3750::numeric)
    ) AS ingredients(sku, name, unit, opening_stock, unit_cost)
  LOOP
    SELECT id, current_stock INTO item_id, item_stock
    FROM stock_items
    WHERE sku = seed.sku OR lower(name) = lower(seed.name)
    ORDER BY (sku = seed.sku) DESC
    LIMIT 1
    FOR UPDATE;

    IF item_id IS NULL THEN
      INSERT INTO stock_items(sku, name, kind, unit, current_stock, average_unit_cost)
      VALUES (seed.sku, seed.name, 'ingredient', seed.unit, 0, seed.unit_cost)
      RETURNING id, current_stock INTO item_id, item_stock;
    ELSE
      UPDATE stock_items
      SET sku = COALESCE(sku, seed.sku), name = seed.name, kind = 'ingredient',
          unit = seed.unit,
          average_unit_cost = CASE WHEN initial_seed_pending THEN seed.unit_cost ELSE average_unit_cost END,
          active = true, updated_at = now()
      WHERE id = item_id;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM inventory_movements WHERE stock_item_id = item_id
    ) INTO has_movements;

    IF item_stock = 0 AND NOT has_movements THEN
      UPDATE stock_items SET current_stock = seed.opening_stock, updated_at = now() WHERE id = item_id;
      INSERT INTO inventory_movements(stock_item_id, quantity_delta, unit_cost, reason, reference_type, notes)
      VALUES (item_id, seed.opening_stock, seed.unit_cost, 'purchase', 'opening_balance', 'Stock inicial parametrizado');
    END IF;

    item_id := NULL;
    item_stock := NULL;
  END LOOP;

  INSERT INTO app_private.seed_runs(seed_name)
  VALUES ('empanada-costing-stock-v1') ON CONFLICT DO NOTHING;
END;
$$;

DO $$
DECLARE
  v_product_id uuid;
  v_recipe_id uuid;
  initial_seed_pending boolean;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1 FROM app_private.seed_runs WHERE seed_name = 'empanada-costing-product-v1'
  ) INTO initial_seed_pending;

  SELECT id INTO v_product_id
  FROM stock_items
  WHERE sku = 'product-beef-empanadas-dozen' OR lower(name) = lower('Empanadas de carne (docena)')
  ORDER BY (sku = 'product-beef-empanadas-dozen') DESC
  LIMIT 1
  FOR UPDATE;

  IF v_product_id IS NULL THEN
    INSERT INTO stock_items(sku, name, kind, unit, current_stock, minimum_stock, average_unit_cost, sale_price, unit_sale_price)
    VALUES ('product-beef-empanadas-dozen', 'Empanadas de carne (docena)', 'product', 'dozen', 0, 0, 0, 20000, 1700)
    RETURNING id INTO v_product_id;
  ELSE
    UPDATE stock_items
    SET sku = COALESCE(sku, 'product-beef-empanadas-dozen'), name = 'Empanadas de carne (docena)',
      kind = 'product', unit = 'dozen',
      sale_price = CASE WHEN initial_seed_pending THEN 20000 ELSE sale_price END,
      active = true, updated_at = now()
    WHERE id = v_product_id;
  END IF;

  UPDATE stock_items
  SET sale_price = CASE WHEN unit = 'unit' THEN 1700 ELSE 20000 END,
      unit_sale_price = 1700,
      updated_at = now()
  WHERE kind = 'product' AND active = true AND unit IN ('unit', 'dozen');

  INSERT INTO recipes(product_id, version, output_quantity, output_unit, active)
  VALUES (v_product_id, 1, 1, 'dozen', true)
  ON CONFLICT (product_id, version) DO UPDATE
  SET output_quantity = EXCLUDED.output_quantity, output_unit = EXCLUDED.output_unit, active = true
  RETURNING id INTO v_recipe_id;

  UPDATE recipes existing_recipe SET active = false
  WHERE existing_recipe.product_id = v_product_id AND existing_recipe.id <> v_recipe_id;

  INSERT INTO recipe_ingredients(recipe_id, ingredient_id, quantity, unit)
  SELECT v_recipe_id, item.id, seed.quantity, seed.unit
  FROM (VALUES
    ('ingredient-flour', 0.333333::numeric, 'kg'),
    ('ingredient-beef-fat', 0.083333::numeric, 'kg'),
    ('ingredient-clean-beef', 0.200000::numeric, 'kg'),
    ('ingredient-eggs', 1.000000::numeric, 'unit'),
    ('ingredient-onion', 0.300000::numeric, 'kg'),
    ('ingredient-peppers', 0.060000::numeric, 'kg')
  ) AS seed(sku, quantity, unit)
  JOIN stock_items item ON item.sku = seed.sku
  ON CONFLICT (recipe_id, ingredient_id) DO UPDATE
  SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit;

  INSERT INTO app_private.seed_runs(seed_name)
  VALUES ('empanada-costing-product-v1') ON CONFLICT DO NOTHING;
END;
$$;

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS unit_sale_price numeric(14,2)
  CHECK (unit_sale_price IS NULL OR unit_sale_price >= 0);

UPDATE public.stock_items
SET unit_sale_price = 1700
WHERE kind = 'product' AND unit = 'dozen' AND unit_sale_price IS NULL;

CREATE OR REPLACE VIEW public.recipe_costs WITH (security_invoker = true) AS
SELECT r.id AS recipe_id,
       p.id AS product_id,
       p.name AS product_name,
       p.sale_price,
       r.output_quantity,
       r.output_unit,
       COALESCE(sum(ri.quantity * si.average_unit_cost), 0)::numeric(14,4) AS total_recipe_cost,
       (COALESCE(sum(ri.quantity * si.average_unit_cost), 0) / r.output_quantity)::numeric(14,4) AS cost_per_output,
       CASE WHEN p.sale_price IS NULL THEN NULL
         ELSE (p.sale_price - COALESCE(sum(ri.quantity * si.average_unit_cost), 0) / r.output_quantity)::numeric(14,4)
       END AS gross_profit_per_output,
       CASE WHEN p.sale_price > 0 THEN
         ((p.sale_price - COALESCE(sum(ri.quantity * si.average_unit_cost), 0) / r.output_quantity) / p.sale_price * 100)::numeric(7,2)
         ELSE NULL
       END AS gross_margin_percent,
       COALESCE(
         jsonb_agg(jsonb_build_object(
           'name', si.name,
           'quantity', ri.quantity,
           'unit', ri.unit,
           'line_cost', ri.quantity * si.average_unit_cost
         ) ORDER BY si.name) FILTER (WHERE ri.ingredient_id IS NOT NULL),
         '[]'::jsonb
      ) AS ingredients,
      COALESCE(p.unit_sale_price, 1700::numeric(14,2)) AS unit_sale_price
  FROM public.recipes r
  JOIN public.stock_items p ON p.id = r.product_id
  LEFT JOIN public.recipe_ingredients ri ON ri.recipe_id = r.id
  LEFT JOIN public.stock_items si ON si.id = ri.ingredient_id
WHERE r.active = true AND p.active = true
GROUP BY r.id, p.id, p.name, p.sale_price, p.unit_sale_price, r.output_quantity, r.output_unit;

GRANT SELECT ON public.recipe_costs TO authenticated;
NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION adjust_stock(
  p_stock_item_id uuid,
  p_quantity_delta numeric,
  p_reason text,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  item stock_items%ROWTYPE;
  movement_id uuid;
BEGIN
  PERFORM public.require_partner_owner();
  IF p_quantity_delta = 0 THEN RAISE EXCEPTION 'El ajuste debe ser distinto de cero'; END IF;
  IF p_reason NOT IN ('waste', 'adjustment') THEN RAISE EXCEPTION 'Motivo de ajuste no permitido'; END IF;

  SELECT * INTO item FROM stock_items WHERE id = p_stock_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Artículo de stock no encontrado'; END IF;
  IF item.current_stock + p_quantity_delta < 0 THEN
    RAISE EXCEPTION 'El ajuste dejaría stock negativo. Disponible: %, ajuste: %', item.current_stock, p_quantity_delta;
  END IF;

  UPDATE stock_items
  SET current_stock = current_stock + p_quantity_delta, updated_at = now()
  WHERE id = p_stock_item_id;

  INSERT INTO inventory_movements(stock_item_id, quantity_delta, unit_cost, reason, reference_type, notes, created_by)
  VALUES (p_stock_item_id, p_quantity_delta, item.average_unit_cost, p_reason, 'manual_adjustment', p_notes, auth.uid())
  RETURNING id INTO movement_id;
  RETURN movement_id;
END;
$$;
REVOKE ALL ON FUNCTION adjust_stock(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION adjust_stock(uuid, numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION confirm_customer_order(p_order_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  item record;
  available numeric(14,3);
BEGIN
  PERFORM public.require_partner_owner();

  FOR item IN
    SELECT oi.product_id, sum(oi.quantity) AS quantity
    FROM customer_order_items oi
    WHERE oi.order_id = p_order_id
    GROUP BY oi.product_id
    ORDER BY oi.product_id
  LOOP
    SELECT current_stock INTO available FROM stock_items WHERE id = item.product_id FOR UPDATE;
    IF available < item.quantity AND EXISTS (
      SELECT 1 FROM recipes r WHERE r.product_id = item.product_id AND r.active = true
    ) THEN
      PERFORM public.apply_production_order_impl(
        item.product_id,
        item.quantity - available,
        COALESCE(p_user_id, auth.uid()),
        'Producción automática para pedido ' || p_order_id::text
      );
    END IF;
  END LOOP;

  PERFORM public.confirm_customer_order_impl(p_order_id, COALESCE(p_user_id, auth.uid()));
END;
$$;
REVOKE ALL ON FUNCTION confirm_customer_order(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION confirm_customer_order(uuid, uuid) TO authenticated;

GRANT SELECT ON recipe_costs TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
