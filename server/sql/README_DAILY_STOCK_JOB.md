# Daily Stock Snapshot Job Setup Guide

This guide explains how to set up an automated SQL Server Agent job that creates daily opening stock records for all products every morning based on yesterday's ending quantities.

## Overview

The job runs every morning (recommended: 6:00 AM) and:
- Takes yesterday's ending stock quantity (`available_qty`) and average cost (`avg_cost`) for each product
- Inserts a **NEW** record for **TODAY's date** with yesterday's ending quantity as the opening stock
- Leaves all old records intact (does not update or modify existing records)
- Ensures you have a complete daily snapshot history for tracking inventory trends

## Prerequisites

1. SQL Server with SQL Server Agent enabled and running
2. SQL Server Management Studio (SSMS) installed
3. Database with `products` and `daily_stock` tables already created
4. Appropriate permissions to create stored procedures and SQL Agent jobs

## Setup Instructions

### Step 1: Create the Stored Procedure

1. Open SQL Server Management Studio (SSMS)
2. Connect to your SQL Server instance
3. Open the file `server/sql/daily_stock_snapshot_job.sql`
4. **Important**: Replace `[YourDatabaseName]` with your actual database name (e.g., `InventorySystem`)
5. Replace `[SQLAgentServiceAccount]` with your SQL Agent service account (or remove the GRANT statement if not needed)
6. Execute the script to create the stored procedure `sp_DailyStockSnapshot`

### Step 2: Test the Stored Procedure

Before setting up the job, test the procedure manually:

```sql
USE [YourDatabaseName]
GO
EXEC sp_DailyStockSnapshot;
GO
```

Check the `daily_stock` table to verify records were created/updated for yesterday's date.

### Step 3: Create SQL Server Agent Job (Using SSMS GUI)

1. In SSMS, expand **SQL Server Agent**
2. Right-click on **Jobs** and select **New Job...**
3. **General Tab:**
   - **Name**: `Daily Stock Snapshot Job`
   - **Description**: `Captures daily ending stock quantities every morning`
   - **Owner**: Your SQL Server login
   - **Category**: `Database Maintenance` (or create a custom category)
   - **Enabled**: ✓ (checked)

4. **Steps Tab:**
   - Click **New...**
   - **Step name**: `Run Daily Stock Snapshot`
   - **Type**: `Transact-SQL script (T-SQL)`
   - **Database**: Select your database name
   - **Command**: 
     ```sql
     EXEC sp_DailyStockSnapshot;
     ```
   - Click **Advanced** tab:
     - **On success action**: `Go to next step`
     - **On failure action**: `Quit the job reporting failure`
   - Click **OK**

5. **Schedules Tab:**
   - Click **New...**
   - **Name**: `Daily at 6:00 AM`
   - **Schedule type**: `Recurring`
   - **Frequency:**
     - **Occurs**: `Daily`
     - **Recurs every**: `1 day(s)`
   - **Daily frequency:**
     - **Occurs once at**: `6:00:00 AM`
   - **Duration:**
     - **Start date**: Today's date
     - **End date**: `No end date` (or set a specific end date)
   - Click **OK**

6. **Notifications Tab** (Optional):
   - Configure email notifications if you want alerts on job success/failure
   - Select **Write to the Windows Application event log** for logging

7. Click **OK** to create the job

### Step 4: Enable and Test the Job

1. The job should be enabled by default (check the checkbox in General tab)
2. To test immediately:
   - Right-click on the job in SSMS
   - Select **Start Job at Step...**
   - Verify it completes successfully
   - Check the `daily_stock` table for new records

### Alternative: Create Job Using T-SQL

If you prefer to create the job using T-SQL, uncomment and modify the code at the bottom of `daily_stock_snapshot_job.sql`:

```sql
USE msdb
GO

-- Create the job
EXEC sp_add_job 
    @job_name = N'Daily Stock Snapshot Job',
    @enabled = 1,
    @description = N'Captures daily ending stock quantities every morning at 6:00 AM';

-- Add job step
EXEC sp_add_jobstep
    @job_name = N'Daily Stock Snapshot Job',
    @step_name = N'Run Daily Stock Snapshot',
    @subsystem = N'TSQL',
    @database_name = N'YourDatabaseName',  -- Replace with your database name
    @command = N'EXEC sp_DailyStockSnapshot;';

-- Create schedule
EXEC sp_add_schedule
    @schedule_name = N'Daily at 6:00 AM',
    @freq_type = 4,  -- Daily
    @freq_interval = 1,
    @active_start_time = 060000;  -- 6:00:00 AM

-- Attach schedule to job
EXEC sp_attach_schedule
    @job_name = N'Daily Stock Snapshot Job',
    @schedule_name = N'Daily at 6:00 AM';

-- Assign job to local server
EXEC sp_add_jobserver
    @job_name = N'Daily Stock Snapshot Job',
    @server_name = N'(local)';
GO
```

## How It Works

1. The stored procedure runs every morning at the scheduled time
2. It calculates:
   - Yesterday's date (current date - 1 day) - to get ending stock
   - Today's date - to create opening stock record
3. For each product in the `products` table:
   - Finds yesterday's ending quantity (most recent `daily_stock` entry from yesterday or before)
   - Checks if a record already exists for today's date
   - If no record exists, inserts a **NEW** record for today's date with yesterday's ending quantity as the opening stock
   - If a record already exists for today, it skips that product (leaves existing record intact)
4. All old records remain unchanged - this ensures you have a complete history without data loss
5. The new record for today serves as the opening stock, which will be updated throughout the day as invoices are processed

## Troubleshooting

### Job Fails to Run

1. **Check SQL Server Agent is running:**
   - In SSMS, right-click **SQL Server Agent** → **Start**
   - Or use Services: Start "SQL Server Agent (MSSQLSERVER)" service

2. **Check permissions:**
   - Ensure the SQL Agent service account has execute permissions on the stored procedure
   - Verify the service account has INSERT/UPDATE permissions on `daily_stock` table

3. **Check job history:**
   - Right-click the job → **View History**
   - Review error messages for details

### No Records Created

1. Verify products exist in the `products` table
2. Check if there are existing `daily_stock` records (the procedure uses the latest entry from yesterday or before)
3. Verify the date calculation is correct (today's date)

### Job Runs But Doesn't Insert Records

1. Check if records already exist for today's date (the procedure skips if a record already exists)
2. Verify the procedure has permissions to INSERT
3. Review the job history for any error messages
4. Note: The procedure will skip products that already have a record for today - this is expected behavior

## Monitoring

- **View Job History**: Right-click job → **View History**
- **Check daily_stock table for today's opening stock**:
  ```sql
  SELECT * FROM daily_stock 
  WHERE date = CAST(GETDATE() AS DATE)
  ORDER BY product_id;
  ```
  
- **Verify yesterday's ending quantity**:
  ```sql
  SELECT * FROM daily_stock 
  WHERE date = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
  ORDER BY product_id;
  ```

## Maintenance

- Periodically review job execution history
- Consider adding email notifications for failures
- Archive old `daily_stock` records if needed (keep at least 1 year of history)
- Update the schedule if business hours change

## Notes

- The job captures yesterday's ending quantity and uses it as today's opening quantity
- The procedure inserts NEW records only - it never updates existing records to preserve history
- If a record already exists for today's date, the procedure skips that product (idempotent behavior)
- Running the job multiple times on the same day will only insert records for products that don't already have a record for today
- Throughout the day, as invoices are created, the system will update today's `daily_stock` record with the current stock quantity
- This approach ensures you have both opening stock (from the job) and ending stock (from invoice processing) for each day

