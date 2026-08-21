
import { buildKimiQuotaWindows, parseKimiPlan } from '../lib/providers/kimi.js';
const sample = {
  user: { userId: 'x', region: 'REGION_CN', membership: { level: 'LEVEL_BASIC' }, businessId: '' },
  usage: { limit: '100', used: '13', remaining: '87', resetTime: '2026-08-27T07:56:26.407903Z' },
  limits: [
    { window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
      detail: { limit: '100', used: '64', remaining: '36', resetTime: '2026-08-20T12:56:26.407903Z' } }
  ]
};
console.log(JSON.stringify(buildKimiQuotaWindows(sample), null, 1));
console.log('plan:', parseKimiPlan(sample));
// legacy plan: no weekly usage
const legacy = { user: { membership: { level: 'LEVEL_PRO' } }, limits: sample.limits };
console.log('legacy:', JSON.stringify(buildKimiQuotaWindows(legacy)));
console.log('legacy plan:', parseKimiPlan(legacy));
