import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { storage, KEYS } from "@/services/storage";
import { api, mockAuditLogs, mockOrders, mockProducts, mockTerminals } from "@/services/mockApi";
import type { AuditLog, Branch, CartItem, OpeningCash, Order, Product, Terminal, User } from "@/types";
import { todayISO } from "@/utils/formatters";

interface Ctx {
  user: User | null;
  branch: Branch | null;
  terminal: Terminal | null;
  opening: OpeningCash | null;
  shiftActive: boolean;
  products: Product[];
  cart: CartItem[];
  heldOrders: Order[];
  orders: Order[];
  terminals: Terminal[];
  auditLogs: AuditLog[];
  setUser: (u: User | null) => void;
  setBranch: (b: Branch | null) => void;
  setTerminal: (t: Terminal | null) => void;
  setOpening: (o: OpeningCash | null) => void;
  addToCart: (p: Product, qty?: number) => void;
  updateCartQty: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  holdCurrentOrder: (customer: string) => void;
  resumeHeld: (id: string) => void;
  completeOrder: (o: Order) => void;
  pushAudit: (a: Omit<AuditLog, "id" | "timestamp">) => void;
  logout: () => Promise<void>;
  bootstrapping: boolean;
}

const AppCtx = createContext<Ctx | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [opening, setOpening] = useState<OpeningCash | null>(null);
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [heldOrders, setHeld] = useState<Order[]>([]);
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [terminals] = useState<Terminal[]>(mockTerminals);
  const [auditLogs, setLogs] = useState<AuditLog[]>(mockAuditLogs);
  const [bootstrapping, setBoot] = useState(true);

  useEffect(() => {
    (async () => {
      const [u, b, t, o] = await Promise.all([
        storage.get<User>(KEYS.session),
        storage.get<Branch>(KEYS.branch),
        storage.get<Terminal>(KEYS.terminal),
        storage.get<OpeningCash>(KEYS.opening),
      ]);
      if (u) setUser(u); if (b) setBranch(b); if (t) setTerminal(t); if (o) setOpening(o);
      setBoot(false);
    })();
  }, []);

  useEffect(() => { user ? storage.set(KEYS.session, user) : storage.remove(KEYS.session); }, [user]);
  useEffect(() => { branch ? storage.set(KEYS.branch, branch) : storage.remove(KEYS.branch); }, [branch]);
  useEffect(() => { terminal ? storage.set(KEYS.terminal, terminal) : storage.remove(KEYS.terminal); }, [terminal]);
  useEffect(() => { opening ? storage.set(KEYS.opening, opening) : storage.remove(KEYS.opening); }, [opening]);

  const pushAudit: Ctx["pushAudit"] = (a) => {
    setLogs(prev => [{ ...a, id: `L${Date.now()}`, timestamp: todayISO() }, ...prev]);
  };

  const addToCart: Ctx["addToCart"] = (p, qty = 1) => {
    setCart(prev => {
      const ex = prev.find(c => c.product.id === p.id);
      if (ex) return prev.map(c => c.product.id === p.id ? { ...c, qty: c.qty + qty } : c);
      return [...prev, { product: p, qty }];
    });
  };
  const updateCartQty: Ctx["updateCartQty"] = (id, qty) =>
    setCart(prev => prev.map(c => c.product.id === id ? { ...c, qty: Math.max(1, qty) } : c));
  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.product.id !== id));
  const clearCart = () => setCart([]);

  const holdCurrentOrder: Ctx["holdCurrentOrder"] = (customer) => {
    if (cart.length === 0) return;
    const subtotal = cart.reduce((s, c) => s + c.product.price * c.qty, 0);
    const tax = +(subtotal * 0.15).toFixed(2);
    const held: Order = {
      id: `HLD-${Date.now()}`, invoiceNo: "—",
      customer: customer || "Walk-in", items: cart,
      subtotal, tax, discount: 0, total: +(subtotal + tax).toFixed(2),
      status: "held", paymentStatus: "unpaid",
      cashier: user?.name ?? "—", branch: branch?.name ?? "—",
      terminalId: terminal?.id ?? "—", createdAt: todayISO(),
    };
    setHeld(prev => [held, ...prev]); clearCart();
    pushAudit({ action: `Order Held (${held.id})`, user: user?.name ?? "—", role: user?.role ?? "Cashier", branch: branch?.name ?? "—", terminalId: terminal?.id ?? "—", status: "success" });
  };

  const resumeHeld: Ctx["resumeHeld"] = (id) => {
    const o = heldOrders.find(h => h.id === id); if (!o) return;
    setCart(o.items); setHeld(prev => prev.filter(h => h.id !== id));
  };

  const completeOrder: Ctx["completeOrder"] = (o) => {
    setOrders(prev => [o, ...prev]);
    setProducts(prev => prev.map(p => {
      const ci = o.items.find(c => c.product.id === p.id);
      return ci ? { ...p, stock: Math.max(0, p.stock - ci.qty) } : p;
    }));
    clearCart();
    pushAudit({ action: `Payment Completed (${o.id})`, user: user?.name ?? "—", role: user?.role ?? "Cashier", branch: branch?.name ?? "—", terminalId: terminal?.id ?? "—", status: "success" });
  };

  const logout = async () => {
    setUser(null); setBranch(null); setTerminal(null); setOpening(null); clearCart();
  };

  const value = useMemo<Ctx>(() => ({
    user, branch, terminal, opening,
    shiftActive: !!opening,
    products, cart, heldOrders, orders, terminals, auditLogs,
    setUser, setBranch, setTerminal, setOpening,
    addToCart, updateCartQty, removeFromCart, clearCart,
    holdCurrentOrder, resumeHeld, completeOrder, pushAudit, logout, bootstrapping,
  }), [user, branch, terminal, opening, products, cart, heldOrders, orders, terminals, auditLogs, bootstrapping]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
};

export const useApp = () => {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
};