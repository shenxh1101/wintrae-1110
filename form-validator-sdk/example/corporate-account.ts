import {
  createFormValidator,
  required,
  minLength,
  maxLength,
  pattern,
  crossField,
  presetRules,
  asyncCustom,
  custom,
  withGroups,
  FormSchema,
  ServerError,
  mergeServerErrors,
} from '../src';

function mockDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkCompanyNameExists(name: string): Promise<boolean> {
  await mockDelay(100);
  return ['已存在公司', '测试企业', '示例集团'].includes(name);
}

const corporateAccountSchema: FormSchema = {
  globalSanitize: { trim: true },
  scenarioGroups: {
    draft: ['draft'],
    step: ['draft', 'step'],
    submit: ['draft', 'step', 'submit'],
  },
  fields: [
    {
      name: 'entityType',
      label: '主体类型',
      type: 'string',
      step: 1,
      rules: [required()],
    },
    {
      name: 'companyName',
      label: '企业名称',
      type: 'string',
      step: 1,
      when: (v) => v.entityType === 'enterprise',
      rules: [
        required(),
        minLength(2),
        maxLength(80),
        asyncCustom(
          async (value) => {
            const exists = await checkCompanyNameExists(String(value));
            if (exists) return '该企业名称已开户，请勿重复提交';
            return true;
          },
        ),
      ],
    },
    {
      name: 'personalName',
      label: '个人姓名',
      type: 'string',
      step: 1,
      when: (v) => v.entityType === 'individual',
      rules: [required(), minLength(2)],
      sanitize: { trim: true },
    },
    {
      name: 'personalIdCard',
      label: '个人身份证号',
      type: 'string',
      step: 1,
      when: (v) => v.entityType === 'individual',
      rules: [required(), presetRules.idCard()],
      sanitize: { removeSpaces: true, toUpperCase: true },
    },
    {
      name: 'businessLicense',
      label: '营业执照号',
      type: 'string',
      step: 1,
      when: (v) => v.entityType === 'enterprise',
      rules: [
        required(),
        pattern(/^[0-9A-Z]{15,20}$/, '营业执照号格式不正确'),
      ],
      sanitize: { removeSpaces: true, toUpperCase: true },
    },
    {
      name: 'legalRepName',
      label: '法定代表人',
      type: 'string',
      step: 2,
      when: (v) => v.entityType === 'enterprise',
      rules: [required(), minLength(2)],
      sanitize: { trim: true },
    },
    {
      name: 'legalRepIdCard',
      label: '法人身份证号',
      type: 'string',
      step: 2,
      when: (v) => v.entityType === 'enterprise',
      rules: [required(), presetRules.idCard()],
      sanitize: { removeSpaces: true, toUpperCase: true },
    },
    {
      name: 'contactName',
      label: '联系人姓名',
      type: 'string',
      step: 2,
      rules: [required(), minLength(2)],
      sanitize: { trim: true },
    },
    {
      name: 'contactPhone',
      label: '联系人手机号',
      type: 'string',
      step: 2,
      rules: [required(), presetRules.phone()],
      sanitize: { removeSpaces: true },
    },
    {
      name: 'contactEmail',
      label: '联系人邮箱',
      type: 'string',
      step: 2,
      rules: [presetRules.email()],
      sanitize: { trim: true, toLowerCase: true },
    },
    {
      name: 'needInvoice',
      label: '是否需要发票',
      type: 'boolean',
      step: 3,
      rules: [required()],
    },
    {
      name: 'invoiceTitle',
      label: '发票抬头',
      type: 'string',
      step: 3,
      when: (v) => v.needInvoice === true || v.needInvoice === 'true',
      rules: [required(), minLength(2)],
      sanitize: { trim: true },
    },
    {
      name: 'taxNumber',
      label: '税号',
      type: 'string',
      step: 3,
      when: (v) => v.needInvoice === true || v.needInvoice === 'true',
      rules: [
        required(),
        pattern(/^[0-9A-Z]{15,20}$/, '税号格式不正确'),
      ],
      sanitize: { removeSpaces: true, toUpperCase: true },
    },
    {
      name: 'bankAccount',
      label: '银行账号',
      type: 'string',
      step: 3,
      rules: [
        required(),
        withGroups(pattern(/^\d{10,25}$/, '银行账号格式不正确'), 'submit'),
      ],
      sanitize: { removeSpaces: true },
    },
    {
      name: 'agreement',
      label: '同意开户协议',
      type: 'boolean',
      step: 3,
      rules: [
        custom((value) => value === true || value === 'true', '请阅读并同意开户协议'),
      ],
    },
  ],
};

function printSeparator(title: string) {
  console.log('\n' + '='.repeat(72));
  console.log(`  ${title}`);
  console.log('='.repeat(72));
}

function printErrors(errors: Array<{ field: string; label: string; ruleType: string; message: string; step?: number; async?: boolean; server?: boolean; group?: string }>) {
  if (errors.length === 0) {
    console.log('  ✅ 无错误');
    return;
  }
  for (const err of errors) {
    const tags: string[] = [];
    if (err.async) tags.push('异步');
    if (err.server) tags.push('后端');
    if (err.group) tags.push(`组:${err.group}`);
    const tagStr = tags.length > 0 ? ` [${tags.join(',')}]` : '';
    console.log(`  ❌ [步骤${err.step ?? '-'}] ${err.label}(${err.field}): ${err.message} [${err.ruleType}]${tagStr}`);
  }
}

function printSkippedInfo(result: { skippedFields: string[]; visibleFields: string[]; scenarioSkippedRules: Array<{ field: string; label: string; ruleType: string; group: string }> }) {
  console.log(`  可见字段: ${result.visibleFields.join(', ')}`);
  console.log(`  跳过字段: ${result.skippedFields.join(', ') || '(无)'}`);
  if (result.scenarioSkippedRules.length > 0) {
    console.log(`  场景跳过规则:`);
    for (const s of result.scenarioSkippedRules) {
      console.log(`    - ${s.label}(${s.field}) 的 ${s.ruleType} 规则 [组: ${s.group}]`);
    }
  }
}

async function main() {
  const fv = createFormValidator(corporateAccountSchema, 'zh-CN');

  printSeparator('场景 1：when 统一条件 - 企业类型选择后字段增减');
  const enterpriseData = { entityType: 'enterprise', companyName: '新创科技', businessLicense: '91110000MA01ABCDEF' };
  const enterpriseResult = await fv.validateStep(enterpriseData, 1);
  console.log(`  [企业类型] 步骤1结果: ${enterpriseResult.valid ? '通过 ✅' : '未通过 ❌'}`);
  printSkippedInfo(enterpriseResult);

  const individualData = { entityType: 'individual', personalName: '张三', personalIdCard: '110101199003077731' };
  const individualResult = await fv.validateStep(individualData, 1);
  console.log(`\n  [个人类型] 步骤1结果: ${individualResult.valid ? '通过 ✅' : '未通过 ❌'}`);
  printSkippedInfo(individualResult);

  printSeparator('场景 2：动态字段切换 - 错误不残留');
  const switchData = {
    entityType: 'enterprise',
    companyName: '',
    businessLicense: '',
    legalRepName: '',
    contactName: '',
    contactPhone: '',
  };
  const enterpriseErrors = await fv.validate(switchData, { step: 2 });
  console.log(`  [企业] 步骤2错误:`);
  printErrors(enterpriseErrors.errors);

  const switchToIndividual = { ...switchData, entityType: 'individual' };
  const individualErrors = await fv.validate(switchToIndividual, { step: 2 });
  console.log(`\n  [切换为个人后] 步骤2错误:`);
  printErrors(individualErrors.errors);
  console.log(`  法人字段不再报错，因为 when 条件为 false → 字段被跳过`);

  printSeparator('场景 3：场景模式 - draft 草稿保存（弱校验）');
  const draftData = {
    entityType: 'enterprise',
    companyName: '新',
    contactName: '李',
    contactPhone: '138',
    needInvoice: true,
    invoiceTitle: '',
    taxNumber: '',
    bankAccount: '',
    agreement: false,
  };
  const draftResult = fv.validateSync(draftData, { scenario: 'draft' });
  console.log(`  草稿模式结果: ${draftResult.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  场景: ${draftResult.scenario}`);
  printSkippedInfo(draftResult);
  printErrors(draftResult.errors);
  console.log(`  提交值(仅可见字段):`, JSON.stringify(draftResult.submitValues, null, 2));

  printSeparator('场景 4：场景模式 - step 下一步（中等校验）');
  const stepResult = fv.validateSync(draftData, { scenario: 'step' });
  console.log(`  下一步模式结果: ${stepResult.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  场景: ${stepResult.scenario}`);
  printErrors(stepResult.errors);
  console.log(`  对比: draft 通过但 step 不通过 → required 规则组 step 在 step 场景下生效`);

  printSeparator('场景 5：场景模式 - submit 最终提交（强校验）');
  const submitData = {
    entityType: 'enterprise',
    companyName: '新创科技',
    businessLicense: '91110000MA01ABCDEF',
    legalRepName: '王五',
    legalRepIdCard: '110101199003077731',
    contactName: '李四',
    contactPhone: '13800138000',
    needInvoice: true,
    invoiceTitle: '新创科技有限公司',
    taxNumber: '91110000MA01ABCDEF',
    bankAccount: '6222 0200 0000 0000 000',
    agreement: true,
  };
  const submitResult = await fv.validate(submitData, { scenario: 'submit' });
  console.log(`  提交模式结果: ${submitResult.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  场景: ${submitResult.scenario}`);
  printSkippedInfo(submitResult);
  printErrors(submitResult.errors);

  printSeparator('场景 6：提交数据不含隐藏字段');
  const mixedData = {
    entityType: 'individual',
    personalName: '张三',
    personalIdCard: '110101199003077731',
    contactName: '张三',
    contactPhone: '13800138000',
    needInvoice: false,
    bankAccount: '6222020000000000000',
    agreement: true,
  };
  const mixedResult = await fv.validate(mixedData, { scenario: 'submit' });
  console.log(`  校验结果: ${mixedResult.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  跳过字段: ${mixedResult.skippedFields.join(', ')}`);
  console.log(`\n  提交数据 (submitValues):`);
  console.log(JSON.stringify(mixedResult.submitValues, null, 2));
  console.log(`\n  ✅ companyName / businessLicense / legalRep* / invoiceTitle / taxNumber 不在提交数据中`);

  printSeparator('场景 7：异步校验 - 企业名称重复');
  const dupData = { entityType: 'enterprise', companyName: '已存在公司', businessLicense: '91110000MA01ABCDEF' };
  const dupResult = await fv.validateStep(dupData, 1);
  console.log(`  校验结果: ${dupResult.valid ? '通过 ✅' : '未通过 ❌'}`);
  printErrors(dupResult.errors);

  printSeparator('场景 8：合并后端错误');
  const validData = {
    entityType: 'enterprise',
    companyName: '新创科技',
    businessLicense: '91110000MA01ABCDEF',
    legalRepName: '王五',
    legalRepIdCard: '110101199003077731',
    contactName: '李四',
    contactPhone: '13800138000',
    needInvoice: false,
    bankAccount: '6222020000000000000',
    agreement: true,
  };
  const baseResult = await fv.validate(validData, { scenario: 'submit' });
  console.log(`  前端校验结果: ${baseResult.valid ? '通过 ✅' : '未通过 ❌'}`);

  const serverErrors: ServerError[] = [
    { field: 'businessLicense', message: '该营业执照号已被其他企业使用' },
    { field: 'bankAccount', message: '银行账号开户行校验失败，请确认后重试', step: 3 },
  ];

  const mergedResult = mergeServerErrors(baseResult, serverErrors, corporateAccountSchema);
  console.log(`  合并后端错误后: ${mergedResult.valid ? '通过 ✅' : '未通过 ❌'}`);
  printErrors(mergedResult.errors);

  console.log(`\n  字段状态 - businessLicense:`);
  const blState = mergedResult.fieldStates['businessLicense'];
  console.log(`    错误数: ${blState.errors.length}`);
  for (const e of blState.errors) {
    console.log(`    - [${e.ruleType}${e.server ? '/server' : ''}] ${e.message}`);
  }

  console.log(`\n  字段状态 - bankAccount:`);
  const baState = mergedResult.fieldStates['bankAccount'];
  console.log(`    错误数: ${baState.errors.length}`);
  for (const e of baState.errors) {
    console.log(`    - [${e.ruleType}${e.server ? '/server' : ''}] ${e.message}`);
  }

  printSeparator('场景 9：同步模式 vs 异步模式对比');
  const syncTestData = { entityType: 'enterprise', companyName: '已存在公司' };
  const syncResult = fv.validateStepSync(syncTestData, 1, { scenario: 'step' });
  console.log(`  同步模式: ${syncResult.valid ? '通过 ✅' : '未通过 ❌'} (异步规则被跳过)`);
  printErrors(syncResult.errors);

  const asyncResult = await fv.validateStep(syncTestData, 1, { scenario: 'step' });
  console.log(`\n  异步模式: ${asyncResult.valid ? '通过 ✅' : '未通过 ❌'} (异步规则执行)`);
  printErrors(asyncResult.errors);

  printSeparator('场景 10：分步骤模式 - 逐步校验');
  const step1Data = {
    entityType: 'enterprise',
    companyName: '新创科技',
    businessLicense: '91110000MA01ABCDEF',
  };
  const step1 = await fv.validateStep(step1Data, 1, { scenario: 'step' });
  console.log(`  步骤1: ${step1.valid ? '通过 ✅' : '未通过 ❌'}`);

  const step2Data = { ...step1Data, legalRepName: '王五', legalRepIdCard: '110101199003077731', contactName: '李四', contactPhone: '13800138000' };
  const step2 = await fv.validateStep(step2Data, 2, { scenario: 'step' });
  console.log(`  步骤2: ${step2.valid ? '通过 ✅' : '未通过 ❌'}`);

  const step3Data = { ...step2Data, needInvoice: false, bankAccount: '6222020000000000000', agreement: true };
  const step3 = await fv.validateStep(step3Data, 3, { scenario: 'step' });
  console.log(`  步骤3: ${step3.valid ? '通过 ✅' : '未通过 ❌'}`);

  const fullSubmit = await fv.validate(step3Data, { scenario: 'submit' });
  console.log(`  全量提交: ${fullSubmit.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  提交值:`, JSON.stringify(fullSubmit.submitValues, null, 2));
  console.log(`  跳过字段: ${fullSubmit.skippedFields.join(', ') || '(无)'}`);
}

main().catch(console.error);
