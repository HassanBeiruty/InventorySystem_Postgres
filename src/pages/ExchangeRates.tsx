import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { DollarSign, Filter, X, Plus, Pencil, Trash2, CheckCircle2, XCircle, AlertCircle, Search } from "lucide-react";
import { formatDateTimeLebanon, getTodayLebanon } from "@/utils/dateUtils";
import { exchangeRatesRepo, ExchangeRateEntity } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useAdmin } from "@/hooks/useAdmin";
import { useTranslation } from "react-i18next";

const ExchangeRates = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isAdmin, isLoading: isAdminLoading, userInfo } = useAdmin();
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<ExchangeRateEntity[]>([]);
  const [filters, setFilters] = useState({
    currency_code: "all",
    is_active: "all",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<ExchangeRateEntity | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const fetchData = useCallback(async () => {
    // Only fetch if admin check is complete and user is admin
    if (isAdminLoading || !isAdmin) {
      return;
    }
    
    setLoading(true);
    try {
      const filterObj: any = {};
      if (filters.currency_code && filters.currency_code !== "all") {
        filterObj.currency_code = filters.currency_code;
      }
      if (filters.is_active && filters.is_active !== "all") {
        filterObj.is_active = filters.is_active === "true";
      }
      
      const ratesData = await exchangeRatesRepo.list(filterObj);
      setRates(ratesData || []);
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [isAdminLoading, isAdmin, filters.currency_code, filters.is_active, toast]);

  // Only fetch data when admin status is confirmed
  useEffect(() => {
    if (!isAdminLoading && isAdmin) {
      fetchData();
    }
  }, [isAdminLoading, isAdmin, fetchData]);

  const applyFilters = async () => {
    await fetchData();
  };

  const clearFilters = () => {
    setFilters({ currency_code: "all", is_active: "all" });
    fetchData();
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      await exchangeRatesRepo.create({
        currency_code: formData.get("currency_code") as "USD" | "LBP" | "EUR",
        rate_to_usd: parseFloat(formData.get("rate_to_usd") as string),
        effective_date: formData.get("effective_date") as string,
        is_active: formData.get("is_active") === "on",
      });
      toast({
        title: t("common.success"),
        description: t("exchangeRates.exchangeRateAdded"),
      });
      setIsAddOpen(false);
      fetchData();
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingRate) return;
    
    setFormLoading(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      await exchangeRatesRepo.update(editingRate.id, {
        currency_code: formData.get("currency_code") as "USD" | "LBP" | "EUR",
        rate_to_usd: parseFloat(formData.get("rate_to_usd") as string),
        effective_date: formData.get("effective_date") as string,
        is_active: formData.get("is_active") === "on",
      });
      toast({
        title: t("common.success"),
        description: t("exchangeRates.exchangeRateUpdated"),
      });
      setIsEditOpen(false);
      setEditingRate(null);
      fetchData();
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("exchangeRates.deactivateConfirm"))) {
      return;
    }
    
    try {
      await exchangeRatesRepo.delete(id);
      toast({
        title: t("common.success"),
        description: t("exchangeRates.exchangeRateDeactivated"),
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Get current active rates for each currency
  const getCurrentActiveRates = () => {
    const activeRates: Record<string, ExchangeRateEntity> = {};
    rates
      .filter(r => r.is_active)
      .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime())
      .forEach(rate => {
        if (!activeRates[rate.currency_code]) {
          activeRates[rate.currency_code] = rate;
        }
      });
    return activeRates;
  };

  // Wait for admin check to complete before rendering anything
  // This prevents the flash of content/access denied
  if (isAdminLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-3 p-2 sm:p-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Show access denied if not admin (only after loading is definitely complete)
  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="space-y-3 p-2 sm:p-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-1.5">
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6" />
              Exchange Rates
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Manage currency exchange rates</p>
          </div>
          <Card>
            <CardContent className="p-3 text-center">
              <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">Admin access required to manage exchange rates</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const currentRates = getCurrentActiveRates();

  const filteredRates = rates.filter(rate => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const currency = (rate.currency_code || "").toLowerCase();
      const id = (rate.id || "").toString();
      return currency.includes(query) || id.includes(query);
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{t("exchangeRates.title")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">{t("exchangeRates.subtitle")}</p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="h-8 text-xs">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("exchangeRates.addExchangeRate")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("exchangeRates.addExchangeRateTitle")}</DialogTitle>
                <DialogDescription>{t("exchangeRates.addExchangeRateDescription")}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAdd}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="currency_code">{t("exchangeRates.currency")} *</Label>
                    <Select name="currency_code" required>
                      <SelectTrigger>
                        <SelectValue placeholder={t("exchangeRates.selectCurrency")} />
                      </SelectTrigger>
                      <SelectContent side="bottom" align="start">
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="LBP">LBP</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rate_to_usd">{t("exchangeRates.rate")} *</Label>
                    <Input
                      name="rate_to_usd"
                      type="number"
                      step="0.000001"
                      min="0.000001"
                      required
                      placeholder={t("exchangeRates.ratePlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="effective_date">{t("exchangeRates.effectiveDate")} *</Label>
                    <Input
                      name="effective_date"
                      type="date"
                      defaultValue={getTodayLebanon()}
                      required
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      name="is_active"
                      id="is_active"
                      defaultChecked
                      className="h-4 w-4"
                    />
                    <Label htmlFor="is_active">{t("exchangeRates.active")}</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading ? t("exchangeRates.adding") : t("exchangeRates.add")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Current Active Rates */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {(['USD', 'LBP', 'EUR'] as const).map((currency) => {
            const currentRate = currentRates[currency];
            return (
              <div key={currency} className="border rounded-lg p-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-sm">{currency}</span>
                  {currentRate ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  )}
                </div>
                {currentRate ? (
                  <>
                    <div className="text-base sm:text-lg font-bold">1 USD = {parseFloat(String(currentRate.rate_to_usd)).toLocaleString()} {currency}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t("exchangeRates.effective")}: {formatDateTimeLebanon(currentRate.effective_date, "MM/dd/yyyy")}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">{t("exchangeRates.noActiveRate")}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 sm:flex-initial sm:min-w-[300px]">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search exchange rates (currency, ID)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 h-8 text-sm"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8 text-xs"
          >
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            {showFilters ? t("common.hideFilters") : t("common.showFilters")}
          </Button>
          {showFilters && (
            <>
              <Select
                value={filters.currency_code}
                onValueChange={(value) => setFilters({ ...filters, currency_code: value })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t("exchangeRates.currency")} />
                </SelectTrigger>
                <SelectContent side="bottom" align="start">
                  <SelectItem value="all">{t("exchangeRates.allCurrencies")}</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="LBP">LBP</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.is_active}
                onValueChange={(value) => setFilters({ ...filters, is_active: value })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t("invoices.status")} />
                </SelectTrigger>
                <SelectContent side="bottom" align="start">
                  <SelectItem value="all">{t("exchangeRates.allStatus")}</SelectItem>
                  <SelectItem value="true">{t("exchangeRates.activeStatus")}</SelectItem>
                  <SelectItem value="false">{t("exchangeRates.inactiveStatus")}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={applyFilters} className="h-8 text-xs">
                {t("common.apply")}
              </Button>
              <Button variant="outline" size="sm" onClick={clearFilters} className="h-8 text-xs">
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t("exchangeRates.noExchangeRates")}
          </div>
        ) : filteredRates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No exchange rates found matching your search
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="p-2 text-xs">{t("exchangeRates.currency")}</TableHead>
                  <TableHead className="p-2 text-xs">{t("exchangeRates.rate")}</TableHead>
                  <TableHead className="p-2 text-xs">{t("exchangeRates.effectiveDate")}</TableHead>
                  <TableHead className="p-2 text-xs">{t("invoices.status")}</TableHead>
                  <TableHead className="p-2 text-xs">{t("common.created") || "Created"}</TableHead>
                  <TableHead className="text-right p-2 text-xs">{t("common.actions") || "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell className="font-medium p-2 text-sm">{rate.currency_code}</TableCell>
                    <TableCell className="p-2 text-xs">{parseFloat(String(rate.rate_to_usd)).toLocaleString()}</TableCell>
                    <TableCell className="p-2 text-xs">{formatDateTimeLebanon(rate.effective_date, "MM/dd/yyyy")}</TableCell>
                    <TableCell className="p-2">
                      {rate.is_active ? (
                        <span className="text-success text-xs">{t("exchangeRates.activeStatus")}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">{t("exchangeRates.inactiveStatus")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground p-2">
                      {formatDateTimeLebanon(rate.created_at, "MM/dd/yyyy")}
                    </TableCell>
                    <TableCell className="text-right p-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingRate(rate);
                            setIsEditOpen(true);
                          }}
                          className="h-7 w-7 p-0"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rate.id)}
                          className="h-7 w-7 p-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("exchangeRates.editExchangeRate")}</DialogTitle>
              <DialogDescription>{t("exchangeRates.editExchangeRateDescription")}</DialogDescription>
            </DialogHeader>
            {editingRate && (
              <form onSubmit={handleEdit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_currency_code">{t("exchangeRates.currency")} *</Label>
                    <Select name="currency_code" defaultValue={editingRate.currency_code} required>
                      <SelectTrigger>
                        <SelectValue placeholder={t("exchangeRates.selectCurrency")} />
                      </SelectTrigger>
                      <SelectContent side="bottom" align="start">
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="LBP">LBP</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_rate_to_usd">{t("exchangeRates.rate")} *</Label>
                    <Input
                      name="rate_to_usd"
                      type="number"
                      step="0.000001"
                      min="0.000001"
                      defaultValue={parseFloat(String(editingRate.rate_to_usd))}
                      required
                      placeholder={t("exchangeRates.ratePlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_effective_date">{t("exchangeRates.effectiveDate")} *</Label>
                    <Input
                      name="effective_date"
                      type="date"
                      defaultValue={editingRate.effective_date}
                      required
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      name="is_active"
                      id="edit_is_active"
                      defaultChecked={editingRate.is_active}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="edit_is_active">{t("exchangeRates.active")}</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => {
                    setIsEditOpen(false);
                    setEditingRate(null);
                  }}>
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading ? t("exchangeRates.updating") : t("exchangeRates.update")}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ExchangeRates;

