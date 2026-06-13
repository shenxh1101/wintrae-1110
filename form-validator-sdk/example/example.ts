import {
  FormValidator,
  createFormValidator,
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
  presetRules,
  FormSchema,
} from '../src';

const loanFormSchema: FormSchema = {
  globalSanitize: { trim: true },
  fields: [
    {
      name: 'name',
      label: '姓名',
      type: 'string',
      step: 1,
      rules: [required(), minLength(2), maxLength(20)],
      sanitize: { trim: true },
    },
    {
      name: 'idCard',
      label: '身份证号',
      type: 'string',
      step: 1,
      rules: [required(), presetRules.idCard()],
      sanitize: { removeSpaces: true, toUpperCase: true },
    },
    {
      name: 'phone',
      label: '手机号',
      type: 'string',
      step: 1,
      rules: [required(), presetRules.phone()],
      sanitize: { removeSpaces: true },
    },
    {
      name: 'email',
      label: '邮箱',
      type: 'string',
      step: 1,
      rules: [presetRules.email()],
      sanitize: { trim: true, toLowerCase: true },
    },
    {
      name: 'loanAmount',
      label: '贷款金额',
      type: 'number',
      step: 2,
      rules: [required(), presetRules.amount({ min: 1000, max: 500000 })],
      sanitize: { formatNumber: true },
    },
    {
      name: 'loanTerm',
      label: '贷款期限（月）',
      type: 'number',
      step: 2,
      rules: [required(), range(6, 60)],
    },
    {
      name: 'annualIncome',
      label: '年收入',
      type: 'number',
      step: 2,
      rules: [required(), min(0)],
    },
    {
      name: 'confirmIncome',
      label: '确认年收入',
      type: 'number',
      step: 2,
      rules: [required(), crossField('annualIncome', 'eq', '两次输入的年收入不一致')],
    },
    {
      name: 'company',
      label: '工作单位',
      type: 'string',
      step: 2,
      rules: [required(), minLength(2)],
      sanitize: { trim: true },
    },
    {
      name: 'hasGuarantor',
      label: '是否有担保人',
      type: 'boolean',
      step: 3,
      rules: [required()],
    },
    {
      name: 'guarantorName',
      label: '担保人姓名',
      type: 'string',
      step: 3,
      rules: [
        conditionalDisplay(
          (values) => values.hasGuarantor === true || values.hasGuarantor === 'true',
        ),
      ],
      visible: (values) => values.hasGuarantor === true || values.hasGuarantor === 'true',
      sanitize: { trim: true },
    },
    {
      name: 'guarantorPhone',
      label: '担保人手机号',
      type: 'string',
      step: 3,
      rules: [
        conditionalDisplay(
          (values) => values.hasGuarantor === true || values.hasGuarantor === 'true',
        ),
        presetRules.phone(),
      ],
      visible: (values) => values.hasGuarantor === true || values.hasGuarantor === 'true',
      sanitize: { removeSpaces: true },
    },
    {
      name: 'remark',
      label: '备注',
      type: 'string',
      step: 3,
      rules: [maxLength(500)],
      sanitize: { trim: true },
    },
    {
      name: 'agreement',
      label: '同意协议',
      type: 'boolean',
      step: 3,
      rules: [
        custom(
          (value) => value === true || value === 'true',
          '请勾选同意协议',
        ),
      ],
    },
  ],
};

function printSeparator(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function printErrors(errors: Array<{ field: string; label: string; ruleType: string; message: string; step?: number }>) {
  if (errors.length === 0) {
    console.log('  ✅ 无错误');
    return;
  }
  for (const err of errors) {
    console.log(`  ❌ [步骤${err.step ?? '-'}] ${err.label}(${err.field}): ${err.message} [规则: ${err.ruleType}]`);
  }
}

function main() {
  const validator = createFormValidator(loanFormSchema, 'zh-CN');

  printSeparator('场景 1：空表单校验 - 全部必填字段报错');
  const result1 = validator.validateSync({});
  console.log(`  校验结果: ${result1.valid ? '通过' : '未通过'}`);
  console.log(`  错误数量: ${result1.errors.length}`);
  printErrors(result1.errors);

  printSeparator('场景 2：步骤表单 - 仅校验步骤 1');
  const step1Result = validator.validateStepSync({}, 1);
  console.log(`  步骤1校验结果: ${step1Result.valid ? '通过' : '未通过'}`);
  printErrors(step1Result.errors);

  printSeparator('场景 3：步骤 1 通过后校验步骤 2');
  const step1Data = {
    name: '张三',
    idCard: '110101199003077731',
    phone: '13800138000',
    email: 'zhangsan@example.com',
  };
  const step1Check = validator.validateStepSync(step1Data, 1);
  console.log(`  步骤1数据: ${JSON.stringify(step1Data, null, 2)}`);
  console.log(`  步骤1校验结果: ${step1Check.valid ? '通过 ✅' : '未通过 ❌'}`);

  const step2Result = validator.validateStepSync({ ...step1Data, loanAmount: 500 }, 2);
  console.log(`  步骤2（金额不足）校验结果:`);
  printErrors(step2Result.errors);

  printSeparator('场景 4：数据清洗功能');
  const dirtyData = {
    name: '  张三  ',
    idCard: '110101 199003 077735',
    phone: '138 0013 8000',
    email: 'ZhangSan@Example.COM ',
    loanAmount: '50000.00',
  };
  const cleaned = validator.sanitize(dirtyData);
  console.log('  清洗前:', JSON.stringify(dirtyData, null, 2));
  console.log('  清洗后:', JSON.stringify(cleaned, null, 2));

  printSeparator('场景 5：跨字段校验 - 年收入不一致');
  const crossFieldData = {
    ...step1Data,
    loanAmount: '50000',
    loanTerm: '12',
    annualIncome: '100000',
    confirmIncome: '200000',
    company: '测试公司',
  };
  const crossResult = validator.validateSync(crossFieldData, { step: 2 });
  printErrors(crossResult.errors);

  printSeparator('场景 6：条件显示 - 有担保人时担保人信息必填');
  const condData = {
    ...step1Data,
    hasGuarantor: true,
    guarantorName: '',
    guarantorPhone: '',
  };
  const condResult = validator.validateStepSync(condData, 3);
  printErrors(condResult.errors);

  printSeparator('场景 7：条件显示 - 无担保人时担保人信息不校验');
  const noGuarantorData = {
    ...step1Data,
    hasGuarantor: false,
    agreement: true,
  };
  const noGuarantorResult = validator.validateStepSync(noGuarantorData, 3);
  console.log(`  校验结果: ${noGuarantorResult.valid ? '通过 ✅' : '未通过 ❌'}`);
  printErrors(noGuarantorResult.errors);

  printSeparator('场景 8：单字段校验');
  const fieldError = validator.validateFieldSync({ phone: '1380000' }, 'phone');
  console.log(`  手机号 "1380000" 校验: ${fieldError ? fieldError.message : '通过 ✅'}`);

  printSeparator('场景 9：自定义校验函数');
  const customData = { ...step1Data, agreement: false };
  const customResult = validator.validateFieldSync(customData, 'agreement');
  console.log(`  协议未勾选校验: ${customResult ? customResult.message : '通过 ✅'}`);

  printSeparator('场景 10：英文提示切换');
  validator.setLocale('en-US');
  const enResult = validator.validateStepSync({}, 1);
  printErrors(enResult.errors);

  printSeparator('场景 11：完整正确数据校验');
  validator.setLocale('zh-CN');
  const validData = {
    name: '张三',
    idCard: '110101199003077731',
    phone: '13800138000',
    email: 'zhangsan@example.com',
    loanAmount: '50000',
    loanTerm: '24',
    annualIncome: '200000',
    confirmIncome: '200000',
    company: '测试科技有限公司',
    hasGuarantor: false,
    agreement: true,
    remark: '请尽快处理',
  };
  const fullResult = validator.validateSync(validData);
  console.log(`  校验结果: ${fullResult.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  错误数量: ${fullResult.errors.length}`);

  printSeparator('步骤信息');
  const steps = validator.getSteps();
  console.log(`  表单步骤: ${steps.join(', ')}`);
  for (const step of steps) {
    const fields = validator.getFieldsByStep(step);
    console.log(`  步骤${step}字段: ${fields.map((f) => f.label).join(', ')}`);
  }

  printSeparator('可见字段');
  const visibleWhenGuarantor = validator.getVisibleFields({ hasGuarantor: true });
  console.log(`  有担保人时可见字段: ${visibleWhenGuarantor.map((f) => f.label).join(', ')}`);
  const visibleNoGuarantor = validator.getVisibleFields({ hasGuarantor: false });
  console.log(`  无担保人时可见字段: ${visibleNoGuarantor.map((f) => f.label).join(', ')}`);
}

main();
