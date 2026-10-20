import { Command } from 'commander';
import { startUiServer } from '../ui/server.js';
import {
  MODEL_VERSION,
  CORE_SHA256,
  DEFAULTS,
  SCENARIOS,
  PARAM_RULES,
  buildRun,
  type SimLabParameters
} from '../kernel/index.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('sim-lab')
    .description('SimLab v0.2 电商经营仿真实验室命令行工具')
    .version('0.2.0');

  // 1. sim-lab ui
  program
    .command('ui')
    .description('启动 SimLab 本地 HTTP 工作台服务')
    .option('-p, --port <number>', '监听端口 (默认 4175，占用自动顺延)', process.env.SIMLAB_PORT || '4175')
    .option('-h, --host <host>', '绑定主机地址', '127.0.0.1')
    .action(async options => {
      const port = parseInt(options.port, 10) || 4175;
      await startUiServer(port, options.host);
    });

  // 2. sim-lab inspect-model
  program
    .command('inspect-model')
    .description('查询仿真模型版本、SHA-256、参数口径与未建模能力')
    .action(() => {
      console.log('--------------------------------------------------');
      console.log(`模型版本: ${MODEL_VERSION}`);
      console.log(`内核哈希: ${CORE_SHA256}`);
      console.log('受支持情景:');
      SCENARIOS.forEach(s => console.log(`  - [${s.id}] ${s.name}: ${s.note}`));
      console.log('\n未建模范围 (诚实拒止):');
      console.log('  - 多仓调拨');
      console.log('  - 退货回仓');
      console.log('  - 随机概率分布');
      console.log('  - 账期融资');
      console.log('--------------------------------------------------');
    });

  // 3. sim-lab run
  program
    .command('run')
    .description('使用指定参数在命令行执行一次离散事件仿真推演')
    .option('--demand <number>', '基础日均需求量')
    .option('--capacity <number>', '每日发货能力')
    .option('--price <number>', '商品单价')
    .option('--cost <number>', '商品进价')
    .action(options => {
      const p: SimLabParameters = {
        ...DEFAULTS,
        ...(options.demand !== undefined ? { demand: Number(options.demand) } : {}),
        ...(options.capacity !== undefined ? { capacity: Number(options.capacity) } : {}),
        ...(options.price !== undefined ? { price: Number(options.price) } : {}),
        ...(options.cost !== undefined ? { cost: Number(options.cost) } : {})
      };

      const result = buildRun(p, 1);
      const bSummary = result.results.baseline.summary;

      console.log('\n=== SimLab 仿真执行结果 (SIM-001) ===');
      console.log(`基准情景贡献利润: ${bSummary.contribution.toLocaleString()} 元`);
      console.log(`基准期末现金余额: ${bSummary.closingCash.toLocaleString()} 元`);
      console.log(`基准最低现金点位: ${bSummary.minCash.toLocaleString()} 元 (第 ${bSummary.minCashDay} 天)`);
      console.log(`基准总交付率: ${(bSummary.fulfillmentRate! * 100).toFixed(1)}%`);
      console.log(`守恒性检验状态: ${bSummary.valid ? '通过 (VALID)' : '失败'}`);
      console.log('=====================================\n');
    });

  return program;
}

// Auto execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const program = createCli();
  program.parse(process.argv);
}
