-- ============================================================================
-- Daily Stock Snapshot Job Setup
-- ============================================================================
-- This script creates a stored procedure and SQL Server Agent job to
-- capture daily opening stock quantities for all products every morning.
-- 
-- The job runs daily at 6:00 AM (Lebanon timezone - Asia/Beirut) and:
-- 1. Takes yesterday's ending stock quantity for each product
-- 2. Inserts a NEW record for TODAY's date with that quantity as opening stock
-- 3. Leaves all old records intact (does not update existing records)
-- 
-- NOTE: This procedure uses Lebanon timezone (GMT+2/GMT+3 with DST).
-- For SQL Server 2016+, AT TIME ZONE is used. For older versions,
-- the server timezone should be set to Lebanon timezone, or use
-- GETUTCDATE() with manual offset calculation.
-- ============================================================================

USE [YourDatabaseName]  -- Replace with your actual database name
GO

-- ============================================================================
-- Create Stored Procedure: sp_DailyStockSnapshot
-- ============================================================================
-- This procedure captures yesterday's ending stock quantity and average cost
-- for each product and inserts a NEW record for TODAY's date with that quantity
-- as the opening stock. Old records are left intact.
-- ============================================================================

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.sp_DailyStockSnapshot') AND type = N'P')
    DROP PROCEDURE dbo.sp_DailyStockSnapshot
GO

CREATE PROCEDURE sp_DailyStockSnapshot
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Get current date/time in Lebanon timezone (Asia/Beirut)
    -- Lebanon is GMT+2 in winter (EET) and GMT+3 in summer (EEST with DST)
    -- 
    -- IMPORTANT: SQL Server timezone functions have limitations.
    -- The best approach is to:
    -- 1. Set SQL Server's system timezone to Lebanon (Asia/Beirut) if possible, OR
    -- 2. Use GETUTCDATE() and manually calculate Lebanon offset (UTC+2 or UTC+3 with DST)
    -- 3. For SQL Server 2016+, AT TIME ZONE can be used but requires Windows timezone ID
    --
    -- This implementation uses UTC+3 as default (summer time). 
    -- Adjust based on DST or use server timezone setting.
    -- For accurate DST handling, consider using a UDF or setting server timezone.
    
    DECLARE @LebanonNow DATETIME2;
    DECLARE @Yesterday DATE;
    DECLARE @Today DATE;
    DECLARE @Now DATETIME2;
    DECLARE @SuccessCount INT = 0;
    DECLARE @SkippedCount INT = 0;
    
    -- Calculate Lebanon time from UTC
    -- Lebanon is UTC+2 in winter (EET), UTC+3 in summer (EEST)
    -- Default to UTC+3 (summer time). For winter, change to DATEADD(HOUR, 2, GETUTCDATE())
    -- For automatic DST handling, consider setting SQL Server system timezone to Lebanon
    SET @LebanonNow = DATEADD(HOUR, 3, GETUTCDATE());
    
    -- Alternative for SQL Server 2016+ (if Windows timezone is configured correctly):
    -- SET @LebanonNow = CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Arab Standard Time' AS DATETIME2);
    -- Note: Timezone names vary; verify with: SELECT * FROM sys.time_zone_info;
    
    SET @Yesterday = CAST(DATEADD(DAY, -1, @LebanonNow) AS DATE);
    SET @Today = CAST(@LebanonNow AS DATE);
    SET @Now = @LebanonNow;
    
    BEGIN TRY
        BEGIN TRANSACTION;
        
        -- Get all products
        DECLARE @ProductId INT;
        DECLARE @YesterdayEndingQty INT;
        DECLARE @YesterdayAvgCost DECIMAL(18,2);
        DECLARE @TodayRecordExists INT;
        
        DECLARE product_cursor CURSOR FOR
        SELECT id FROM products;
        
        OPEN product_cursor;
        FETCH NEXT FROM product_cursor INTO @ProductId;
        
        WHILE @@FETCH_STATUS = 0
        BEGIN
            -- Get yesterday's ending quantity and average cost for this product
            -- Priority: 1) Yesterday's entry (if exists), 2) Latest entry before yesterday
            -- This captures the ending quantity from yesterday or the most recent available
            SELECT TOP 1 
                @YesterdayEndingQty = available_qty,
                @YesterdayAvgCost = avg_cost
            FROM daily_stock
            WHERE product_id = @ProductId
            AND date <= @Yesterday
            ORDER BY 
                CASE WHEN date = @Yesterday THEN 0 ELSE 1 END,  -- Prioritize yesterday's date
                date DESC, 
                updated_at DESC;
            
            -- If no record exists, default to 0 (new product with no stock history)
            IF @YesterdayEndingQty IS NULL
            BEGIN
                SET @YesterdayEndingQty = 0;
                SET @YesterdayAvgCost = 0;
            END;
            
            -- Check if a record already exists for today's date
            SELECT @TodayRecordExists = COUNT(*)
            FROM daily_stock
            WHERE product_id = @ProductId
            AND date = @Today;
            
            IF @TodayRecordExists = 0
            BEGIN
                -- Insert NEW record for today's date with yesterday's ending quantity as opening stock
                -- This creates a new line without modifying any existing records
                INSERT INTO daily_stock 
                (product_id, available_qty, avg_cost, date, created_at, updated_at)
                VALUES 
                (@ProductId, @YesterdayEndingQty, @YesterdayAvgCost, @Today, @Now, @Now);
                
                SET @SuccessCount = @SuccessCount + 1;
            END
            ELSE
            BEGIN
                -- Record already exists for today, skip insertion (leave existing record intact)
                SET @SkippedCount = @SkippedCount + 1;
            END
            
            FETCH NEXT FROM product_cursor INTO @ProductId;
        END
        
        CLOSE product_cursor;
        DEALLOCATE product_cursor;
        
        COMMIT TRANSACTION;
        
        -- Log success
        PRINT 'Daily stock snapshot completed successfully.';
        PRINT 'Products processed: ' + CAST(@SuccessCount AS VARCHAR(10));
        PRINT 'Products skipped (record exists): ' + CAST(@SkippedCount AS VARCHAR(10));
        PRINT 'Opening stock date: ' + CAST(@Today AS VARCHAR(10));
        PRINT 'Based on yesterday ending quantity: ' + CAST(@Yesterday AS VARCHAR(10));
        
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();
        
        PRINT 'Error occurred: ' + @ErrorMessage;
        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
        
        -- Log error (optional: insert into error log table if you have one)
        -- INSERT INTO error_log (error_message, error_date) VALUES (@ErrorMessage, GETDATE());
    END CATCH
    
    SET NOCOUNT OFF;
END
GO

-- Grant execute permission to SQL Agent service account
-- Adjust as needed for your environment
GRANT EXECUTE ON sp_DailyStockSnapshot TO [SQLAgentServiceAccount]  -- Replace with actual service account
GO

-- ============================================================================
-- Test the stored procedure manually
-- ============================================================================
-- Uncomment the line below to test the procedure:
-- EXEC sp_DailyStockSnapshot;
-- GO

-- ============================================================================
-- SQL Server Agent Job Setup (Run this in SQL Server Management Studio)
-- ============================================================================
-- Follow these steps to create the SQL Server Agent job:
--
-- 1. Open SQL Server Management Studio (SSMS)
-- 2. Connect to your SQL Server instance
-- 3. Expand SQL Server Agent (make sure it's running)
-- 4. Right-click on "Jobs" and select "New Job..."
-- 5. In the "General" page:
--    - Name: Daily Stock Snapshot Job
--    - Description: Creates daily opening stock records based on yesterday's ending quantity
--    - Owner: Your SQL Server login
--    - Category: Database Maintenance (or create a custom category)
--
-- 6. Go to "Steps" page and click "New..."
--    - Step name: Run Daily Stock Snapshot
--    - Type: Transact-SQL script (T-SQL)
--    - Database: [YourDatabaseName]
--    - Command: EXEC sp_DailyStockSnapshot;
--    - Click "OK"
--
-- 7. Go to "Schedules" page and click "New..."
--    - Name: Daily at 6:00 AM
--    - Schedule type: Recurring
--    - Frequency: Daily
--    - Daily frequency: Occurs once at 6:00:00 AM
--    - Duration: No end date (or set end date if needed)
--    - Click "OK"
--
-- 8. Go to "Notifications" page (optional):
--    - Configure email notifications if you want to be notified of job status
--
-- 9. Click "OK" to create the job
--
-- 10. To enable the job, right-click on it and select "Enable"
--
-- ============================================================================
-- Alternative: Create job using T-SQL (run this after creating the procedure)
-- ============================================================================
/*
USE msdb
GO

-- Create the job
EXEC sp_add_job 
    @job_name = N'Daily Stock Snapshot Job',
    @enabled = 1,
    @description = N'Creates daily opening stock records based on yesterday''s ending quantity every morning at 6:00 AM';

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
*/
-- ============================================================================
