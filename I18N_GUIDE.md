# Internationalization (i18n) Guide

Your project now supports **Arabic (العربية)** and **English** with a language switcher! 🌍

## What's Been Set Up

### 1. **Core Setup**
- ✅ Installed `i18next` and `react-i18next`
- ✅ Created translation files:
  - `src/locales/en.json` - English translations
  - `src/locales/ar.json` - Arabic translations
- ✅ Created i18n configuration (`src/i18n/config.ts`)
- ✅ Language switcher component (`src/components/LanguageSwitcher.tsx`)
- ✅ RTL (Right-to-Left) support for Arabic

### 2. **Already Translated**
- ✅ Navigation menu (all buttons and dropdowns)
- ✅ Daily Stocks page (as an example)
- ✅ Common translations (buttons, labels, etc.)

### 3. **Language Switcher**
A language switcher button has been added next to the "Sign Out" button in the header. Users can click it to switch between English and Arabic.

## How to Use Translations in Your Components

### Step 1: Import the hook
```typescript
import { useTranslation } from "react-i18next";
```

### Step 2: Use the translation function
```typescript
const MyComponent = () => {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t('dashboard.title')}</h1>
      <p>{t('dashboard.subtitle')}</p>
    </div>
  );
};
```

### Step 3: Add your translations
Add the keys to both `en.json` and `ar.json`:

**en.json:**
```json
{
  "dashboard": {
    "title": "Dashboard",
    "subtitle": "Overview of your business"
  }
}
```

**ar.json:**
```json
{
  "dashboard": {
    "title": "لوحة التحكم",
    "subtitle": "نظرة عامة على عملك"
  }
}
```

## How to Translate Remaining Pages

### Pages that need translation:
1. ✅ ~~DashboardLayout~~ (Done)
2. ✅ ~~DailyStocks~~ (Done - use as reference)
3. ⏳ Dashboard
4. ⏳ Products
5. ⏳ Customers
6. ⏳ Suppliers
7. ⏳ Invoices
8. ⏳ InvoiceForm
9. ⏳ Inventory
10. ⏳ StockMovements
11. ⏳ ProductCosts
12. ⏳ InvoicesList
13. ⏳ Reports
14. ⏳ Auth

### Example: Translating a Page

**Before:**
```tsx
const Products = () => {
  return (
    <div>
      <h1>Products</h1>
      <Button>Add Product</Button>
      <Table>
        <TableHead>Product Name</TableHead>
        <TableHead>Price</TableHead>
      </Table>
    </div>
  );
};
```

**After:**
```tsx
import { useTranslation } from "react-i18next";

const Products = () => {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t('products.title')}</h1>
      <Button>{t('products.addProduct')}</Button>
      <Table>
        <TableHead>{t('products.productName')}</TableHead>
        <TableHead>{t('products.retailPrice')}</TableHead>
      </Table>
    </div>
  );
};
```

## Translation Keys Already Available

### Common
- `common.signOut` - Sign Out / تسجيل الخروج
- `common.loading` - Loading... / جار التحميل...
- `common.save` - Save / حفظ
- `common.cancel` - Cancel / إلغاء
- `common.delete` - Delete / حذف
- `common.edit` - Edit / تعديل
- `common.add` - Add / إضافة
- `common.search` - Search / بحث

### Navigation
- `nav.dashboard` - Dashboard / لوحة التحكم
- `nav.products` - Products / المنتجات
- `nav.customers` - Customers / العملاء
- `nav.suppliers` - Suppliers / الموردين
- `nav.invoices` - Invoices / الفواتير
- `nav.reports` - Reports / التقارير

### Products, Customers, Suppliers, Invoices
All keys are already in `en.json` and `ar.json` - just use them!

## RTL Support

When Arabic is selected:
- ✅ Layout automatically switches to RTL
- ✅ `dir="rtl"` attribute is set on `<html>`
- ✅ Margins and paddings are automatically flipped
- ✅ Text alignment adjusts automatically

## Testing

1. Start the development server: `npm run dev`
2. Navigate to any page
3. Click the language switcher (🌐 icon) in the header
4. Switch between English and Arabic
5. The page should reload with the new language

## Adding New Translation Keys

1. Open `src/locales/en.json`
2. Add your new key under the appropriate section
3. Open `src/locales/ar.json`
4. Add the Arabic translation for the same key
5. Use it in your component with `t('section.key')`

## Tips

- Keep translation keys organized by page/feature
- Use nested objects for better organization
- Always add translations to both `en.json` AND `ar.json`
- Test both languages after adding new translations
- For RTL, avoid absolute positioning where possible

## Next Steps

1. Go through each page one by one
2. Import `useTranslation` hook
3. Replace hardcoded text with `t('key.name')`
4. Test in both languages
5. Check RTL layout for Arabic

Need help? Check the `DailyStocks.tsx` page as a complete example! 🚀

