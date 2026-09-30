import { create } from 'zustand';
import { BoxSize, BoxSlot, CartState, EmpanadaOption } from '../types/empanada';

export const UNIT_PRICE = 1700;
export const DOZEN_PRICE = 20000;

export const EMPANADAS: EmpanadaOption[] = [
  {
    id: 'carne',
    name: 'Carne',
    description: 'Cebolla, huevo y especias',
    color: '#D94E28',
    accent: '#F7A13C',
    price: UNIT_PRICE,
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
    price: UNIT_PRICE,
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
    price: UNIT_PRICE,
    emoji: '🌽',
    repulgue: 'Cresta suave',
  },
  {
    id: 'pollo',
    name: 'Pollo',
    description: 'Pollo desmenuzado con ajo',
    color: '#F5B38E',
    accent: '#D47A3C',
    price: UNIT_PRICE,
    emoji: '🍗',
    repulgue: 'Forma rústica',
  },
  {
    id: 'jamon',
    name: 'Jamón',
    description: 'Jamón y queso con toque ahumado',
    color: '#D96B36',
    accent: '#B1471F',
    price: UNIT_PRICE,
    emoji: '🥪',
    repulgue: 'Media luna',
  },
  {
    id: 'ricota',
    name: 'Ricota',
    description: 'Ricota fresca y cebollita',
    color: '#F1E6D2',
    accent: '#C7A768',
    price: UNIT_PRICE,
    emoji: '🥛',
    repulgue: 'Redondo apretado',
  },
  {
    id: 'cebolla',
    name: 'Cebolla',
    description: 'Cebolla caramelizada',
    color: '#D28F49',
    accent: '#9C4D1A',
    price: UNIT_PRICE,
    emoji: '🧅',
    repulgue: 'Pliegue cerrado',
  },
  {
    id: 'caprese',
    name: 'Caprese',
    description: 'Tomate, albahaca y queso',
    color: '#E97046',
    accent: '#9E2F1A',
    price: UNIT_PRICE,
    emoji: '🍅',
    repulgue: 'Doble curva',
  },
];

const createEmptySelection = (size: BoxSize): BoxSlot[] =>
  Array.from({ length: size }, () => null);

const shuffle = <T,>(items: T[]) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

export const useCartStore = create<CartState>((set, get) => ({
  boxSize: 1,
  selectedFlavors: createEmptySelection(1),
  promoLabel: 'Precio docena',

  setBoxSize: (size) => {
    set({
      boxSize: size,
      selectedFlavors: createEmptySelection(size),
    });
  },

  replaceSelection: (flavors) => {
    const normalized = Array.isArray(flavors) ? flavors : createEmptySelection(1);
    const nextSize = normalized.length >= 12 ? 12 : 1;
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

  surpriseMe: () => {
    const flavorIds = EMPANADAS.map((flavor) => flavor.id);
    const selection: typeof flavorIds = [];
    while (selection.length < get().boxSize) {
      selection.push(...shuffle(flavorIds).slice(0, get().boxSize - selection.length));
    }
    set({ selectedFlavors: shuffle(selection) });
  },

  getFilledCount: () => get().selectedFlavors.filter(Boolean).length,

  getRemaining: () => get().boxSize - get().getFilledCount(),

  getSubtotal: () => {
    const totalItems = get().selectedFlavors.filter(Boolean).length;
    return totalItems === 12 ? DOZEN_PRICE : totalItems * UNIT_PRICE;
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
