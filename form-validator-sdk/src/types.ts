export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'array';

export type RuleType =
  | 'required'
  | 'minLength'
  | 'maxLength'
  | 'min'
  | 'max'
  | 'pattern'
  | 'format'
  | 'range'
  | 'crossField'
  | 'custom'
  | 'conditionalDisplay';

export interface FieldRule {
  type: RuleType;
  value?: unknown;
  message?: string;
  condition?: (formValues: Record<string, unknown>) => boolean;
  validator?: (value: unknown, formValues: Record<string, unknown>) => boolean | string;
  compareField?: string;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  fields?: string[];
  triggerFields?: string[];
}

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  rules: FieldRule[];
  step?: number;
  visible?: (formValues: Record<string, unknown>) => boolean;
  sanitize?: SanitizeOptions;
}

export interface SanitizeOptions {
  trim?: boolean;
  trimAll?: boolean;
  toUpperCase?: boolean;
  toLowerCase?: boolean;
  removeSpaces?: boolean;
  formatNumber?: boolean;
  dateFormat?: string;
  custom?: (value: unknown) => unknown;
}

export interface ValidationError {
  field: string;
  label: string;
  ruleType: RuleType;
  message: string;
  step?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  errorsByStep: Record<number, ValidationError[]>;
  firstError: ValidationError | null;
  firstErrorStep: number | null;
}

export interface FormSchema {
  fields: FieldDefinition[];
  globalSanitize?: SanitizeOptions;
}

export interface MessageTemplate {
  required: (label: string) => string;
  minLength: (label: string, min: number) => string;
  maxLength: (label: string, max: number) => string;
  min: (label: string, min: number) => string;
  max: (label: string, max: number) => string;
  pattern: (label: string) => string;
  format: (label: string, formatName: string) => string;
  range: (label: string, min: number, max: number) => string;
  crossField: (label: string, compareLabel: string, operator: string) => string;
  conditionalDisplay: (label: string) => string;
  custom: (label: string) => string;
}

export type Locale = 'zh-CN' | 'en-US';
