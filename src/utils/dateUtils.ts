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
 */
export function formatDateTimeLebanon(date: Date | string, formatStr: string): string {
  let d: Date;
  
  if (typeof date === 'string') {
    // If the string doesn't have timezone info, treat it as UTC and convert to Lebanon time
    // PostgreSQL timestamps are typically in UTC
    if (date.includes('T') && !date.includes('+') && !date.includes('Z') && !date.includes('-', date.indexOf('T') + 1)) {
      // ISO string without timezone - treat as UTC
      d = new Date(date + 'Z');
    } else {
      d = new Date(date);
    }
  } else {
    d = date;
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
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0');
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
  
  // Create a date object with Lebanon time components (local timezone)
  // This allows date-fns to format it correctly
  const lebanonDate = new Date(year, month - 1, day, hour, minute, second);
  
  // Use date-fns format with the Lebanon-adjusted date
  return format(lebanonDate, formatStr);
}

