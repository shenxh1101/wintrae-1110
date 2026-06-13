import {
  FormSchema,
  FieldDefinition,
  FieldRule,
  ValidationError,
  ValidationResult,
  Locale,
  ValidateOptions,
  FieldValidationState,
  FieldRuleHit,
  SyncValidatorResult,
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

function isFieldRequired(field: FieldDefinition, formValues: Record<string, unknown>): boolean {
  if (typeof field.requiredWhen === 'function') {
    return field.requiredWhen(formValues);
  }
  return field.rules.some((r) => r.type === 'required');
}

function resolveRuleMessage(
  rule: FieldRule,
  field: FieldDefinition,
  locale: Locale,
  customMessage?: string,
): string {
  if (customMessage) return customMessage;
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
    case 'async':
      return tpl.async(field.label);
    default:
      return tpl.custom(field.label);
  }
}

function runSyncRule(
  rule: FieldRule,
  value: unknown,
  formValues: Record<string, unknown>,
): SyncValidatorResult {
  if (rule.type === 'required') {
    return !isEmpty(value);
  }

  if (rule.type === 'conditionalDisplay') {
    if (rule.validator) {
      return rule.validator(value, formValues) as SyncValidatorResult;
    }
    return true;
  }

  if (isEmpty(value)) {
    return true;
  }

  if (rule.validator) {
    return rule.validator(value, formValues) as SyncValidatorResult;
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

async function runAsyncRule(
  rule: FieldRule,
  value: unknown,
  formValues: Record<string, unknown>,
): Promise<SyncValidatorResult> {
  if (rule.asyncValidator) {
    return await rule.asyncValidator(value, formValues);
  }
  if (rule.validator) {
    const result = rule.validator(value, formValues);
    if (result instanceof Promise) {
      return await result;
    }
    return result;
  }
  return true;
}

function isAsyncRule(rule: FieldRule): boolean {
  if (rule.type === 'async') return true;
  if (rule.asyncValidator) return true;
  return false;
}

function shouldSkipRule(rule: FieldRule, formValues: Record<string, unknown>): boolean {
  if (rule.condition && !rule.condition(formValues)) {
    return true;
  }
  return false;
}

function createEmptyFieldState(field: FieldDefinition, visible: boolean, cleanedValue: unknown): FieldValidationState {
  return {
    field: field.name,
    label: field.label,
    visible,
    skipped: !visible,
    errors: [],
    ruleHits: [],
    cleanedValue,
    step: field.step,
  };
}

export async function validate(
  schema: FormSchema,
  values: Record<string, unknown>,
  options: ValidateOptions = {},
): Promise<ValidationResult> {
  const { locale = 'zh-CN', step, fields, sanitize = true, skipAsync = false } = options;

  const sanitizedValues = sanitize
    ? sanitizeFormValues(values, schema)
    : { ...values };

  const fieldStates: Record<string, FieldValidationState> = {};
  const visibleFields: string[] = [];
  const skippedFields: string[] = [];
  const errors: ValidationError[] = [];

  for (const field of schema.fields) {
    if (step !== undefined && field.step !== undefined && field.step !== step) {
      continue;
    }

    if (fields && !fields.includes(field.name)) {
      continue;
    }

    const visible = isFieldVisible(field, sanitizedValues);
    const value = sanitizedValues[field.name];
    const state = createEmptyFieldState(field, visible, value);

    if (!visible) {
      skippedFields.push(field.name);
      fieldStates[field.name] = state;
      continue;
    }

    visibleFields.push(field.name);

    const hasRequiredWhen = typeof field.requiredWhen === 'function';
    const requiredWhenActive = hasRequiredWhen && field.requiredWhen!(sanitizedValues);

    for (let i = 0; i < field.rules.length; i++) {
      const rule = field.rules[i];

      if (shouldSkipRule(rule, sanitizedValues)) {
        state.ruleHits.push({
          ruleIndex: i,
          ruleType: rule.type,
          passed: true,
        });
        continue;
      }

      if (skipAsync && isAsyncRule(rule)) {
        state.ruleHits.push({
          ruleIndex: i,
          ruleType: rule.type,
          passed: true,
          async: true,
        });
        continue;
      }

      let ruleResult: SyncValidatorResult;

      if (isAsyncRule(rule)) {
        ruleResult = await runAsyncRule(rule, value, sanitizedValues);
      } else {
        ruleResult = runSyncRule(rule, value, sanitizedValues);
      }

      const passed = ruleResult === true;
      const errorMessage = typeof ruleResult === 'string' ? ruleResult : undefined;

      const hit: FieldRuleHit = {
        ruleIndex: i,
        ruleType: rule.type,
        passed,
        async: isAsyncRule(rule),
      };

      if (!passed) {
        const message = resolveRuleMessage(rule, field, locale, errorMessage);
        hit.message = message;

        const err: ValidationError = {
          field: field.name,
          label: field.label,
          ruleType: rule.type,
          message,
          step: field.step,
          async: isAsyncRule(rule),
        };
        state.errors.push(err);
        errors.push(err);
      }

      state.ruleHits.push(hit);
    }

    if (hasRequiredWhen && requiredWhenActive && !field.rules.some((r) => r.type === 'required')) {
      const isEmptyValue = isEmpty(value);
      const hit: FieldRuleHit = {
        ruleIndex: -1,
        ruleType: 'required',
        passed: !isEmptyValue,
      };

      if (isEmptyValue) {
        const tpl = getMessageTemplate(locale);
        const message = tpl.required(field.label);
        hit.message = message;

        const err: ValidationError = {
          field: field.name,
          label: field.label,
          ruleType: 'required',
          message,
          step: field.step,
        };
        state.errors.unshift(err);
        errors.unshift(err);
      }

      state.ruleHits.unshift(hit);
    }

    fieldStates[field.name] = state;
  }

  const errorsByStep: Record<number, ValidationError[]> = {};
  for (const err of errors) {
    const s = err.step ?? 0;
    if (!errorsByStep[s]) errorsByStep[s] = [];
    errorsByStep[s].push(err);
  }

  const firstError = errors.length > 0 ? errors[0] : null;
  const firstErrorStep = firstError ? (firstError.step ?? 0) : null;

  const submitValues: Record<string, unknown> = {};
  for (const name of visibleFields) {
    if (name in sanitizedValues) {
      submitValues[name] = sanitizedValues[name];
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    errorsByStep,
    firstError,
    firstErrorStep,
    sanitizedValues,
    skippedFields,
    visibleFields,
    fieldStates,
    submitValues,
  };
}

export async function validateStep(
  schema: FormSchema,
  values: Record<string, unknown>,
  step: number,
  options: Omit<ValidateOptions, 'step'> = {},
): Promise<ValidationResult> {
  return validate(schema, values, { ...options, step });
}

export async function validateField(
  schema: FormSchema,
  values: Record<string, unknown>,
  fieldName: string,
  options: Omit<ValidateOptions, 'fields'> = {},
): Promise<ValidationError | null> {
  const result = await validate(schema, values, { ...options, fields: [fieldName] });
  return result.errors.length > 0 ? result.errors[0] : null;
}

export function validateSync(
  schema: FormSchema,
  values: Record<string, unknown>,
  options: Omit<ValidateOptions, 'skipAsync'> = {},
): ValidationResult {
  let result: ValidationResult | null = null;
  validate(schema, values, { ...options, skipAsync: true }).then((r) => {
    result = r;
  });
  if (result) return result;

  const { locale = 'zh-CN', step, fields, sanitize = true } = options;

  const sanitizedValues = sanitize
    ? sanitizeFormValues(values, schema)
    : { ...values };

  const fieldStates: Record<string, FieldValidationState> = {};
  const visibleFields: string[] = [];
  const skippedFields: string[] = [];
  const errors: ValidationError[] = [];

  for (const field of schema.fields) {
    if (step !== undefined && field.step !== undefined && field.step !== step) {
      continue;
    }

    if (fields && !fields.includes(field.name)) {
      continue;
    }

    const visible = isFieldVisible(field, sanitizedValues);
    const value = sanitizedValues[field.name];
    const state = createEmptyFieldState(field, visible, value);

    if (!visible) {
      skippedFields.push(field.name);
      fieldStates[field.name] = state;
      continue;
    }

    visibleFields.push(field.name);

    const hasRequiredWhen = typeof field.requiredWhen === 'function';
    const requiredWhenActive = hasRequiredWhen && field.requiredWhen!(sanitizedValues);

    for (let i = 0; i < field.rules.length; i++) {
      const rule = field.rules[i];

      if (shouldSkipRule(rule, sanitizedValues)) {
        state.ruleHits.push({
          ruleIndex: i,
          ruleType: rule.type,
          passed: true,
        });
        continue;
      }

      if (isAsyncRule(rule)) {
        state.ruleHits.push({
          ruleIndex: i,
          ruleType: rule.type,
          passed: true,
          async: true,
        });
        continue;
      }

      const ruleResult = runSyncRule(rule, value, sanitizedValues);
      const passed = ruleResult === true;
      const errorMessage = typeof ruleResult === 'string' ? ruleResult : undefined;

      const hit: FieldRuleHit = {
        ruleIndex: i,
        ruleType: rule.type,
        passed,
      };

      if (!passed) {
        const message = resolveRuleMessage(rule, field, locale, errorMessage);
        hit.message = message;

        const err: ValidationError = {
          field: field.name,
          label: field.label,
          ruleType: rule.type,
          message,
          step: field.step,
        };
        state.errors.push(err);
        errors.push(err);
      }

      state.ruleHits.push(hit);
    }

    if (hasRequiredWhen && requiredWhenActive && !field.rules.some((r) => r.type === 'required')) {
      const isEmptyValue = isEmpty(value);
      const hit: FieldRuleHit = {
        ruleIndex: -1,
        ruleType: 'required',
        passed: !isEmptyValue,
      };

      if (isEmptyValue) {
        const tpl = getMessageTemplate(locale);
        const message = tpl.required(field.label);
        hit.message = message;

        const err: ValidationError = {
          field: field.name,
          label: field.label,
          ruleType: 'required',
          message,
          step: field.step,
        };
        state.errors.unshift(err);
        errors.unshift(err);
      }

      state.ruleHits.unshift(hit);
    }

    fieldStates[field.name] = state;
  }

  const errorsByStep: Record<number, ValidationError[]> = {};
  for (const err of errors) {
    const s = err.step ?? 0;
    if (!errorsByStep[s]) errorsByStep[s] = [];
    errorsByStep[s].push(err);
  }

  const firstError = errors.length > 0 ? errors[0] : null;
  const firstErrorStep = firstError ? (firstError.step ?? 0) : null;

  const submitValues: Record<string, unknown> = {};
  for (const name of visibleFields) {
    if (name in sanitizedValues) {
      submitValues[name] = sanitizedValues[name];
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    errorsByStep,
    firstError,
    firstErrorStep,
    sanitizedValues,
    skippedFields,
    visibleFields,
    fieldStates,
    submitValues,
  };
}

export function validateStepSync(
  schema: FormSchema,
  values: Record<string, unknown>,
  step: number,
  options: Omit<ValidateOptions, 'step' | 'skipAsync'> = {},
): ValidationResult {
  return validateSync(schema, values, { ...options, step });
}

export function validateFieldSync(
  schema: FormSchema,
  values: Record<string, unknown>,
  fieldName: string,
  options: Omit<ValidateOptions, 'fields' | 'skipAsync'> = {},
): ValidationError | null {
  const result = validateSync(schema, values, { ...options, fields: [fieldName] });
  return result.errors.length > 0 ? result.errors[0] : null;
}
