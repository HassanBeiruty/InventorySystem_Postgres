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
import { DollarSign, Filter, X, Plus, Pencil, Trash2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { formatDateTimeLebanon, getTodayLebanon } from "@/utils/dateUtils";
import { exchangeRatesRepo, ExchangeRateEntity } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { useAdmin } from "@/hooks/useAdmin";

const ExchangeRates = () => {
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
        title: "Error",
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
        title: "Success",
        description: "Exchange rate added successfully",
      });
      setIsAddOpen(false);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
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
        title: "Success",
        description: "Exchange rate updated successfully",
      });
      setIsEditOpen(false);
      setEditingRate(null);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to deactivate this exchange rate?")) {
      return;
    }
    
    try {
      await exchangeRatesRepo.delete(id);
      toast({
        title: "Success",
        description: "Exchange rate deactivated successfully",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
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
  // Only show loading if we truly have no data (initial load)
  if (isAdminLoading && !userInfo) {
    return (
      <DashboardLayout>
        <div className="space-y-6 p-4 sm:p-6">
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Show access denied if not admin (only after loading is definitely complete)
  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="space-y-6 p-4 sm:p-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <DollarSign className="w-8 h-8" />
              Exchange Rates
            </h1>
            <p className="text-muted-foreground mt-2">Manage currency exchange rates</p>
          </div>
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Admin access required to manage exchange rates</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const currentRates = getCurrentActiveRates();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Exchange Rates</h1>
            <p className="text-muted-foreground">Manage currency exchange rates</p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Exchange Rate
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Exchange Rate</DialogTitle>
                <DialogDescription>Create a new exchange rate</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAdd}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="currency_code">Currency *</Label>
                    <Select name="currency_code" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="LBP">LBP</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rate_to_usd">Rate (1 USD = X currency) *</Label>
                    <Input
                      name="rate_to_usd"
                      type="number"
                      step="0.000001"
                      min="0.000001"
                      required
                      placeholder="e.g., 89500 for LBP"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="effective_date">Effective Date *</Label>
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
                    <Label htmlFor="is_active">Active</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading ? "Adding..." : "Add"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Current Active Rates */}
        <div className="grid grid-cols-3 gap-4">
          {(['USD', 'LBP', 'EUR'] as const).map((currency) => {
            const currentRate = currentRates[currency];
            return (
              <div key={currency} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">{currency}</span>
                  {currentRate ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                </div>
                {currentRate ? (
                  <>
                    <div className="text-2xl font-bold">1 USD = {parseFloat(String(currentRate.rate_to_usd)).toLocaleString()} {currency}</div>
                    <div className="text-xs text-muted-foreground">
                      Effective: {formatDateTimeLebanon(currentRate.effective_date, "MM/dd/yyyy")}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">No active rate</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="mr-2 h-4 w-4" />
            {showFilters ? "Hide" : "Show"} Filters
          </Button>
          {showFilters && (
            <>
              <Select
                value={filters.currency_code}
                onValueChange={(value) => setFilters({ ...filters, currency_code: value })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Currencies</SelectItem>
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
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={applyFilters}>
                Apply
              </Button>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4" />
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
            No exchange rates found
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>Rate (1 USD = X)</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell className="font-medium">{rate.currency_code}</TableCell>
                    <TableCell>{parseFloat(String(rate.rate_to_usd)).toLocaleString()}</TableCell>
                    <TableCell>{formatDateTimeLebanon(rate.effective_date, "MM/dd/yyyy")}</TableCell>
                    <TableCell>
                      {rate.is_active ? (
                        <span className="text-green-600">Active</span>
                      ) : (
                        <span className="text-muted-foreground">Inactive</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTimeLebanon(rate.created_at, "MM/dd/yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingRate(rate);
                            setIsEditOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rate.id)}
                        >
                          <Trash2 className="h-4 w-4" />
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
              <DialogTitle>Edit Exchange Rate</DialogTitle>
              <DialogDescription>Update exchange rate details</DialogDescription>
            </DialogHeader>
            {editingRate && (
              <form onSubmit={handleEdit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_currency_code">Currency *</Label>
                    <Select name="currency_code" defaultValue={editingRate.currency_code} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="LBP">LBP</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_rate_to_usd">Rate (1 USD = X currency) *</Label>
                    <Input
                      name="rate_to_usd"
                      type="number"
                      step="0.000001"
                      min="0.000001"
                      defaultValue={parseFloat(String(editingRate.rate_to_usd))}
                      required
                      placeholder="e.g., 89500 for LBP"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_effective_date">Effective Date *</Label>
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
                    <Label htmlFor="edit_is_active">Active</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => {
                    setIsEditOpen(false);
                    setEditingRate(null);
                  }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={formLoading}>
                    {formLoading ? "Updating..." : "Update"}
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

