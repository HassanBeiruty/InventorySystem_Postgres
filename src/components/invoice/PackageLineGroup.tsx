import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Package, Trash2 } from "lucide-react";
import ProductNameWithCode from "@/components/ProductNameWithCode";
import { cn } from "@/lib/utils";
import type { PackageGroup } from "@/utils/invoicePackageLines";
import { QtyStepper } from "./ui/QtyStepper";
import { MoneyInput } from "./ui/MoneyInput";

interface PackageLineGroupProps {
  group: PackageGroup;
  /** The package's current default price, or null when the package no longer exists. */
  defaultPrice: number | null;
  productsById: Map<string, { id: number | string; name?: string; barcode?: string | null; sku?: string | null }>;
  /** Available stock for the line at `index` (null when stock is not tracked). */
  getAvailable: (productId: string, index: number) => number | null;
  canRemove: boolean;
  onQtyChange: (qty: number) => void;
  onPriceChange: (price: number) => void;
  onRemove: () => void;
}

const usd = (amount: number) => `$${amount.toFixed(2)}`;
const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);

/**
 * One package on a sell invoice: the package qty and price are the only inputs; its lines are
 * shown read-only with the private price each one receives.
 */
export function PackageLineGroup({
  group,
  defaultPrice,
  productsById,
  getAvailable,
  canRemove,
  onQtyChange,
  onPriceChange,
  onRemove,
}: PackageLineGroupProps) {
  const { t } = useTranslation();
  const [typedPrice, setTypedPrice] = useState<number>(group.price);

  const id = `package-${group.packageId}`;
  const total = group.lines.reduce((sum, line) => sum + line.total_price, 0);
  const normal = group.lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0);
  const saving = cents(normal) - cents(total);
  const typedInvalid = Number.isNaN(typedPrice) || typedPrice <= 0;
  const roundedAway = !typedInvalid && cents(typedPrice) !== cents(group.price);
  const unpriced = group.lines.filter((line) => line.unit_price <= 0);
  const showReset = defaultPrice !== null && cents(defaultPrice) !== cents(group.price);

  const productOf = (productId: string) => productsById.get(productId) || { id: productId, name: `#${productId}` };

  return (
    <section
      aria-labelledby={`${id}-name`}
      className="space-y-2.5 rounded-xl border-2 border-primary bg-gradient-to-b from-primary-light to-card to-70% p-2.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Package className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div id={`${id}-name`} className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
              {group.name}
              <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary-light px-1.5 py-px text-[10px] font-bold text-primary-strong">
                {t("packages.badge", "Package")}
              </span>
            </div>
            <div className="text-[11px] tabular-nums text-muted-foreground">
              {t("packages.productsCount", "{{count}} products", { count: group.lines.length })}
              {defaultPrice !== null && <> · {t("packages.defaultPricePer", "default price {{price}} per package", { price: usd(defaultPrice) })}</>}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          title={canRemove ? undefined : "Cannot remove items from invoice with payments. Remove all payments first."}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[12px] font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t("packages.remove", "Remove package")}
        </button>
      </div>

      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[190px_230px_1fr]">
        <div className="space-y-1">
          <label htmlFor={`${id}-qty`} className="text-[11px] font-medium">
            {t("packages.qty", "Package qty")}
          </label>
          <QtyStepper id={`${id}-qty`} size="lg" value={group.qty} onChange={onQtyChange} />
          <p className="text-[11px] text-muted-foreground">{t("packages.qtyHint", "Multiplies every line's quantity")}</p>
        </div>

        <div className="space-y-1">
          <label htmlFor={`${id}-price`} className="text-[11px] font-medium">
            {t("packages.price", "Package price (per package)")}
          </label>
          <MoneyInput
            id={`${id}-price`}
            size="lg"
            value={group.price}
            onChange={onPriceChange}
            onTyping={setTypedPrice}
            aria-describedby={`${id}-price-hint`}
          />
          <p id={`${id}-price-hint`} className="min-h-[16px] text-[11px] text-muted-foreground">
            {showReset ? (
              <button
                type="button"
                className="font-semibold text-primary-strong underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => {
                  onPriceChange(defaultPrice as number);
                  setTypedPrice(defaultPrice as number);
                }}
              >
                {t("packages.resetToDefault", "Reset to default {{price}}", { price: usd(defaultPrice as number) })}
              </button>
            ) : (
              t("packages.defaultPrice", "Default price")
            )}
          </p>
        </div>

        <div className="flex flex-col gap-0.5 border-t border-dashed border-primary/30 pt-2 sm:col-span-2 lg:col-span-1 lg:items-end lg:border-0 lg:pt-0 lg:text-end">
          <span className="text-[11px] font-medium text-muted-foreground">
            {t("packages.total", "Package total")}
            {group.qty > 1 && <span className="tabular-nums"> ({group.qty} × {usd(group.price)})</span>}
          </span>
          <span className="text-2xl font-extrabold tabular-nums tracking-tight text-primary">{usd(total)}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {saving > 0 && (
              <>
                {t("packages.normally", "Normally {{price}}", { price: usd(normal) })} ·{" "}
                <span className="font-bold text-success-strong">{t("packages.saves", "customer saves {{amount}}", { amount: usd(saving / 100) })}</span>
              </>
            )}
            {saving < 0 && (
              <>
                {t("packages.normally", "Normally {{price}}", { price: usd(normal) })} ·{" "}
                <span className="font-bold text-warning-strong">{t("packages.aboveRetail", "{{amount}} above retail", { amount: usd(-saving / 100) })}</span>
              </>
            )}
            {saving === 0 && t("packages.sameAsRetail", "Same as retail {{price}}", { price: usd(normal) })}
          </span>
        </div>
      </div>

      {typedInvalid && (
        <Notice tone="destructive">
          {t("packages.invalidPrice", "Enter a package price above 0. The lines keep their last prices until then.")}
        </Notice>
      )}
      {roundedAway && (
        <Notice tone="warning">
          {t("packages.roundingNotice", "{{requested}} can't be split into whole cents across these quantities. Closest exact price: {{achieved}} per package.", {
            requested: usd(typedPrice),
            achieved: usd(group.price),
          })}
        </Notice>
      )}
      {unpriced.length > 0 && (
        <Notice tone="warning">
          {t("packages.unpriced", "No retail price set for {{names}}, so it gets $0.00 of the package price.", {
            names: unpriced.map((line) => productOf(line.product_id).name).join(", "),
          })}
        </Notice>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2.5 py-1.5 text-start font-bold">
                {t("packages.colProduct", "Product")}{" "}
                <span className="font-medium normal-case tracking-normal">{t("packages.setByPackage", "(set by the package)")}</span>
              </th>
              <th className="px-2.5 py-1.5 text-end font-bold">{t("packages.colPerPackage", "Per package")}</th>
              <th className="px-2.5 py-1.5 text-end font-bold">{t("packages.colQty", "Qty")}</th>
              <th className="px-2.5 py-1.5 text-end font-bold">{t("packages.colStock", "In stock")}</th>
              <th className="px-2.5 py-1.5 text-end font-bold">{t("packages.colRetail", "Retail")}</th>
              <th className="px-2.5 py-1.5 text-end font-bold">{t("packages.colPrivate", "Private price")}</th>
              <th className="px-2.5 py-1.5 text-end font-bold">{t("packages.colLineTotal", "Line total")}</th>
            </tr>
          </thead>
          <tbody>
            {group.lines.map((line, k) => {
              const available = getAvailable(line.product_id, group.indexes[k]);
              const short = available !== null && line.quantity > available;
              return (
                <tr key={line.product_id} className="border-t border-border">
                  <td className="whitespace-nowrap px-2.5 py-1.5">
                    <ProductNameWithCode product={productOf(line.product_id)} showId id={line.product_id} codeClassName="ms-1.5 font-mono text-[11px] text-muted-foreground" />
                  </td>
                  <td className="px-2.5 py-1.5 text-end tabular-nums text-muted-foreground">×{line.package_unit_qty || 1}</td>
                  <td className="px-2.5 py-1.5 text-end font-bold tabular-nums">{line.quantity}</td>
                  <td className={cn("px-2.5 py-1.5 text-end tabular-nums", short ? "font-bold text-destructive-strong" : available !== null && available < 10 ? "text-warning-strong" : "text-muted-foreground")}>
                    {available ?? "—"}
                  </td>
                  <td className="px-2.5 py-1.5 text-end tabular-nums text-muted-foreground">{usd(line.unit_price)}</td>
                  <td className="px-2.5 py-1.5 text-end font-bold tabular-nums text-primary-strong">{usd(line.private_price_amount)}</td>
                  <td className="px-2.5 py-1.5 text-end tabular-nums">{usd(line.total_price)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted font-bold">
              <td className="px-2.5 py-1.5" colSpan={6}>{t("packages.linesTotal", "Lines total")}</td>
              <td className="px-2.5 py-1.5 text-end tabular-nums">{usd(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("packages.savedNote", "Each line is saved as a normal invoice line with a private price and the note \"Package: {{name}}\". The split follows each product's retail price.", { name: group.name })}
      </p>
    </section>
  );
}

function Notice({ tone, children }: { tone: "destructive" | "warning"; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px]",
        tone === "destructive" ? "bg-destructive/10 text-destructive-strong" : "bg-warning-light text-warning-strong",
      )}
    >
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
