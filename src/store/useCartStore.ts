import { create } from 'zustand';
import { BoxSize, BoxSlot, CartState, EmpanadaOption } from '../types/empanada';

export const UNIT_PRICE = 1700;
export const DOZEN_PRICE = 20000;
const DOZEN_SIZE = 12;

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

const createEmptySelection = (size: number = DOZEN_SIZE): BoxSlot[] =>
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
  boxSize: DOZEN_SIZE,
  selectedFlavors: createEmptySelection(),
  promoLabel: 'Precio docena',

  addDozen: () => {
    const { selectedFlavors } = get();
    const activeDozenCount = selectedFlavors.slice(-DOZEN_SIZE).filter(Boolean).length;
    if (activeDozenCount !== DOZEN_SIZE) return;
    set({ selectedFlavors: [...selectedFlavors, ...createEmptySelection()] });
  },

  addFlavor: (flavorId) => {
    const { selectedFlavors } = get();
    const activeDozenStart = Math.max(0, selectedFlavors.length - DOZEN_SIZE);
    const emptySlot = selectedFlavors.slice(activeDozenStart).findIndex((slot) => slot === null);

    if (emptySlot === -1) return;

    const next = [...selectedFlavors];
    next[activeDozenStart + emptySlot] = flavorId;
    set({ selectedFlavors: next });
  },

  removeFlavor: (flavorId) => {
    const next = [...get().selectedFlavors];
    const activeDozenStart = Math.max(0, next.length - DOZEN_SIZE);
    let index = -1;
    for (let slot = next.length - 1; slot >= activeDozenStart; slot -= 1) {
      if (next[slot] === flavorId) {
        index = slot;
        break;
      }
    }
    if (index < 0) return;
    next[index] = null;
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

  clearSelection: () => set({ selectedFlavors: createEmptySelection() }),

  surpriseMe: () => {
    const flavorIds = EMPANADAS.map((flavor) => flavor.id);
    const selection: typeof flavorIds = [];
    while (selection.length < DOZEN_SIZE) {
      selection.push(...shuffle(flavorIds).slice(0, DOZEN_SIZE - selection.length));
    }
    const existing = [...get().selectedFlavors];
    existing.splice(existing.length - DOZEN_SIZE, DOZEN_SIZE, ...shuffle(selection));
    set({ selectedFlavors: existing });
  },

  getFilledCount: () => get().selectedFlavors.slice(-DOZEN_SIZE).filter(Boolean).length,

  getRemaining: () => DOZEN_SIZE - get().getFilledCount(),

  getSubtotal: () => {
    const totalItems = get().selectedFlavors.filter(Boolean).length;
    return Math.ceil(totalItems / DOZEN_SIZE) * DOZEN_PRICE;
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
