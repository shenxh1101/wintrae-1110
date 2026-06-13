/* eslint-disable no-console */
import {
  FormSchema,
  required,
  eachItem,
  arrayMinLength,
  arrayMaxLength,
  pattern,
  minLength,
  computePageState,
  computePageStateSync,
  withGroups,
} from '../src';

function buildBatchFormSchema(): FormSchema {
  return {
    fields: [
      {
        name: 'applicantName',
        label: '申请人姓名',
        type: 'string',
        step: 1,
        sanitize: { trim: true },
        rules: [
          required('申请人姓名为必填项'),
          minLength(2, '姓名至少 2 个字'),
        ],
      },
      {
        name: 'hasContacts',
        label: '是否需要联系人',
        type: 'boolean',
        step: 1,
        rules: [],
      },
      {
        name: 'contacts',
        label: '联系人列表',
        type: 'array',
        step: 1,
        when: (v) => Boolean(v.hasContacts),
        sanitize: {
          custom: (val: unknown) => {
            if (!Array.isArray(val)) return val;
            return val.map((c) => {
              if (!c || typeof c !== 'object') return c;
              const item = { ...(c as Record<string, unknown>) };
              if (typeof item.name === 'string') item.name = item.name.trim();
              if (typeof item.phone === 'string') item.phone = item.phone.replace(/\s+/g, '');
              if (typeof item.email === 'string') {
                item.email = item.email.trim();
                if (item.email !== '') item.email = (item.email as string).toLowerCase();
              }
              return item;
            });
          },
        },
        rules: [
          withGroups(arrayMinLength(1, '至少添加 1 位联系人'), 'step', 'submit'),
          arrayMaxLength(5, '联系人最多 5 位'),
          eachItem((item: unknown, index: number) => {
            const c = item as Record<string, unknown>;
            if (!c || typeof c !== 'object') return `第 ${index + 1} 位联系人信息缺失`;
            if (!c.name || typeof c.name !== 'string' || c.name === '')
              return `第 ${index + 1} 位联系人的姓名不能为空`;
            if (c.name.length < 2)
              return `第 ${index + 1} 位联系人姓名至少 2 个字`;
            if (!c.phone || typeof c.phone !== 'string' || c.phone === '')
              return `第 ${index + 1} 位联系人的手机号不能为空`;
            if (!/^1[3-9]\d{9}$/.test(c.phone))
              return `第 ${index + 1} 位联系人手机号格式不正确`;
            if (c.email && typeof c.email === 'string' && c.email !== '') {
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email))
                return `第 ${index + 1} 位联系人邮箱格式不正确`;
            }
            return true;
          }),
        ],
      },
      {
        name: 'needInvoice',
        label: '是否需要发票',
        type: 'boolean',
        step: 2,
        rules: [],
      },
      {
        name: 'invoiceHeaders',
        label: '发票抬头列表',
        type: 'array',
        step: 2,
        when: (v) => Boolean(v.needInvoice),
        sanitize: {
          custom: (val: unknown) => {
            if (!Array.isArray(val)) return val;
            return val.map((inv) => {
              if (!inv || typeof inv !== 'object') return inv;
              const item = { ...(inv as Record<string, unknown>) };
              if (typeof item.title === 'string') item.title = item.title.trim();
              if (typeof item.taxNo === 'string') {
                item.taxNo = item.taxNo.replace(/\s+/g, '').toUpperCase();
              }
              return item;
            });
          },
        },
        rules: [
          withGroups(arrayMinLength(1, '需要发票时至少添加 1 个发票抬头'), 'step', 'submit'),
          arrayMaxLength(3, '发票抬头最多 3 个'),
          eachItem((item: unknown, index: number) => {
            const inv = item as Record<string, unknown>;
            if (!inv || typeof inv !== 'object') return `第 ${index + 1} 个发票抬头信息缺失`;
            if (!inv.title || typeof inv.title !== 'string' || inv.title === '')
              return `第 ${index + 1} 个发票抬头不能为空`;
            if (!inv.taxNo || typeof inv.taxNo !== 'string' || inv.taxNo === '')
              return `第 ${index + 1} 个发票税号不能为空`;
            if (inv.taxNo && !/^[0-9A-Z]{15,20}$/.test(inv.taxNo))
              return `第 ${index + 1} 个发票税号格式不正确（15-20 位字母数字）`;
            return true;
          }),
        ],
      },
      {
        name: 'remark',
        label: '备注',
        type: 'string',
        step: 2,
        sanitize: { trim: true },
        rules: [],
      },
    ],
  };
}

const section = (title: string) => {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
};

const h = (title: string) => {
  console.log(`\n  ── ${title} ` + '─'.repeat(Math.max(0, 70 - title.length)));
};

function printPageStateSummary(label: string, state: ReturnType<typeof computePageStateSync>) {
  h(label);
  console.log(`    当前步骤      : ${state.currentStep}`);
  console.log(`    场景          : ${state.scenario}`);
  console.log(`    当前步骤有效  : ${state.currentStepValid}`);
  console.log(`    整体有效      : ${state.valid}`);
  console.log(`    可见字段      : [${state.visibleFieldNames.join(', ')}]`);
  console.log(`    跳过字段      : [${state.skippedFields.join(', ')}]`);
  console.log(`    当前步骤错误  : ${state.currentStepErrors.length} 条`);
  for (const e of state.currentStepErrors) {
    const loc = e.index !== undefined ? `[项 ${e.index + 1}]` : '';
    console.log(`      - ${e.field}${loc}: ${e.message}`);
  }
  const byFieldKeys = Object.keys(state.allErrorsByField);
  console.log(`    按字段汇总    : ${byFieldKeys.length} 个字段有错误`);
  for (const k of byFieldKeys) {
    const msgs = state.allErrorsByField[k].map((e) => {
      const loc = e.index !== undefined ? `[项 ${e.index + 1}]` : '';
      return `${loc}${e.message}`;
    });
    console.log(`      - ${k}: ${msgs.join('; ')}`);
  }
  const byStepKeys = Object.keys(state.allErrorsByStep).map(Number);
  console.log(`    按步骤汇总    : 步骤 [${byStepKeys.join(', ')}] 有错误`);
  const byGroupKeys = Object.keys(state.allErrorsByGroup);
  console.log(`    按分组汇总    : 分组 [${byGroupKeys.join(', ')}] 有错误`);
  console.log(`    场景跳过规则  : ${state.scenarioSkippedRules.length} 条`);
  for (const s of state.scenarioSkippedRules.slice(0, 3)) {
    console.log(`      - ${s.label} 跳过规则(${s.ruleType}) 组=[${s.group}]`);
  }
}

async function run() {
  const schema = buildBatchFormSchema();

  section('场景 1：初始空表单（草稿场景 draft）');
  const emptyValues: Record<string, unknown> = {
    applicantName: '',
    hasContacts: true,
    contacts: [],
    needInvoice: false,
    invoiceHeaders: [],
    remark: '',
  };
  const state1 = computePageStateSync(schema, emptyValues, { scenario: 'draft', currentStep: 1 });
  printPageStateSummary('草稿模式（draft）- 所有必填跳过', state1);

  section('场景 2：联系人全量错误演示（下一步 step 场景）');
  const badContacts: Record<string, unknown> = {
    applicantName: '张',
    hasContacts: true,
    contacts: [
      { name: ' ', phone: '123', email: 'bad-email' },
      { name: '李四', phone: '', email: '' },
      { name: '', phone: '13800001111', email: 'ok@test.com' },
    ],
    needInvoice: false,
    invoiceHeaders: [],
    remark: '',
  };
  const state2 = computePageStateSync(schema, badContacts, { scenario: 'step', currentStep: 1 });
  printPageStateSummary('step 场景 - 联系人错误定位', state2);
  h('errorsByGroup 详情');
  for (const g of Object.keys(state2.allErrorsByGroup)) {
    console.log(`    [${g}] ${state2.allErrorsByGroup[g].length} 条:`);
    for (const e of state2.allErrorsByGroup[g]) {
      const idx = e.index !== undefined ? `[项 ${e.index + 1}]` : '';
      console.log(`      - ${e.field}${idx}: ${e.message}`);
    }
  }

  section('场景 3：修复后 step1 通过，step2 发票场景');
  const goodStep1: Record<string, unknown> = {
    applicantName: '  张三  ',
    hasContacts: true,
    contacts: [
      { name: '  王五  ', phone: ' 138 0013 8000 ', email: '  Wang@Example.COM ' },
      { name: '赵六', phone: '13900139000', email: '' },
    ],
    needInvoice: true,
    invoiceHeaders: [
      { title: '', taxNo: 'abc' },
      { title: '  科技公司  ', taxNo: ' 91330100ma27x12k3y ' },
    ],
    remark: '  加急处理  ',
  };
  const state3step2 = computePageStateSync(schema, goodStep1, { scenario: 'step', currentStep: 2 });
  printPageStateSummary('step 场景 - step2 发票错误', state3step2);
  h('submitValues（清洗后的预提交值）');
  console.log(JSON.stringify(state3step2.submitValues, null, 4));

  section('场景 4：最终提交 submit 场景，全部通过');
  const goodAll: Record<string, unknown> = {
    applicantName: '  张三  ',
    hasContacts: true,
    contacts: [
      { name: '  王五  ', phone: ' 138 0013 8000 ', email: '  Wang@Example.COM ' },
      { name: '赵六', phone: '13900139000', email: '' },
    ],
    needInvoice: true,
    invoiceHeaders: [
      { title: '  某某科技有限公司  ', taxNo: ' 91330100MA27X12K3Y ' },
    ],
    remark: '  加急处理  ',
  };
  const state4submit = await computePageState(schema, goodAll, { scenario: 'submit' });
  printPageStateSummary('submit 场景 - 全部通过', state4submit);
  h('最终 submitValues');
  console.log(JSON.stringify(state4submit.submitValues, null, 4));

  section('场景 5：隐藏字段 + 删除数组项后错误清除');
  const hiddenScenario: Record<string, unknown> = {
    applicantName: '张三',
    hasContacts: false,
    contacts: [
      { name: '', phone: '123', email: '' },
      { name: '', phone: '456', email: '' },
    ],
    needInvoice: false,
    invoiceHeaders: [{ title: '', taxNo: '' }],
    remark: '',
  };
  const state5hidden = computePageStateSync(schema, hiddenScenario, { scenario: 'step', currentStep: 1 });
  printPageStateSummary('关闭 hasContacts 后，contacts 数组隐藏且错误全部清除', state5hidden);
  h('验证 contacts 相关错误已清除');
  console.log('    allErrors 含 contacts 前缀:', state5hidden.allErrors.some((e) => e.field === 'contacts'));
  console.log('    errorsByField 含 contacts:', 'contacts' in state5hidden.allErrorsByField);
  console.log('    visibleFieldNames 含 contacts:', state5hidden.visibleFieldNames.includes('contacts'));

  section('场景 6：按场景维度汇总对比（draft vs step vs submit）');
  const partialData: Record<string, unknown> = {
    applicantName: '',
    hasContacts: true,
    contacts: [
      { name: '李', phone: '1380000111', email: 'no-at-sign' },
    ],
    needInvoice: true,
    invoiceHeaders: [
      { title: '', taxNo: 'short' },
    ],
    remark: '',
  };
  for (const sc of ['draft', 'step', 'submit'] as const) {
    const st = computePageStateSync(schema, partialData, { scenario: sc });
    h(`场景=${sc} 错误数统计`);
    console.log('    当前步骤错误:', st.currentStepErrors.length);
    console.log('    总错误数    :', st.allErrors.length);
    console.log('    按字段      :', Object.keys(st.allErrorsByField).join(', ') || '(空)');
    console.log('    按分组      :', Object.keys(st.allErrorsByGroup).join(', ') || '(空)');
    console.log('    跳过规则数  :', st.scenarioSkippedRules.length);
  }

  section('场景 7：数组越界 + 删除后重校验（错误 index 同步更新）');
  const delScenario: Record<string, unknown> = {
    applicantName: '测试用户',
    hasContacts: true,
    contacts: [
      { name: '错误1', phone: '123', email: '' },
      { name: '错误2', phone: '456', email: '' },
      { name: '正确三', phone: '13700007000', email: 'ok@ok.com' },
    ],
    needInvoice: false,
    invoiceHeaders: [],
    remark: '',
  };
  h('删除前（3 项）');
  const before = computePageStateSync(schema, delScenario, { scenario: 'step', currentStep: 1 });
  for (const e of before.currentStepErrors.filter((x) => x.field === 'contacts')) {
    console.log(`    - 项 ${e.index !== undefined ? e.index + 1 : '?'}: ${e.message}`);
  }
  const afterDel: Record<string, unknown> = {
    ...delScenario,
    contacts: [
      { name: '正确三', phone: '13700007000', email: 'ok@ok.com' },
    ],
  };
  h('删除前 2 项后（只剩 1 项正确）');
  const after = computePageStateSync(schema, afterDel, { scenario: 'step', currentStep: 1 });
  console.log('    contacts 相关错误数:', after.currentStepErrors.filter((x) => x.field === 'contacts').length);
  console.log('    当前 step 有效:', after.currentStepValid);

  console.log('\n✅ 批量表单示例全部完成');
}

run().catch((err) => {
  console.error('运行失败:', err);
  process.exit(1);
});
