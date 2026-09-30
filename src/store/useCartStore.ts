import { create } from 'zustand';
import { BoxSize, BoxSlot, CartState, EmpanadaOption, FlavorKey } from '../types/empanada';

export const EMPANADAS: EmpanadaOption[] = [
  {
    id: 'carne',
    name: 'Carne',
    description: 'Cebolla, huevo y especias',
    color: '#D94E28',
    accent: '#F7A13C',
    price: 190,
    popular: true,
    emoji: '🥩',
    repulgue: 'Redondo clásico',
  },
  {
    id: 'queso',
    name: 'Queso',
    description: 'Masa suave y queso fundido',
    color: '#F4C95D',
    accent: '#FFB800',
    price: 180,
    popular: true,
    emoji: '🧀',
    repulgue: 'Curva profunda',
  },
  {
    id: 'humita',
    name: 'Humita',
    description: 'Choclo, cebolla y queso',
    color: '#F9D774',
    accent: '#D6A647',
    price: 200,
    emoji: '🌽',
    repulgue: 'Cresta suave',
  },
  {
    id: 'pollo',
    name: 'Pollo',
    description: 'Pollo desmenuzado con ajo',
    color: '#F5B38E',
    accent: '#D47A3C',
    price: 185,
    emoji: '🍗',
    repulgue: 'Forma rústica',
  },
  {
    id: 'jamon',
    name: 'Jamón',
    description: 'Jamón y queso con toque ahumado',
    color: '#D96B36',
    accent: '#B1471F',
    price: 210,
    emoji: '🥪',
    repulgue: 'Media luna',
  },
  {
    id: 'ricota',
    name: 'Ricota',
    description: 'Ricota fresca y cebollita',
    color: '#F1E6D2',
    accent: '#C7A768',
    price: 195,
    emoji: '🥛',
    repulgue: 'Redondo apretado',
  },
  {
    id: 'cebolla',
    name: 'Cebolla',
    description: 'Cebolla caramelizada',
    color: '#D28F49',
    accent: '#9C4D1A',
    price: 175,
    emoji: '🧅',
    repulgue: 'Pliegue cerrado',
  },
  {
    id: 'caprese',
    name: 'Caprese',
    description: 'Tomate, albahaca y queso',
    color: '#E97046',
    accent: '#9E2F1A',
    price: 220,
    emoji: '🍅',
    repulgue: 'Doble curva',
  },
];

const createEmptySelection = (size: BoxSize): BoxSlot[] =>
  Array.from({ length: size }, () => null);

export const useCartStore = create<CartState>((set, get) => ({
  boxSize: 6,
  selectedFlavors: createEmptySelection(6),
  promoLabel: 'Promo: 2x1 en 6-pack',

  setBoxSize: (size) => {
    set({
      boxSize: size,
      selectedFlavors: createEmptySelection(size),
    });
  },

  replaceSelection: (flavors) => {
    const normalized = Array.isArray(flavors) ? flavors : createEmptySelection(6);
    const nextSize = normalized.length >= 12 ? 12 : 6;
    const selected = normalized.slice(0, nextSize).map((item) => item ?? null) as BoxSlot[];

    set({
      boxSize: nextSize,
      selectedFlavors: selected.length ? selected : createEmptySelection(nextSize),
    });
  },

  addFlavor: (flavorId) => {
    const { selectedFlavors } = get();
    const firstEmptyIndex = selectedFlavors.findIndex((slot) => slot === null);

    if (firstEmptyIndex === -1) {
      return;
    }

    const next = [...selectedFlavors];
    next[firstEmptyIndex] = flavorId;
    set({ selectedFlavors: next });
  },

  replaceFlavorAt: (index, flavorId) => {
    const next = [...get().selectedFlavors];
    next[index] = flavorId;
    set({ selectedFlavors: next });
  },

  removeFlavorAt: (index) => {
    const next = [...get().selectedFlavors];
    next[index] = null;
    set({ selectedFlavors: next });
  },

  clearSelection: () => set({ selectedFlavors: createEmptySelection(get().boxSize) }),

  autofillPopular: () => {
    const popular = EMPANADAS.filter((flavor) => flavor.popular).map((flavor) => flavor.id);
    const next = createEmptySelection(get().boxSize);

    for (let i = 0; i < get().boxSize; i += 1) {
      next[i] = popular[i % popular.length];
    }

    set({ selectedFlavors: next });
  },

  getFilledCount: () => get().selectedFlavors.filter(Boolean).length,

  getRemaining: () => get().boxSize - get().getFilledCount(),

  getSubtotal: () => {
    const selected = get().selectedFlavors.filter(Boolean) as FlavorKey[];
    return selected.reduce((total, flavorId) => {
      const item = EMPANADAS.find((flavor) => flavor.id === flavorId);
      return total + (item?.price ?? 0);
    }, 0);
  },

  getSummary: () => {
    const totalItems = get().selectedFlavors.filter(Boolean).length;
    const subtotal = get().getSubtotal();
    return {
      totalItems,
      subtotal,
      promoLabel: get().promoLabel,
      finalTotal: subtotal,
    };
  },
}));
