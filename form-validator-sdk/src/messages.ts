import { MessageTemplate, Locale } from './types';

const zhCN: MessageTemplate = {
  required: (label) => `${label}不能为空`,
  minLength: (label, min) => `${label}长度不能少于${min}个字符`,
  maxLength: (label, max) => `${label}长度不能超过${max}个字符`,
  min: (label, min) => `${label}不能小于${min}`,
  max: (label, max) => `${label}不能大于${max}`,
  pattern: (label) => `${label}格式不正确`,
  format: (label, formatName) => `${label}不是有效的${formatName}`,
  range: (label, min, max) => `${label}必须在${min}到${max}之间`,
  crossField: (label, compareLabel, operator) => {
    const opMap: Record<string, string> = {
      eq: '等于',
      neq: '不等于',
      gt: '大于',
      gte: '大于等于',
      lt: '小于',
      lte: '小于等于',
    };
    return `${label}必须${opMap[operator] || operator}${compareLabel}`;
  },
  conditionalDisplay: (label) => `${label}在当前条件下不能为空`,
  custom: (label) => `${label}校验失败`,
  async: (label) => `${label}校验未通过`,
  arrayMinLength: (label, min) => `${label}至少需要${min}项`,
  arrayMaxLength: (label, max) => `${label}不能超过${max}项`,
  eachItem: (label, index) => `${label}第${index + 1}项校验失败`,
};

const enUS: MessageTemplate = {
  required: (label) => `${label} is required`,
  minLength: (label, min) => `${label} must be at least ${min} characters`,
  maxLength: (label, max) => `${label} must be at most ${max} characters`,
  min: (label, min) => `${label} must not be less than ${min}`,
  max: (label, max) => `${label} must not be greater than ${max}`,
  pattern: (label) => `${label} format is invalid`,
  format: (label, formatName) => `${label} is not a valid ${formatName}`,
  range: (label, min, max) => `${label} must be between ${min} and ${max}`,
  crossField: (label, compareLabel, operator) => {
    const opMap: Record<string, string> = {
      eq: 'equal to',
      neq: 'not equal to',
      gt: 'greater than',
      gte: 'greater than or equal to',
      lt: 'less than',
      lte: 'less than or equal to',
    };
    return `${label} must be ${opMap[operator] || operator} ${compareLabel}`;
  },
  conditionalDisplay: (label) => `${label} is required under current conditions`,
  custom: (label) => `${label} validation failed`,
  async: (label) => `${label} async validation failed`,
  arrayMinLength: (label, min) => `${label} must have at least ${min} items`,
  arrayMaxLength: (label, max) => `${label} must not have more than ${max} items`,
  eachItem: (label, index) => `${label} item #${index + 1} is invalid`,
};

const messages: Record<Locale, MessageTemplate> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

export function getMessageTemplate(locale: Locale = 'zh-CN'): MessageTemplate {
  return messages[locale] || messages['zh-CN'];
}

export { zhCN, enUS };
