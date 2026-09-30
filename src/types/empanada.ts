export type BoxSize = 1 | 12;
export type FlavorKey =
  | 'carne'
  | 'queso'
  | 'humita'
  | 'pollo'
  | 'jamon'
  | 'ricota'
  | 'cebolla'
  | 'caprese';

export type BoxSlot = FlavorKey | null;

export interface EmpanadaOption {
  id: FlavorKey;
  name: string;
  description: string;
  color: string;
  accent: string;
  price: number;
  popular?: boolean;
  emoji: string;
  repulgue: string;
}

export interface CartSummary {
  totalItems: number;
  subtotal: number;
  promoLabel: string;
  finalTotal: number;
}

export interface CartState {
  boxSize: BoxSize;
  selectedFlavors: BoxSlot[];
  promoLabel: string;
  setBoxSize: (size: BoxSize) => void;
  replaceSelection: (flavors: BoxSlot[]) => void;
  addFlavor: (flavorId: FlavorKey) => void;
  removeFlavor: (flavorId: FlavorKey) => void;
  replaceFlavorAt: (index: number, flavorId: FlavorKey) => void;
  removeFlavorAt: (index: number) => void;
  clearSelection: () => void;
  surpriseMe: () => void;
  getFilledCount: () => number;
  getRemaining: () => number;
  getSubtotal: () => number;
  getSummary: () => CartSummary;
}
