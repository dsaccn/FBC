import { syncToCloud } from './src/lib/sync-engine';
async function run() {
  const res = await syncToCloud();
  console.log(JSON.stringify(res, null, 2));
}
run().catch(console.error);
