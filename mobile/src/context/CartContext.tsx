import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface CartItem {
  productId: number;
  productName: string;
  productSlug: string;
  colorId: string;
  colorName: string;
  colorHex: string;
  image: string | null;
  unitPriceLocal: number;
  currency: string;
  symbol: string;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>, quantity: number) => void;
  removeItem: (productId: number, colorId: string) => void;
  setQuantity: (productId: number, colorId: string, quantity: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

// In-memory only, same documented limitation as the theme override - resets
// on app restart. The web cart persists to localStorage; there's no
// equivalent here yet, so this is a real gap, not a hidden one.
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((item: Omit<CartItem, 'quantity'>, quantity: number) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId && i.colorId === item.colorId);
      if (existing) {
        return prev.map((i) => (i === existing ? { ...i, quantity: i.quantity + quantity } : i));
      }
      return [...prev, { ...item, quantity }];
    });
  }, []);

  const removeItem = useCallback((productId: number, colorId: string) => {
    setItems((prev) => prev.filter((i) => !(i.productId === productId && i.colorId === colorId)));
  }, []);

  const setQuantity = useCallback((productId: number, colorId: string, quantity: number) => {
    setItems((prev) => prev.map((i) => (i.productId === productId && i.colorId === colorId ? { ...i, quantity: Math.max(1, quantity) } : i)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  // Distinct line items, not total quantity - matches the web cart's own
  // badge (public/product.html's updateCartBadge: Object.keys(cart).length)
  // so selecting 500 of one product still reads as "1" on the icon; the
  // cart page itself is where quantities actually show.
  const count = items.length;
  const subtotal = items.reduce((sum, i) => sum + i.unitPriceLocal * i.quantity, 0);

  const value = useMemo(
    () => ({ items, addItem, removeItem, setQuantity, clear, count, subtotal }),
    [items, addItem, removeItem, setQuantity, clear, count, subtotal],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
