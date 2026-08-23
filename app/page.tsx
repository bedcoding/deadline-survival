import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExperienceClient from '@/components/ExperienceClient';
import { loadMap } from '@/engine/mapfile';
import type { Balance } from '@/engine/balance';

export default function Page() {
  const root = process.cwd();
  const balance: Balance = JSON.parse(readFileSync(join(root, 'balance.json'), 'utf8'));
  const map = loadMap(join(root, 'maps', 'mart.map'));

  return <ExperienceClient map={map} balance={balance} />;
}
