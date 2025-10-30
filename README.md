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

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Local-only mode (no cloud backend)

This app has been converted to use a local database via IndexedDB (Dexie). No network or cloud services are required.

Getting started:

1. Install dependencies
   - `npm install`
2. Start the app
   - `npm run dev`

Notes:
- Data is stored in the browser (IndexedDB). Each browser/profile has its own data.
- Authentication is local-only (email/password stored locally for demo purposes). Do not use real credentials.
- You can clear app data by clearing the site storage in your browser.

## SQL Server backend (local)

The project includes a minimal Node.js backend in `server/` to connect to a local SQL Server instance using Windows Authentication.

Environment variables (copy `server/env.sample` to `server/.env` and adjust if needed):

```
PORT=5050
SQL_SERVER=HASSANLAPTOP\\MSSQLSERVER01
SQL_DATABASE=InvoiceSystem
SQL_TRUST_SERVER_CERT=true
SQL_TIMEOUT_MS=30000
```

Run in development:

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

Available endpoints (proxied from Vite to `http://localhost:5050`):

- `GET /api/health` – checks DB connectivity (`GETDATE()`, `DB_NAME()`).
- `GET /api/db-test` – returns top rows from `Invoices` if table exists; otherwise lists tables.

Notes and prerequisites (Windows):
- Ensure "ODBC Driver 18 for SQL Server" is installed. If not, the backend auto-retries with Driver 17. You can install either from Microsoft.
- Install the latest Microsoft Visual C++ Redistributable (required by `msnodesqlv8`).
- SQL Server should be running on `HASSANLAPTOP\\MSSQLSERVER01` with Windows Authentication enabled.

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/fd9b15fd-e17d-4e80-9485-5f5eb3e93b3a) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
