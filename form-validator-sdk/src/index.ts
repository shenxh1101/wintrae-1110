import {
  FormSchema,
  FieldDefinition,
  FieldRule,
  ValidationError,
  ValidationResult,
  ValidateOptions,
  SanitizeOptions,
  FieldType,
  RuleType,
  MessageTemplate,
  Locale,
  FieldValidationState,
  FieldRuleHit,
  ValidationContext,
  ValidationScenario,
  ScenarioSkippedRule,
  ServerError,
  PageState,
  PageStateOptions,
} from './types';
import {
  validate,
  validateStep,
  validateField,
  validateSync,
  validateStepSync,
  validateFieldSync,
  mergeServerErrors,
  computePageState,
  computePageStateSync,
} from './validator';
import { sanitizeFormValues, sanitizeField } from './sanitizer';
import { getMessageTemplate } from './messages';
import {
  presetRules,
  required,
  minLength,
  maxLength,
  min,
  max,
  pattern,
  range,
  crossField,
  conditionalDisplay,
  custom,
  asyncCustom,
  withGroups,
  formatNames,
  arrayMinLength,
  arrayMaxLength,
  eachItem,
} from './presets';

export {
  FormSchema,
  FieldDefinition,
  FieldRule,
  ValidationError,
  ValidationResult,
  ValidateOptions,
  SanitizeOptions,
  FieldType,
  RuleType,
  MessageTemplate,
  Locale,
  FieldValidationState,
  FieldRuleHit,
  ValidationContext,
  ValidationScenario,
  ScenarioSkippedRule,
  ServerError,
  PageState,
  PageStateOptions,
};

export {
  presetRules,
  required,
  minLength,
  maxLength,
  min,
  max,
  pattern,
  range,
  crossField,
  conditionalDisplay,
  custom,
  asyncCustom,
  withGroups,
  formatNames,
  arrayMinLength,
  arrayMaxLength,
  eachItem,
  getMessageTemplate,
  sanitizeFormValues,
  sanitizeField,
  mergeServerErrors,
  computePageState,
  computePageStateSync,
};

export class FormValidator {
  private schema: FormSchema;
  private locale: Locale;

  constructor(schema: FormSchema, locale: Locale = 'zh-CN') {
    this.schema = schema;
    this.locale = locale;
  }

  async validate(values: Record<string, unknown>, options?: ValidateOptions): Promise<ValidationResult> {
    return validate(this.schema, values, { locale: this.locale, ...options });
  }

  async validateStep(values: Record<string, unknown>, step: number, options?: Omit<ValidateOptions, 'step'>): Promise<ValidationResult> {
    return validateStep(this.schema, values, step, { locale: this.locale, ...options });
  }

  async validateField(values: Record<string, unknown>, fieldName: string, options?: Omit<ValidateOptions, 'fields'>): Promise<ValidationError | null> {
    return validateField(this.schema, values, fieldName, { locale: this.locale, ...options });
  }

  validateSync(values: Record<string, unknown>, options?: Omit<ValidateOptions, 'skipAsync'>): ValidationResult {
    return validateSync(this.schema, values, { locale: this.locale, ...options });
  }

  validateStepSync(values: Record<string, unknown>, step: number, options?: Omit<ValidateOptions, 'step' | 'skipAsync'>): ValidationResult {
    return validateStepSync(this.schema, values, step, { locale: this.locale, ...options });
  }

  validateFieldSync(values: Record<string, unknown>, fieldName: string, options?: Omit<ValidateOptions, 'fields' | 'skipAsync'>): ValidationError | null {
    return validateFieldSync(this.schema, values, fieldName, { locale: this.locale, ...options });
  }

  mergeServerErrors(result: ValidationResult, serverErrors: ServerError[]): ValidationResult {
    return mergeServerErrors(result, serverErrors, this.schema);
  }

  sanitize(values: Record<string, unknown>): Record<string, unknown> {
    return sanitizeFormValues(values, this.schema);
  }

  async computePageState(
    values: Record<string, unknown>,
    options?: Omit<PageStateOptions, 'locale'>,
  ): Promise<PageState> {
    return computePageState(this.schema, values, { locale: this.locale, ...options });
  }

  computePageStateSync(
    values: Record<string, unknown>,
    options?: Omit<PageStateOptions, 'locale' | 'skipAsync'>,
  ): PageState {
    return computePageStateSync(this.schema, values, { locale: this.locale, ...options });
  }

  getVisibleFields(values: Record<string, unknown>): FieldDefinition[] {
    const sanitized = sanitizeFormValues(values, this.schema);
    return this.schema.fields.filter((field) => {
      if (typeof field.when === 'function') {
        return field.when(sanitized);
      }
      if (typeof field.visible === 'function') {
        return field.visible(sanitized);
      }
      return true;
    });
  }

  getFieldsByStep(step: number): FieldDefinition[] {
    return this.schema.fields.filter((field) => field.step === step);
  }

  getSteps(): number[] {
    const steps = new Set<number>();
    for (const field of this.schema.fields) {
      if (field.step !== undefined) {
        steps.add(field.step);
      }
    }
    return Array.from(steps).sort((a, b) => a - b);
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
  }

  getSchema(): FormSchema {
    return this.schema;
  }
}

export function createFormValidator(schema: FormSchema, locale?: Locale): FormValidator {
  return new FormValidator(schema, locale);
}
