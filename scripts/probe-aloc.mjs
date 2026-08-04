import fs from 'fs';
import path from 'path';
import { ingestQuestionsForSubject } from '../lib/aloc-ingestion.ts';

const envPath = path.join(process.cwd(), '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const separatorIndex = line.indexOf('=');
  if (separatorIndex === -1) continue;
  const key = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  process.env[key] = value;
}

const result = await ingestQuestionsForSubject('English', 'jamb');
console.log(JSON.stringify(result, null, 2));
