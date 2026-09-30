CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE stock_item_kind AS ENUM ('ingredient', 'product');
CREATE TYPE production_status AS ENUM ('draft', 'completed', 'cancelled');
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'preparing', 'on_the_way', 'delivered', 'cancelled');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded');
CREATE TYPE financial_entry_kind AS ENUM ('income', 'refund', 'direct_cost', 'cost_reversal', 'fixed_cost', 'inventory_purchase', 'partner_contribution', 'partner_withdrawal');

CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ownership_percent numeric(5,2) NOT NULL CHECK (ownership_percent > 0 AND ownership_percent <= 100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE,
  name text NOT NULL,
  kind stock_item_kind NOT NULL,
  unit text NOT NULL CHECK (unit IN ('g', 'kg', 'ml', 'l', 'unit', 'dozen', 'pack')),
  current_stock numeric(14,3) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_stock numeric(14,3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  average_unit_cost numeric(14,4) NOT NULL DEFAULT 0 CHECK (average_unit_cost >= 0),
  sale_price numeric(14,2) CHECK (sale_price IS NULL OR sale_price >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES stock_items(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  output_quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK (output_quantity > 0),
  output_unit text NOT NULL CHECK (output_unit IN ('g', 'kg', 'ml', 'l', 'unit', 'dozen', 'pack')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, version)
);

CREATE TABLE recipe_ingredients (
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES stock_items(id),
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (unit IN ('g', 'kg', 'ml', 'l', 'unit', 'dozen', 'pack')),
  PRIMARY KEY (recipe_id, ingredient_id)
);

CREATE TABLE production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number bigserial UNIQUE,
  product_id uuid NOT NULL REFERENCES stock_items(id),
  recipe_id uuid NOT NULL REFERENCES recipes(id),
  planned_quantity numeric(14,3) NOT NULL CHECK (planned_quantity > 0),
  produced_quantity numeric(14,3) NOT NULL CHECK (produced_quantity > 0),
  unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
  total_cost numeric(14,2) NOT NULL CHECK (total_cost >= 0),
  status production_status NOT NULL DEFAULT 'completed',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number bigserial UNIQUE,
  customer_name text NOT NULL,
  phone text,
  delivery_address text,
  status order_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  delivery_fee numeric(14,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  discount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  confirmed_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES stock_items(id),
  product_name_snapshot text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost_snapshot numeric(14,4) NOT NULL DEFAULT 0 CHECK (unit_cost_snapshot >= 0),
  line_total numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES stock_items(id),
  quantity_delta numeric(14,3) NOT NULL CHECK (quantity_delta <> 0),
  unit_cost numeric(14,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reason text NOT NULL CHECK (reason IN ('purchase', 'production_input', 'production_output', 'sale', 'sale_return', 'waste', 'adjustment')),
  reference_type text,
  reference_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_movements_item_created_idx ON inventory_movements(stock_item_id, created_at DESC);
CREATE INDEX customer_orders_status_created_idx ON customer_orders(status, created_at DESC);
CREATE INDEX production_orders_created_idx ON production_orders(created_at DESC);

CREATE TABLE financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind financial_entry_kind NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  occurred_on date NOT NULL DEFAULT current_date,
  order_id uuid REFERENCES customer_orders(id),
  production_order_id uuid REFERENCES production_orders(id),
  partner_id uuid REFERENCES partners(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX financial_entries_occurred_idx ON financial_entries(occurred_on DESC, kind);

INSERT INTO partners (name, ownership_percent)
SELECT seed.name, seed.ownership_percent
FROM (VALUES ('Socio 1', 50::numeric), ('Socio 2', 50::numeric)) AS seed(name, ownership_percent)
WHERE NOT EXISTS (SELECT 1 FROM partners existing WHERE existing.name = seed.name);

CREATE OR REPLACE FUNCTION apply_production_order(
  p_product_id uuid,
  p_quantity numeric,
  p_user_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_recipe recipes%ROWTYPE;
  v_product stock_items%ROWTYPE;
  v_order_id uuid;
  v_total_cost numeric(14,2) := 0;
  v_component record;
  v_required numeric(14,3);
  v_current_stock numeric(14,3);
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'La cantidad producida debe ser mayor a cero'; END IF;

  SELECT * INTO v_product FROM stock_items WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND OR v_product.kind <> 'product' THEN RAISE EXCEPTION 'El artículo a producir debe ser un producto final'; END IF;

  SELECT * INTO v_recipe FROM recipes
  WHERE product_id = p_product_id AND active = true
  ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe receta activa para el producto'; END IF;
  IF v_product.unit <> v_recipe.output_unit THEN
    RAISE EXCEPTION 'La unidad de salida de la receta debe coincidir con la unidad del producto';
  END IF;

  FOR v_component IN
    SELECT ri.ingredient_id, ri.quantity, ri.unit, si.current_stock, si.average_unit_cost, si.unit AS stock_unit, si.kind AS stock_kind
    FROM recipe_ingredients ri
    JOIN stock_items si ON si.id = ri.ingredient_id
    WHERE ri.recipe_id = v_recipe.id
    ORDER BY ri.ingredient_id
    FOR UPDATE OF si
  LOOP
    IF v_component.stock_kind <> 'ingredient' THEN
      RAISE EXCEPTION 'Las recetas solo pueden descontar insumos';
    END IF;
    IF v_component.unit <> v_component.stock_unit THEN
      RAISE EXCEPTION 'Unidad de receta (%) no coincide con insumo (%)', v_component.unit, v_component.stock_unit;
    END IF;
    v_required := round(v_component.quantity * p_quantity / v_recipe.output_quantity, 3);
    IF v_component.current_stock < v_required THEN
      RAISE EXCEPTION 'Stock insuficiente del insumo %. Disponible: %, necesario: %', v_component.ingredient_id, v_component.current_stock, v_required;
    END IF;
    v_total_cost := v_total_cost + (v_required * v_component.average_unit_cost);
  END LOOP;

  INSERT INTO production_orders(product_id, recipe_id, planned_quantity, produced_quantity, unit_cost, total_cost, notes, created_by)
  VALUES (p_product_id, v_recipe.id, p_quantity, p_quantity, round(v_total_cost / p_quantity, 4), v_total_cost, p_notes, p_user_id)
  RETURNING id INTO v_order_id;

  FOR v_component IN
    SELECT ri.ingredient_id, ri.quantity, ri.unit, si.average_unit_cost, si.unit AS stock_unit
    FROM recipe_ingredients ri
    JOIN stock_items si ON si.id = ri.ingredient_id
    WHERE ri.recipe_id = v_recipe.id
    ORDER BY ri.ingredient_id
  LOOP
    v_required := round(v_component.quantity * p_quantity / v_recipe.output_quantity, 3);
    UPDATE stock_items SET current_stock = current_stock - v_required, updated_at = now()
    WHERE id = v_component.ingredient_id;
    INSERT INTO inventory_movements(stock_item_id, quantity_delta, unit_cost, reason, reference_type, reference_id, created_by)
    VALUES (v_component.ingredient_id, -v_required, v_component.average_unit_cost, 'production_input', 'production_order', v_order_id, p_user_id);
  END LOOP;

  UPDATE stock_items
  SET current_stock = current_stock + p_quantity,
      average_unit_cost = CASE WHEN current_stock = 0 THEN round(v_total_cost / p_quantity, 4)
        ELSE round(((current_stock * average_unit_cost) + v_total_cost) / (current_stock + p_quantity), 4) END,
      updated_at = now()
  WHERE id = p_product_id;

  INSERT INTO inventory_movements(stock_item_id, quantity_delta, unit_cost, reason, reference_type, reference_id, created_by)
  VALUES (p_product_id, p_quantity, round(v_total_cost / p_quantity, 4), 'production_output', 'production_order', v_order_id, p_user_id);

  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION confirm_customer_order(p_order_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_order customer_orders%ROWTYPE;
  v_item record;
BEGIN
  SELECT * INTO v_order FROM customer_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'Solo se pueden confirmar pedidos pendientes'; END IF;

  PERFORM 1 FROM stock_items
  WHERE id IN (SELECT product_id FROM customer_order_items WHERE order_id = p_order_id)
  ORDER BY id FOR UPDATE;

  FOR v_item IN
    SELECT oi.product_id, sum(oi.quantity) AS quantity, si.current_stock, si.average_unit_cost, si.unit AS stock_unit
    FROM customer_order_items oi
    JOIN stock_items si ON si.id = oi.product_id
    WHERE oi.order_id = p_order_id
    GROUP BY oi.product_id, si.current_stock, si.average_unit_cost, si.unit
    ORDER BY oi.product_id
  LOOP
    IF v_item.stock_unit NOT IN ('unit', 'dozen', 'pack') THEN
      RAISE EXCEPTION 'El producto de venta debe usar una unidad de producto final';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM stock_items WHERE id = v_item.product_id AND kind = 'product') THEN
      RAISE EXCEPTION 'Solo se pueden vender productos finales';
    END IF;
    IF v_item.current_stock < v_item.quantity THEN
      RAISE EXCEPTION 'Stock de producto insuficiente: disponible %, solicitado %', v_item.current_stock, v_item.quantity;
    END IF;
  END LOOP;

  UPDATE stock_items si SET current_stock = si.current_stock - oi.quantity, updated_at = now()
  FROM (
    SELECT product_id, sum(quantity) AS quantity
    FROM customer_order_items WHERE order_id = p_order_id GROUP BY product_id
  ) oi WHERE si.id = oi.product_id;

  INSERT INTO inventory_movements(stock_item_id, quantity_delta, unit_cost, reason, reference_type, reference_id, created_by)
  SELECT oi.product_id, -oi.quantity, si.average_unit_cost, 'sale', 'customer_order', p_order_id, p_user_id
  FROM (
    SELECT product_id, sum(quantity) AS quantity
    FROM customer_order_items WHERE order_id = p_order_id GROUP BY product_id
  ) oi JOIN stock_items si ON si.id = oi.product_id;

  UPDATE customer_orders SET status = 'confirmed', confirmed_at = now()
  WHERE id = p_order_id;

  INSERT INTO financial_entries(kind, category, description, amount, order_id, created_by)
  VALUES ('income', 'venta', 'Venta pedido #' || v_order.order_number, v_order.total, p_order_id, p_user_id);

  INSERT INTO financial_entries(kind, category, description, amount, order_id, created_by)
  SELECT 'direct_cost', 'costo_venta', 'Costo de productos pedido #' || v_order.order_number,
         sum(oi.quantity * oi.unit_cost_snapshot), p_order_id, p_user_id
  FROM customer_order_items oi WHERE oi.order_id = p_order_id
  HAVING sum(oi.quantity * oi.unit_cost_snapshot) > 0;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_customer_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_order customer_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM customer_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_order.status IN ('delivered', 'cancelled') THEN RAISE EXCEPTION 'El pedido ya no se puede cancelar'; END IF;

  IF v_order.status <> 'pending' THEN
    UPDATE stock_items si SET current_stock = si.current_stock + oi.quantity, updated_at = now()
    FROM (
      SELECT product_id, sum(quantity) AS quantity
      FROM customer_order_items WHERE order_id = p_order_id GROUP BY product_id
    ) oi WHERE si.id = oi.product_id;

    INSERT INTO inventory_movements(stock_item_id, quantity_delta, unit_cost, reason, reference_type, reference_id)
    SELECT product_id, sum(quantity), sum(quantity * unit_cost_snapshot) / sum(quantity), 'sale_return', 'customer_order', p_order_id
    FROM customer_order_items WHERE order_id = p_order_id GROUP BY product_id;

    INSERT INTO financial_entries(kind, category, description, amount, order_id)
    VALUES ('refund', 'reembolso', 'Reverso de venta pedido #' || v_order.order_number, v_order.total, p_order_id);

    INSERT INTO financial_entries(kind, category, description, amount, order_id)
    SELECT 'cost_reversal', 'reverso_costo', 'Reverso de costo por cancelación #' || v_order.order_number,
           sum(quantity * unit_cost_snapshot), p_order_id
    FROM customer_order_items WHERE order_id = p_order_id
    HAVING sum(quantity * unit_cost_snapshot) > 0;
  END IF;

  UPDATE customer_orders SET status = 'cancelled', payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION receive_stock(
  p_stock_item_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_item stock_items%ROWTYPE;
  v_movement_id uuid;
BEGIN
  IF p_quantity <= 0 OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser positiva y el costo no puede ser negativo';
  END IF;
  SELECT * INTO v_item FROM stock_items WHERE id = p_stock_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  IF v_item.kind <> 'ingredient' THEN RAISE EXCEPTION 'La recepción solo aplica a insumos'; END IF;

  UPDATE stock_items
  SET current_stock = current_stock + p_quantity,
      average_unit_cost = CASE WHEN current_stock = 0 THEN p_unit_cost
        ELSE round(((current_stock * average_unit_cost) + (p_quantity * p_unit_cost)) / (current_stock + p_quantity), 4) END,
      updated_at = now()
  WHERE id = p_stock_item_id;

  INSERT INTO inventory_movements(stock_item_id, quantity_delta, unit_cost, reason, reference_type, created_by)
  VALUES (p_stock_item_id, p_quantity, p_unit_cost, 'purchase', 'stock_receipt', p_user_id)
  RETURNING id INTO v_movement_id;

  INSERT INTO financial_entries(kind, category, description, amount, created_by)
  VALUES ('inventory_purchase', 'compra_insumos', 'Recepción de stock: ' || v_item.name, p_quantity * p_unit_cost, p_user_id);
  RETURN v_movement_id;
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
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_kind NOT IN ('direct_cost', 'fixed_cost', 'partner_contribution', 'partner_withdrawal') THEN
    RAISE EXCEPTION 'Tipo de egreso no permitido para esta función';
  END IF;
  INSERT INTO financial_entries(kind, category, description, amount, occurred_on, partner_id, created_by)
  VALUES (p_kind, p_category, p_description, p_amount, p_occurred_on, p_partner_id, p_user_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE VIEW partner_profit_distribution AS
WITH period_totals AS (
  SELECT
    COALESCE(sum(amount) FILTER (WHERE kind = 'income'), 0) - COALESCE(sum(amount) FILTER (WHERE kind = 'refund'), 0) AS revenue,
    COALESCE(sum(amount) FILTER (WHERE kind = 'direct_cost'), 0) - COALESCE(sum(amount) FILTER (WHERE kind = 'cost_reversal'), 0) AS direct_costs,
    COALESCE(sum(amount) FILTER (WHERE kind = 'fixed_cost'), 0) AS fixed_costs,
    COALESCE(sum(amount) FILTER (WHERE kind = 'partner_withdrawal'), 0) AS withdrawals
  FROM financial_entries
  WHERE occurred_on >= date_trunc('month', current_date)::date
), available AS (
  SELECT revenue, direct_costs, fixed_costs,
    greatest(0, revenue - direct_costs - fixed_costs - withdrawals) AS distributable
  FROM period_totals
)
SELECT p.id AS partner_id, p.name, p.ownership_percent,
       a.revenue, a.direct_costs, a.fixed_costs,
       round(a.revenue - a.direct_costs - a.fixed_costs, 2) AS net_profit,
       round(a.distributable * p.ownership_percent / 100, 2) AS available_distribution
FROM partners p CROSS JOIN available a
WHERE p.active = true;

CREATE VIEW inventory_alerts AS
SELECT id, sku, name, kind, unit, current_stock, minimum_stock,
       (minimum_stock - current_stock) AS reorder_quantity
FROM stock_items
WHERE active = true AND current_stock <= minimum_stock;

CREATE VIEW products WITH (security_invoker = true) AS
SELECT id, sku, name, unit, current_stock, minimum_stock, average_unit_cost,
       sale_price, active, created_at, updated_at
FROM stock_items
WHERE kind = 'product'
WITH LOCAL CHECK OPTION;

CREATE VIEW ingredients WITH (security_invoker = true) AS
SELECT id, sku, name, unit, current_stock, minimum_stock, average_unit_cost,
       active, created_at, updated_at
FROM stock_items
WHERE kind = 'ingredient'
WITH LOCAL CHECK OPTION;

CREATE VIEW admin_daily_metrics AS
SELECT
  COALESCE(sum(total) FILTER (WHERE status <> 'cancelled' AND created_at::date = current_date), 0) AS sales_today,
  count(*) FILTER (WHERE status <> 'cancelled' AND created_at::date = current_date) AS orders_today,
  COALESCE(avg(total) FILTER (WHERE status <> 'cancelled' AND created_at::date = current_date), 0) AS average_ticket_today,
  COALESCE(sum(total) FILTER (WHERE status <> 'cancelled' AND created_at >= now() - interval '7 days'), 0) AS sales_7d
FROM customer_orders;
