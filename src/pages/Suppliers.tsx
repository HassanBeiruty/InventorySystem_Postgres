import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, UserPlus, Pencil } from "lucide-react";
import { suppliersRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";

const Suppliers = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
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

  return (
    <DashboardLayout>
      <div className="space-y-6 sm:space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              {t('suppliers.title')}
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">{t('suppliers.subtitle')}</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-secondary hover:shadow-glow-pink transition-all duration-300 hover:scale-105 font-semibold">
                <Plus className="w-4 h-4 mr-2" />
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
                  <Label htmlFor="name" className="text-sm">{t('suppliers.supplierName')}</Label>
                  <Input id="name" name="name" placeholder={t('suppliers.supplierName')} required className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-sm">{t('suppliers.phone')}</Label>
                  <Input id="phone" name="phone" placeholder={t('suppliers.phone')} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-sm">{t('suppliers.address')}</Label>
                  <Input id="address" name="address" placeholder={t('suppliers.address')} className="h-9" />
                </div>
                <Button type="submit" className="w-full h-9 mt-2" disabled={loading}>
                  {loading ? t('common.loading') : t('common.save')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
          <CardHeader className="border-b bg-gradient-to-br from-secondary/5 via-transparent to-accent/5">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <UserPlus className="w-6 h-6 text-secondary" />
              Supplier List
            </CardTitle>
            <CardDescription className="text-base">All your suppliers</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {suppliers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-secondary/10 flex items-center justify-center mb-4">
                  <UserPlus className="w-10 h-10 text-secondary/50" />
                </div>
                <p className="text-muted-foreground text-lg">{t('suppliers.noSuppliers')}</p>
              </div>
            ) : (
              <div className="rounded-xl border-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-secondary/5 to-accent/5 hover:from-secondary/10 hover:to-accent/10">
                      <TableHead className="font-bold whitespace-nowrap">{t('suppliers.supplierName')}</TableHead>
                      <TableHead className="font-bold whitespace-nowrap">{t('suppliers.phone')}</TableHead>
                      <TableHead className="font-bold whitespace-nowrap hidden md:table-cell">{t('suppliers.address')}</TableHead>
                      <TableHead className="font-bold whitespace-nowrap">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.map((supplier, idx) => (
                      <TableRow 
                        key={supplier.id} 
                        className="hover:bg-secondary/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <TableCell className="font-medium whitespace-nowrap">{supplier.name}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{supplier.phone || "-"}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap hidden md:table-cell">{supplier.address || "-"}</TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleEdit(supplier)}
                            className="hover:bg-secondary/10 hover:scale-110 transition-all duration-300"
                          >
                            <Pencil className="w-4 h-4 text-secondary" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('suppliers.editSupplier')}</DialogTitle>
              <DialogDescription>{t('suppliers.subtitle')}</DialogDescription>
            </DialogHeader>
            {editingSupplier && (
              <form onSubmit={handleUpdate} className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-sm">{t('suppliers.supplierName')}</Label>
                  <Input id="edit-name" name="name" defaultValue={editingSupplier.name} required className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-phone" className="text-sm">{t('suppliers.phone')}</Label>
                  <Input id="edit-phone" name="phone" defaultValue={editingSupplier.phone} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-address" className="text-sm">{t('suppliers.address')}</Label>
                  <Input id="edit-address" name="address" defaultValue={editingSupplier.address} className="h-9" />
                </div>
                <Button type="submit" className="w-full h-9 mt-2" disabled={loading}>
                  {loading ? t('common.loading') : t('common.save')}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Suppliers;
