import supabase from '../supabase';

/**
 * Shared utility functions for tools.
 */

/**
 * Fetches the first organization the user belongs to.
 */
export async function getUserOrganization(userId: string): Promise<string | null> {
    if (!supabase) return null;
    const { data, error } = await (supabase as any)
        .from('profiles')
        .select('organization_id')
        .eq('id', userId)
        .limit(1)
        .single();
    if (error) {
        console.error('[Utils] Error fetching user organization:', error.message);
        return null;
    }
    return data ? data.organization_id : null;
}

/**
 * Standardizes dates for TTS (e.g., "2024-04-08" -> "April 8").
 * Supports relative terms (Today, Yesterday, X days ago) for the last week.
 */
export function formatDate(rawDate: any): any {
    if (!rawDate || typeof rawDate !== 'string')
        return rawDate;
    // Basic ISO/YYYY-MM-DD check to avoid trying to format everything
    if (!/^\d{4}-\d{2}-\d{2}/.test(rawDate))
        return rawDate;
    const date = new Date(rawDate);
    if (isNaN(date.getTime()))
        return rawDate;
    const now = new Date();
    // Set times to midnight to calculate pure day difference
    const dateMidnight = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = (nowMidnight as any) - (dateMidnight as any);
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0)
        return "Today";
    if (diffDays === 1)
        return "Yesterday";
    if (diffDays > 1 && diffDays <= 7)
        return `${diffDays} days ago`;
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const month = months[date.getUTCMonth()];
    const day = date.getUTCDate();
    return `${month} ${day}`;
}

/**
 * Recursively scans an object or array and formats any date-like strings.
 */
export function formatAllDates(obj: any): any {
    if (!obj || typeof obj !== 'object')
        return obj;
    if (Array.isArray(obj)) {
        return obj.map(item => formatAllDates(item));
    }
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = formatDate(value);
      }
      else if (value && typeof value === 'object') {
        result[key] = formatAllDates(value);
      }
      else {
        result[key] = value;
      }
    }
    return result;
}

/**
 * Removes keys with null, undefined, or empty string values from an object.
 * Handles arrays of objects recursively. Preserves 0 and false.
 */
export function stripNulls(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(item => stripNulls(item));
    }
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined && value !== '') {
            result[key] = value;
        }
    }
    return result;
}

/**
 * Parses a healthremarks HTML div into a structured object.
 * Example: "<div class='healthremarks' bWeight='True' bMastitis='False' bPlanned='True'></div>"
 * Returns: { weight_issue: true, mastitis: false, planned_treatment: true }
 */
export function parseHealthRemark(html: any): { weight_issue: boolean; mastitis: boolean; planned_treatment: boolean } | null {
    if (!html || typeof html !== 'string') return null;
    if (!html.includes('healthremarks')) return null;

    const extract = (attr: string): boolean => {
        const match = html.match(new RegExp(`${attr}='(True|False)'`, 'i'));
        return match ? match[1].toLowerCase() === 'true' : false;
    };

    return {
        weight_issue: extract('bWeight'),
        mastitis: extract('bMastitis'),
        planned_treatment: extract('bPlanned')
    };
}

/**
 * Recursively strips HTML tags from all string values in an object/array.
 * Special-cases healthremarks divs by parsing them into structured data.
 */
export function stripHtmlFromValues(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(item => stripHtmlFromValues(item));
    }
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && value.includes('<')) {
            // Special case: healthremarks div → structured object
            const parsed = parseHealthRemark(value);
            if (parsed) {
                result[key] = parsed;
            } else {
                // Generic: strip all HTML tags
                result[key] = value.replace(/<[^>]*>/g, '').trim();
            }
        } else if (value && typeof value === 'object') {
            result[key] = stripHtmlFromValues(value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

/**
 * Wraps tool result data in a metadata envelope so the AI has context
 * about the total count, report name, and generation time.
 */
export function buildReportEnvelope(reportName: string, data: any): { report: string; total_cows: number; generated_at: string; data: any } {
    const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
    return {
        report: reportName,
        total_cows: count,
        generated_at: formatDate(new Date().toISOString()),
        data
    };
}

/** Internal/system fields that should be stripped from tool responses. */
const INTERNAL_FIELDS = new Set(['id', 'organization_id', 'updated_at']);

/**
 * Removes internal/system fields from tool results.
 * Use after select('*') to strip fields the AI doesn't need.
 */
export function omitFields(obj: any, fields: Set<string> = INTERNAL_FIELDS): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(item => omitFields(item, fields));
    }
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (!fields.has(key)) {
            result[key] = value;
        }
    }
    return result;
}

/**
 * Picks only the specified fields from an object.
 * Use for report tools that need focused output from select('*') results.
 */
export function pickFields(obj: any, fields: string[]): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(item => pickFields(item, fields));
    }
    const fieldSet = new Set(fields);
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (fieldSet.has(key)) {
            result[key] = value;
        }
    }
    return result;
}

export default {
    getUserOrganization,
    formatDate,
    formatAllDates,
    stripNulls,
    parseHealthRemark,
    stripHtmlFromValues,
    buildReportEnvelope,
    omitFields,
    pickFields
};

