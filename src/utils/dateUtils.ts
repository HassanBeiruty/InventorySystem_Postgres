/**
 * Date utilities for Lebanon timezone (Asia/Beirut)
 * Lebanon uses EET (GMT+2) in winter and EEST (GMT+3) in summer with DST
 */

import { format } from 'date-fns';

const LEBANON_TIMEZONE = 'Asia/Beirut';

/**
 * Get current date in Lebanon timezone (YYYY-MM-DD format)
 */
export function getTodayLebanon(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: LEBANON_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
}

/**
 * Format a date to Lebanon timezone date string (YYYY-MM-DD format)
 */
export function formatDateLebanon(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: LEBANON_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

/**
 * Format a date/time to a readable string in Lebanon timezone
 * Uses date-fns format string patterns (e.g., "MMM dd, yyyy", "HH:mm:ss")
 * 
 * IMPORTANT: Dates from PostgreSQL are stored in Lebanon timezone (Asia/Beirut) 
 * and returned as strings without timezone info (e.g., "2025-11-22 23:35:00").
 * The string IS the Lebanon time we want to display, so we extract and format directly.
 */
export function formatDateTimeLebanon(date: Date | string, formatStr: string): string {
  let year: number, month: number, day: number, hour: number, minute: number, second: number;
  
  if (typeof date === 'string') {
    // PostgreSQL returns timestamps in format: "2025-11-22 23:35:00" or "2025-11-22T23:35:00"
    // These are stored in Lebanon timezone, so the string IS the time we want to display
    
    // Check if it's a PostgreSQL-style timestamp (space or T separator, no timezone)
    const hasSpace = date.includes(' ');
    const hasT = date.includes('T');
    const hasTimezone = date.includes('+') || date.includes('Z') || (date.match(/[+-]\d{2}:\d{2}$/) !== null);
    
    if ((hasSpace || hasT) && !hasTimezone) {
      // PostgreSQL timestamp without timezone - extract components directly
      // The string "2025-11-22 23:35:00" means Nov 22, 2025 at 23:35 in Lebanon
      const normalized = date.replace(' ', 'T');
      const match = normalized.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
      
      if (match) {
        // Extract components - these are already in Lebanon timezone
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
        hour = parseInt(match[4]);
        minute = parseInt(match[5]);
        second = parseInt(match[6] || '0');
        
        // Create a date object with these components (treating as local time for date-fns)
        const lebanonDate = new Date(year, month - 1, day, hour, minute, second);
        return format(lebanonDate, formatStr);
      }
    }
    
    // Fallback: parse as normal date and convert to Lebanon timezone
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      console.warn('Invalid date:', date);
      return 'Invalid Date';
    }
    
    // Get date components in Lebanon timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: LEBANON_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(d);
    year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    month = parseInt(parts.find(p => p.type === 'month')?.value || '0');
    day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
  } else {
    // Date object - get components in Lebanon timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: LEBANON_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    month = parseInt(parts.find(p => p.type === 'month')?.value || '0');
    day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
  }
  
  // Create a date object with Lebanon time components (local timezone)
  // This allows date-fns to format it correctly
  const lebanonDate = new Date(year, month - 1, day, hour, minute, second);
  
  // Use date-fns format with the Lebanon-adjusted date
  return format(lebanonDate, formatStr);
}

