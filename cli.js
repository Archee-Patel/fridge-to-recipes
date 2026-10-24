import { loadEnvironment } from './lib/environment.js';
import { generateRecipes, RecipeServiceError } from './lib/recipes.js';

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith('--')) throw new RecipeServiceError(`Unexpected argument: ${key}`, 400);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new RecipeServiceError(`Missing value for ${key}.`, 400);
    values[key.slice(2)] = value;
    index += 1;
  }

  return {
    ingredients: (values.ingredients || '').split(/[,\n]/).map((item) => item.trim()).filter(Boolean),
    dietary: values.dietary || '',
    cuisine: values.cuisine || '',
    maxCookTime: values['max-cook-time'] ?? '',
    servings: values.servings ?? '',
  };
}

function printRecipes({ recipes }) {
  recipes.forEach((recipe, index) => {
    console.log(`\n${index + 1}. ${recipe.title} — ${recipe.cookTimeMinutes} minutes`);
    console.log('Ingredients:');
    recipe.ingredients.forEach((item) => {
      const status = item.inPantry ? 'have' : 'missing';
      console.log(`  - [${status}] ${item.quantity} ${item.name}`);
    });
    console.log('Instructions:');
    recipe.instructions.forEach((step, stepIndex) => {
      console.log(`  ${stepIndex + 1}. ${step}`);
    });
  });
}

await loadEnvironment(new URL('.env', import.meta.url));
try {
  const input = parseArguments(process.argv.slice(2));
  printRecipes(await generateRecipes(input));
} catch (error) {
  if (error instanceof RecipeServiceError) {
    console.error(`Error: ${error.message}`);
    process.exitCode = error.status === 400 ? 2 : 1;
  } else {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
