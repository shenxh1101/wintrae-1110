import {
  FormSchema,
  FieldDefinition,
  FieldRule,
  ValidationError,
  ValidationResult,
  Locale,
} from './types';
import { getMessageTemplate } from './messages';
import { formatNames } from './presets';
import { sanitizeFormValues } from './sanitizer';

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function isFieldVisible(field: FieldDefinition, formValues: Record<string, unknown>): boolean {
  if (typeof field.visible === 'function') {
    return field.visible(formValues);
  }
  return true;
}

function resolveRuleMessage(
  rule: FieldRule,
  field: FieldDefinition,
  locale: Locale,
): string {
  if (rule.message) return rule.message;

  const tpl = getMessageTemplate(locale);

  switch (rule.type) {
    case 'required':
      return tpl.required(field.label);
    case 'minLength':
      return tpl.minLength(field.label, rule.value as number);
    case 'maxLength':
      return tpl.maxLength(field.label, rule.value as number);
    case 'min':
      return tpl.min(field.label, rule.value as number);
    case 'max':
      return tpl.max(field.label, rule.value as number);
    case 'pattern':
      return tpl.pattern(field.label);
    case 'format': {
      const formatName = typeof rule.value === 'string' ? (formatNames[rule.value] || rule.value) : '格式';
      return tpl.format(field.label, formatName);
    }
    case 'range': {
      const rangeVal = rule.value as { min: number; max: number };
      return tpl.range(field.label, rangeVal.min, rangeVal.max);
    }
    case 'crossField':
      return tpl.crossField(field.label, rule.compareField || '', rule.operator || 'eq');
    case 'conditionalDisplay':
      return tpl.conditionalDisplay(field.label);
    case 'custom':
      return tpl.custom(field.label);
    default:
      return tpl.custom(field.label);
  }
}

function validateRule(
  rule: FieldRule,
  value: unknown,
  formValues: Record<string, unknown>,
): boolean {
  if (rule.type === 'required') {
    return !isEmpty(value);
  }

  if (rule.type === 'conditionalDisplay') {
    if (rule.validator) {
      return rule.validator(value, formValues) === true;
    }
    return true;
  }

  if (isEmpty(value)) {
    return true;
  }

  if (rule.validator) {
    const result = rule.validator(value, formValues);
    return result === true;
  }

  switch (rule.type) {
    case 'minLength':
      return typeof value === 'string' && value.length >= (rule.value as number);
    case 'maxLength':
      return typeof value === 'string' && value.length <= (rule.value as number);
    case 'min': {
      const num = Number(value);
      return !isNaN(num) && num >= (rule.value as number);
    }
    case 'max': {
      const num = Number(value);
      return !isNaN(num) && num <= (rule.value as number);
    }
    case 'pattern':
      return typeof rule.value === 'string' && new RegExp(rule.value).test(String(value));
    default:
      return true;
  }
}

export interface ValidateOptions {
  locale?: Locale;
  step?: number;
  fields?: string[];
  sanitize?: boolean;
}

export function validate(
  schema: FormSchema,
  values: Record<string, unknown>,
  options: ValidateOptions = {},
): ValidationResult {
  const { locale = 'zh-CN', step, fields, sanitize = true } = options;

  let formValues = values;
  if (sanitize) {
    formValues = sanitizeFormValues(values, schema);
  }

  const errors: ValidationError[] = [];

  for (const field of schema.fields) {
    if (step !== undefined && field.step !== undefined && field.step !== step) {
      continue;
    }

    if (fields && !fields.includes(field.name)) {
      continue;
    }

    if (!isFieldVisible(field, formValues)) {
      continue;
    }

    const value = formValues[field.name];

    for (const rule of field.rules) {
      const passed = validateRule(rule, value, formValues);
      if (!passed) {
        errors.push({
          field: field.name,
          label: field.label,
          ruleType: rule.type,
          message: resolveRuleMessage(rule, field, locale),
          step: field.step,
        });
      }
    }
  }

  const errorsByStep: Record<number, ValidationError[]> = {};
  for (const err of errors) {
    const s = err.step ?? 0;
    if (!errorsByStep[s]) errorsByStep[s] = [];
    errorsByStep[s].push(err);
  }

  const firstError = errors.length > 0 ? errors[0] : null;
  const firstErrorStep = firstError ? (firstError.step ?? 0) : null;

  return {
    valid: errors.length === 0,
    errors,
    errorsByStep,
    firstError,
    firstErrorStep,
  };
}

export function validateStep(
  schema: FormSchema,
  values: Record<string, unknown>,
  step: number,
  options: Omit<ValidateOptions, 'step'> = {},
): ValidationResult {
  return validate(schema, values, { ...options, step });
}

export function validateField(
  schema: FormSchema,
  values: Record<string, unknown>,
  fieldName: string,
  options: Omit<ValidateOptions, 'fields'> = {},
): ValidationError | null {
  const result = validate(schema, values, { ...options, fields: [fieldName] });
  return result.errors.length > 0 ? result.errors[0] : null;
}
