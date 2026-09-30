import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, ClipboardList, DollarSign, Flame, PackageCheck, TrendingUp } from 'lucide-react-native';

type IngredientKey = 'carne' | 'cebolla' | 'harina' | 'grasa';
type Ingredient = { id: IngredientKey; name: string; stock: number; minimum: number; unit: string; pricePerKg: number; gramsPerDozen: number };
type Order = { id: string; customer: string; detail: string; total: number; status: 'Pendiente' | 'Preparando' | 'En camino' | 'Entregado' };

const initialIngredients: Ingredient[] = [
  { id: 'carne', name: 'Carne vacuna', stock: 8.4, minimum: 10, unit: 'kg', pricePerKg: 8400, gramsPerDozen: 720 },
  { id: 'cebolla', name: 'Cebolla', stock: 14.2, minimum: 8, unit: 'kg', pricePerKg: 1450, gramsPerDozen: 300 },
  { id: 'harina', name: 'Harina 000', stock: 22, minimum: 12, unit: 'kg', pricePerKg: 980, gramsPerDozen: 600 },
  { id: 'grasa', name: 'Grasa vacuna', stock: 4.1, minimum: 5, unit: 'kg', pricePerKg: 3900, gramsPerDozen: 120 },
];

const initialOrders: Order[] = [
  { id: '#1048', customer: 'Lucía Fernández', detail: '2 docenas · Carne / Caprese', total: 19800, status: 'Pendiente' },
  { id: '#1047', customer: 'Marcos Díaz', detail: '1 docena · Combo clásico', total: 11200, status: 'Preparando' },
  { id: '#1046', customer: 'Sofía Ruiz', detail: '3 docenas · surtidas', total: 30600, status: 'En camino' },
];

const money = (value: number) => `$${Math.round(value).toLocaleString('es-AR')}`;

export default function AdminDashboard() {
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [orders, setOrders] = useState(initialOrders);
  const [targetMargin, setTargetMargin] = useState('33');
  const [otherCostsPerDozen, setOtherCostsPerDozen] = useState('1800');

  const recipeCost = ingredients.reduce((total, item) => total + item.pricePerKg * item.gramsPerDozen / 1000, 0);
  const totalCost = recipeCost + Math.max(0, Number(otherCostsPerDozen) || 0);
  const margin = Math.min(90, Math.max(0, Number(targetMargin) || 0)) / 100;
  const suggestedPrice = totalCost / (1 - margin);
  const todayLabel = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const updateIngredientPrice = (id: IngredientKey, raw: string) => {
    const price = Number(raw.replace(/[^0-9.]/g, ''));
    setIngredients((current) => current.map((item) => item.id === id ? { ...item, pricePerKg: Number.isFinite(price) ? price : 0 } : item));
  };
  const advanceOrder = (id: string) => {
    const next: Order['status'][] = ['Pendiente', 'Preparando', 'En camino', 'Entregado'];
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status: next[Math.min(next.indexOf(order.status) + 1, next.length - 1)] } : order));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.eyebrow}>PANEL DE CONTROL</Text>
            <Text style={styles.title}>Buen día, equipo 👋</Text>
            <Text style={styles.subtitle}>{todayLabel} · Buenos Aires</Text>
          </View>
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>Demo local</Text></View>
        </View>
        <View style={styles.headerBanner}>
          <View style={styles.bannerIcon}><Flame size={22} color="#fff" /></View>
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerTitle}>La cocina está a buen ritmo</Text>
            <Text style={styles.bannerText}>18 pedidos completados hoy · 4.8 ★ de satisfacción</Text>
          </View>
          <TrendingUp size={23} color="#B9F2D2" />
        </View>
      </View>

      <View style={styles.kpiGrid}>
        <Kpi title="Ventas de hoy" value="$284.650" change="+12,8%" icon={<DollarSign size={18} color="#137B58" />} tint="#E5F5EC" positive />
        <Kpi title="Pedidos" value="32" change="+6 vs ayer" icon={<ClipboardList size={18} color="#3167B5" />} tint="#EAF1FC" positive />
        <Kpi title="Ticket promedio" value="$8.895" change="+4,2%" icon={<Activity size={18} color="#B75B23" />} tint="#FFF0E5" positive />
        <Kpi title="Margen neto est." value="28,4%" change="Meta 33%" icon={<TrendingUp size={18} color="#8650A4" />} tint="#F3EAF7" />
      </View>

      <View style={styles.mainGrid}>
        <View style={styles.panel}>
          <View style={styles.panelHeading}>
            <View><Text style={styles.panelTitle}>Inventario crítico</Text><Text style={styles.panelHint}>Insumos de mayor rotación</Text></View>
            <View style={styles.panelIcon}><Boxes size={18} color="#38544A" /></View>
          </View>
          <View style={styles.inventoryTableHeader}><Text style={[styles.tableLabel, styles.ingredientColumn]}>INSUMO</Text><Text style={[styles.tableLabel, styles.stockColumn]}>STOCK</Text><Text style={[styles.tableLabel, styles.stateColumn]}>ESTADO</Text></View>
          {ingredients.map((item) => {
            const low = item.stock <= item.minimum;
            const percent = Math.min(100, item.stock / (item.minimum * 1.8) * 100);
            return (
              <View key={item.id} style={styles.inventoryRow}>
                <View style={[styles.ingredientColumn, styles.ingredientNameWrap]}>
                  <Text style={styles.ingredientName}>{item.name}</Text>
                  <View style={styles.miniTrack}><View style={[styles.miniFill, { width: `${percent}%`, backgroundColor: low ? '#E47A43' : '#48A881' }]} /></View>
                </View>
                <Text style={[styles.stockValue, styles.stockColumn]}>{item.stock.toFixed(1)} <Text style={styles.stockUnit}>{item.unit}</Text></Text>
                <View style={[styles.stateColumn, styles.stateWrap]}>
                  {low ? <View style={styles.lowTag}><AlertTriangle size={11} color="#A44C20" /><Text style={styles.lowText}>Reponer</Text></View> : <View style={styles.okTag}><Text style={styles.okText}>En nivel</Text></View>}
                </View>
              </View>
            );
          })}
          <View style={styles.alertFooter}><AlertTriangle size={15} color="#BD5C2C" /><Text style={styles.alertFooterText}>Carne y grasa por debajo del mínimo configurado</Text></View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeading}>
            <View><Text style={styles.panelTitle}>Simulador de receta</Text><Text style={styles.panelHint}>Costo estimado por docena de carne</Text></View>
            <View style={styles.panelIcon}><TrendingUp size={18} color="#38544A" /></View>
          </View>
          <View style={styles.simRows}>
            {ingredients.map((item) => (
              <View key={item.id} style={styles.simRow}>
                <View style={styles.simInfo}><Text style={styles.simName}>{item.name}</Text><Text style={styles.simQuantity}>{item.gramsPerDozen} g / docena</Text></View>
                <View style={styles.priceInputWrap}><Text style={styles.currency}>$</Text><TextInput value={String(item.pricePerKg)} onChangeText={(text) => updateIngredientPrice(item.id, text)} keyboardType="decimal-pad" style={styles.priceInput} accessibilityLabel={`Precio por kilo de ${item.name}`} /></View>
              </View>
            ))}
          </View>
          <View style={styles.additionalCostRow}>
            <View style={styles.simInfo}><Text style={styles.simName}>Mano de obra + costos indirectos</Text><Text style={styles.simQuantity}>Estimado por docena · editable</Text></View>
            <View style={styles.priceInputWrap}><Text style={styles.currency}>$</Text><TextInput value={otherCostsPerDozen} onChangeText={setOtherCostsPerDozen} keyboardType="decimal-pad" style={styles.priceInput} accessibilityLabel="Mano de obra y costos indirectos por docena" /></View>
          </View>
          <View style={styles.costSummary}>
            <View><Text style={styles.costLabel}>Costo materia prima</Text><Text style={styles.costValue}>{money(recipeCost)} <Text style={styles.perDozen}>/ docena</Text></Text></View>
            <View style={styles.marginInputWrap}><Text style={styles.costLabel}>Margen neto objetivo</Text><View style={styles.marginControl}><TextInput value={targetMargin} onChangeText={setTargetMargin} keyboardType="decimal-pad" style={styles.marginInput} accessibilityLabel="Margen neto objetivo" /><Text style={styles.percent}>%</Text></View></View>
          </View>
          <View style={styles.suggestedPrice}><View><Text style={styles.suggestLabel}>Precio para margen neto {Math.round(margin * 100)}%</Text><Text style={styles.suggestCaption}>{money(totalCost)} de costo total estimado / docena</Text></View><Text style={styles.suggestValue}>{money(suggestedPrice)}</Text></View>
          <Text style={styles.disclaimer}>Estimación editable. Verifica impuestos, comisiones y costos reales antes de fijar precios.</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeading}>
          <View><Text style={styles.panelTitle}>Pedidos en curso</Text><Text style={styles.panelHint}>Actualiza estado tocando cada pedido</Text></View>
          <View style={styles.ordersCount}><Text style={styles.ordersCountText}>{orders.length} activos</Text></View>
        </View>
        {orders.map((order) => (
          <Pressable key={order.id} onPress={() => advanceOrder(order.id)} style={styles.orderRow}>
            <View style={styles.orderIdBox}><PackageCheck size={18} color="#C2522C" /></View>
            <View style={styles.orderInfo}><Text style={styles.orderCustomer}>{order.customer} <Text style={styles.orderNumber}>{order.id}</Text></Text><Text style={styles.orderDetail}>{order.detail}</Text></View>
            <View style={styles.orderRight}><Text style={styles.orderTotal}>{money(order.total)}</Text><StatusTag status={order.status} /></View>
          </Pressable>
        ))}
      </View>

      <View style={styles.financeStrip}>
        <View style={styles.financeIcon}><ArrowUpRight size={19} color="#137B58" /></View>
        <View style={styles.financeCopy}><Text style={styles.financeTitle}>Utilidad estimada del mes</Text><Text style={styles.financeSub}>Luego de costos directos y fijos registrados</Text></View>
        <View style={styles.financeAmount}><Text style={styles.financeValue}>$1.842.300</Text><Text style={styles.splitText}>Socio A $921.150 · Socio B $921.150</Text></View>
      </View>
      <View style={styles.footerNote}><ArrowDownRight size={13} color="#718078" /><Text style={styles.footerText}>Los indicadores son demostrativos hasta conectar la API y base de datos.</Text></View>
    </ScrollView>
  );
}

function Kpi({ title, value, change, icon, tint, positive = false }: { title: string; value: string; change: string; icon: React.ReactNode; tint: string; positive?: boolean }) {
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiTop}><View style={[styles.kpiIcon, { backgroundColor: tint }]}>{icon}</View><Text style={styles.kpiChange}>{change}</Text></View>
      <Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiTitle}>{title}</Text>
      {positive && <View style={styles.kpiTrend}><ArrowUpRight size={12} color="#25885F" /><Text style={styles.trendText}>vs. período anterior</Text></View>}
    </View>
  );
}

function StatusTag({ status }: { status: Order['status'] }) {
  const tagStyle = status === 'Pendiente' ? styles.pendingTag : status === 'Preparando' ? styles.preparingTag : status === 'Entregado' ? styles.deliveredTag : styles.transitTag;
  return <View style={[styles.statusTag, tagStyle]}><Text style={styles.statusText}>{status}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F4' },
  content: { padding: 22, paddingBottom: 54, maxWidth: 1200, width: '100%', alignSelf: 'center', gap: 18 },
  header: { backgroundColor: '#173E34', borderRadius: 24, padding: 24, overflow: 'hidden' },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: '#B5D6C5', marginBottom: 7 },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#D1E4D9', fontSize: 13, marginTop: 5 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#65D899' },
  liveText: { color: '#E6F5EC', fontSize: 11, fontWeight: '800' },
  headerBanner: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 16, padding: 13 },
  bannerIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#D75B35', alignItems: 'center', justifyContent: 'center' },
  bannerCopy: { flex: 1 },
  bannerTitle: { color: '#fff', fontWeight: '800', fontSize: 13 },
  bannerText: { color: '#C5DCD0', fontSize: 11, marginTop: 3 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCard: { flexGrow: 1, flexBasis: '23%', minWidth: 170, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5ECE7', borderRadius: 18, padding: 16 },
  kpiTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  kpiIcon: { width: 35, height: 35, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  kpiChange: { color: '#488567', fontSize: 10, fontWeight: '800' },
  kpiValue: { color: '#203A30', fontSize: 25, fontWeight: '900' },
  kpiTitle: { color: '#65776D', fontSize: 12, fontWeight: '700', marginTop: 3 },
  kpiTrend: { flexDirection: 'row', alignItems: 'center', marginTop: 9, gap: 3 },
  trendText: { color: '#788A80', fontSize: 9 },
  mainGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' },
  panel: { flex: 1, minWidth: 320, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5ECE7', borderRadius: 20, padding: 18 },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  panelTitle: { color: '#203A30', fontSize: 17, fontWeight: '900' },
  panelHint: { color: '#7A8A81', fontSize: 11, marginTop: 4 },
  panelIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#EFF5F1', alignItems: 'center', justifyContent: 'center' },
  inventoryTableHeader: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#EDF1EE', paddingBottom: 8 },
  tableLabel: { color: '#91A097', fontSize: 9, fontWeight: '900' },
  ingredientColumn: { flex: 1.4 },
  stockColumn: { flex: 0.8, textAlign: 'right' },
  stateColumn: { flex: 0.9, alignItems: 'flex-end' },
  inventoryRow: { flexDirection: 'row', alignItems: 'center', minHeight: 57, borderBottomWidth: 1, borderBottomColor: '#F0F3F1' },
  ingredientNameWrap: { paddingRight: 12 },
  ingredientName: { color: '#30463B', fontSize: 12, fontWeight: '800' },
  miniTrack: { marginTop: 7, height: 4, backgroundColor: '#EEF2EF', borderRadius: 3, overflow: 'hidden' },
  miniFill: { height: 4, borderRadius: 3 },
  stockValue: { color: '#30463B', fontSize: 12, fontWeight: '800' },
  stockUnit: { color: '#849189', fontSize: 10, fontWeight: '600' },
  stateWrap: { alignItems: 'flex-end' },
  lowTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF0E7', paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8 },
  lowText: { color: '#A44C20', fontSize: 9, fontWeight: '900' },
  okTag: { backgroundColor: '#EAF5EE', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  okText: { color: '#3C815F', fontSize: 9, fontWeight: '900' },
  alertFooter: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, backgroundColor: '#FFF7F1', borderRadius: 10, padding: 10 },
  alertFooterText: { flex: 1, color: '#955333', fontSize: 10, fontWeight: '700' },
  simRows: { gap: 8 },
  additionalCostRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 },
  simRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F0F3F1' },
  simInfo: { flex: 1 },
  simName: { color: '#344A3F', fontSize: 11, fontWeight: '800' },
  simQuantity: { color: '#85938B', fontSize: 9, marginTop: 3 },
  priceInputWrap: { flexDirection: 'row', alignItems: 'center', width: 104, borderWidth: 1, borderColor: '#E1E9E3', borderRadius: 9, paddingHorizontal: 8, height: 34 },
  currency: { color: '#839087', fontSize: 11, fontWeight: '700' },
  priceInput: { flex: 1, paddingVertical: 0, paddingLeft: 3, color: '#30463B', textAlign: 'right', fontSize: 11, fontWeight: '800', outlineStyle: 'none' as never },
  costSummary: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 12 },
  costLabel: { color: '#819087', fontSize: 9, fontWeight: '700' },
  costValue: { color: '#31483C', fontSize: 18, fontWeight: '900', marginTop: 5 },
  perDozen: { color: '#85938B', fontSize: 10, fontWeight: '600' },
  marginInputWrap: { alignItems: 'flex-end' },
  marginControl: { flexDirection: 'row', alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#DDE7E0', borderRadius: 8, paddingHorizontal: 7, height: 31 },
  marginInput: { width: 36, padding: 0, textAlign: 'right', color: '#344A3F', fontSize: 12, fontWeight: '800', outlineStyle: 'none' as never },
  percent: { color: '#64766B', fontSize: 11, fontWeight: '800', marginLeft: 2 },
  suggestedPrice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#173E34', borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, marginTop: 14 },
  suggestLabel: { color: '#EAF4EE', fontSize: 12, fontWeight: '900' },
  suggestCaption: { color: '#BFD5C8', fontSize: 9, marginTop: 3 },
  suggestValue: { color: '#fff', fontSize: 21, fontWeight: '900' },
  disclaimer: { color: '#89968F', fontSize: 9, lineHeight: 13, marginTop: 9 },
  ordersCount: { backgroundColor: '#ECF4EF', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  ordersCountText: { color: '#3A785B', fontSize: 10, fontWeight: '900' },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#EEF2EF' },
  orderIdBox: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#FFF0E8', alignItems: 'center', justifyContent: 'center' },
  orderInfo: { flex: 1 },
  orderCustomer: { color: '#30463B', fontSize: 12, fontWeight: '900' },
  orderNumber: { color: '#8B9A91', fontSize: 10, fontWeight: '700' },
  orderDetail: { color: '#829188', fontSize: 10, marginTop: 4 },
  orderRight: { alignItems: 'flex-end', gap: 5 },
  orderTotal: { color: '#30463B', fontSize: 12, fontWeight: '900' },
  statusTag: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  pendingTag: { backgroundColor: '#FFF1E4' },
  preparingTag: { backgroundColor: '#EAF1FC' },
  transitTag: { backgroundColor: '#E8F5EF' },
  deliveredTag: { backgroundColor: '#E8F5EF' },
  statusText: { color: '#52695C', fontSize: 9, fontWeight: '900' },
  financeStrip: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#E7F3EB', borderRadius: 18, padding: 16 },
  financeIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  financeCopy: { flex: 1 },
  financeTitle: { color: '#2D6048', fontSize: 12, fontWeight: '900' },
  financeSub: { color: '#648875', fontSize: 10, marginTop: 3 },
  financeAmount: { alignItems: 'flex-end' },
  financeValue: { color: '#205E43', fontSize: 19, fontWeight: '900' },
  splitText: { color: '#648875', fontSize: 9, marginTop: 3 },
  footerNote: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerText: { color: '#718078', fontSize: 10 },
});
