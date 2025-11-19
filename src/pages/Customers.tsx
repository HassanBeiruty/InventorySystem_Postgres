import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Users, Pencil } from "lucide-react";
import { customersRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";

const Customers = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
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

  return (
    <DashboardLayout>
      <div className="space-y-6 sm:space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
              {t('customers.title')}
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">{t('customers.subtitle')}</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105 font-semibold">
                <Plus className="w-4 h-4 mr-2" />
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
                  <Label htmlFor="name" className="text-sm">{t('customers.customerName')}</Label>
                  <Input id="name" name="name" placeholder={t('customers.customerName')} required className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-sm">{t('customers.phone')}</Label>
                  <Input id="phone" name="phone" placeholder={t('customers.phone')} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-sm">{t('customers.address')}</Label>
                  <Input id="address" name="address" placeholder={t('customers.address')} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="credit" className="text-sm">{t('customers.creditLimit')}</Label>
                  <Input id="credit" name="credit" type="number" step="0.01" placeholder="0.00" className="h-9" />
                </div>
                <Button type="submit" className="w-full h-9 mt-2" disabled={loading}>
                  {loading ? t('common.loading') : t('common.save')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-2 shadow-card hover:shadow-elegant transition-all duration-300">
          <CardHeader className="border-b bg-gradient-to-br from-success/5 via-transparent to-accent/5">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Users className="w-6 h-6 text-success" />
              Customer List
            </CardTitle>
            <CardDescription className="text-base">All your customers</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mb-4">
                  <Users className="w-10 h-10 text-success/50" />
                </div>
                <p className="text-muted-foreground text-lg">{t('customers.noCustomers')}</p>
              </div>
            ) : (
              <div className="rounded-xl border-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-success/5 to-accent/5 hover:from-success/10 hover:to-accent/10">
                      <TableHead className="font-bold whitespace-nowrap">{t('customers.customerName')}</TableHead>
                      <TableHead className="font-bold whitespace-nowrap">{t('customers.phone')}</TableHead>
                      <TableHead className="font-bold whitespace-nowrap hidden md:table-cell">{t('customers.address')}</TableHead>
                      <TableHead className="font-bold whitespace-nowrap">{t('customers.creditLimit')}</TableHead>
                      <TableHead className="font-bold whitespace-nowrap">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer, idx) => (
                      <TableRow 
                        key={customer.id} 
                        className="hover:bg-success/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <TableCell className="font-medium whitespace-nowrap">{customer.name}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{customer.phone || "-"}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap hidden md:table-cell">{customer.address || "-"}</TableCell>
                        <TableCell className="font-semibold text-success whitespace-nowrap">${parseFloat(customer.credit_limit).toFixed(2)}</TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleEdit(customer)}
                            className="hover:bg-success/10 hover:scale-110 transition-all duration-300"
                          >
                            <Pencil className="w-4 h-4 text-success" />
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
              <DialogTitle>{t('customers.editCustomer')}</DialogTitle>
              <DialogDescription>{t('customers.subtitle')}</DialogDescription>
            </DialogHeader>
            {editingCustomer && (
              <form onSubmit={handleUpdate} className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-sm">{t('customers.customerName')}</Label>
                  <Input id="edit-name" name="name" defaultValue={editingCustomer.name} required className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-phone" className="text-sm">{t('customers.phone')}</Label>
                  <Input id="edit-phone" name="phone" defaultValue={editingCustomer.phone} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-address" className="text-sm">{t('customers.address')}</Label>
                  <Input id="edit-address" name="address" defaultValue={editingCustomer.address} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-credit" className="text-sm">{t('customers.creditLimit')}</Label>
                  <Input id="edit-credit" name="credit" type="number" step="0.01" defaultValue={editingCustomer.credit_limit} className="h-9" />
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

export default Customers;
