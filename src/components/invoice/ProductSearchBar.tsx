import {
  Fragment,
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Package, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PackageEntity } from "@/integrations/api/repo";
import {
  MATCH_RANK,
  buildProductSearchIndex,
  highlightParts,
  queryWords,
  rankName,
  searchProducts,
  type MatchRank,
  type SearchableProduct,
} from "@/utils/productSearch";

/** What the invoice knows about a product, shown next to it in the results. */
export interface ProductSearchInfo {
  /** Units that can still be added (sell) or current stock (buy); null when unknown. */
  stock: number | null;
  /** Retail price (sell) or wholesale price (buy); null when not set. */
  price: number | null;
  /** Set when the product is already on the invoice; packageName null means its own line. */
  onInvoice: { packageName: string | null } | null;
}

interface ProductSearchBarProps {
  products: SearchableProduct[];
  /** Offered on sell invoices only. */
  packages: PackageEntity[];
  invoiceType: "sell" | "buy";
  describe: (productId: string) => ProductSearchInfo;
  isPackageOnInvoice: (packageId: string) => boolean;
  /** Return false when it could not be added; the caller tells the user why. */
  onAddProduct: (productId: string) => boolean;
  onAddPackage: (packageId: string) => boolean;
  /** Enter was pressed and nothing matches well enough to add. */
  onNotFound: (query: string) => void;
  disabled?: boolean;
}

/** Rendering more rows than this only slows typing down; the user narrows the list instead. */
const PRODUCT_LIMIT = 50;
const PAGE_STEP = 7;

type Tab = "all" | "products" | "packages";

type Option =
  | { kind: "package"; id: string; pkg: PackageEntity; rank: MatchRank | null; onInvoice: boolean; disabled: false }
  | { kind: "product"; id: string; product: SearchableProduct; rank: MatchRank | null; info: ProductSearchInfo; disabled: boolean };

const usd = (amount: number) => `$${amount.toFixed(2)}`;
const isTypingTarget = (el: Element | null) =>
  !!el &&
  ((el as HTMLElement).isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
    !!el.closest('[role="listbox"],[role="menu"],[role="dialog"]'));

/**
 * The one way to add lines to an invoice: type to search products (and packages on sell
 * invoices) or scan a barcode. Focus never leaves the box, so typing and scanning are never lost.
 */
export const ProductSearchBar = forwardRef<HTMLInputElement, ProductSearchBarProps>(function ProductSearchBar(
  { products, packages, invoiceType, describe, isPackageOnInvoice, onAddProduct, onAddPackage, onNotFound, disabled },
  ref,
) {
  const { t } = useTranslation();
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef("");

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  /** Highlighted option; null follows the best match as the results change. */
  const [active, setActive] = useState<number | null>(null);
  /** The highlight was moved on purpose (arrow keys or mouse), so Enter adds that option. */
  const [navigated, setNavigated] = useState(false);

  const searchIndex = useMemo(() => buildProductSearchIndex(products), [products]);
  const words = useMemo(() => queryWords(query), [query]);
  const browsing = words.length === 0;
  const productMatches = useMemo(() => searchProducts(searchIndex, query), [searchIndex, query]);
  // Packages (sell only) are ranked by name like products; browsing lists them by name
  const packageMatches = useMemo(() => {
    if (invoiceType !== "sell") return [];
    const ranked = packages.map((pkg) => ({ pkg, rank: words.length ? rankName(pkg.name.toLowerCase(), words) : null }));
    return (words.length ? ranked.filter((match) => match.rank !== null) : ranked).sort(
      (a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.pkg.name.localeCompare(b.pkg.name),
    );
  }, [packages, invoiceType, words]);

  const hasTabs = invoiceType === "sell" && packages.length > 0;
  const showProducts = tab !== "packages";
  // Browsing offers a couple of packages as shortcuts, a search the few best ones
  const packageLimit = tab === "packages" ? Infinity : tab === "products" ? 0 : browsing ? 2 : 3;
  const shownPackages = packageMatches.slice(0, packageLimit);
  const shownProducts = showProducts ? productMatches.slice(0, PRODUCT_LIMIT) : [];

  const packageOptions = shownPackages.map(({ pkg, rank }): Option => ({
    kind: "package",
    id: String(pkg.id),
    pkg,
    rank,
    onInvoice: isPackageOnInvoice(String(pkg.id)),
    disabled: false,
  }));
  const productOptions = shownProducts.map(({ entry, rank }): Option => {
    const info = describe(entry.id);
    const inPackage = !!info.onInvoice && info.onInvoice.packageName !== null;
    const noneLeft = invoiceType === "sell" && info.stock !== null && info.stock <= 0;
    return { kind: "product", id: entry.id, product: entry.product, rank, info, disabled: inPackage || noneLeft };
  });
  // Browsing: packages first, under their own heading. Searching: one list, best match first;
  // a product wins a tie, so a package never pushes down the product that was typed.
  const options: Option[] = browsing
    ? [...packageOptions, ...productOptions]
    : [...productOptions, ...packageOptions].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const grouped = browsing && tab === "all" && packageOptions.length > 0;

  const firstEnabled = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < options.length; i += step) if (!options[i].disabled) return i;
    return -1;
  };
  const activeIndex = active !== null && options[active] && !options[active].disabled ? active : firstEnabled(0, 1);

  // "/" jumps to the search from anywhere on the page
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.key !== "/" && e.code !== "Slash") || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(document.activeElement)) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [disabled]);

  const resetHighlight = () => {
    setActive(null);
    setNavigated(false);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  // Scroll the page just enough to show the whole panel, without pushing the search box under
  // the app's sticky header
  const revealPanel = () => {
    const input = inputRef.current;
    const panel = panelRef.current;
    if (!input || !panel) return;
    const headerBottom = Math.max(0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
    const overflow = panel.getBoundingClientRect().bottom + 12 - window.innerHeight;
    const by = Math.min(overflow, input.getBoundingClientRect().top - headerBottom - 12);
    if (by > 0) window.scrollBy({ top: by });
  };

  const openPanel = () => {
    if (disabled || open) return;
    setOpen(true);
    requestAnimationFrame(revealPanel);
  };

  const finish = (added: boolean) => {
    if (added) {
      setQuery("");
      setTab("all");
      setOpen(false);
      resetHighlight();
    } else {
      inputRef.current?.select();
    }
    inputRef.current?.focus();
  };

  const choose = (option: Option | undefined) => {
    if (!option || option.disabled) return;
    finish(option.kind === "package" ? onAddPackage(option.id) : onAddProduct(option.id));
  };

  const move = (step: 1 | -1, count = 1) => {
    if (!options.length) return;
    let next = activeIndex;
    for (let n = 0; n < count; n++) {
      const candidate = firstEnabled(next < 0 ? (step > 0 ? 0 : options.length - 1) : next + step, step);
      if (candidate < 0) break;
      next = candidate;
    }
    if (next < 0) return;
    setActive(next);
    setNavigated(true);
    document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
  };

  const submit = (value: string) => {
    const raw = value.trim();
    if (navigated && open && activeIndex >= 0) {
      choose(options[activeIndex]);
      return;
    }
    if (!raw) return;
    // An exact barcode / SKU / ID (a scan) is added even while the panel is closed. It goes to
    // the caller even when it can't be added, so a scanned out-of-stock product gets a reason.
    const exact = searchProducts(searchIndex, raw)[0];
    if (exact?.rank === MATCH_RANK.exactCode) {
      finish(onAddProduct(exact.entry.id));
      return;
    }
    // Otherwise only a name match is safe to add without looking: a partial barcode from a
    // scanner must never add some other product
    const best = value === query ? options[activeIndex] : undefined;
    if (best && (best.kind === "package" || (best.rank !== null && best.rank <= MATCH_RANK.nameContains))) {
      choose(best);
      return;
    }
    onNotFound(raw);
    inputRef.current?.select();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
        e.preventDefault();
        if (open) move(e.key === "ArrowDown" ? 1 : -1);
        else openPanel();
        break;
      case "PageDown":
      case "PageUp":
        if (!open) break;
        e.preventDefault();
        move(e.key === "PageDown" ? 1 : -1, PAGE_STEP);
        break;
      case "Enter":
        e.preventDefault();
        submit(e.currentTarget.value);
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        } else if (query) {
          e.preventDefault();
          setQuery("");
          resetHighlight();
        }
        break;
    }
  };

  const selectTab = (next: Tab) => {
    setTab(next);
    resetHighlight();
  };

  const placeholder = disabled
    ? t("productSearch.placeholderDisabled", "Products can't be added while editing an invoice")
    : invoiceType === "sell"
      ? t("productSearch.placeholderSell", "Search or scan a product or package: name, barcode, SKU or ID")
      : t("productSearch.placeholderBuy", "Search or scan a product: name, barcode, SKU or ID");

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: "all", label: t("productSearch.tabAll", "All"), count: productMatches.length + packageMatches.length },
    { id: "products", label: t("productSearch.tabProducts", "Products"), count: productMatches.length },
    { id: "packages", label: t("productSearch.tabPackages", "Packages"), count: packageMatches.length },
  ];

  const optionProps = (option: Option, i: number) => ({
    id: optionId(i),
    role: "option" as const,
    "aria-selected": i === activeIndex,
    "aria-disabled": option.disabled || undefined,
    onMouseMove: (e: MouseEvent) => {
      // Only a real pointer move changes the highlight, not the list scrolling under a still mouse
      const at = `${e.clientX},${e.clientY}`;
      if (at === lastPointer.current) return;
      lastPointer.current = at;
      if (!option.disabled && i !== activeIndex) {
        setActive(i);
        setNavigated(true);
      }
    },
    onClick: () => choose(option),
    className: cn(
      "grid min-h-[46px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border-s-[3px] border-transparent px-2.5 py-1.5 sm:grid-cols-[minmax(0,1fr)_104px_84px]",
      "aria-selected:border-primary aria-selected:bg-primary-light",
      option.disabled ? "cursor-not-allowed" : "cursor-pointer",
    ),
  });

  const groupHeading = (label: string, action?: ReactNode) => (
    <div role="presentation" className="flex items-center justify-between px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      <span>{label}</span>
      {action}
    </div>
  );

  const renderOption = (option: Option, i: number) =>
    option.kind === "package" ? (
      <div key={`package-${option.id}`} {...optionProps(option, i)}>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <Package className="h-3 w-3" aria-hidden="true" />
            </span>
            <span className="truncate">
              <Highlighted text={option.pkg.name} words={words} />
            </span>
            <span className="shrink-0 rounded-md border border-primary/30 bg-primary-light px-1 py-px text-[10px] font-bold text-primary-strong">
              {t("packages.badge", "Package")}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            {option.onInvoice && <Pill tone="success">{t("productSearch.onInvoiceAddOne", "On invoice · +1")}</Pill>}
            <span className="truncate">
              {t("packages.productsCount", "{{count}} products", { count: option.pkg.items.length })}:{" "}
              {option.pkg.items.map((item) => `${item.name} ×${item.quantity}`).join(", ")}
            </span>
          </div>
        </div>
        <span className="hidden sm:block" />
        <Price amount={Number(option.pkg.default_price)} note={t("productSearch.perPackage", "package")} />
      </div>
    ) : (
      <div key={option.id} {...optionProps(option, i)}>
        <ProductOptionBody option={option} words={words} invoiceType={invoiceType} />
      </div>
    );

  const emptyMessage =
    products.length === 0 && packages.length === 0 ? (
      t("productSearch.noProducts", "No products yet. Add them on the Products page.")
    ) : query.trim() ? (
      <>
        <span className="block font-semibold text-foreground">
          {t("productSearch.noMatch", "Nothing matches “{{query}}”", { query: query.trim() })}
        </span>
        {t("productSearch.noMatchHint", "Check the spelling, or search by barcode, SKU or ID.")}
      </>
    ) : (
      t("productSearch.noPackages", "No packages yet.")
    );

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-primary" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={t("productSearch.label", "Search or scan products to add")}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            resetHighlight();
            openPanel();
          }}
          onClick={openPanel}
          onKeyDown={onKeyDown}
          className={cn(
            "h-11 w-full rounded-xl border-2 border-primary/30 bg-primary-light pe-11 ps-10 text-[14px] font-medium text-foreground transition-colors",
            "placeholder:truncate placeholder:font-normal placeholder:text-muted-foreground hover:border-primary/50",
            "focus:border-primary focus:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
            "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:opacity-70 dark:bg-card/50",
          )}
        />
        {query ? (
          <button
            type="button"
            aria-label={t("productSearch.clear", "Clear search")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              resetHighlight();
              inputRef.current?.focus();
            }}
            className="absolute end-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          !disabled && (
            <kbd className="pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 rounded border border-b-2 border-border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground sm:block">
              /
            </kbd>
          )
        )}
      </div>

      {open && (
        <div
          ref={panelRef}
          // Clicks in the panel never take focus from the search box
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-40 mt-1.5 flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 slide-in-from-top-1 duration-100"
        >
          {hasTabs && (
            <div role="tablist" aria-label={t("productSearch.show", "Show")} className="flex gap-1 border-b border-border px-2 py-1.5">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  aria-controls={listId}
                  onClick={() => selectTab(item.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    tab === item.id
                      ? "border-primary/30 bg-primary-light text-primary-strong"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                  <span className="font-medium tabular-nums opacity-80">{item.count}</span>
                </button>
              ))}
            </div>
          )}

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={t("productSearch.results", "Search results")}
            className="max-h-[min(336px,50vh)] overflow-y-auto overscroll-contain p-1"
          >
            {options.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
                <div>{emptyMessage}</div>
              </div>
            ) : (
              <>
                {options.map((option, i) => (
                  <Fragment key={`${option.kind}-${option.id}`}>
                    {grouped &&
                      i === 0 &&
                      groupHeading(
                        t("packages.searchHeading", "Packages"),
                        packageMatches.length > shownPackages.length && (
                          <button
                            type="button"
                            onClick={() => selectTab("packages")}
                            className="text-[11px] font-semibold normal-case tracking-normal text-primary-strong hover:underline"
                          >
                            {t("productSearch.showAll", "Show all {{count}}", { count: packageMatches.length })}
                          </button>
                        ),
                      )}
                    {grouped && i === packageOptions.length && groupHeading(t("packages.productsHeading", "Products"))}
                    {renderOption(option, i)}
                  </Fragment>
                ))}
                {showProducts && productMatches.length > PRODUCT_LIMIT && (
                  <p className="px-2.5 py-2 text-center text-[11.5px] text-muted-foreground">
                    {t("productSearch.more", "{{count}} more. Keep typing to narrow the list.", { count: productMatches.length - PRODUCT_LIMIT })}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/60 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span className="hidden items-center gap-3 sm:flex">
              <KeyHint keys={["↑", "↓"]} label={t("productSearch.hintMove", "move")} />
              <KeyHint keys={["Enter"]} label={t("productSearch.hintAdd", "add")} />
              <KeyHint keys={["Esc"]} label={t("productSearch.hintClose", "close")} />
            </span>
            <span className="ms-auto tabular-nums">
              {showProducts
                ? t("productSearch.showing", "{{shown}} of {{total}} products", { shown: shownProducts.length, total: productMatches.length })
                : t("productSearch.packagesCount", "{{count}} packages", { count: packageMatches.length })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

function ProductOptionBody({
  option,
  words,
  invoiceType,
}: {
  option: Extract<Option, { kind: "product" }>;
  words: string[];
  invoiceType: "sell" | "buy";
}) {
  const { t } = useTranslation();
  const { info, product, rank } = option;
  const code = product.barcode || product.sku || "";
  const onOwnLine = !!info.onInvoice && info.onInvoice.packageName === null;

  let stockText = "";
  let stockTone = "text-muted-foreground";
  if (info.stock !== null) {
    if (info.stock <= 0) {
      stockText = onOwnLine && invoiceType === "sell" ? t("productSearch.noneLeft", "None left") : t("productSearch.outOfStock", "Out of stock");
      stockTone = invoiceType === "sell" ? "font-semibold text-destructive-strong" : "text-warning-strong";
    } else if (info.stock < 10) {
      stockText = invoiceType === "sell" ? t("productSearch.left", "{{count}} left", { count: info.stock }) : t("productSearch.inStock", "{{count}} in stock", { count: info.stock });
      stockTone = "font-semibold text-warning-strong";
    } else {
      stockText = t("productSearch.inStock", "{{count}} in stock", { count: info.stock });
    }
  }

  let pill: ReactNode = null;
  if (info.onInvoice?.packageName != null) {
    pill = <Pill>{t("productSearch.inPackage", "In {{name}}", { name: info.onInvoice.packageName })}</Pill>;
  } else if (onOwnLine) {
    pill = option.disabled ? (
      <Pill>{t("productSearch.onInvoice", "On invoice")}</Pill>
    ) : (
      <Pill tone="success">{t("productSearch.onInvoiceAddOne", "On invoice · +1")}</Pill>
    );
  }

  const dim = option.disabled && "opacity-60";
  return (
    <>
      <div className="min-w-0">
        <div className={cn("truncate text-[13px] font-semibold", dim)}>
          <Highlighted text={product.name || ""} words={words} />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {pill}
          <span
            className={cn(
              "truncate font-mono",
              (rank === MATCH_RANK.exactCode || rank === MATCH_RANK.codeContains) && code && "rounded-sm bg-primary/20 px-0.5 text-foreground",
            )}
          >
            {code || t("productSearch.noBarcode", "no barcode")}
          </span>
          <span className="shrink-0 tabular-nums">· #{product.id}</span>
          {stockText && <span className={cn("shrink-0 tabular-nums sm:hidden", stockTone)}>· {stockText}</span>}
        </div>
      </div>
      <span className={cn("hidden text-end text-[12px] tabular-nums sm:block", stockTone)}>{stockText}</span>
      {invoiceType === "sell" ? (
        info.price ? (
          <Price amount={info.price} note={t("productSearch.retail", "retail")} className={dim || undefined} />
        ) : (
          <span className="text-end text-[11.5px] font-semibold text-warning-strong">{t("productSearch.noPrice", "No price")}</span>
        )
      ) : info.price ? (
        <Price amount={info.price} note={t("productSearch.wholesale", "wholesale")} muted />
      ) : (
        <span className="text-end text-muted-foreground">—</span>
      )}
    </>
  );
}

function Highlighted({ text, words }: { text: string; words: string[] }) {
  return (
    <>
      {highlightParts(text, words).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded-sm bg-primary/20 px-px text-inherit">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

function Price({ amount, note, muted, className }: { amount: number; note: string; muted?: boolean; className?: string }) {
  return (
    <span className={cn("text-end tabular-nums leading-tight", muted ? "text-[12.5px] font-semibold text-muted-foreground" : "text-[13px] font-bold", className)}>
      {usd(amount)}
      <span className="block text-[10px] font-medium text-muted-foreground">{note}</span>
    </span>
  );
}

function Pill({ tone, children }: { tone?: "success"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block max-w-[45%] shrink-0 truncate rounded-full px-1.5 py-px align-middle text-[10.5px] font-bold",
        tone === "success" ? "bg-success-light text-success-strong" : "border border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function KeyHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key) => (
        <kbd key={key} className="rounded border border-b-2 border-border bg-background px-1 font-mono text-[10.5px] text-foreground">
          {key}
        </kbd>
      ))}
      {label}
    </span>
  );
}
