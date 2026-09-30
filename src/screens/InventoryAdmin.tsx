import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AlertTriangle, Boxes, PackagePlus, RefreshCw, Scale } from 'lucide-react-native';
import { supabase } from '../lib/supabase';

type StockItem = {
  id: string;
  sku: string | null;
  name: string;
  kind: 'ingredient' | 'product';
  unit: string;
  current_stock: number;
  minimum_stock: number;
  average_unit_cost: number;
  sale_price: number | null;
};

type RecipeCost = {
  recipe_id: string;
  product_id: string;
  product_name: string;
  sale_price: number | null;
  unit_sale_price: number | null;
  output_quantity: number;
  output_unit: string;
  total_recipe_cost: number;
  cost_per_output: number;
  gross_profit_per_output: number | null;
  gross_margin_percent: number | null;
  ingredients: { name: string; quantity: number; unit: string; line_cost: number }[];
};

type RowInput = { quantity: string; cost: string; adjustment: string };

const money = (value: number) => `$${Math.round(value).toLocaleString('es-AR')}`;
const initialInput = (item: StockItem): RowInput => ({ quantity: '', cost: String(item.average_unit_cost), adjustment: '' });

export default function InventoryAdmin() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeCost[]>([]);
  const [inputs, setInputs] = useState<Record<string, RowInput>>({});
  const [productionQuantity, setProductionQuantity] = useState('1');
  const [salePrice, setSalePrice] = useState('20000');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = async () => {
    if (!supabase) {
      setError('Supabase no está configurado.');
      setLoading(false);
      return;
    }
    setError('');
    const [stockResult, recipeResult] = await Promise.all([
      supabase.from('stock_items').select('id,sku,name,kind,unit,current_stock,minimum_stock,average_unit_cost,sale_price').eq('active', true).order('kind').order('name'),
      supabase.from('recipe_costs').select('recipe_id,product_id,product_name,sale_price,unit_sale_price,output_quantity,output_unit,total_recipe_cost,cost_per_output,gross_profit_per_output,gross_margin_percent,ingredients'),
    ]);
    if (stockResult.error) setError(stockResult.error.message);
    else {
      const nextItems = (stockResult.data ?? []) as StockItem[];
      setItems(nextItems);
      setInputs((current) => Object.fromEntries(nextItems.filter((item) => item.kind === 'ingredient').map((item) => [item.id, current[item.id] ?? initialInput(item)])));
    }
    if (recipeResult.error) setError((current) => current ? `${current} · ${recipeResult.error.message}` : recipeResult.error.message);
    else {
      const nextRecipes = (recipeResult.data ?? []) as RecipeCost[];
      setRecipes(nextRecipes);
      if (nextRecipes[0]?.sale_price != null) setSalePrice(String(nextRecipes[0].sale_price));
    }
    setLoading(false);
  };

  useEffect(() => { void Promise.resolve().then(loadData); }, []);

  const updateInput = (itemId: string, key: keyof RowInput, value: string) => {
    setInputs((current) => ({ ...current, [itemId]: { ...current[itemId], [key]: value } }));
  };

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  };

  const receiveItem = (item: StockItem) => runAction(async () => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const input = inputs[item.id] ?? initialInput(item);
    const quantity = Number(input.quantity);
    const unitCost = Number(input.cost);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Ingresa una cantidad de compra mayor que cero.');
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('Ingresa un costo unitario válido.');
    const { error: rpcError } = await supabase.rpc('receive_stock', {
      p_stock_item_id: item.id,
      p_quantity: quantity,
      p_unit_cost: unitCost,
    });
    if (rpcError) throw rpcError;
    updateInput(item.id, 'quantity', '');
  }, `Ingreso registrado: ${item.name}.`);

  const recordWaste = (item: StockItem) => runAction(async () => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const quantity = Math.abs(Number(inputs[item.id]?.adjustment));
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Ingresa la cantidad a descartar.');
    const { error: rpcError } = await supabase.rpc('adjust_stock', {
      p_stock_item_id: item.id,
      p_quantity_delta: -quantity,
      p_reason: 'waste',
      p_notes: 'Merma registrada desde Administración',
    });
    if (rpcError) throw rpcError;
    updateInput(item.id, 'adjustment', '');
  }, `Merma registrada: ${item.name}.`);

  const applyAdjustment = (item: StockItem) => runAction(async () => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const delta = Number(inputs[item.id]?.adjustment);
    if (!Number.isFinite(delta) || delta === 0) throw new Error('El ajuste debe ser distinto de cero. Usa signo negativo para una baja.');
    const { error: rpcError } = await supabase.rpc('adjust_stock', {
      p_stock_item_id: item.id,
      p_quantity_delta: delta,
      p_reason: 'adjustment',
      p_notes: 'Ajuste manual desde Administración',
    });
    if (rpcError) throw rpcError;
    updateInput(item.id, 'adjustment', '');
  }, `Ajuste registrado: ${item.name}.`);

  const produceDozens = () => runAction(async () => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const product = recipes[0];
    const quantity = Number(productionQuantity);
    if (!product) throw new Error('No hay una receta activa. Ejecuta database/empanada-costing.sql en Supabase.');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Ingresa una cantidad de docenas mayor que cero.');
    const { error: rpcError } = await supabase.rpc('apply_production_order', {
      p_product_id: product.product_id,
      p_quantity: quantity,
      p_notes: 'Producción desde Administración',
    });
    if (rpcError) throw rpcError;
  }, 'Producción registrada; se descontaron los ingredientes de la receta.');

  const saveSalePrice = () => runAction(async () => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const product = recipes[0];
    const parsedPrice = Number(salePrice);
    if (!product) throw new Error('No hay un producto con receta activa.');
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) throw new Error('Ingresa un precio de venta válido.');
    const { error: updateError } = await supabase.from('stock_items').update({ sale_price: parsedPrice, unit_sale_price: 1700 }).eq('kind', 'product').eq('unit', 'dozen');
    if (updateError) throw updateError;
  }, 'Precio minorista actualizado.');

  const ingredientItems = items.filter((item) => item.kind === 'ingredient');
  const product = recipes[0];
  const productStock = product ? items.find((item) => item.id === product.product_id) : undefined;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.eyebrow}>ADMINISTRACIÓN · INVENTARIO Y COSTOS</Text>
            <Text style={styles.title}>Producción y stock</Text>
            <Text style={styles.subtitle}>Movimientos, receta y rentabilidad conectados a Supabase</Text>
          </View>
          <Pressable onPress={() => { setLoading(true); void loadData(); }} disabled={busy} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Actualizar inventario">
            <RefreshCw size={17} color="#fff" />
          </Pressable>
        </View>
      </View>

      {!!error && <Text style={styles.errorBanner}>{error}</Text>}
      {!!notice && <Text style={styles.noticeBanner}>{notice}</Text>}
      {loading ? <ActivityIndicator color="#167957" style={styles.loader} /> : (
        <>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryPanel}>
              <View style={styles.sectionTitleRow}><Boxes size={18} color="#31634E" /><Text style={styles.sectionTitle}>Costo y precio por docena</Text></View>
              {product ? <>
                <Text style={styles.productName}>{product.product_name}</Text>
                <View style={styles.metricRow}><Text style={styles.metricLabel}>Costo receta / docena</Text><Text style={styles.metricValue}>{money(product.cost_per_output)}</Text></View>
                <View style={styles.metricRow}><Text style={styles.metricLabel}>Precio minorista</Text><Text style={styles.metricValue}>{money(product.sale_price ?? 0)}</Text></View>
                <View style={styles.metricRow}><Text style={styles.metricLabel}>Precio unitario</Text><Text style={styles.metricValue}>{money(product.unit_sale_price ?? 1700)}</Text></View>
                <View style={styles.metricRow}><Text style={styles.metricLabel}>Ganancia bruta / docena</Text><Text style={styles.profitValue}>{money(product.gross_profit_per_output ?? 0)}</Text></View>
                <View style={styles.metricRow}><Text style={styles.metricLabel}>Margen bruto</Text><Text style={styles.metricValue}>{Number(product.gross_margin_percent ?? 0).toLocaleString('es-AR')}%</Text></View>
                <View style={styles.recipeBreakdown}>
                  {(product.ingredients ?? []).map((ingredient) => (
                    <View key={ingredient.name} style={styles.recipeIngredientRow}>
                      <Text style={styles.recipeIngredientText}>{ingredient.name}: {Number(ingredient.quantity).toLocaleString('es-AR')} {ingredient.unit}</Text>
                      <Text style={styles.recipeIngredientCost}>{money(Number(ingredient.line_cost))}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.priceEditor}>
                  <TextInput value={salePrice} onChangeText={setSalePrice} keyboardType="decimal-pad" style={styles.priceField} accessibilityLabel="Precio minorista por docena" />
                  <Pressable onPress={saveSalePrice} disabled={busy} style={styles.smallButton}><Text style={styles.smallButtonText}>Guardar precio</Text></Pressable>
                </View>
              </> : <Text style={styles.emptyText}>Ejecuta database/empanada-costing.sql para cargar el producto y su receta.</Text>}
            </View>
            <View style={styles.summaryPanel}>
              <View style={styles.sectionTitleRow}><Scale size={18} color="#31634E" /><Text style={styles.sectionTitle}>Producir docenas</Text></View>
              <Text style={styles.metricLabel}>Empanadas de carne disponibles: {productStock?.current_stock ?? 0} docenas</Text>
              <View style={styles.productionRow}>
                <TextInput value={productionQuantity} onChangeText={setProductionQuantity} keyboardType="decimal-pad" style={styles.quantityField} accessibilityLabel="Cantidad de docenas a producir" />
                <Pressable onPress={produceDozens} disabled={busy || !product} style={[styles.primaryButton, (busy || !product) && styles.buttonDisabled]}>
                  <Text style={styles.primaryButtonText}>Producir</Text>
                </Pressable>
              </View>
              <Text style={styles.helperText}>La producción descuenta harina, grasa, carne, huevo, cebolla y pimiento. Al confirmar ventas, Supabase produce automáticamente cualquier faltante de producto terminado.</Text>
            </View>
          </View>

          <View style={styles.inventorySection}>
            <View style={styles.sectionHeading}>
              <View><Text style={styles.sectionTitle}>Insumos</Text><Text style={styles.sectionHint}>Costo promedio ponderado y existencias actuales</Text></View>
              <Text style={styles.itemCount}>{ingredientItems.length} insumos</Text>
            </View>
            {ingredientItems.map((item) => {
              const input = inputs[item.id] ?? initialInput(item);
              const isLow = item.current_stock <= item.minimum_stock;
              return (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.itemDetails}>
                    <View style={styles.itemNameRow}><Text style={styles.itemName}>{item.name}</Text>{isLow && <AlertTriangle size={14} color="#B65D30" />}</View>
                    <Text style={styles.itemMeta}>{item.current_stock.toLocaleString('es-AR')} {item.unit} disponibles · {money(item.average_unit_cost)} / {item.unit}</Text>
                  </View>
                  <View style={styles.itemActions}>
                    <View style={styles.inputsRow}>
                      <TextInput value={input.quantity} onChangeText={(value) => updateInput(item.id, 'quantity', value)} keyboardType="decimal-pad" placeholder={`Cantidad ${item.unit}`} placeholderTextColor="#8A9990" style={styles.stockInput} accessibilityLabel={`Cantidad de ingreso para ${item.name}`} />
                      <TextInput value={input.cost} onChangeText={(value) => updateInput(item.id, 'cost', value)} keyboardType="decimal-pad" placeholder="Costo unitario" placeholderTextColor="#8A9990" style={styles.stockInput} accessibilityLabel={`Costo unitario de ${item.name}`} />
                    </View>
                    <View style={styles.inputsRow}>
                      <Pressable onPress={() => receiveItem(item)} disabled={busy} style={styles.smallButton}><PackagePlus size={14} color="#fff" /><Text style={styles.smallButtonText}>Ingresar</Text></Pressable>
                      <TextInput value={input.adjustment} onChangeText={(value) => updateInput(item.id, 'adjustment', value)} keyboardType="numbers-and-punctuation" placeholder="Merma / ajuste" placeholderTextColor="#8A9990" style={styles.stockInput} accessibilityLabel={`Cantidad de merma o ajuste para ${item.name}`} />
                      <Pressable onPress={() => recordWaste(item)} disabled={busy} style={styles.wasteButton}><Text style={styles.wasteButtonText}>Merma</Text></Pressable>
                      <Pressable onPress={() => applyAdjustment(item)} disabled={busy} style={styles.adjustButton}><Text style={styles.adjustButtonText}>Ajustar</Text></Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
            {!ingredientItems.length && <Text style={styles.emptyText}>No hay insumos cargados. Ejecuta la migración de costos en Supabase.</Text>}
          </View>
          <Text style={styles.footerNote}>Cada ingreso, merma, ajuste y producción queda guardado en el historial de inventario. Las acciones requieren una sesión owner.</Text>
        </>
      )}
      {busy && <View style={styles.busyLine}><ActivityIndicator size="small" color="#167957" /><Text style={styles.helperText}>Guardando movimiento…</Text></View>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F4' },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 20, paddingBottom: 48, gap: 16 },
  header: { backgroundColor: '#173E34', padding: 22, borderRadius: 12 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: '#B8D8C7', fontSize: 10, fontWeight: '900', marginBottom: 6 },
  title: { color: '#fff', fontSize: 25, fontWeight: '900' },
  subtitle: { color: '#D0E3D8', fontSize: 12, marginTop: 5 },
  refreshButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2C5A49', borderRadius: 9 },
  errorBanner: { color: '#873B2D', backgroundColor: '#FFF0E9', borderColor: '#F0D2C5', borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 12 },
  noticeBanner: { color: '#28664B', backgroundColor: '#E9F5ED', borderColor: '#CDE5D4', borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 12 },
  loader: { padding: 40 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  summaryPanel: { flex: 1, minWidth: 290, backgroundColor: '#fff', borderColor: '#E1E9E3', borderWidth: 1, borderRadius: 10, padding: 16, gap: 9 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  sectionTitle: { color: '#203A30', fontSize: 16, fontWeight: '900' },
  productName: { color: '#55685D', fontSize: 12, fontWeight: '700' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EFF3F0', paddingTop: 8, gap: 12 },
  metricLabel: { color: '#697A70', fontSize: 11 },
  metricValue: { color: '#2E473A', fontSize: 13, fontWeight: '800' },
  profitValue: { color: '#15784F', fontSize: 14, fontWeight: '900' },
  recipeBreakdown: { borderTopWidth: 1, borderTopColor: '#EFF3F0', paddingTop: 5, gap: 5 },
  recipeIngredientRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  recipeIngredientText: { color: '#68786F', fontSize: 10 },
  recipeIngredientCost: { color: '#42594B', fontSize: 10, fontWeight: '700' },
  priceEditor: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  priceField: { flex: 1, height: 38, borderWidth: 1, borderColor: '#DCE6DF', borderRadius: 7, paddingHorizontal: 10, color: '#2E473A', outlineStyle: 'none' as never },
  smallButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 34, paddingHorizontal: 10, backgroundColor: '#1A5C43', borderRadius: 7 },
  smallButtonText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  productionRow: { flexDirection: 'row', gap: 8, marginTop: 3 },
  quantityField: { width: 100, height: 40, borderWidth: 1, borderColor: '#DCE6DF', borderRadius: 7, paddingHorizontal: 10, color: '#2E473A', outlineStyle: 'none' as never },
  primaryButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40, backgroundColor: '#1A5C43', borderRadius: 7 },
  primaryButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  buttonDisabled: { opacity: 0.5 },
  helperText: { color: '#78877F', fontSize: 10, lineHeight: 15, marginTop: 4 },
  inventorySection: { backgroundColor: '#fff', borderColor: '#E1E9E3', borderWidth: 1, borderRadius: 10, paddingHorizontal: 16 },
  sectionHeading: { minHeight: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#EAF0EC', gap: 12 },
  sectionHint: { color: '#7A8A81', fontSize: 10, marginTop: 4 },
  itemCount: { color: '#436A55', backgroundColor: '#ECF5EF', fontSize: 10, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 6 },
  itemRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EDF2EE' },
  itemDetails: { flex: 1, minWidth: 180, gap: 5 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName: { color: '#2B4337', fontSize: 12, fontWeight: '900' },
  itemMeta: { color: '#718078', fontSize: 10 },
  itemActions: { flex: 2, minWidth: 300, gap: 7 },
  inputsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  stockInput: { flex: 1, minWidth: 90, height: 34, borderWidth: 1, borderColor: '#E0E8E2', borderRadius: 6, paddingHorizontal: 8, color: '#31483C', fontSize: 10, outlineStyle: 'none' as never },
  wasteButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 9, backgroundColor: '#A94D32', borderRadius: 6 },
  wasteButtonText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  adjustButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 9, backgroundColor: '#EAF1EC', borderRadius: 6 },
  adjustButtonText: { color: '#3B5F49', fontSize: 10, fontWeight: '800' },
  emptyText: { color: '#748279', fontSize: 11, lineHeight: 17 },
  footerNote: { color: '#738178', fontSize: 10, lineHeight: 15 },
  busyLine: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
});
