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
  | 'async'
  | 'conditionalDisplay';

export type SyncValidatorResult = boolean | string;
export type AsyncValidatorResult = Promise<SyncValidatorResult>;
export type ValidatorResult = SyncValidatorResult | AsyncValidatorResult;

export type ValidationScenario = 'draft' | 'step' | 'submit';

export interface FieldRule {
  type: RuleType;
  value?: unknown;
  message?: string;
  condition?: (formValues: Record<string, unknown>) => boolean;
  validator?: (value: unknown, formValues: Record<string, unknown>) => ValidatorResult;
  asyncValidator?: (value: unknown, formValues: Record<string, unknown>) => AsyncValidatorResult;
  compareField?: string;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  fields?: string[];
  triggerFields?: string[];
  debounce?: number;
  groups?: string[];
}

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  rules: FieldRule[];
  step?: number;
  when?: (formValues: Record<string, unknown>) => boolean;
  visible?: (formValues: Record<string, unknown>) => boolean;
  visibleDependsOn?: string[];
  requiredWhen?: (formValues: Record<string, unknown>) => boolean;
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
  ruleType: RuleType | 'server';
  message: string;
  step?: number;
  async?: boolean;
  server?: boolean;
  group?: string;
}

export interface FieldRuleHit {
  ruleIndex: number;
  ruleType: RuleType;
  passed: boolean;
  message?: string;
  async?: boolean;
  skippedByScenario?: boolean;
  group?: string;
}

export interface FieldValidationState {
  field: string;
  label: string;
  visible: boolean;
  skipped: boolean;
  errors: ValidationError[];
  ruleHits: FieldRuleHit[];
  cleanedValue: unknown;
  step?: number;
}

export interface ValidationContext {
  sanitizedValues: Record<string, unknown>;
  skippedFields: string[];
  visibleFields: string[];
  fieldStates: Record<string, FieldValidationState>;
  scenarioSkippedRules: ScenarioSkippedRule[];
}

export interface ScenarioSkippedRule {
  field: string;
  label: string;
  ruleIndex: number;
  ruleType: RuleType;
  group: string;
}

export interface ValidationResult extends ValidationContext {
  valid: boolean;
  errors: ValidationError[];
  errorsByStep: Record<number, ValidationError[]>;
  firstError: ValidationError | null;
  firstErrorStep: number | null;
  submitValues: Record<string, unknown>;
  scenario: ValidationScenario;
}

export interface FormSchema {
  fields: FieldDefinition[];
  globalSanitize?: SanitizeOptions;
  scenarioGroups?: Record<ValidationScenario, string[]>;
}

export interface ServerError {
  field: string;
  message: string;
  step?: number;
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
  async: (label: string) => string;
}

export type Locale = 'zh-CN' | 'en-US';

export interface ValidateOptions {
  locale?: Locale;
  step?: number;
  fields?: string[];
  sanitize?: boolean;
  skipAsync?: boolean;
  scenario?: ValidationScenario;
}
