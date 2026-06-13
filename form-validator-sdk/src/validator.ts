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
  ValidationScenario,
  ScenarioSkippedRule,
  ServerError,
  PageState,
  PageStateOptions,
} from './types';
import { getMessageTemplate } from './messages';
import { formatNames } from './presets';
import { sanitizeFormValues } from './sanitizer';

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function resolveFieldVisibility(field: FieldDefinition, formValues: Record<string, unknown>): boolean {
  if (typeof field.when === 'function') {
    return field.when(formValues);
  }
  if (typeof field.visible === 'function') {
    return field.visible(formValues);
  }
  return true;
}

function resolveFieldRequired(field: FieldDefinition, formValues: Record<string, unknown>): boolean {
  if (typeof field.when === 'function') {
    return field.when(formValues);
  }
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
  index?: number,
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
    case 'arrayMinLength':
      return tpl.arrayMinLength(field.label, rule.value as number);
    case 'arrayMaxLength':
      return tpl.arrayMaxLength(field.label, rule.value as number);
    case 'eachItem':
      return tpl.eachItem(field.label, index ?? 0);
    default:
      return tpl.custom(field.label);
  }
}

function isRuleInScenario(
  rule: FieldRule,
  scenario: ValidationScenario,
  schemaScenarioGroups?: Record<ValidationScenario, string[]>,
): boolean {
  if (!rule.groups || rule.groups.length === 0) {
    return true;
  }

  if (schemaScenarioGroups && schemaScenarioGroups[scenario]) {
    const activeGroups = schemaScenarioGroups[scenario];
    return rule.groups.some((g) => activeGroups.includes(g));
  }

  switch (scenario) {
    case 'draft':
      return rule.groups.includes('draft');
    case 'step':
      return rule.groups.includes('step') || rule.groups.includes('submit');
    case 'submit':
      return true;
    default:
      return true;
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

  if (rule.type === 'arrayMinLength' || rule.type === 'arrayMaxLength') {
    const arr = Array.isArray(value) ? value : [];
    if (rule.type === 'arrayMinLength') {
      return arr.length >= (rule.value as number);
    }
    return arr.length <= (rule.value as number);
  }

  if (rule.type === 'eachItem') {
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

function shouldSkipRuleByCondition(rule: FieldRule, formValues: Record<string, unknown>): boolean {
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

interface ValidateInternalOptions extends ValidateOptions {
  skipAsyncInternal?: boolean;
}

async function validateInternal(
  schema: FormSchema,
  values: Record<string, unknown>,
  options: ValidateInternalOptions = {},
): Promise<ValidationResult> {
  const {
    locale = 'zh-CN',
    step,
    fields,
    sanitize = true,
    skipAsync = false,
    skipAsyncInternal = false,
    scenario = 'submit',
  } = options;

  const shouldSkipAsync = skipAsync || skipAsyncInternal;

  const sanitizedValues = sanitize
    ? sanitizeFormValues(values, schema)
    : { ...values };

  const fieldStates: Record<string, FieldValidationState> = {};
  const visibleFields: string[] = [];
  const skippedFields: string[] = [];
  const errors: ValidationError[] = [];
  const scenarioSkippedRules: ScenarioSkippedRule[] = [];

  for (const field of schema.fields) {
    if (step !== undefined && field.step !== undefined && field.step !== step) {
      continue;
    }

    if (fields && !fields.includes(field.name)) {
      continue;
    }

    const visible = resolveFieldVisibility(field, sanitizedValues);
    const value = sanitizedValues[field.name];
    const state = createEmptyFieldState(field, visible, value);

    if (!visible) {
      skippedFields.push(field.name);
      fieldStates[field.name] = state;
      continue;
    }

    visibleFields.push(field.name);

    const needsRequired = resolveFieldRequired(field, sanitizedValues);
    const hasExplicitRequired = field.rules.some((r) => r.type === 'required');

    for (let i = 0; i < field.rules.length; i++) {
      const rule = field.rules[i];

      if (shouldSkipRuleByCondition(rule, sanitizedValues)) {
        state.ruleHits.push({
          ruleIndex: i,
          ruleType: rule.type,
          passed: true,
        });
        continue;
      }

      if (!isRuleInScenario(rule, scenario, schema.scenarioGroups)) {
        const primaryGroup = rule.groups && rule.groups.length > 0 ? rule.groups[0] : '';
        scenarioSkippedRules.push({
          field: field.name,
          label: field.label,
          ruleIndex: i,
          ruleType: rule.type,
          group: primaryGroup,
        });
        state.ruleHits.push({
          ruleIndex: i,
          ruleType: rule.type,
          passed: true,
          skippedByScenario: true,
          group: primaryGroup,
        });
        continue;
      }

      if (shouldSkipAsync && isAsyncRule(rule)) {
        state.ruleHits.push({
          ruleIndex: i,
          ruleType: rule.type,
          passed: true,
          async: true,
        });
        continue;
      }

      if (rule.type === 'eachItem' && rule.itemValidator && Array.isArray(value)) {
        const arr = value as unknown[];
        let anyFailed = false;
        for (let idx = 0; idx < arr.length; idx++) {
          const itemResult = await rule.itemValidator(arr[idx], idx, sanitizedValues);
          const itemPassed = itemResult === true;
          const itemErrorMessage = typeof itemResult === 'string' ? itemResult : undefined;
          const primaryGroup = rule.groups && rule.groups.length > 0 ? rule.groups[0] : undefined;

          const hit: FieldRuleHit = {
            ruleIndex: i,
            ruleType: rule.type,
            passed: itemPassed,
            async: isAsyncRule(rule),
            group: primaryGroup,
            index: idx,
          };

          if (!itemPassed) {
            anyFailed = true;
            const message = resolveRuleMessage(rule, field, locale, itemErrorMessage, idx);
            hit.message = message;

            const err: ValidationError = {
              field: field.name,
              label: field.label,
              ruleType: rule.type,
              message,
              step: field.step,
              async: isAsyncRule(rule),
              group: primaryGroup,
              index: idx,
            };
            state.errors.push(err);
            errors.push(err);
          }

          state.ruleHits.push(hit);
        }
        if (!anyFailed) {
          state.ruleHits.push({
            ruleIndex: i,
            ruleType: rule.type,
            passed: true,
            async: isAsyncRule(rule),
            group: rule.groups && rule.groups.length > 0 ? rule.groups[0] : undefined,
          });
        }
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

      const primaryGroup = rule.groups && rule.groups.length > 0 ? rule.groups[0] : undefined;

      const hit: FieldRuleHit = {
        ruleIndex: i,
        ruleType: rule.type,
        passed,
        async: isAsyncRule(rule),
        group: primaryGroup,
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
          group: primaryGroup,
        };
        state.errors.push(err);
        errors.push(err);
      }

      state.ruleHits.push(hit);
    }

    if (needsRequired && !hasExplicitRequired) {
      const isEmptyValue = isEmpty(value);
      const primaryGroup = 'step';
      const isInScenario = isRuleInScenario(
        { type: 'required', groups: ['step', 'submit'] },
        scenario,
        schema.scenarioGroups,
      );

      if (!isInScenario) {
        scenarioSkippedRules.push({
          field: field.name,
          label: field.label,
          ruleIndex: -1,
          ruleType: 'required',
          group: 'step',
        });
        state.ruleHits.unshift({
          ruleIndex: -1,
          ruleType: 'required',
          passed: true,
          skippedByScenario: true,
          group: 'step',
        });
      } else {
        const hit: FieldRuleHit = {
          ruleIndex: -1,
          ruleType: 'required',
          passed: !isEmptyValue,
          group: primaryGroup,
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
            group: primaryGroup,
          };
          state.errors.unshift(err);
          errors.unshift(err);
        }

        state.ruleHits.unshift(hit);
      }
    }

    fieldStates[field.name] = state;
  }

  const errorsByStep: Record<number, ValidationError[]> = {};
  const errorsByField: Record<string, ValidationError[]> = {};
  const errorsByGroup: Record<string, ValidationError[]> = {};
  const errorsByScenario: Record<ValidationScenario, ValidationError[]> = {
    draft: [],
    step: [],
    submit: [],
  };

  for (const err of errors) {
    const s = err.step ?? 0;
    if (!errorsByStep[s]) errorsByStep[s] = [];
    errorsByStep[s].push(err);

    if (!errorsByField[err.field]) errorsByField[err.field] = [];
    errorsByField[err.field].push(err);

    if (err.group) {
      if (!errorsByGroup[err.group]) errorsByGroup[err.group] = [];
      errorsByGroup[err.group].push(err);
    }

    if (!err.group || err.group === 'draft') errorsByScenario.draft.push(err);
    if (!err.group || err.group === 'step' || err.group === 'draft') errorsByScenario.step.push(err);
    errorsByScenario.submit.push(err);
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
    scenarioSkippedRules,
    scenario,
    errorsByField,
    errorsByGroup,
    errorsByScenario,
  };
}

export async function validate(
  schema: FormSchema,
  values: Record<string, unknown>,
  options: ValidateOptions = {},
): Promise<ValidationResult> {
  return validateInternal(schema, values, options);
}

export async function validateStep(
  schema: FormSchema,
  values: Record<string, unknown>,
  step: number,
  options: Omit<ValidateOptions, 'step'> = {},
): Promise<ValidationResult> {
  return validateInternal(schema, values, { ...options, step });
}

export async function validateField(
  schema: FormSchema,
  values: Record<string, unknown>,
  fieldName: string,
  options: Omit<ValidateOptions, 'fields'> = {},
): Promise<ValidationError | null> {
  const result = await validateInternal(schema, values, { ...options, fields: [fieldName] });
  return result.errors.length > 0 ? result.errors[0] : null;
}

function buildSyncResult(
  schema: FormSchema,
  values: Record<string, unknown>,
  options: Omit<ValidateOptions, 'skipAsync'> & { skipAsyncInternal?: boolean },
): ValidationResult {
  const {
    locale = 'zh-CN',
    step,
    fields,
    sanitize = true,
    scenario = 'submit',
  } = options;

  const sanitizedValues = sanitize
    ? sanitizeFormValues(values, schema)
    : { ...values };

  const fieldStates: Record<string, FieldValidationState> = {};
  const visibleFields: string[] = [];
  const skippedFields: string[] = [];
  const errors: ValidationError[] = [];
  const scenarioSkippedRules: ScenarioSkippedRule[] = [];

  for (const field of schema.fields) {
    if (step !== undefined && field.step !== undefined && field.step !== step) {
      continue;
    }

    if (fields && !fields.includes(field.name)) {
      continue;
    }

    const visible = resolveFieldVisibility(field, sanitizedValues);
    const value = sanitizedValues[field.name];
    const state = createEmptyFieldState(field, visible, value);

    if (!visible) {
      skippedFields.push(field.name);
      fieldStates[field.name] = state;
      continue;
    }

    visibleFields.push(field.name);

    const needsRequired = resolveFieldRequired(field, sanitizedValues);
    const hasExplicitRequired = field.rules.some((r) => r.type === 'required');

    for (let i = 0; i < field.rules.length; i++) {
      const rule = field.rules[i];

      if (shouldSkipRuleByCondition(rule, sanitizedValues)) {
        state.ruleHits.push({
          ruleIndex: i,
          ruleType: rule.type,
          passed: true,
        });
        continue;
      }

      if (!isRuleInScenario(rule, scenario, schema.scenarioGroups)) {
        const primaryGroup = rule.groups && rule.groups.length > 0 ? rule.groups[0] : '';
        scenarioSkippedRules.push({
          field: field.name,
          label: field.label,
          ruleIndex: i,
          ruleType: rule.type,
          group: primaryGroup,
        });
        state.ruleHits.push({
          ruleIndex: i,
          ruleType: rule.type,
          passed: true,
          skippedByScenario: true,
          group: primaryGroup,
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

      if (rule.type === 'eachItem' && rule.itemValidator && Array.isArray(value)) {
        const arr = value as unknown[];
        let anyFailed = false;
        for (let idx = 0; idx < arr.length; idx++) {
          const itemResult = rule.itemValidator(arr[idx], idx, sanitizedValues) as SyncValidatorResult;
          const itemPassed = itemResult === true;
          const itemErrorMessage = typeof itemResult === 'string' ? itemResult : undefined;
          const primaryGroup = rule.groups && rule.groups.length > 0 ? rule.groups[0] : undefined;

          const hit: FieldRuleHit = {
            ruleIndex: i,
            ruleType: rule.type,
            passed: itemPassed,
            group: primaryGroup,
            index: idx,
          };

          if (!itemPassed) {
            anyFailed = true;
            const message = resolveRuleMessage(rule, field, locale, itemErrorMessage, idx);
            hit.message = message;

            const err: ValidationError = {
              field: field.name,
              label: field.label,
              ruleType: rule.type,
              message,
              step: field.step,
              group: primaryGroup,
              index: idx,
            };
            state.errors.push(err);
            errors.push(err);
          }

          state.ruleHits.push(hit);
        }
        if (!anyFailed) {
          state.ruleHits.push({
            ruleIndex: i,
            ruleType: rule.type,
            passed: true,
            group: rule.groups && rule.groups.length > 0 ? rule.groups[0] : undefined,
          });
        }
        continue;
      }

      const ruleResult = runSyncRule(rule, value, sanitizedValues);
      const passed = ruleResult === true;
      const errorMessage = typeof ruleResult === 'string' ? ruleResult : undefined;

      const primaryGroup = rule.groups && rule.groups.length > 0 ? rule.groups[0] : undefined;

      const hit: FieldRuleHit = {
        ruleIndex: i,
        ruleType: rule.type,
        passed,
        group: primaryGroup,
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
          group: primaryGroup,
        };
        state.errors.push(err);
        errors.push(err);
      }

      state.ruleHits.push(hit);
    }

    if (needsRequired && !hasExplicitRequired) {
      const isEmptyValue = isEmpty(value);
      const isInScenario = isRuleInScenario(
        { type: 'required', groups: ['step', 'submit'] },
        scenario,
        schema.scenarioGroups,
      );

      if (!isInScenario) {
        scenarioSkippedRules.push({
          field: field.name,
          label: field.label,
          ruleIndex: -1,
          ruleType: 'required',
          group: 'step',
        });
        state.ruleHits.unshift({
          ruleIndex: -1,
          ruleType: 'required',
          passed: true,
          skippedByScenario: true,
          group: 'step',
        });
      } else {
        const hit: FieldRuleHit = {
          ruleIndex: -1,
          ruleType: 'required',
          passed: !isEmptyValue,
          group: 'step',
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
            group: 'step',
          };
          state.errors.unshift(err);
          errors.unshift(err);
        }

        state.ruleHits.unshift(hit);
      }
    }

    fieldStates[field.name] = state;
  }

  const errorsByStep: Record<number, ValidationError[]> = {};
  const errorsByField: Record<string, ValidationError[]> = {};
  const errorsByGroup: Record<string, ValidationError[]> = {};
  const errorsByScenario: Record<ValidationScenario, ValidationError[]> = {
    draft: [],
    step: [],
    submit: [],
  };

  for (const err of errors) {
    const s = err.step ?? 0;
    if (!errorsByStep[s]) errorsByStep[s] = [];
    errorsByStep[s].push(err);

    if (!errorsByField[err.field]) errorsByField[err.field] = [];
    errorsByField[err.field].push(err);

    if (err.group) {
      if (!errorsByGroup[err.group]) errorsByGroup[err.group] = [];
      errorsByGroup[err.group].push(err);
    }

    if (!err.group || err.group === 'draft') errorsByScenario.draft.push(err);
    if (!err.group || err.group === 'step' || err.group === 'draft') errorsByScenario.step.push(err);
    errorsByScenario.submit.push(err);
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
    scenarioSkippedRules,
    scenario,
    errorsByField,
    errorsByGroup,
    errorsByScenario,
  };
}

export function validateSync(
  schema: FormSchema,
  values: Record<string, unknown>,
  options: Omit<ValidateOptions, 'skipAsync'> = {},
): ValidationResult {
  return buildSyncResult(schema, values, options);
}

export function validateStepSync(
  schema: FormSchema,
  values: Record<string, unknown>,
  step: number,
  options: Omit<ValidateOptions, 'step' | 'skipAsync'> = {},
): ValidationResult {
  return buildSyncResult(schema, values, { ...options, step });
}

export function validateFieldSync(
  schema: FormSchema,
  values: Record<string, unknown>,
  fieldName: string,
  options: Omit<ValidateOptions, 'fields' | 'skipAsync'> = {},
): ValidationError | null {
  const result = buildSyncResult(schema, values, { ...options, fields: [fieldName] });
  return result.errors.length > 0 ? result.errors[0] : null;
}

export function mergeServerErrors(
  result: ValidationResult,
  serverErrors: ServerError[],
  schema: FormSchema,
): ValidationResult {
  if (serverErrors.length === 0) return result;

  const fieldMap = new Map<string, FieldDefinition>();
  for (const f of schema.fields) {
    fieldMap.set(f.name, f);
  }

  const mergedErrors = [...result.errors];
  const mergedFieldStates: Record<string, FieldValidationState> = {};

  for (const key of Object.keys(result.fieldStates)) {
    mergedFieldStates[key] = { ...result.fieldStates[key], errors: [...result.fieldStates[key].errors] };
  }

  const mergedErrorsByField = { ...result.errorsByField };
  const mergedErrorsByStep = { ...result.errorsByStep };
  const mergedErrorsByGroup = { ...result.errorsByGroup };
  const mergedErrorsByScenario: Record<ValidationScenario, ValidationError[]> = {
    draft: [...result.errorsByScenario.draft],
    step: [...result.errorsByScenario.step],
    submit: [...result.errorsByScenario.submit],
  };

  for (const sErr of serverErrors) {
    const field = fieldMap.get(sErr.field);
    const label = field ? field.label : sErr.field;
    const fieldStep = field?.step ?? sErr.step;

    const err: ValidationError = {
      field: sErr.field,
      label,
      ruleType: 'server',
      message: sErr.message,
      step: fieldStep,
      server: true,
    };

    mergedErrors.push(err);

    if (!mergedErrorsByField[err.field]) mergedErrorsByField[err.field] = [];
    mergedErrorsByField[err.field].push(err);

    const s = err.step ?? 0;
    if (!mergedErrorsByStep[s]) mergedErrorsByStep[s] = [];
    mergedErrorsByStep[s].push(err);

    mergedErrorsByScenario.draft.push(err);
    mergedErrorsByScenario.step.push(err);
    mergedErrorsByScenario.submit.push(err);

    if (mergedFieldStates[sErr.field]) {
      mergedFieldStates[sErr.field].errors.push(err);
    } else {
      mergedFieldStates[sErr.field] = {
        field: sErr.field,
        label,
        visible: true,
        skipped: false,
        errors: [err],
        ruleHits: [],
        cleanedValue: undefined,
        step: fieldStep,
      };
    }
  }

  return {
    ...result,
    valid: false,
    errors: mergedErrors,
    errorsByStep: mergedErrorsByStep,
    errorsByField: mergedErrorsByField,
    errorsByGroup: mergedErrorsByGroup,
    errorsByScenario: mergedErrorsByScenario,
    firstError: mergedErrors[0] || null,
    firstErrorStep: mergedErrors[0] ? (mergedErrors[0].step ?? 0) : null,
    fieldStates: mergedFieldStates,
  };
}

export async function computePageState(
  schema: FormSchema,
  values: Record<string, unknown>,
  options: PageStateOptions = {},
): Promise<PageState> {
  const {
    locale = 'zh-CN',
    currentStep = 1,
    scenario = 'step',
    skipAsync = false,
  } = options;

  const result = await validateInternal(schema, values, {
    locale,
    scenario,
    skipAsync,
  });

  const stepSchemaFields = schema.fields.filter(
    (f) => f.step === undefined || f.step === currentStep,
  );
  const visibleFields = stepSchemaFields.filter((f) =>
    resolveFieldVisibility(f, result.sanitizedValues),
  );

  const currentStepErrors = result.errors.filter((e) => (e.step ?? 0) === currentStep);
  const currentStepErrorsByField: Record<string, ValidationError[]> = {};
  for (const err of currentStepErrors) {
    if (!currentStepErrorsByField[err.field]) currentStepErrorsByField[err.field] = [];
    currentStepErrorsByField[err.field].push(err);
  }

  const visibleFieldStates: Record<string, FieldValidationState> = {};
  for (const f of visibleFields) {
    if (result.fieldStates[f.name]) {
      visibleFieldStates[f.name] = result.fieldStates[f.name];
    }
  }

  return {
    currentStep,
    visibleFields,
    visibleFieldNames: visibleFields.map((f) => f.name),
    skippedFields: result.skippedFields,
    allFieldStates: result.fieldStates,
    visibleFieldStates,
    currentStepErrors,
    currentStepErrorsByField,
    currentStepFirstError: currentStepErrors.length > 0 ? currentStepErrors[0] : null,
    allErrors: result.errors,
    allErrorsByStep: result.errorsByStep,
    allErrorsByField: result.errorsByField,
    allErrorsByGroup: result.errorsByGroup,
    draftErrors: result.errorsByScenario.draft,
    stepErrors: result.errorsByScenario.step,
    submitErrors: result.errorsByScenario.submit,
    sanitizedValues: result.sanitizedValues,
    submitValues: result.submitValues,
    scenarioSkippedRules: result.scenarioSkippedRules,
    valid: result.valid,
    currentStepValid: currentStepErrors.length === 0,
    scenario,
  };
}

export function computePageStateSync(
  schema: FormSchema,
  values: Record<string, unknown>,
  options: PageStateOptions = {},
): PageState {
  const {
    locale = 'zh-CN',
    currentStep = 1,
    scenario = 'step',
  } = options;

  const result = buildSyncResult(schema, values, {
    locale,
    scenario,
  });

  const stepSchemaFields = schema.fields.filter(
    (f) => f.step === undefined || f.step === currentStep,
  );
  const visibleFields = stepSchemaFields.filter((f) =>
    resolveFieldVisibility(f, result.sanitizedValues),
  );

  const currentStepErrors = result.errors.filter((e) => (e.step ?? 0) === currentStep);
  const currentStepErrorsByField: Record<string, ValidationError[]> = {};
  for (const err of currentStepErrors) {
    if (!currentStepErrorsByField[err.field]) currentStepErrorsByField[err.field] = [];
    currentStepErrorsByField[err.field].push(err);
  }

  const visibleFieldStates: Record<string, FieldValidationState> = {};
  for (const f of visibleFields) {
    if (result.fieldStates[f.name]) {
      visibleFieldStates[f.name] = result.fieldStates[f.name];
    }
  }

  return {
    currentStep,
    visibleFields,
    visibleFieldNames: visibleFields.map((f) => f.name),
    skippedFields: result.skippedFields,
    allFieldStates: result.fieldStates,
    visibleFieldStates,
    currentStepErrors,
    currentStepErrorsByField,
    currentStepFirstError: currentStepErrors.length > 0 ? currentStepErrors[0] : null,
    allErrors: result.errors,
    allErrorsByStep: result.errorsByStep,
    allErrorsByField: result.errorsByField,
    allErrorsByGroup: result.errorsByGroup,
    draftErrors: result.errorsByScenario.draft,
    stepErrors: result.errorsByScenario.step,
    submitErrors: result.errorsByScenario.submit,
    sanitizedValues: result.sanitizedValues,
    submitValues: result.submitValues,
    scenarioSkippedRules: result.scenarioSkippedRules,
    valid: result.valid,
    currentStepValid: currentStepErrors.length === 0,
    scenario,
  };
}
