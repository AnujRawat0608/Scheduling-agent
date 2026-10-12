import { useCallback, useSyncExternalStore } from "react";
import type { CatalogProduct } from "./catalogApi";

/**
 * A small cart kept in the browser (localStorage) and shared by every component that calls
 * useCart(). No provider or layout change is needed. It is per browser, not per account.
 */
export interface CartLine {
  product: CatalogProduct; // snapshot taken when it was added; re-check prices at checkout
  quantity: number;
}

const KEY = "procurement-cart-v1";
const EMPTY: CartLine[] = []; // stable reference for server rendering

let cache: CartLine[] | null = null;
const listeners = new Set<() => void>();

function isLine(x: unknown): x is CartLine {
  const l = x as CartLine;
  return (
    !!l &&
    typeof l.quantity === "number" &&
    !!l.product &&
    typeof l.product.offerId === "string" &&
    typeof l.product.unitPrice === "number"
  );
}

function load(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isLine) : [];
  } catch {
    return [];
  }
}

function getSnapshot(): CartLine[] {
  if (cache === null) cache = load();
  return cache;
}

function getServerSnapshot(): CartLine[] {
  return EMPTY;
}

function commit(next: CartLine[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be full or blocked; the cart still works for this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Keep several open tabs in sync.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart() {
  const lines = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /** Adds to the cart (or increases the quantity), never above the supplier's stock. */
  const add = useCallback((product: CatalogProduct, quantity: number) => {
    const current = getSnapshot();
    const cap = product.quantityAvailable;
    const existing = current.find((l) => l.product.offerId === product.offerId);
    if (existing) {
      commit(
        current.map((l) =>
          l === existing ? { product, quantity: Math.min(l.quantity + quantity, cap) } : l
        )
      );
    } else {
      commit([...current, { product, quantity: Math.min(quantity, cap) }]);
    }
  }, []);

  const setQuantity = useCallback((offerId: string, quantity: number) => {
    commit(
      getSnapshot().map((l) =>
        l.product.offerId === offerId
          ? {
              ...l,
              quantity: Math.min(
                Math.max(Math.floor(quantity) || 1, Math.max(1, l.product.moq)),
                l.product.quantityAvailable
              ),
            }
          : l
      )
    );
  }, []);

  const remove = useCallback((offerId: string) => {
    commit(getSnapshot().filter((l) => l.product.offerId !== offerId));
  }, []);

  const clear = useCallback(() => commit([]), []);

  const quantityOf = useCallback(
    (offerId: string) => lines.find((l) => l.product.offerId === offerId)?.quantity ?? 0,
    [lines]
  );

  const count = lines.reduce((n, l) => n + l.quantity, 0);

  return { lines, count, add, setQuantity, remove, clear, quantityOf };
}