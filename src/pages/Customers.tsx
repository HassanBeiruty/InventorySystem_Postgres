import { useState, useEffect } from "react";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Users, Pencil, Search, X } from "lucide-react";
import { customersRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";
import { useSearchText } from "@/hooks/useSearchText";

const Customers = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { applied: debouncedSearchQuery, searchOnEnter } = useSearchText(searchQuery);
  const { toast } = useToast();

  const fetchCustomers = async () => {
    const data = await customersRepo.list();
    setCustomers(data || []);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const address = formData.get("address") as string;
    const credit = formData.get("credit") as string;

    try {
      await customersRepo.add({
        name,
        phone: phone || null,
        address: address || null,
        credit_limit: credit ? parseFloat(credit) : 0,
      });
    } catch (error: any) {
      setLoading(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLoading(false);

    toast({ title: "Success", description: "Customer added successfully" });
    if (e.currentTarget) {
      e.currentTarget.reset();
    }
    setIsOpen(false);
    fetchCustomers();
  };

  const handleEdit = (customer: any) => {
    setEditingCustomer(customer);
    setEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const address = formData.get("address") as string;
    const credit = formData.get("credit") as string;

    try {
      await customersRepo.update(editingCustomer.id, {
        name,
        phone: phone || null,
        address: address || null,
        credit_limit: credit ? parseFloat(credit) : 0,
      });
    } catch (error: any) {
      setLoading(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLoading(false);

    toast({ title: "Success", description: "Customer updated successfully" });
    setEditOpen(false);
    setEditingCustomer(null);
    fetchCustomers();
  };

  const filteredCustomers = customers.filter(customer => {
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      const name = (customer.name || "").toLowerCase();
      const phone = (customer.phone || "").toLowerCase();
      const address = (customer.address || "").toLowerCase();
      const id = (customer.id || "").toString();
      return name.includes(query) || phone.includes(query) || address.includes(query) || id.includes(query);
    }
    return true;
  });

  return (
    <>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <InvoicePageHeader
          icon={Users}
          title={t('customers.title')}
          description={t('customers.subtitle')}
          actions={
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105 font-semibold h-8 text-xs">
                <Plus className="w-3.5 h-3.5 me-1.5" />
                {t('customers.addCustomer')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('customers.addCustomer')}</DialogTitle>
                <DialogDescription>{t('customers.subtitle')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-[11px] font-medium">{t('customers.customerName')}</Label>
                  <Input id="name" name="name" placeholder={t('customers.customerName')} required className="h-8 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-[11px] font-medium">{t('customers.phone')}</Label>
                  <Input id="phone" name="phone" placeholder={t('customers.phone')} className="h-8 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-[11px] font-medium">{t('customers.address')}</Label>
                  <Input id="address" name="address" placeholder={t('customers.address')} className="h-8 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="credit" className="text-[11px] font-medium">{t('customers.creditLimit')}</Label>
                  <Input id="credit" name="credit" type="number" step="0.01" placeholder="0.00" className="h-8 text-[13px]" />
                </div>
                <Button type="submit" className="w-full h-8 mt-2" disabled={loading}>
                  {loading ? t('common.loading') : t('common.save')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          }
        />

        <SectionCard
          icon={Users}
          title="Customer List"
          description="All your customers"
        >
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute start-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search customers (name, phone, address, ID)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={searchOnEnter}
                className="w-full ps-8 pe-8 h-8 text-[13px]"
                autoFocus
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                  className="absolute end-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
            {customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-success-light flex items-center justify-center mb-4">
                  <Users className="w-10 h-10 text-success/60" />
                </div>
                <p className="text-muted-foreground text-[13px]">
                  {searchQuery ? 'No customers found matching your search' : t('customers.noCustomers')}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="scroll-x">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('customers.customerName')}</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('customers.phone')}</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap hidden md:table-cell">{t('customers.address')}</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('customers.creditLimit')}</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer, idx) => (
                      <TableRow 
                        key={customer.id} 
                        className="hover:bg-success/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <TableCell className="font-medium whitespace-nowrap p-2 text-[13px]">{customer.name}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap p-2 text-[12px]">{customer.phone || "-"}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap hidden md:table-cell p-2 text-[12px]">{customer.address || "-"}</TableCell>
                        <TableCell className="font-semibold text-success-strong text-right tabular-nums whitespace-nowrap p-2 text-[12px]">${parseFloat(customer.credit_limit).toFixed(2)}</TableCell>
                        <TableCell className="p-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleEdit(customer)}
                            className="hover:bg-success/10 hover:scale-110 transition-all duration-300 h-7 w-7 p-0"
                          >
                            <Pencil className="w-3.5 h-3.5 text-success" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>
            )}
        </SectionCard>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('customers.editCustomer')}</DialogTitle>
              <DialogDescription>{t('customers.subtitle')}</DialogDescription>
            </DialogHeader>
            {editingCustomer && (
              <form onSubmit={handleUpdate} className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-[11px] font-medium">{t('customers.customerName')}</Label>
                  <Input id="edit-name" name="name" defaultValue={editingCustomer.name} required className="h-8 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-phone" className="text-[11px] font-medium">{t('customers.phone')}</Label>
                  <Input id="edit-phone" name="phone" defaultValue={editingCustomer.phone} className="h-8 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-address" className="text-[11px] font-medium">{t('customers.address')}</Label>
                  <Input id="edit-address" name="address" defaultValue={editingCustomer.address} className="h-8 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-credit" className="text-[11px] font-medium">{t('customers.creditLimit')}</Label>
                  <Input id="edit-credit" name="credit" type="number" step="0.01" defaultValue={editingCustomer.credit_limit} className="h-8 text-[13px]" />
                </div>
                <Button type="submit" className="w-full h-8 mt-2" disabled={loading}>
                  {loading ? t('common.loading') : t('common.save')}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default Customers;
