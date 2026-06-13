import { SanitizeOptions, FieldDefinition, FormSchema } from './types';

function sanitizeValue(value: unknown, options: SanitizeOptions): unknown {
  if (value === undefined || value === null) return value;

  if (options.custom) {
    value = options.custom(value);
  }

  let strValue: string | undefined;
  if (typeof value === 'string') {
    strValue = value;
  }

  if (strValue !== undefined) {
    if (options.removeSpaces) {
      strValue = strValue.replace(/\s+/g, '');
    } else if (options.trimAll) {
      strValue = strValue.replace(/\s+/g, ' ').trim();
    } else if (options.trim) {
      strValue = strValue.trim();
    }

    if (options.toUpperCase) {
      strValue = strValue.toUpperCase();
    }
    if (options.toLowerCase) {
      strValue = strValue.toLowerCase();
    }

    if (options.formatNumber) {
      const num = parseFloat(strValue);
      if (!isNaN(num) && isFinite(num)) {
        strValue = String(num);
      }
    }

    return strValue;
  }

  return value;
}

export function sanitizeField(
  value: unknown,
  field: FieldDefinition,
  globalSanitize?: SanitizeOptions,
): unknown {
  const merged: SanitizeOptions = {
    ...globalSanitize,
    ...field.sanitize,
  };

  if (!Object.keys(merged).some((k) => k !== 'custom' && merged[k as keyof SanitizeOptions])) {
    if (!merged.custom) return value;
  }

  return sanitizeValue(value, merged);
}

export function sanitizeFormValues(
  values: Record<string, unknown>,
  schema: FormSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...values };

  for (const field of schema.fields) {
    if (field.name in result) {
      result[field.name] = sanitizeField(result[field.name], field, schema.globalSanitize);
    }
  }

  return result;
}
