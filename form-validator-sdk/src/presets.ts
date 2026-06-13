import { FieldRule, AsyncValidatorResult } from './types';

const ID_CARD_PATTERN = /^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/;
const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const AMOUNT_PATTERN = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
const URL_PATTERN = /^https?:\/\/[^\s]+$/;
const ZIP_CODE_PATTERN = /^\d{6}$/;
const CHINESE_PATTERN = /^[\u4e00-\u9fa5]+$/;
const PLATE_NUMBER_PATTERN = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-Z0-9]{5,6}$/;

function validateIdCardChecksum(id: string): boolean {
  if (!ID_CARD_PATTERN.test(id)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(id[i], 10) * weights[i];
  }
  const checkChar = checkCodes[sum % 11];
  return id[17].toUpperCase() === checkChar;
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }
  const numA = Number(a);
  const numB = Number(b);
  if (!isNaN(numA) && !isNaN(numB) && isFinite(numA) && isFinite(numB)) {
    return numA === numB;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b;
  }
  return String(a) === String(b);
}

export const presetRules = {
  idCard(): FieldRule {
    return {
      type: 'format',
      value: 'idCard',
      message: undefined,
      validator: (value) => {
        if (typeof value !== 'string' || !value.trim()) return false;
        return validateIdCardChecksum(value.trim().toUpperCase());
      },
    };
  },

  phone(): FieldRule {
    return {
      type: 'format',
      value: 'phone',
      message: undefined,
      validator: (value) => {
        if (typeof value !== 'string') return false;
        return PHONE_PATTERN.test(value.trim());
      },
    };
  },

  email(): FieldRule {
    return {
      type: 'format',
      value: 'email',
      message: undefined,
      validator: (value) => {
        if (typeof value !== 'string') return false;
        return EMAIL_PATTERN.test(value.trim());
      },
    };
  },

  amount(options?: { min?: number; max?: number }): FieldRule {
    return {
      type: 'format',
      value: 'amount',
      message: undefined,
      validator: (value) => {
        const num = Number(value);
        if (isNaN(num)) return false;
        if (typeof value === 'string' && !AMOUNT_PATTERN.test(value.trim())) return false;
        if (options?.min !== undefined && num < options.min) return false;
        if (options?.max !== undefined && num > options.max) return false;
        return true;
      },
    };
  },

  url(): FieldRule {
    return {
      type: 'format',
      value: 'url',
      message: undefined,
      validator: (value) => {
        if (typeof value !== 'string') return false;
        return URL_PATTERN.test(value.trim());
      },
    };
  },

  zipCode(): FieldRule {
    return {
      type: 'format',
      value: 'zipCode',
      message: undefined,
      validator: (value) => {
        if (typeof value !== 'string') return false;
        return ZIP_CODE_PATTERN.test(value.trim());
      },
    };
  },

  chinese(): FieldRule {
    return {
      type: 'format',
      value: 'chinese',
      message: undefined,
      validator: (value) => {
        if (typeof value !== 'string') return false;
        return CHINESE_PATTERN.test(value.trim());
      },
    };
  },

  plateNumber(): FieldRule {
    return {
      type: 'format',
      value: 'plateNumber',
      message: undefined,
      validator: (value) => {
        if (typeof value !== 'string') return false;
        return PLATE_NUMBER_PATTERN.test(value.trim());
      },
    };
  },
};

export function required(message?: string): FieldRule {
  return { type: 'required', message, groups: ['step', 'submit'] };
}

export function minLength(min: number, message?: string): FieldRule {
  return { type: 'minLength', value: min, message };
}

export function maxLength(max: number, message?: string): FieldRule {
  return { type: 'maxLength', value: max, message };
}

export function min(min: number, message?: string): FieldRule {
  return { type: 'min', value: min, message };
}

export function max(max: number, message?: string): FieldRule {
  return { type: 'max', value: max, message };
}

export function pattern(regex: RegExp, message?: string): FieldRule {
  return {
    type: 'pattern',
    value: regex.source,
    message,
    validator: (value) => {
      if (typeof value !== 'string') return false;
      return regex.test(value);
    },
  };
}

export function range(minVal: number, maxVal: number, message?: string): FieldRule {
  return {
    type: 'range',
    value: { min: minVal, max: maxVal },
    message,
    validator: (value) => {
      const num = Number(value);
      if (isNaN(num)) return false;
      return num >= minVal && num <= maxVal;
    },
  };
}

export function crossField(
  compareField: string,
  operator: FieldRule['operator'],
  message?: string,
): FieldRule {
  return {
    type: 'crossField',
    compareField,
    operator,
    message,
    validator: (value, formValues) => {
      const compareValue = formValues[compareField];
      const numA = Number(value);
      const numB = Number(compareValue);
      const bothNumeric = !isNaN(numA) && !isNaN(numB) && isFinite(numA) && isFinite(numB);

      switch (operator) {
        case 'eq':
          return looseEqual(value, compareValue);
        case 'neq':
          return !looseEqual(value, compareValue);
        case 'gt':
          return bothNumeric && numA > numB;
        case 'gte':
          return bothNumeric && numA >= numB;
        case 'lt':
          return bothNumeric && numA < numB;
        case 'lte':
          return bothNumeric && numA <= numB;
        default:
          return true;
      }
    },
  };
}

export function conditionalDisplay(
  condition: (formValues: Record<string, unknown>) => boolean,
  message?: string,
): FieldRule {
  return {
    type: 'conditionalDisplay',
    condition,
    message,
    validator: (value, formValues) => {
      if (!condition(formValues)) return true;
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    },
  };
}

export function custom(
  validator: (value: unknown, formValues: Record<string, unknown>) => boolean | string,
  message?: string,
): FieldRule {
  return { type: 'custom', validator, message };
}

export function asyncCustom(
  asyncValidator: (value: unknown, formValues: Record<string, unknown>) => AsyncValidatorResult,
  message?: string,
  options?: { debounce?: number },
): FieldRule {
  return {
    type: 'async',
    asyncValidator,
    message,
    debounce: options?.debounce,
    groups: ['submit'],
  };
}

export function withGroups(rule: FieldRule, ...groups: string[]): FieldRule {
  return { ...rule, groups };
}

export function arrayMinLength(min: number, message?: string): FieldRule {
  return { type: 'arrayMinLength', value: min, message, groups: ['step', 'submit'] };
}

export function arrayMaxLength(max: number, message?: string): FieldRule {
  return { type: 'arrayMaxLength', value: max, message };
}

export function eachItem(
  itemValidator: (itemValue: unknown, itemIndex: number, formValues: Record<string, unknown>) => boolean | string,
  message?: string,
): FieldRule {
  return {
    type: 'eachItem',
    message,
    itemValidator,
    groups: ['step', 'submit'],
  };
}

export const formatNames: Record<string, string> = {
  idCard: '身份证号',
  phone: '手机号',
  email: '邮箱',
  amount: '金额',
  url: '网址',
  zipCode: '邮编',
  chinese: '中文',
  plateNumber: '车牌号',
};
