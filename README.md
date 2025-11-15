# Invoice System - Inventory Management

A comprehensive inventory and invoice management system built with React, Node.js, and PostgreSQL.

## Features

- **Invoice Management**: Complete buy/sell invoice system with partial and full payment tracking
- **Product Inventory**: Real-time stock tracking with daily snapshots and average cost calculation
- **Customer & Supplier Management**: Full CRUD operations for business contacts
- **Product Pricing**: Manage wholesale and retail prices with private pricing options
- **Stock Movements**: Track all inventory changes with detailed history
- **Low Stock Alerts**: Automatic notifications for products below threshold
- **Comprehensive Reporting**: Analytics, profit tracking, and export capabilities
- **Multi-language Support**: English and Arabic (RTL) interface

## Technology Stack

**Frontend:**
- React 18 with TypeScript
- Vite - Fast build tool
- Tailwind CSS - Utility-first CSS
- shadcn/ui - UI components
- React Router - Navigation
- TanStack Query - Data fetching
- date-fns - Date utilities
- Lucide React - Icons
- i18next - Internationalization

**Backend:**
- Node.js with Express
- PostgreSQL - Database
- pg - PostgreSQL driver
- JWT - Authentication

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 12+ (local or remote instance)
- Git

## Installation

1. **Clone the repository:**
```sh
git clone https://github.com/HassanBeiruty/InventorySystem_Postgres.git
cd InventorySystem_Postgres
```

2. **Install dependencies:**
```sh
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

3. **Set up environment variables:**
```sh
# Copy the sample environment file
cp server/env.sample server/.env

# Edit server/.env with your PostgreSQL credentials
```

Example `server/.env`:
```env
PORT=5050
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=invoicesystem
PG_USER=postgres
PG_PASSWORD=your_password
PG_SSL=false
JWT_SECRET=your_jwt_secret_key_here
```

4. **Initialize the database:**
The database schema is automatically initialized on server startup. To manually run initialization:
```sh
# Start the server (it will auto-initialize)
cd server
npm run dev

# Or use the API endpoint
curl -X POST http://localhost:5050/api/admin/init
```

5. **Seed sample data (optional):**
```sh
cd server
npm run seed
```

## Running the Project

**Development mode (both frontend and backend):**
```sh
npm run dev:all
```

**Or run separately:**

Terminal 1 (Backend):
```sh
cd server
npm run dev
```

Terminal 2 (Frontend):
```sh
npm run dev
```

The application will be available at:
- Frontend: http://localhost:8080
- Backend API: http://localhost:5050

## API Endpoints

**Authentication:**
- `POST /api/auth/signup` - Create new user account
- `POST /api/auth/signin` - User login
- `POST /api/auth/logout` - User logout

**Products:**
- `GET /api/products` - List all products
- `POST /api/products` - Create new product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

**Invoices:**
- `GET /api/invoices` - List all invoices
- `POST /api/invoices` - Create new invoice
- `GET /api/invoices/:id` - Get invoice details
- `PUT /api/invoices/:id` - Update invoice
- `DELETE /api/invoices/:id` - Delete invoice
- `GET /api/invoices/overdue` - Get overdue invoices
- `POST /api/invoices/:id/payments` - Record payment

**Inventory:**
- `GET /api/inventory/today` - Today's inventory
- `GET /api/inventory/low-stock/:threshold` - Low stock products
- `GET /api/stock-movements/recent/:limit` - Recent stock movements
- `GET /api/daily-stock/today/avg-cost` - Today's average costs
- `GET /api/daily-stock/avg-costs/all` - All average costs

**Customers & Suppliers:**
- `GET /api/customers` - List all customers
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer
- `GET /api/suppliers` - List all suppliers
- `POST /api/suppliers` - Create supplier
- `PUT /api/suppliers/:id` - Update supplier
- `DELETE /api/suppliers/:id` - Delete supplier

**Admin:**
- `GET /api/health` - Database connectivity check
- `POST /api/admin/init` - Run database initialization

For complete API documentation, see `server/routes/api.js`.

## Database Schema

The system uses PostgreSQL with the following main tables:
- `users` - User accounts and authentication
- `products` - Product catalog with categories
- `categories` - Product categories
- `customers` - Customer information
- `suppliers` - Supplier information
- `invoices` - Buy/sell invoices
- `invoice_items` - Invoice line items
- `invoice_payments` - Payment records
- `stock_movements` - Stock change history
- `daily_stock` - Daily stock snapshots
- `product_prices` - Product pricing information

## Security

- Environment variables are excluded from version control (see `.gitignore`)
- JWT tokens for authentication
- SQL injection protection via parameterized queries
- CORS configured for API security
- Password hashing for user accounts

## Building for Production

```sh
# Build frontend
npm run build

# The built files will be in the `dist` directory
# Serve with any static file server or deploy to your hosting platform
```

## Deployment

This project is configured for deployment on free hosting platforms:

- **Frontend**: Vercel (automatic deployments from GitHub)
- **Backend**: Render (Node.js web service)
- **Database**: Render PostgreSQL (free tier) or Supabase

### Quick Start

See `QUICK_DEPLOY.md` for a step-by-step deployment checklist.

### Detailed Guide

See `DEPLOYMENT.md` for comprehensive deployment instructions including:
- Environment variable configuration
- Database setup
- CORS configuration
- Troubleshooting
- Custom domain setup

### Deployment Files

- `vercel.json` - Vercel frontend configuration
- `render.yaml` - Render backend and database configuration (optional)
- `.env.production.example` - Production environment variable template

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and proprietary.

## Support

For issues and questions, please open an issue on the GitHub repository.
