import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  evaluateRagCase,
  type RagEvaluationAnswer,
  type RagEvaluationCase,
  summarizeRagEvaluation,
} from '../assistant/rag-evaluation';
import { buildEvaluationCases } from './rag-eval/cases';

/**
 * Asks the running API every evaluation question and scores the answers.
 *
 *   npm run assistant:eval -- --builtin --out rag-eval-results/baseline.json
 *   npm run assistant:eval -- path/to/cases.json --only bank,refusal
 *
 * `--builtin` uses the synthetic dossier seeded by `assistant:eval:seed`.
 */
async function main() {
  const apiUrl = required('FISCORA_API_URL').replace(/\/$/, '');
  const token = required('FISCORA_API_TOKEN');
  const organizationId = required('FISCORA_ORGANIZATION_ID');
  const dossierId = required('FISCORA_DOSSIER_ID');
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const builtin = args.includes('--builtin');
  const datasetPath = args.find(
    (value, index) =>
      !value.startsWith('--') &&
      !['--out', '--only'].includes(args[index - 1] ?? ''),
  );
  if (!builtin && !datasetPath) {
    throw new Error(
      'Usage: npm run assistant:eval -- (--builtin | chemin/vers/cas.json) [--only categorie,...] [--out resultats.json]',
    );
  }
  const only = option('--only')?.split(',').filter(Boolean);
  const outPath = option('--out');
  const allCases = builtin
    ? buildEvaluationCases()
    : (JSON.parse(await readFile(datasetPath!, 'utf8')) as RagEvaluationCase[]);
  const cases = only
    ? allCases.filter((item) => only.includes(item.category ?? 'general'))
    : allCases;

  const results = [];
  const answers: Record<string, RagEvaluationAnswer> = {};
  for (const testCase of cases) {
    const conversationStartedAt = new Date().toISOString();
    const ask = async (question: string): Promise<RagEvaluationAnswer> => {
      const startedAt = performance.now();
      const response = await fetch(
        `${apiUrl}/api/organizations/${organizationId}/assistant/ask`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ question, dossierId, conversationStartedAt }),
        },
      );
      const latencyMs = Math.round(performance.now() - startedAt);
      // The API answers 400 when the validated sources cannot support an answer.
      if (response.status === 400) {
        const body = await response.text();
        return { answer: body, citations: [], refused: true, latencyMs };
      }
      if (!response.ok) {
        throw new Error(
          `Cas ${testCase.id}: API ${response.status} ${(await response.text()).slice(0, 300)}`,
        );
      }
      const answer = (await response.json()) as RagEvaluationAnswer;
      return { ...answer, latencyMs };
    };
    for (const question of testCase.setupQuestions ?? []) await ask(question);
    const answer = await ask(testCase.question);
    answers[testCase.id] = answer;
    const result = evaluateRagCase(testCase, answer);
    results.push(result);
    console.log(
      `${result.passed ? 'PASS' : 'FAIL'} ${testCase.id} (${answer.latencyMs} ms)`,
    );
    for (const failure of result.failures) console.log(`  ${failure}`);
  }
  const summary = summarizeRagEvaluation(results);
  console.log(JSON.stringify(summary, null, 2));
  if (outPath) {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(
      outPath,
      JSON.stringify(
        {
          ranAt: new Date().toISOString(),
          apiUrl,
          summary,
          results: results.map((result) => ({
            ...result,
            question: cases.find((item) => item.id === result.id)?.question,
            answer: answers[result.id]?.answer,
            citedDocuments: answers[result.id]?.citations.map(
              (citation) => citation.sourceName,
            ),
          })),
        },
        null,
        2,
      ),
    );
    console.log(`Résultats écrits dans ${outPath}`);
  }
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

void main();
