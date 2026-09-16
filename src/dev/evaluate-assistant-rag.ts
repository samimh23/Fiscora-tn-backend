import { readFile } from 'node:fs/promises';
import {
  evaluateRagCase,
  type RagEvaluationAnswer,
  type RagEvaluationCase,
  summarizeRagEvaluation,
} from '../assistant/rag-evaluation';

async function main() {
  const apiUrl = required('FISCORA_API_URL').replace(/\/$/, '');
  const token = required('FISCORA_API_TOKEN');
  const organizationId = required('FISCORA_ORGANIZATION_ID');
  const dossierId = required('FISCORA_DOSSIER_ID');
  const datasetPath = process.argv[2];
  if (!datasetPath) {
    throw new Error(
      'Usage: npm run assistant:eval -- chemin/vers/cas-evaluation.json',
    );
  }
  const cases = JSON.parse(
    await readFile(datasetPath, 'utf8'),
  ) as RagEvaluationCase[];
  const results = [];
  for (const testCase of cases) {
    const response = await fetch(
      `${apiUrl}/api/organizations/${organizationId}/dossiers/${dossierId}/assistant/ask`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ question: testCase.question }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Cas ${testCase.id}: API ${response.status} ${(await response.text()).slice(0, 300)}`,
      );
    }
    const answer = (await response.json()) as RagEvaluationAnswer;
    const result = evaluateRagCase(testCase, answer);
    results.push(result);
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${testCase.id}`);
  }
  console.log(JSON.stringify(summarizeRagEvaluation(results), null, 2));
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

void main();
