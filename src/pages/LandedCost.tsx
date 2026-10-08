import React, { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { StatTile } from "@/components/page-ui/StatTile";
import { StatusPill } from "@/components/page-ui/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertCircle, Calculator, Download, FileSpreadsheet, Upload, X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAdmin } from "@/hooks/useAdmin";

interface LandedCostLine {
  row: number;
  barcode: string;
  sku: string;
  quantity: number;
  sourceUnitPrice: number;
  sourceLineTotal: number;
  usdUnitBeforeTax: number;
  lineValueUsd: number;
  sharePct: number;
  taxAllocatedUsd: number;
  finalUnitPrice: number;
  lineTotalUsd: number;
  nudged: boolean;
}

interface LandedCostSummary {
  rate: number;
  taxUsd: number;
  lineCount: number;
  totalQuantity: number;
  sourceGoodsTotal: number;
  goodsUsd: number;
  upliftPct: number;
  targetGrandTotalUsd: number;
  importableTotalUsd: number;
  residualUsd: number;
  nudgedCount: number;
  zeroPriceLineCount: number;
  errorCount: number;
}

interface LandedCostResult {
  lines: LandedCostLine[];
  errors: { row: number; error: string }[];
  summary: LandedCostSummary;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

const endpoint = () => {
  const base = API_BASE_URL ? `${API_BASE_URL.replace(/\/$/, "")}` : "";
  return `${base}/api/tools/landed-cost`;
};

const money = (n: number, dp = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

const LandedCost = () => {
  const { t } = useTranslation();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();

  const [file, setFile] = useState<File | null>(null);
  const [rate, setRate] = useState<string>("");
  const [tax, setTax] = useState<string>("");
  const [taxInSourceCurrency, setTaxInSourceCurrency] = useState(false);
  const [result, setResult] = useState<LandedCostResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit =
    !!file && parseFloat(rate) > 0 && tax.trim() !== "" && parseFloat(tax) >= 0;

  const buildFormData = (format: "json" | "xlsx") => {
    const fd = new FormData();
    fd.append("file", file as File);
    fd.append("rate", rate);
    fd.append("tax", tax);
    fd.append("taxInSourceCurrency", String(taxInSourceCurrency));
    fd.append("format", format);
    return fd;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);
    e.target.value = "";
  };

  const clearFile = () => {
    setFile(null);
    setResult(null);
  };

  const handleCalculate = async () => {
    if (!canSubmit) return;
    setCalculating(true);
    try {
      const response = await fetch(endpoint(), {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
        body: buildFormData("json"),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to calculate");

      setResult(payload);
      if (payload.summary.errorCount > 0) {
        toast.warning(`Calculated with ${payload.summary.errorCount} skipped row(s)`);
      } else {
        toast.success(`Tax distributed across ${payload.summary.lineCount} items`);
      }
    } catch (err: any) {
      setResult(null);
      toast.error(err.message || "Failed to calculate landed cost");
    } finally {
      setCalculating(false);
    }
  };

  const handleDownload = async () => {
    if (!canSubmit) return;
    setDownloading(true);
    try {
      const response = await fetch(endpoint(), {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
        body: buildFormData("xlsx"),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to generate file");
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `invoice_landed_cost_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 100);

      toast.success("File ready — import it on the Invoices page");
    } catch (err: any) {
      toast.error(err.message || "Failed to download file");
    } finally {
      setDownloading(false);
    }
  };

  if (isAdminLoading) {
    return (
      <>
        <div className="space-y-3 p-2 sm:p-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full" />
        </div>
      </>
    );
  }

  if (!isAdmin) {
    return (
      <>
        <div className="space-y-3 sm:space-y-4">
          <InvoicePageHeader
            icon={Calculator}
            title={t("landedCost.title") || "Landed Cost"}
          />
          <Card className="rounded-xl border-2 border-border">
            <CardContent className="p-4 text-center">
              <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-[13px] text-muted-foreground">
                Admin access required to use the landed cost tool
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const summary = result?.summary;

  return (
    <>
      <div className="space-y-3 sm:space-y-4">
        <InvoicePageHeader
          icon={Calculator}
          title={t("landedCost.title") || "Landed Cost"}
          description={t("landedCost.subtitle") ||
              "Convert a supplier invoice to USD and spread the total tax across items by value. Produces a file you can import on the Invoices page."}
        />

        {/* ---- Inputs ---- */}
        <SectionCard
          icon={FileSpreadsheet}
          title={t("landedCost.inputs") || "Invoice & rates"}
          description="Upload the supplier's Excel, then enter the day's rate and the total tax."
          bodyClassName="space-y-3"
        >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* File */}
              <div className="space-y-1">
                <Label className="text-[11px] font-medium">Invoice file</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {file ? (
                  <div className="flex items-center gap-1.5 h-8 px-2 border-2 border-border rounded-md bg-muted/30">
                    <FileSpreadsheet className="w-3 h-3 shrink-0" />
                    <span className="text-[12px] truncate flex-1" title={file.name}>
                      {file.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 shrink-0"
                      onClick={clearFile}
                      aria-label="Remove file"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-8 text-[13px]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3 h-3 me-1.5" />
                    Choose Excel file
                  </Button>
                )}
              </div>

              {/* Rate */}
              <div className="space-y-1">
                <Label htmlFor="lc-rate" className="text-[11px] font-medium">
                  Exchange rate
                </Label>
                <Input
                  id="lc-rate"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="e.g. 6.7"
                  value={rate}
                  onChange={(e) => { setRate(e.target.value); setResult(null); }}
                  className="h-8 text-[13px]"
                />
                <p className="text-[11px] text-muted-foreground">
                  Unit price is divided by this. 6.7 means ¥6.70 = $1.
                </p>
              </div>

              {/* Tax */}
              <div className="space-y-1">
                <Label htmlFor="lc-tax" className="text-[11px] font-medium">
                  Total tax
                </Label>
                <Input
                  id="lc-tax"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="e.g. 1000"
                  value={tax}
                  onChange={(e) => { setTax(e.target.value); setResult(null); }}
                  className="h-8 text-[13px]"
                />
                <div className="flex items-center gap-3 pt-0.5">
                  {[
                    { label: "in USD", value: false },
                    { label: "in invoice currency", value: true },
                  ].map((opt) => (
                    <label
                      key={String(opt.value)}
                      className="flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="taxCurrency"
                        checked={taxInSourceCurrency === opt.value}
                        onChange={() => { setTaxInSourceCurrency(opt.value); setResult(null); }}
                        className="w-3 h-3"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleCalculate}
                disabled={!canSubmit || calculating}
                className="h-8 text-[13px]"
              >
                <Calculator className="w-3 h-3 me-1.5" />
                {calculating ? "Calculating…" : "Calculate"}
              </Button>
              <Button
                variant="outline"
                onClick={handleDownload}
                disabled={!canSubmit || !result || downloading}
                className="h-8 text-[13px]"
              >
                <Download className="w-3 h-3 me-1.5" />
                {downloading ? "Preparing…" : "Download importable Excel"}
              </Button>
            </div>
        </SectionCard>

        {/* ---- Summary ---- */}
        {summary && (
          <SectionCard
            icon={Calculator}
            title="Summary"
            description={<>Every line is marked up by the same {summary.upliftPct.toFixed(4)}% of its own
                value, so expensive parts carry proportionally more tax than cheap ones.</>}
          >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Goods (invoice currency)", value: money(summary.sourceGoodsTotal) },
                  { label: "Rate", value: `÷ ${summary.rate}` },
                  { label: "Goods (USD)", value: `$${money(summary.goodsUsd)}` },
                  { label: "Tax (USD)", value: `$${money(summary.taxUsd)}` },
                  { label: "Tax uplift", value: `${summary.upliftPct.toFixed(4)}%` },
                  { label: "Target total", value: `$${money(summary.targetGrandTotalUsd)}` },
                  { label: "Importable total", value: `$${money(summary.importableTotalUsd)}` },
                  {
                    label: "Residual",
                    value: `$${money(summary.residualUsd)}`,
                    warn: summary.residualUsd !== 0,
                  },
                ].map((tile) => (
                  <StatTile
                    key={tile.label}
                    label={tile.label}
                    value={tile.value}
                    tone={tile.warn ? "destructive" : "default"}
                  />
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                <StatusPill tone="neutral">
                  {summary.lineCount} lines · {summary.totalQuantity} units
                </StatusPill>
                {summary.nudgedCount > 0 && (
                  <StatusPill tone="neutral">
                    {summary.nudgedCount} line(s) adjusted by 1¢ to close rounding
                  </StatusPill>
                )}
                {summary.zeroPriceLineCount > 0 && (
                  <StatusPill tone="neutral">
                    {summary.zeroPriceLineCount} zero-price line(s) left at 0.00
                  </StatusPill>
                )}
                {summary.errorCount > 0 && (
                  <StatusPill tone="overdue">
                    {summary.errorCount} row(s) skipped
                  </StatusPill>
                )}
              </div>

              {summary.residualUsd !== 0 && (
                <p className="text-[11px] text-destructive-strong mt-2">
                  ${money(Math.abs(summary.residualUsd))} could not be placed: unit prices store
                  only 2 decimals, and no combination of these quantities lands exactly on the
                  target. The imported total will differ by this amount.
                </p>
              )}
          </SectionCard>
        )}

        {/* ---- Skipped rows ---- */}
        {result && result.errors.length > 0 && (
          <SectionCard
            className="border-destructive/40"
            title={
              <span className="inline-flex items-center gap-1.5 text-destructive-strong">
                <AlertCircle className="w-4 h-4" />
                Skipped rows ({result.errors.length})
              </span>
            }
            description="These are not in the output file and carry none of the tax."
          >
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i} className="text-[12px] text-muted-foreground">
                    Row {e.row}: {e.error}
                  </li>
                ))}
              </ul>
              {result.errors.length > 50 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  …and {result.errors.length - 50} more
                </p>
              )}
          </SectionCard>
        )}

        {/* ---- Lines ---- */}
        {result && result.lines.length > 0 && (
          <SectionCard
            title={`Items (${result.lines.length})`}
            description="Net unit price is what goes into the file: USD cost plus this item's share of the tax."
            bodyClassName="space-y-0 p-0"
          >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead className="h-9 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Barcode</TableHead>
                      <TableHead className="h-9 text-[10px] text-right font-bold uppercase tracking-wider text-muted-foreground">Qty</TableHead>
                      <TableHead className="h-9 text-[10px] text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Unit (src)</TableHead>
                      <TableHead className="h-9 text-[10px] text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">USD before tax</TableHead>
                      <TableHead className="h-9 text-[10px] text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Share %</TableHead>
                      <TableHead className="h-9 text-[10px] text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Tax share</TableHead>
                      <TableHead className="h-9 text-[10px] text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Net unit price</TableHead>
                      <TableHead className="h-9 text-[10px] text-right font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.lines.map((line) => (
                      <TableRow key={`${line.row}-${line.barcode}`}>
                        <TableCell className="text-[12px] font-mono whitespace-nowrap">
                          {line.barcode || line.sku}
                          {line.nudged && (
                            <span className="ms-1 text-muted-foreground" title="Adjusted by 1 cent to close rounding">
                              ±1¢
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-[12px] text-right tabular-nums">{line.quantity}</TableCell>
                        <TableCell className="text-[12px] text-right tabular-nums">{money(line.sourceUnitPrice)}</TableCell>
                        <TableCell className="text-[12px] text-right tabular-nums">{money(line.usdUnitBeforeTax, 4)}</TableCell>
                        <TableCell className="text-[12px] text-right tabular-nums text-muted-foreground">{line.sharePct.toFixed(3)}%</TableCell>
                        <TableCell className="text-[12px] text-right tabular-nums">{money(line.taxAllocatedUsd)}</TableCell>
                        <TableCell className="text-[12px] text-right tabular-nums font-semibold">{money(line.finalUnitPrice)}</TableCell>
                        <TableCell className="text-[12px] text-right tabular-nums">{money(line.lineTotalUsd)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
          </SectionCard>
        )}
      </div>
    </>
  );
};

export default LandedCost;
