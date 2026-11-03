"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { CatalogCategory } from "@/lib/best-sellers";

export const FILTER_PANEL_WIDTH = "18rem";

type FilterPanelContextValue = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  width: string;
  marginOn: boolean;
  setMarginOn: Dispatch<SetStateAction<boolean>>;
  margin: string;
  setMargin: Dispatch<SetStateAction<string>>;
  valueOn: boolean;
  setValueOn: Dispatch<SetStateAction<boolean>>;
  valueMargin: string;
  setValueMargin: Dispatch<SetStateAction<string>>;
  departments: string[];
  categories: CatalogCategory[];
  setFacets: (facets: { departments: string[]; categories: CatalogCategory[] }) => void;
};

const FilterPanelContext = createContext<FilterPanelContextValue | null>(null);

export function FilterPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const [marginOn, setMarginOn] = useState(false);
  const [margin, setMargin] = useState("30");
  const [valueOn, setValueOn] = useState(false);
  const [valueMargin, setValueMargin] = useState("10");
  const [departments, setDepartments] = useState<string[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const setFacets = useCallback(
    (facets: { departments: string[]; categories: CatalogCategory[] }) => {
      setDepartments(facets.departments);
      setCategories(facets.categories);
    },
    [],
  );
  const value = useMemo(
    () => ({
      open,
      setOpen,
      width: FILTER_PANEL_WIDTH,
      marginOn,
      setMarginOn,
      margin,
      setMargin,
      valueOn,
      setValueOn,
      valueMargin,
      setValueMargin,
      departments,
      categories,
      setFacets,
    }),
    [open, marginOn, margin, valueOn, valueMargin, departments, categories, setFacets],
  );
  return (
    <FilterPanelContext.Provider value={value}>{children}</FilterPanelContext.Provider>
  );
}

export function useFilterPanel() {
  const context = useContext(FilterPanelContext);
  if (!context) {
    throw new Error("useFilterPanel must be used within FilterPanelProvider");
  }
  return context;
}

const shiftMotion =
  "transition-[margin-left] duration-300 ease-in-out motion-reduce:transition-none";

export function FilterPanelShift({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { open, width } = useFilterPanel();
  return (
    <div
      style={{ marginLeft: open ? width : "0px" }}
      className={`min-w-0 ${shiftMotion} max-lg:!ml-0 ${className}`}
    >
      {children}
    </div>
  );
}
