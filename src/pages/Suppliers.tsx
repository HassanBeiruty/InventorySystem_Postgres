import { useState, useEffect } from "react";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, UserPlus, Pencil, Search, X } from "lucide-react";
import { suppliersRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";
import { useDebounce } from "@/hooks/useDebounce";

const Suppliers = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearchQuery = useDebounce(searchQuery, 400);
  const { toast } = useToast();

  const fetchSuppliers = async () => {
    const data = await suppliersRepo.list();
    setSuppliers(data || []);
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const address = formData.get("address") as string;

    try {
      await suppliersRepo.add({ name, phone: phone || null, address: address || null });
    } catch (error: any) {
      setLoading(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLoading(false);

    toast({ title: "Success", description: "Supplier added successfully" });
    if (e.currentTarget) {
      e.currentTarget.reset();
    }
    setIsOpen(false);
    fetchSuppliers();
  };

  const handleEdit = (supplier: any) => {
    setEditingSupplier(supplier);
    setEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const address = formData.get("address") as string;

    try {
      await suppliersRepo.update(editingSupplier.id, {
        name,
        phone: phone || null,
        address: address || null,
      });
    } catch (error: any) {
      setLoading(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLoading(false);

    toast({ title: "Success", description: "Supplier updated successfully" });
    setEditOpen(false);
    setEditingSupplier(null);
    fetchSuppliers();
  };

  const filteredSuppliers = suppliers.filter(supplier => {
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      const name = (supplier.name || "").toLowerCase();
      const phone = (supplier.phone || "").toLowerCase();
      const address = (supplier.address || "").toLowerCase();
      const id = (supplier.id || "").toString();
      return name.includes(query) || phone.includes(query) || address.includes(query) || id.includes(query);
    }
    return true;
  });

  return (
    <>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <InvoicePageHeader
          icon={UserPlus}
          title={t('suppliers.title')}
          description={t('suppliers.subtitle')}
          actions={
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-secondary hover:shadow-glow-blue transition-all duration-300 hover:scale-105 font-semibold h-8 text-xs">
                <Plus className="w-3.5 h-3.5 me-1.5" />
                {t('suppliers.addSupplier')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('suppliers.addSupplier')}</DialogTitle>
                <DialogDescription>{t('suppliers.subtitle')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-[11px] font-medium">{t('suppliers.supplierName')}</Label>
                  <Input id="name" name="name" placeholder={t('suppliers.supplierName')} required className="h-8 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-[11px] font-medium">{t('suppliers.phone')}</Label>
                  <Input id="phone" name="phone" placeholder={t('suppliers.phone')} className="h-8 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-[11px] font-medium">{t('suppliers.address')}</Label>
                  <Input id="address" name="address" placeholder={t('suppliers.address')} className="h-8 text-[13px]" />
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
          icon={UserPlus}
          title="Supplier List"
          description="All your suppliers"
        >
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute start-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search suppliers (name, phone, address, ID)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
            {suppliers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-secondary-light flex items-center justify-center mb-4">
                  <UserPlus className="w-10 h-10 text-secondary/60" />
                </div>
                <p className="text-muted-foreground text-[13px]">
                  {searchQuery ? 'No suppliers found matching your search' : t('suppliers.noSuppliers')}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="scroll-x">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('suppliers.supplierName')}</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('suppliers.phone')}</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap hidden md:table-cell">{t('suppliers.address')}</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuppliers.map((supplier, idx) => (
                      <TableRow 
                        key={supplier.id} 
                        className="hover:bg-secondary/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <TableCell className="font-medium whitespace-nowrap p-2 text-[13px]">{supplier.name}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap p-2 text-[12px]">{supplier.phone || "-"}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap hidden md:table-cell p-2 text-[12px]">{supplier.address || "-"}</TableCell>
                        <TableCell className="p-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleEdit(supplier)}
                            className="hover:bg-secondary/10 hover:scale-110 transition-all duration-300 h-7 w-7 p-0"
                          >
                            <Pencil className="w-3.5 h-3.5 text-secondary" />
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
              <DialogTitle>{t('suppliers.editSupplier')}</DialogTitle>
              <DialogDescription>{t('suppliers.subtitle')}</DialogDescription>
            </DialogHeader>
            {editingSupplier && (
              <form onSubmit={handleUpdate} className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-[11px] font-medium">{t('suppliers.supplierName')}</Label>
                  <Input id="edit-name" name="name" defaultValue={editingSupplier.name} required className="h-8 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-phone" className="text-[11px] font-medium">{t('suppliers.phone')}</Label>
                  <Input id="edit-phone" name="phone" defaultValue={editingSupplier.phone} className="h-8 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-address" className="text-[11px] font-medium">{t('suppliers.address')}</Label>
                  <Input id="edit-address" name="address" defaultValue={editingSupplier.address} className="h-8 text-[13px]" />
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

export default Suppliers;
