import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnvironment } from '../lib/environment.js';
import { generateRecipes, RecipeServiceError, validateInput } from '../lib/recipes.js';

test('loads environment variables from a .env file without overriding the shell', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fridge-to-recipes-'));
  const variable = 'FRIDGE_TO_RECIPES_TEST_KEY';
  const original = process.env[variable];
  try {
    process.env[variable] = 'shell-value';
    await writeFile(join(directory, '.env'), `# comment\n${variable}=file-value\nFRIDGE_TO_RECIPES_FILE_VALUE="quoted value"\n`);
    await loadEnvironment(pathToFileURL(join(directory, '.env')));
    assert.equal(process.env[variable], 'shell-value');
    assert.equal(process.env.FRIDGE_TO_RECIPES_FILE_VALUE, 'quoted value');
  } finally {
    if (original === undefined) delete process.env[variable];
    else process.env[variable] = original;
    delete process.env.FRIDGE_TO_RECIPES_FILE_VALUE;
    await rm(directory, { recursive: true });
  }
});

const sampleRecipes = {
  recipes: [1, 2, 3].map((number) => ({
    title: `Chickpea supper ${number}`,
    cookTimeMinutes: 20,
    ingredients: [
      { name: 'chickpeas', quantity: '1 can' },
      { name: 'olive oil', quantity: '1 tbsp' },
    ],
    instructions: ['Warm the chickpeas with olive oil.', 'Serve while warm.'],
  })),
};

function groqResponse(content, status = 200) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) } }],
  }), { status, headers: { 'Content-Type': 'application/json' } });
}

test('validates and normalizes ingredient and optional constraint inputs', () => {
  assert.deepEqual(validateInput({
    ingredients: [' chickpeas ', '', 'spinach'],
    maxCookTime: '30',
    servings: '2',
  }), {
    ingredients: ['chickpeas', 'spinach'],
    dietary: '',
    cuisine: '',
    maxCookTime: 30,
    servings: 2,
  });
});

test('rejects a non-object request body as a client error', () => {
  assert.throws(
    () => validateInput(null),
    (error) => error instanceof RecipeServiceError && error.status === 400,
  );
});

test('allows eggplant while rejecting animal stocks and egg-based sauces', () => {
  assert.deepEqual(validateInput({ ingredients: ['eggplant'] }).ingredients, ['eggplant']);
  for (const ingredient of ['chicken stock', 'mayonnaise']) {
    assert.throws(
      () => validateInput({ ingredients: [ingredient] }),
      (error) => error instanceof RecipeServiceError && error.status === 400,
    );
  }
});

test('rejects ingredients that conflict with the vegetarian, egg-free promise', () => {
  for (const ingredient of ['eggs', 'fish', 'chicken', 'eggplant parmesan with eggs']) {
    assert.throws(
      () => validateInput({ ingredients: ['spinach', ingredient] }),
      (error) => error instanceof RecipeServiceError && error.status === 400,
    );
  }
});

test('marks pantry ingredients locally and labels missing items', async () => {
  const result = await generateRecipes({ ingredients: ['chickpeas'] }, {
    apiKey: 'test-key',
    fetchImpl: async () => groqResponse(sampleRecipes),
  });
  assert.equal(result.recipes.length, 3);
  assert.equal(result.recipes[0].ingredients[0].inPantry, true);
  assert.equal(result.recipes[0].ingredients[1].inPantry, false);
});

test('uses the current default Groq model when no model is configured', async () => {
  const previousModel = process.env.GROQ_MODEL;
  delete process.env.GROQ_MODEL;
  let requestedModel;
  try {
    await generateRecipes({ ingredients: ['chickpeas'] }, {
      apiKey: 'test-key',
      fetchImpl: async (_url, request) => {
        requestedModel = JSON.parse(request.body).model;
        return groqResponse(sampleRecipes);
      },
    });
  } finally {
    if (previousModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = previousModel;
  }
  assert.equal(requestedModel, 'openai/gpt-oss-120b');
});

test('retries a transient API failure once', async () => {
  let calls = 0;
  const result = await generateRecipes({ ingredients: ['chickpeas'] }, {
    apiKey: 'test-key',
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response('temporary error', { status: 503 })
        : groqResponse(sampleRecipes);
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.recipes.length, 3);
});

test('does not retry a non-transient API failure', async () => {
  let calls = 0;
  await assert.rejects(
    generateRecipes({ ingredients: ['chickpeas'] }, {
      apiKey: 'test-key',
      fetchImpl: async () => {
        calls += 1;
        return new Response('unauthorized', { status: 401 });
      },
    }),
    /Groq rejected the API key/,
  );
  assert.equal(calls, 1);
});

test('rejects generated recipes that contain eggs, meat, or fish', async () => {
  const unsafeRecipes = structuredClone(sampleRecipes);
  unsafeRecipes.recipes[0].ingredients.push({ name: 'egg whites', quantity: '2' });
  await assert.rejects(
    generateRecipes({ ingredients: ['chickpeas'] }, {
      apiKey: 'test-key',
      fetchImpl: async () => groqResponse(unsafeRecipes),
    }),
    /did not meet the vegetarian, egg-free promise/,
  );
});

test('requires exactly three complete recipes', async () => {
  await assert.rejects(
    generateRecipes({ ingredients: ['chickpeas'] }, {
      apiKey: 'test-key',
      fetchImpl: async () => groqResponse({ recipes: sampleRecipes.recipes.slice(0, 2) }),
    }),
    /unexpected result/,
  );
});
