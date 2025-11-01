# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/fd9b15fd-e17d-4e80-9485-5f5eb3e93b3a

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/fd9b15fd-e17d-4e80-9485-5f5eb3e93b3a) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

**Frontend:**
- React 18 with TypeScript
- Vite - Fast build tool
- Tailwind CSS - Utility-first CSS
- shadcn/ui - UI components
- React Router - Navigation
- TanStack Query - Data fetching
- date-fns - Date utilities
- Lucide React - Icons

**Backend:**
- Node.js with Express
- SQL Server - Database
- msnodesqlv8 - Native SQL Server driver

**Features:**
- Complete invoice management (buy/sell)
- Partial and complete payment tracking
- Product inventory with daily stock snapshots
- Customer and supplier management
- Product pricing management
- Stock movement tracking
- Low stock alerts
- Comprehensive reporting and analytics

## SQL Server Backend

This project uses a SQL Server database for data persistence. The backend is built with Node.js and Express.

The project includes a minimal Node.js backend in `server/` to connect to a local SQL Server instance using Windows Authentication.

### Prerequisites

- SQL Server (local instance)
- ODBC Driver 17 or 18 for SQL Server
- Microsoft Visual C++ Redistributable (required by msnodesqlv8)

### Setup

Environment variables (copy `server/env.sample` to `server/.env` and adjust if needed):

```env
PORT=5050
SQL_SERVER=HASSANLAPTOP\MSSQLSERVER01
SQL_DATABASE=InvoiceSystem
SQL_TRUST_SERVER_CERT=true
SQL_TIMEOUT_MS=30000
```

### Running the Project

```sh
# Terminal 1
cd server
copy env.sample .env  # Windows PowerShell: cp env.sample .env
npm run dev

# Terminal 2 (project root)
npm run dev
```

Or start both with one command from the project root:

```sh
npm run dev:all
```

### Database Initialization

The database schema is automatically initialized on server startup. To manually run initialization:

```sh
# From project root
Invoke-WebRequest -Uri http://localhost:5050/api/admin/init -Method POST
```

### Available API Endpoints

Main endpoints (proxied from Vite to `http://localhost:5050`):

**Authentication:**
- `POST /api/auth/signup` - Create new user account
- `POST /api/auth/signin` - User login

**Entities:**
- `GET /api/customers` - List all customers
- `GET /api/products` - List all products
- `GET /api/suppliers` - List all suppliers

**Invoices:**
- `GET /api/invoices` - List all invoices with relations
- `POST /api/invoices` - Create new invoice
- `GET /api/invoices/:id` - Get invoice details with payments
- `POST /api/invoices/:id/payments` - Record payment for invoice
- `GET /api/invoices/stats` - Get invoice statistics

**Inventory:**
- `GET /api/inventory/today` - Today's inventory
- `GET /api/inventory/low-stock/:threshold` - Low stock products
- `GET /api/stock-movements/recent/:limit` - Recent stock movements

**Admin:**
- `GET /api/health` - Database connectivity check
- `POST /api/admin/init` - Run database initialization

For complete API documentation, see `server/routes/api.js`.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/fd9b15fd-e17d-4e80-9485-5f5eb3e93b3a) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
