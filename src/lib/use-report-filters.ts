import { useEffect, useMemo, useState } from "react";
import { api, type Category, type Product, type Terminal, type User, type Warehouse, type Supplier } from "@/lib/api";

/**
 * Shared lookup lists for the common report filter set (FRD §1.1 — Branch, Warehouse, Employee,
 * Device/Terminal, Product, Category, Supplier, Date Range). Each report page owns its own filter
 * *state* (they don't all apply the same subset), but the option lists behind Employee/Terminal/
 * Product/Category/Warehouse/Supplier are identical everywhere, so they're loaded once here instead
 * of being re-fetched and re-filtered in each report route.
 *
 * Employees and terminals are branch-scoped: picking a branch must not leave another branch's
 * cashier selected, which would silently return an empty report. Passing `branchId` keeps both
 * lists in sync and callers reset their own selection via the returned lists.
 */
export function useReportFilterOptions(branchId?: string, categoryId?: string) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const scopedBranchId = branchId && branchId !== "all" ? branchId : undefined;

  useEffect(() => { api.getCategories().then(setCategories).catch(() => {}); }, []);
  useEffect(() => { api.getProducts({ status: "active" }).then(setProducts).catch(() => {}); }, []);
  useEffect(() => { api.getWarehouses().then(setWarehouses).catch(() => {}); }, []);
  useEffect(() => { api.getSuppliers({ status: "active" }).then(setSuppliers).catch(() => {}); }, []);

  useEffect(() => {
    // Any staff role can ring up a sale (a manager covering a register), so this is every active
    // user at the branch rather than only the literal "Cashier" role.
    api.getUsers({ branchId: scopedBranchId })
      .then((u) => setEmployees(u.filter((x) => x.status === "active")))
      .catch(() => {});
  }, [scopedBranchId]);

  useEffect(() => {
    api.getTerminals({ branchId: scopedBranchId ? [scopedBranchId] : undefined }).then(setTerminals).catch(() => {});
  }, [scopedBranchId]);

  // Narrow the product picker to the selected category so it can't offer a product that the
  // category filter would exclude anyway.
  const productOptions = useMemo(
    () => (!categoryId || categoryId === "all" ? products : products.filter((p) => p.categoryId === categoryId)),
    [products, categoryId],
  );

  return { categories, products: productOptions, employees, terminals, warehouses, suppliers };
}
