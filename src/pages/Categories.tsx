import { useState, useEffect } from "react";
import { InvoicePageHeader } from "@/components/page-ui/InvoicePageHeader";
import { SectionCard } from "@/components/page-ui/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, FolderTree, Pencil, Trash2, Search, X } from "lucide-react";
import { categoriesRepo } from "@/integrations/api/repo";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";
import { useSearchText } from "@/hooks/useSearchText";

const Categories = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [deletingCategory, setDeletingCategory] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { applied: debouncedSearchQuery, searchOnEnter } = useSearchText(searchQuery);
  const { toast } = useToast();

  const fetchCategories = async () => {
    const data = await categoriesRepo.list();
    setCategories(data || []);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;

    try {
      await categoriesRepo.add({
        name,
        description: description || null,
      });
    } catch (error: any) {
      setLoading(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLoading(false);

    toast({ title: "Success", description: "Category added successfully" });
    if (e.currentTarget) {
      e.currentTarget.reset();
    }
    setIsOpen(false);
    fetchCategories();
  };

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    setEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;

    try {
      await categoriesRepo.update(editingCategory.id, {
        name,
        description: description || null,
      });
    } catch (error: any) {
      setLoading(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLoading(false);

    toast({ title: "Success", description: "Category updated successfully" });
    setEditOpen(false);
    setEditingCategory(null);
    fetchCategories();
  };

  const handleDeleteClick = (category: any) => {
    setDeletingCategory(category);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCategory) return;
    
    setLoading(true);
    try {
      await categoriesRepo.delete(deletingCategory.id);
      toast({ title: "Success", description: "Category deleted successfully" });
      fetchCategories();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setDeleteOpen(false);
      setDeletingCategory(null);
    }
  };

  const filteredCategories = categories.filter(category => {
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      const name = (category.name || "").toLowerCase();
      const description = (category.description || "").toLowerCase();
      const id = (category.id || "").toString();
      return name.includes(query) || description.includes(query) || id.includes(query);
    }
    return true;
  });

  return (
    <>
      <div className="space-y-3 sm:space-y-4 animate-fade-in">
        <InvoicePageHeader
          icon={FolderTree}
          title={t('categories.title')}
          description={t('categories.subtitle')}
          actions={
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary hover:shadow-glow transition-all duration-300 hover:scale-105 font-semibold h-8 text-xs">
                <Plus className="w-3.5 h-3.5 me-1.5" />
                {t('categories.addCategory')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('categories.addCategory')}</DialogTitle>
                <DialogDescription>{t('categories.subtitle')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-[11px] font-medium">{t('categories.categoryName')}</Label>
                  <Input id="name" name="name" placeholder={t('categories.categoryName')} required className="h-8 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-[11px] font-medium">{t('categories.description')}</Label>
                  <Textarea id="description" name="description" placeholder={t('categories.description')} rows={2} className="text-[13px]" />
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
          icon={FolderTree}
          title="Category List"
          description="All your product categories"
        >
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute start-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search categories (name, description, ID)"
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
            {categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-full bg-primary-light flex items-center justify-center mb-4">
                  <FolderTree className="w-10 h-10 text-primary/60" />
                </div>
                <p className="text-muted-foreground text-[13px]">
                  {searchQuery ? 'No categories found matching your search' : t('categories.noCategories')}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden bg-card">
                <div className="scroll-x">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{t('categories.categoryName')}</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap hidden md:table-cell">{t('categories.description')}</TableHead>
                      <TableHead className="h-9 px-2 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCategories.map((category, idx) => (
                      <TableRow 
                        key={category.id} 
                        className="hover:bg-primary/5 transition-colors animate-fade-in"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <TableCell className="font-medium whitespace-nowrap p-2 text-[13px]">{category.name}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap hidden md:table-cell p-2 text-[12px]">{category.description || "-"}</TableCell>
                        <TableCell className="p-2">
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleEdit(category)}
                              className="hover:bg-primary/10 hover:scale-110 transition-all duration-300 h-7 w-7 p-0"
                            >
                              <Pencil className="w-3.5 h-3.5 text-primary" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleDeleteClick(category)}
                              className="hover:bg-destructive/10 hover:scale-110 transition-all duration-300 h-7 w-7 p-0"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
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
              <DialogTitle>{t('categories.editCategory')}</DialogTitle>
              <DialogDescription>{t('categories.updateCategory')}</DialogDescription>
            </DialogHeader>
            {editingCategory && (
              <form onSubmit={handleUpdate} className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-[11px] font-medium">{t('categories.categoryName')}</Label>
                  <Input id="edit-name" name="name" defaultValue={editingCategory.name} required className="h-8 text-[13px]" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-description" className="text-[11px] font-medium">{t('categories.description')}</Label>
                  <Textarea id="edit-description" name="description" defaultValue={editingCategory.description || ""} rows={2} className="text-[13px]" />
                </div>
                <Button type="submit" className="w-full h-8 mt-2" disabled={loading}>
                  {loading ? t('categories.updating') : t('categories.updateCategory')}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('categories.deleteCategory')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('categories.deleteConfirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
};

export default Categories;

