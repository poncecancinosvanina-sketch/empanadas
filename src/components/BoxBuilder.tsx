import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Linking,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, MapPin, MessageCircle, Minus, Plus, RotateCcw, Search, ShoppingBag, Sparkles } from 'lucide-react-native';
import { DOZEN_PRICE, EMPANADAS, UNIT_PRICE, useCartStore } from '../store/useCartStore';
import { BoxSize, FlavorKey } from '../types/empanada';

const BOX_SIZES: BoxSize[] = [1, 12];
const FLAVOR_FILTERS = ['Todos', 'Carne', 'Vegetarianos'] as const;
const WHATSAPP_NUMBER = '5493855750969';

export default function BoxBuilder() {
  const {
    boxSize,
    selectedFlavors,
    setBoxSize,
    addFlavor,
    removeFlavor,
    replaceFlavorAt,
    removeFlavorAt,
    clearSelection,
    surpriseMe,
    getFilledCount,
    getRemaining,
    getSummary,
  } = useCartStore();

  const [selectedFlavor, setSelectedFlavor] = useState<FlavorKey | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showOrderPage, setShowOrderPage] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [isSendingOrder, setIsSendingOrder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<(typeof FLAVOR_FILTERS)[number]>('Todos');

  const filledCount = getFilledCount();
  const remaining = getRemaining();
  const summary = getSummary();
  const progress = (filledCount / boxSize) * 100;

  const slots = useMemo(
    () => Array.from({ length: boxSize }, (_, index) => selectedFlavors[index]),
    [selectedFlavors, boxSize],
  );

  const getFlavorById = (flavorId: FlavorKey | null) => {
    if (!flavorId) return null;
    return EMPANADAS.find((flavor) => flavor.id === flavorId) ?? null;
  };

  const handleFlavorSelect = (flavorId: FlavorKey) => {
    const nextFilled = filledCount + 1;
    setSelectedFlavor(flavorId);

    if (filledCount >= boxSize) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Alert.alert('Compra completa', 'Ya elegiste todas las empanadas de este formato.');
      return;
    }

    addFlavor(flavorId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (nextFilled >= boxSize) {
      setCompleted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setCompleted(false), 1200);
    }
  };

  const handleSlotPress = (index: number) => {
    const current = selectedFlavors[index];

    if (current) {
      removeFlavorAt(index);
      return;
    }

    if (selectedFlavor) {
      replaceFlavorAt(index, selectedFlavor);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const orderItems = selectedFlavors.filter(Boolean) as FlavorKey[];
  const flavorCounts = orderItems.reduce<Partial<Record<FlavorKey, number>>>((counts, flavorId) => {
    counts[flavorId] = (counts[flavorId] ?? 0) + 1;
    return counts;
  }, {});
  const visibleFlavors = EMPANADAS.filter((flavor) => {
    const matchesSearch = `${flavor.name} ${flavor.description}`.toLocaleLowerCase('es-AR').includes(searchQuery.trim().toLocaleLowerCase('es-AR'));
    const matchesFilter = activeFilter === 'Todos'
      || (activeFilter === 'Carne' && flavor.id === 'carne')
      || (activeFilter === 'Vegetarianos' && flavor.id !== 'carne' && flavor.id !== 'pollo' && flavor.id !== 'jamon');
    return matchesSearch && matchesFilter;
  });

  const sendOrderToWhatsApp = async () => {
    const flavorCounts = orderItems.reduce<Record<string, number>>((counts, flavorId) => {
      counts[flavorId] = (counts[flavorId] ?? 0) + 1;
      return counts;
    }, {});
    const itemLines = Object.entries(flavorCounts).map(([flavorId, quantity]) => {
      const flavorName = EMPANADAS.find((flavor) => flavor.id === flavorId)?.name ?? flavorId;
      return `- ${quantity} x ${flavorName}`;
    });
    const format = orderItems.length === 12 ? 'Docena' : 'Unidad';
    const message = [
      'Hola, quiero realizar este pedido:',
      '',
      ...itemLines,
      '',
      `Formato: ${format}`,
      `Cantidad: ${orderItems.length} ${orderItems.length === 1 ? 'empanada' : 'empanadas'}`,
      `Total: $${summary.finalTotal.toLocaleString('es-AR')}`,
      '',
      'Por favor, confirmen disponibilidad y coordinamos entrega y pago.',
    ].join('\n');

    setIsSendingOrder(true);
    try {
      await Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`);
    } catch {
      Alert.alert('No se pudo abrir WhatsApp', 'Intenta nuevamente o escribe al +54 9 385 575 0969.');
    } finally {
      setIsSendingOrder(false);
    }
  };

  if (showOrderPage) {
    return (
      <OrderPageModal
        onClose={() => setShowOrderPage(false)}
        onConfirm={sendOrderToWhatsApp}
        isSending={isSendingOrder}
        items={orderItems}
        total={summary.finalTotal}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.marketHeader}>
        <View style={styles.topBar}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}><Text style={styles.brandEmoji}>🥟</Text></View>
            <View><Text style={styles.kicker}>EMPANADAS GOURMET</Text><View style={styles.locationLine}><MapPin size={12} color="#53685D" /><Text style={styles.locationText}>Santiago del Estero · Retiro en local</Text></View></View>
          </View>
          <Pressable onPress={() => setShowGuide(true)} style={styles.guideButton}>
            <Text style={styles.guideText}>Ver repulgues</Text>
          </Pressable>
        </View>

        <View style={styles.headlineBlock}>
          <View style={styles.eyebrowPill}><View style={styles.onlineDot} /><Text style={styles.eyebrowText}>HECHAS HOY · PEDIDOS POR WHATSAPP</Text></View>
          <Text style={styles.title}>Tu próxima docena,{ '\n' }recién salida del horno.</Text>
          <Text style={styles.priceGuide}>Elegí una unidad o armá tu docena con tus sabores favoritos.</Text>
        </View>

        <View style={styles.sizeSwitch}>
          {BOX_SIZES.map((size) => (
            <Pressable
              key={size}
              onPress={() => setBoxSize(size)}
              style={[
                styles.sizeOption,
                {
                  backgroundColor: boxSize === size ? '#D94E28' : '#F5E8DF',
                  borderColor: boxSize === size ? '#D94E28' : '#F0DCCB',
                },
              ]}
            >
              <Text style={[styles.sizeText, { color: boxSize === size ? '#fff' : '#3E2D26' }]}>
                {size === 1 ? `Unidad · $${UNIT_PRICE.toLocaleString('es-AR')}` : `Docena · $${DOZEN_PRICE.toLocaleString('es-AR')}`}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.builderCard}>
          <View style={styles.progressMeta}>
            <Text style={styles.progressLabel}>Progreso</Text>
            <Text style={styles.progressValue}>
              {filledCount}/{boxSize === 1 ? '1 unidad' : '12 unidades'}
            </Text>
          </View>

          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>

          <Text style={styles.helperText}>
            {remaining > 0 ? `Agregá ${remaining} ${remaining === 1 ? 'empanada' : 'empanadas'} para completar tu compra.` : 'Compra completa 👏'}
          </Text>

          <View style={styles.slotGrid}>
            {slots.map((slot, index) => {
              const flavor = getFlavorById(slot);

              return (
                <Pressable
                  key={`slot-${index}`}
                  onPress={() => handleSlotPress(index)}
                  style={[
                    styles.slot,
                    {
                      backgroundColor: flavor ? `${flavor.color}22` : '#F6EEE8',
                      borderColor: flavor ? flavor.color : '#E9D6C7',
                    },
                  ]}
                >
                  {flavor ? (
                    <Text style={styles.slotEmoji}>{flavor.emoji}</Text>
                  ) : (
                    <Plus size={18} color="#9B6A4C" />
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actionsRow}>
            <Pressable onPress={surpriseMe} style={styles.primaryAction}>
              <Sparkles size={18} color="#fff" />
              <Text style={styles.primaryActionText}>Sorpréndeme</Text>
            </Pressable>

            <Pressable onPress={clearSelection} style={styles.secondaryAction}>
              <RotateCcw size={18} color="#554138" />
            </Pressable>
          </View>

          {completed && (
            <View style={styles.successToast}>
              <Check size={18} color="#fff" />
              <Text style={styles.successToastText}>Compra completa</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>¿Qué se te antoja?</Text><Text style={styles.sectionSubtitle}>Todos los sabores al mismo precio</Text></View>
          <Text style={styles.flavorCount}>{EMPANADAS.length} sabores</Text>
        </View>

        <View style={styles.searchBox}>
          <Search size={17} color="#75847B" />
          <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Buscar un sabor" placeholderTextColor="#8A9990" style={styles.searchInput} accessibilityLabel="Buscar sabores" />
          {!!searchQuery && <Pressable onPress={() => setSearchQuery('')} accessibilityRole="button" accessibilityLabel="Limpiar búsqueda"><Text style={styles.clearSearch}>×</Text></Pressable>}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>
          {FLAVOR_FILTERS.map((filter) => <Pressable key={filter} onPress={() => setActiveFilter(filter)} style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}><Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>{filter}</Text></Pressable>)}
        </ScrollView>

        <View style={styles.flavorList}>
          {visibleFlavors.map((flavor) => {
            const isSelected = selectedFlavor === flavor.id;
            const quantity = flavorCounts[flavor.id] ?? 0;

            return (
              <Pressable
                key={flavor.id}
                onPress={() => handleFlavorSelect(flavor.id)}
                style={[
                  styles.flavorCard,
                  {
                    borderColor: isSelected ? flavor.color : '#F1E7DF',
                    backgroundColor: isSelected ? `${flavor.color}12` : '#fff',
                  },
                ]}
              >
                <View style={[styles.flavorBadge, { backgroundColor: flavor.color }]}>
                  <Text style={styles.badgeEmoji}>{flavor.emoji}</Text>
                </View>

                <View style={styles.flavorInfo}>
                  <Text style={styles.flavorName}>{flavor.name}</Text>
                  <Text style={styles.flavorDesc}>{flavor.description}</Text>
                  <Text style={styles.flavorUnitPrice}>${UNIT_PRICE.toLocaleString('es-AR')} / unidad</Text>
                </View>

                <View style={styles.flavorActions}>
                  {quantity > 0 && <Pressable onPress={(event) => { event.stopPropagation(); removeFlavor(flavor.id); }} style={styles.quantityButton} accessibilityRole="button" accessibilityLabel={`Quitar una ${flavor.name}`}><Minus size={15} color="#345B47" /></Pressable>}
                  {quantity > 0 && <Text style={styles.quantityValue}>{quantity}</Text>}
                  <Pressable onPress={(event) => { event.stopPropagation(); handleFlavorSelect(flavor.id); }} style={[styles.addButton, quantity > 0 && styles.addButtonSelected]} accessibilityRole="button" accessibilityLabel={`Agregar una ${flavor.name}`}><Plus size={17} color={quantity > 0 ? '#fff' : '#255B42'} /></Pressable>
                </View>
              </Pressable>
            );
          })}
          {visibleFlavors.length === 0 && <View style={styles.emptySearch}><Text style={styles.emptySearchTitle}>No encontramos ese sabor</Text><Text style={styles.emptySearchText}>Probá con otro nombre o elegí “Todos”.</Text></View>}
        </View>
      </View>

      <View style={styles.checkoutBar}>
        <View>
          <Text style={styles.checkoutLabel}>Pedido</Text>
          <Text style={styles.checkoutValue}>{summary.totalItems} empanadas</Text>
        </View>

        <View style={styles.totalWrap}>
          <Text style={styles.checkoutLabel}>Total</Text>
          <Text style={styles.totalText}>${summary.finalTotal.toLocaleString('es-AR')}</Text>
        </View>

        <Pressable disabled={remaining > 0} style={[styles.checkoutButton, remaining > 0 && styles.checkoutDisabled]} onPress={() => setShowOrderPage(true)}>
          <ShoppingBag size={16} color="#fff" />
          <Text style={styles.checkoutText}>Checkout</Text>
        </Pressable>
      </View>

      <RepulgueGuideModal visible={showGuide} onClose={() => setShowGuide(false)} />
    </ScrollView>
  );
}

function OrderPageModal({
  onClose,
  onConfirm,
  isSending,
  items,
  total,
}: {
  onClose: () => void;
  onConfirm: () => void;
  isSending: boolean;
  items: FlavorKey[];
  total: number;
}) {
  const flavorCounts = items.reduce<Partial<Record<FlavorKey, number>>>((counts, flavorId) => {
    counts[flavorId] = (counts[flavorId] ?? 0) + 1;
    return counts;
  }, {});
  const selectedDetails = Object.entries(flavorCounts).flatMap(([flavorId, quantity]) => {
    const flavor = EMPANADAS.find((item) => item.id === flavorId);
    return flavor && quantity ? [{ flavor, quantity }] : [];
  });

  return (
      <View style={styles.orderPage}>
        <View style={styles.orderHeader}>
          <Pressable onPress={onClose} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </Pressable>
          <Text style={styles.orderTitle}>Tu pedido</Text>
          <View style={styles.orderBadge}>
            <Text style={styles.orderBadgeText}>{items.length} items</Text>
          </View>
        </View>

        <ScrollView style={styles.orderScroll} contentContainerStyle={styles.orderScrollContent}>
          <View style={styles.orderSummaryCard}>
            <Text style={styles.summaryLabel}>Resumen</Text>
            {selectedDetails.length === 0 ? (
              <Text style={styles.emptyState}>Todavía no elegiste empanadas.</Text>
            ) : (
              selectedDetails.map(({ flavor, quantity }) => (
                <View key={flavor.id} style={styles.orderRow}>
                  <View style={styles.orderRowLeft}>
                    <View style={[styles.orderRowBadge, { backgroundColor: flavor.color }]}>
                      <Text style={styles.orderRowEmoji}>{flavor.emoji}</Text>
                    </View>
                    <Text style={styles.orderRowName}>{flavor.name}{quantity > 1 ? ` × ${quantity}` : ''}</Text>
                  </View>
                  <Text style={styles.orderRowPrice}>${(UNIT_PRICE * quantity).toLocaleString('es-AR')}</Text>
                </View>
              ))
            )}
            {items.length === 12 && <Text style={styles.dozenDiscount}>Docena: ${DOZEN_PRICE.toLocaleString('es-AR')} · Ahorrás ${(UNIT_PRICE * 12 - DOZEN_PRICE).toLocaleString('es-AR')}</Text>}
          </View>

          <View style={styles.deliveryCard}>
            <Text style={styles.summaryLabel}>Confirmación</Text>
            <Text style={styles.deliveryText}>El local confirmará disponibilidad, entrega y pago por WhatsApp.</Text>
          </View>

          <View style={styles.totalCard}>
            <Text style={styles.totalCardLabel}>Total</Text>
            <Text style={styles.bigTotal}>${total.toLocaleString('es-AR')}</Text>
          </View>
        </ScrollView>

        <Pressable accessibilityRole="button" style={[styles.confirmButton, isSending && styles.checkoutDisabled]} onPress={onConfirm} disabled={isSending}>
          <MessageCircle size={17} color="#fff" />
          <Text style={styles.confirmButtonText}>{isSending ? 'Abriendo WhatsApp…' : 'Enviar pedido por WhatsApp'}</Text>
        </Pressable>
      </View>
  );
}

type RepulgueGuideModalProps = {
  visible: boolean;
  onClose: () => void;
};

function RepulgueGuideModal({ visible, onClose }: RepulgueGuideModalProps) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Guía de repulgues</Text>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {EMPANADAS.map((flavor) => (
              <View key={flavor.id} style={styles.modalItem}>
                <View style={[styles.modalAvatar, { backgroundColor: flavor.color }]}>
                  <Text style={styles.modalEmoji}>{flavor.emoji}</Text>
                </View>

                <View style={styles.modalMeta}>
                  <Text style={styles.modalName}>{flavor.name}</Text>
                  <Text style={styles.modalRepulgue}>{flavor.repulgue}</Text>
                </View>

                <View style={[styles.repulgueShape, { backgroundColor: flavor.color }]} />
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity onPress={onClose} style={styles.modalButton}>
            <Text style={styles.modalButtonText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7F5',
  },
  content: {
    paddingBottom: 120,
  },
  headerGradient: {
    paddingHorizontal: 18,
    paddingTop: 50,
    paddingBottom: 18,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  marketHeader: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 18,
    backgroundColor: '#EAF3ED',
    borderBottomWidth: 1,
    borderBottomColor: '#DCE9E0',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#174B39', alignItems: 'center', justifyContent: 'center' },
  brandEmoji: { fontSize: 22 },
  locationLine: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  locationText: { color: '#53685D', fontSize: 10, fontWeight: '600' },
  headlineBlock: { marginTop: 20, marginBottom: 18 },
  eyebrowPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#D9EADF', borderRadius: 999, marginBottom: 11 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#218354' },
  eyebrowText: { color: '#2E6348', fontSize: 9, fontWeight: '900' },
  kicker: {
    color: '#A76546',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  guideButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#F2DFD0',
  },
  guideText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#513B30',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#173E30',
    lineHeight: 36,
    marginBottom: 8,
  },
  priceGuide: {
    color: '#60766A',
    fontSize: 12,
    lineHeight: 18,
  },
  sizeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#DDEAE1',
    borderRadius: 12,
    padding: 5,
    marginBottom: 18,
  },
  sizeOption: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 9,
    alignItems: 'center',
    borderWidth: 1,
  },
  sizeText: {
    fontWeight: '800',
    fontSize: 14,
  },
  builderCard: {
    backgroundColor: '#fff',
    borderRadius: 26,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressLabel: {
    fontWeight: '700',
    color: '#614D40',
    fontSize: 13,
  },
  progressValue: {
    fontWeight: '800',
    color: '#241B18',
    fontSize: 14,
  },
  progressBar: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#F3E5D8',
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#D94E28',
    borderRadius: 999,
  },
  helperText: {
    fontSize: 14,
    color: '#4E3E34',
    fontWeight: '700',
    marginBottom: 16,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 16,
  },
  slot: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  slotEmoji: {
    fontSize: 24,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#D94E28',
    paddingVertical: 14,
    borderRadius: 16,
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryAction: {
    width: 52,
    height: 52,
    backgroundColor: '#F6EEE7',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successToast: {
    position: 'absolute',
    right: 18,
    top: 18,
    backgroundColor: '#18B76D',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  successToastText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
  },
  sectionWrap: {
    paddingHorizontal: 18,
    marginTop: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C160F',
  },
  sectionSubtitle: { color: '#718178', fontSize: 11, marginTop: 4 },
  flavorCount: { color: '#557062', fontSize: 10, fontWeight: '800' },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE6DF', borderRadius: 10, marginBottom: 10 },
  searchInput: { flex: 1, minWidth: 0, color: '#263E32', fontSize: 13, outlineStyle: 'none' as never },
  clearSearch: { color: '#6F8076', fontSize: 21, paddingHorizontal: 4 },
  filterRail: { gap: 7, paddingBottom: 13 },
  filterChip: { paddingHorizontal: 13, paddingVertical: 8, backgroundColor: '#E9EFEB', borderRadius: 999 },
  filterChipActive: { backgroundColor: '#174B39' },
  filterText: { color: '#52695C', fontSize: 11, fontWeight: '800' },
  filterTextActive: { color: '#fff' },
  sectionLink: {
    color: '#D94E28',
    fontWeight: '700',
    fontSize: 12,
  },
  comboScrollContent: {
    paddingRight: 18,
    paddingBottom: 8,
  },
  comboCard: {
    width: 220,
    backgroundColor: '#fff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#F0DFD0',
    padding: 16,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 5,
  },
  comboEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  comboTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#1E170F',
    marginBottom: 4,
  },
  comboSubtitle: {
    color: '#725D52',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  comboFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  comboPrice: {
    color: '#D94E28',
    fontWeight: '900',
    fontSize: 18,
  },
  comboAction: {
    color: '#3C2A22',
    fontWeight: '800',
    fontSize: 12,
  },
  flavorList: {
    gap: 10,
  },
  flavorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderWidth: 1.4,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  flavorBadge: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeEmoji: {
    fontSize: 22,
  },
  flavorInfo: {
    flex: 1,
    minWidth: 0,
  },
  flavorName: {
    color: '#1B1713',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 2,
  },
  flavorDesc: {
    color: '#7C675D',
    fontSize: 12,
    lineHeight: 16,
  },
  flavorUnitPrice: { color: '#477258', fontSize: 10, fontWeight: '800', marginTop: 5 },
  flavorActions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 7 },
  quantityButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D6E4DB', borderRadius: 8, backgroundColor: '#F4F8F5' },
  quantityValue: { minWidth: 16, color: '#244A36', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  addButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3EFE7', borderRadius: 9 },
  addButtonSelected: { backgroundColor: '#1F6A48' },
  emptySearch: { alignItems: 'center', paddingVertical: 28 },
  emptySearchTitle: { color: '#294637', fontSize: 14, fontWeight: '900' },
  emptySearchText: { color: '#75847B', fontSize: 11, marginTop: 5 },
  flavorPrice: {
    fontWeight: '900',
    fontSize: 15,
  },
  checkoutBar: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    backgroundColor: '#1B140F',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 12,
  },
  checkoutLabel: {
    color: '#D8C3AB',
    fontSize: 11,
    fontWeight: '600',
  },
  checkoutValue: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  totalWrap: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 12,
  },
  totalText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 22,
  },
  checkoutButton: {
    backgroundColor: '#D94E28',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkoutDisabled: {
    opacity: 0.45,
  },
  checkoutText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(22, 17, 15, 0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: '72%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1D160E',
    marginBottom: 16,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2E7E1',
  },
  modalAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  modalEmoji: {
    fontSize: 22,
  },
  modalMeta: {
    flex: 1,
  },
  modalName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E170F',
  },
  modalRepulgue: {
    fontSize: 12,
    color: '#7A6257',
  },
  repulgueShape: {
    width: 34,
    height: 34,
    borderRadius: 18,
    opacity: 0.9,
  },
  modalButton: {
    backgroundColor: '#D94E28',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 18,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  orderPage: {
    flex: 1,
    backgroundColor: '#F8F3EE',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 28,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  orderScroll: {
    flex: 1,
  },
  orderScrollContent: {
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 22,
    color: '#2B201B',
    fontWeight: '800',
  },
  orderTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1C170F',
  },
  orderBadge: {
    backgroundColor: '#FCEAE1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  orderBadgeText: {
    color: '#B0572F',
    fontWeight: '800',
    fontSize: 11,
  },
  orderSummaryCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  dozenDiscount: {
    color: '#236648',
    backgroundColor: '#E9F5ED',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  summaryLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#211912',
    marginBottom: 12,
  },
  emptyState: {
    color: '#8A6F63',
    fontSize: 13,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  orderRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  orderRowBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  orderRowEmoji: {
    fontSize: 18,
  },
  orderRowName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#251E1A',
  },
  orderRowPrice: {
    fontSize: 15,
    fontWeight: '900',
    color: '#D94E28',
  },
  deliveryCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
  },
  deliveryText: {
    color: '#584D48',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 4,
  },
  totalCard: {
    backgroundColor: '#1C160F',
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalCardLabel: {
    color: '#D7BFA8',
    fontSize: 14,
    fontWeight: '700',
  },
  bigTotal: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
  },
  confirmButton: {
    backgroundColor: '#D94E28',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },
});
