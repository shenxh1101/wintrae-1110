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
  FormSchema,
} from '../src';

const mockUserDb: Record<string, { username: string; phone: string }> = {
  admin: { username: 'admin', phone: '13800000001' },
  test: { username: 'test', phone: '13800000002' },
  zhangsan: { username: 'zhangsan', phone: '13900000001' },
};

function mockDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkUsernameExists(username: string): Promise<boolean> {
  await mockDelay(200);
  return Object.prototype.hasOwnProperty.call(mockUserDb, username.toLowerCase());
}

async function checkPhoneRegistered(phone: string): Promise<boolean> {
  await mockDelay(150);
  return Object.values(mockUserDb).some((u) => u.phone === phone);
}

const registerFormSchema: FormSchema = {
  globalSanitize: { trim: true },
  fields: [
    {
      name: 'accountType',
      label: '注册方式',
      type: 'string',
      step: 1,
      rules: [required()],
    },
    {
      name: 'username',
      label: '用户名',
      type: 'string',
      step: 1,
      visible: (v) => v.accountType === 'username',
      requiredWhen: (v) => v.accountType === 'username',
      rules: [
        minLength(3),
        maxLength(20),
        pattern(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),
        asyncCustom(
          async (value) => {
            const exists = await checkUsernameExists(String(value));
            if (exists) return '该用户名已被注册，请换一个';
            return true;
          },
          undefined,
          { debounce: 300 },
        ),
      ],
      sanitize: { trim: true, toLowerCase: true },
    },
    {
      name: 'phone',
      label: '手机号',
      type: 'string',
      step: 1,
      visible: (v) => v.accountType === 'phone',
      requiredWhen: (v) => v.accountType === 'phone',
      rules: [
        presetRules.phone(),
        asyncCustom(async (value) => {
          const registered = await checkPhoneRegistered(String(value));
          if (registered) return '该手机号已被注册，请直接登录';
          return true;
        }),
      ],
      sanitize: { removeSpaces: true },
    },
    {
      name: 'password',
      label: '密码',
      type: 'string',
      step: 2,
      rules: [
        required(),
        minLength(8, '密码长度至少8位'),
        maxLength(32),
        custom((value) => {
          const str = String(value);
          const hasLetter = /[a-zA-Z]/.test(str);
          const hasNumber = /\d/.test(str);
          if (!hasLetter || !hasNumber) {
            return '密码必须包含字母和数字';
          }
          return true;
        }),
      ],
    },
    {
      name: 'confirmPassword',
      label: '确认密码',
      type: 'string',
      step: 2,
      rules: [
        required(),
        crossField('password', 'eq', '两次输入的密码不一致'),
      ],
    },
    {
      name: 'nickname',
      label: '昵称',
      type: 'string',
      step: 2,
      rules: [maxLength(20)],
      sanitize: { trim: true },
    },
    {
      name: 'hasInviteCode',
      label: '是否有邀请码',
      type: 'boolean',
      step: 2,
      rules: [required()],
    },
    {
      name: 'inviteCode',
      label: '邀请码',
      type: 'string',
      step: 2,
      visible: (v) => v.hasInviteCode === true || v.hasInviteCode === 'true',
      requiredWhen: (v) => v.hasInviteCode === true || v.hasInviteCode === 'true',
      rules: [
        minLength(6),
        maxLength(12),
      ],
      sanitize: { trim: true, toUpperCase: true },
    },
    {
      name: 'email',
      label: '邮箱',
      type: 'string',
      step: 3,
      rules: [
        presetRules.email(),
      ],
      sanitize: { trim: true, toLowerCase: true },
    },
    {
      name: 'birthday',
      label: '出生日期',
      type: 'string',
      step: 3,
      rules: [
        pattern(/^\d{4}-\d{2}-\d{2}$/, '请输入 YYYY-MM-DD 格式的日期'),
      ],
    },
    {
      name: 'agreement',
      label: '同意用户协议',
      type: 'boolean',
      step: 3,
      rules: [
        custom(
          (value) => value === true || value === 'true',
          '请阅读并同意用户协议',
        ),
      ],
    },
    {
      name: 'subscribe',
      label: '订阅消息通知',
      type: 'boolean',
      step: 3,
      rules: [],
    },
  ],
};

function printSeparator(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function printErrors(errors: Array<{ field: string; label: string; ruleType: string; message: string; step?: number; async?: boolean }>) {
  if (errors.length === 0) {
    console.log('  ✅ 无错误');
    return;
  }
  for (const err of errors) {
    const asyncTag = err.async ? ' [异步]' : '';
    console.log(`  ❌ [步骤${err.step ?? '-'}] ${err.label}(${err.field}): ${err.message} [规则: ${err.ruleType}]${asyncTag}`);
  }
}

async function main() {
  const fv = createFormValidator(registerFormSchema, 'zh-CN');

  printSeparator('场景 1：用户名注册 - 同步校验通过 + 异步校验（已存在）');
  const data1 = {
    accountType: 'username',
    username: 'admin',
    password: 'test123456',
    confirmPassword: 'test123456',
    hasInviteCode: false,
    agreement: true,
  };
  const result1 = await fv.validateStep(data1, 1);
  console.log(`  校验结果: ${result1.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  可见字段: ${result1.visibleFields.join(', ')}`);
  console.log(`  跳过字段: ${result1.skippedFields.join(', ') || '(无)'}`);
  printErrors(result1.errors);

  printSeparator('场景 2：用户名注册 - 新用户名（异步校验通过）');
  const data2 = { ...data1, username: 'newuser888' };
  const result2 = await fv.validateStep(data2, 1);
  console.log(`  校验结果: ${result2.valid ? '通过 ✅' : '未通过 ❌'}`);
  printErrors(result2.errors);
  console.log(`  清洗后数据:`, result2.submitValues);

  printSeparator('场景 3：手机号注册 - 已注册的手机号');
  const data3 = {
    accountType: 'phone',
    phone: '13800000001',
  };
  const result3 = await fv.validateStep(data3, 1);
  console.log(`  校验结果: ${result3.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  可见字段: ${result3.visibleFields.join(', ')}`);
  console.log(`  跳过字段: ${result3.skippedFields.join(', ') || '(无)'}`);
  printErrors(result3.errors);

  printSeparator('场景 4：步骤 2 - 密码强度校验 + 跨字段比较');
  const data4 = {
    accountType: 'username',
    username: 'newuser888',
    password: '123456',
    confirmPassword: '12345678',
    hasInviteCode: true,
    inviteCode: '',
  };
  const result4 = await fv.validateStep(data4, 2);
  console.log(`  校验结果: ${result4.valid ? '通过 ✅' : '未通过 ❌'}`);
  printErrors(result4.errors);
  console.log('\n  字段状态详情:');
  for (const fieldName of result4.visibleFields) {
    const state = result4.fieldStates[fieldName];
    const passedCount = state.ruleHits.filter((h) => h.passed).length;
    console.log(`    - ${state.label}(${state.field}): ${state.errors.length}个错误, ${passedCount}/${state.ruleHits.length}条规则通过`);
  }

  printSeparator('场景 5：条件必填 - 有邀请码时邀请码必填');
  const data5 = {
    password: 'Test123456',
    confirmPassword: 'Test123456',
    hasInviteCode: true,
    inviteCode: '',
  };
  const result5 = await fv.validateStep(data5, 2);
  console.log(`  校验结果: ${result5.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  可见字段: ${result5.visibleFields.join(', ')}`);
  printErrors(result5.errors);

  printSeparator('场景 6：无邀请码时邀请码字段被跳过');
  const data6 = {
    password: 'Test123456',
    confirmPassword: 'Test123456',
    hasInviteCode: false,
  };
  const result6 = await fv.validateStep(data6, 2);
  console.log(`  校验结果: ${result6.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  跳过字段: ${result6.skippedFields.join(', ') || '(无)'}`);
  const inviteState = result6.fieldStates['inviteCode'];
  console.log(`  inviteCode 字段状态: visible=${inviteState?.visible}, skipped=${inviteState?.skipped}`);
  printErrors(result6.errors);

  printSeparator('场景 7：跨字段数值宽松比较 - 字符串数字 vs 数字');
  const data7 = {
    password: 'Test123456',
    confirmPassword: 'Test123456',
    hasInviteCode: false,
    nickname: '测试用户',
  };
  const result7 = await fv.validateStep(data7, 2);
  console.log(`  校验结果: ${result7.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  清洗后提交数据(步骤2):`, result7.submitValues);
  printErrors(result7.errors);

  printSeparator('场景 8：完整三步注册提交 - 最终提交数据');
  const fullData = {
    accountType: 'username',
    username: '  HelloWorld  ',
    password: 'Hello123456',
    confirmPassword: 'Hello123456',
    nickname: '  Hello  ',
    hasInviteCode: false,
    email: '  Hello@Example.COM  ',
    birthday: '1995-06-15',
    agreement: true,
    subscribe: true,
    unusedField: '这个字段不会出现在提交数据里',
  };
  const fullResult = await fv.validate(fullData);
  console.log(`  整体校验结果: ${fullResult.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  错误总数: ${fullResult.errors.length}`);
  console.log(`  可见字段数: ${fullResult.visibleFields.length}`);
  console.log(`  跳过字段: ${fullResult.skippedFields.join(', ') || '(无)'}`);
  console.log(`\n  清洗后提交数据 (submitValues):`);
  console.log(JSON.stringify(fullResult.submitValues, null, 4));
  console.log(`\n  原始脏数据中的 username: "${fullData.username}"`);
  console.log(`  清洗后的 username: "${fullResult.submitValues['username']}"`);
  console.log(`  清洗后的 email: "${fullResult.submitValues['email']}"`);

  printSeparator('场景 9：按步骤分组的错误列表');
  const badData = {
    accountType: 'phone',
    phone: '123',
    password: '123',
    confirmPassword: '456',
    hasInviteCode: true,
    inviteCode: 'a',
    agreement: false,
  };
  const badResult = await fv.validate(badData);
  console.log(`  总错误数: ${badResult.errors.length}`);
  console.log(`  第一个错误步骤: ${badResult.firstErrorStep}`);
  for (const stepStr of Object.keys(badResult.errorsByStep).sort()) {
    const step = Number(stepStr);
    console.log(`\n  步骤 ${step} 的错误:`);
    for (const err of badResult.errorsByStep[step]) {
      console.log(`    - ${err.label}: ${err.message}`);
    }
  }

  printSeparator('场景 10：同步校验模式（跳过异步校验）');
  const syncData = {
    accountType: 'username',
    username: 'admin',
    password: 'Test123456',
    confirmPassword: 'Test123456',
    hasInviteCode: false,
  };
  const syncResult = fv.validateStepSync(syncData, 1);
  console.log(`  同步校验结果: ${syncResult.valid ? '通过 ✅' : '未通过 ❌'}`);
  console.log(`  可见字段: ${syncResult.visibleFields.join(', ')}`);
  console.log(`  用户名异步规则被跳过: admin 不会因"已存在"报错（同步模式跳过异步）`);
  printErrors(syncResult.errors);

  printSeparator('场景 11：单字段异步校验');
  const singleResult = await fv.validateField(
    { accountType: 'phone', phone: '13900000001' },
    'phone',
  );
  console.log(`  手机号 13900000001 校验结果:`);
  if (singleResult) {
    console.log(`    ❌ ${singleResult.message} [${singleResult.ruleType}]`);
  } else {
    console.log('    ✅ 通过');
  }

  const singleResult2 = await fv.validateField(
    { accountType: 'phone', phone: '13700000001' },
    'phone',
  );
  console.log(`  手机号 13700000001 校验结果:`);
  if (singleResult2) {
    console.log(`    ❌ ${singleResult2.message} [${singleResult2.ruleType}]`);
  } else {
    console.log('    ✅ 通过');
  }
}

main().catch(console.error);
