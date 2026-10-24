const FORBIDDEN_INGREDIENT = /\b(?:eggs?(?:\s+(?:whites?|yolks?))?|albumin|ovalbumin|mayonnaise|aioli|meat|poultry|chicken|beef|veal|pork|lamb|mutton|goat|turkey|duck|goose|rabbit|quail|pheasant|venison|elk|bison|boar|kangaroo|alligator|fish|seafood|shellfish|shrimp|prawns?|crabs?|lobsters?|oysters?|mussels?|clams?|scallops?|anchov(?:y|ies)|sardines?|tuna|salmon|cod|gelatin|lard|bacon|ham|sausages?|prosciutto|pepperoni|chorizo|bone broth|(?:chicken|beef|pork|fish|meat) (?:broth|stock)|fish sauce|worcestershire sauce)\b/i;

export class RecipeServiceError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'RecipeServiceError';
    this.status = status;
  }
}

export function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RecipeServiceError('Request must be a JSON object.', 400);
  }

  const ingredients = Array.isArray(input.ingredients)
    ? input.ingredients.map((item) => String(item).trim()).filter(Boolean)
    : [];

  if (ingredients.length === 0) {
    throw new RecipeServiceError('Add at least one ingredient to get started.', 400);
  }

  if (ingredients.length > 40 || ingredients.some((item) => item.length > 80)) {
    throw new RecipeServiceError('Please enter up to 40 ingredients, each 80 characters or fewer.', 400);
  }

  const forbidden = ingredients.find((item) => FORBIDDEN_INGREDIENT.test(item));
  if (forbidden) {
    throw new RecipeServiceError(
      'This kitchen only suggests vegetarian, egg-free recipes. Remove non-vegetarian ingredients and try again.',
      400,
    );
  }

  const maxCookTime = input.maxCookTime === '' || input.maxCookTime == null
    ? null
    : Number(input.maxCookTime);
  const servings = input.servings === '' || input.servings == null
    ? null
    : Number(input.servings);

  if (maxCookTime !== null && (!Number.isInteger(maxCookTime) || maxCookTime < 1 || maxCookTime > 600)) {
    throw new RecipeServiceError('Maximum cook time must be between 1 and 600 minutes.', 400);
  }
  if (servings !== null && (!Number.isInteger(servings) || servings < 1 || servings > 20)) {
    throw new RecipeServiceError('Servings must be between 1 and 20.', 400);
  }

  return {
    ingredients,
    dietary: String(input.dietary || '').trim().slice(0, 120),
    cuisine: String(input.cuisine || '').trim().slice(0, 80),
    maxCookTime,
    servings,
  };
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isInPantry(ingredient, pantry) {
  const normalizedIngredient = normalize(ingredient);
  return pantry.some((item) => {
    const normalizedPantryItem = normalize(item);
    return normalizedIngredient === normalizedPantryItem
      || normalizedIngredient.includes(normalizedPantryItem)
      || normalizedPantryItem.includes(normalizedIngredient);
  });
}

function recipeContainsForbiddenFood(recipe) {
  const text = [
    recipe.title,
    ...recipe.ingredients.map((item) => `${item.name} ${item.quantity}`),
    ...recipe.instructions,
  ].join(' ');
  return FORBIDDEN_INGREDIENT.test(text);
}

function validateRecipes(data, pantry) {
  if (!data || !Array.isArray(data.recipes) || data.recipes.length !== 3) {
    throw new RecipeServiceError('The recipe service returned an unexpected result. Please try again.');
  }

  const recipes = data.recipes.map((recipe) => {
    if (
      typeof recipe.title !== 'string'
      || !Number.isInteger(recipe.cookTimeMinutes)
      || recipe.cookTimeMinutes < 1
      || !Array.isArray(recipe.ingredients)
      || recipe.ingredients.length === 0
      || !Array.isArray(recipe.instructions)
      || recipe.instructions.length === 0
    ) {
      throw new RecipeServiceError('The recipe service returned an incomplete recipe. Please try again.');
    }

    const ingredients = recipe.ingredients.map((item) => {
      if (typeof item.name !== 'string' || typeof item.quantity !== 'string') {
        throw new RecipeServiceError('The recipe service returned an incomplete ingredient. Please try again.');
      }
      return {
        name: item.name.trim(),
        quantity: item.quantity.trim(),
        inPantry: isInPantry(item.name, pantry),
      };
    });

    const normalizedRecipe = {
      title: recipe.title.trim(),
      cookTimeMinutes: recipe.cookTimeMinutes,
      ingredients,
      instructions: recipe.instructions.map((step) => String(step).trim()).filter(Boolean),
    };

    if (recipeContainsForbiddenFood(normalizedRecipe)) {
      throw new RecipeServiceError(
        'A suggestion did not meet the vegetarian, egg-free promise. Please try again.',
      );
    }
    return normalizedRecipe;
  });

  return recipes;
}

function buildPrompt(input) {
  return [
    'Create exactly three distinct, practical recipes using the user’s ingredients.',
    'Every recipe must be strictly vegetarian and contain no eggs, meat, poultry, fish, seafood, gelatin, lard, or animal-derived sauces or stocks.',
    'Dairy is allowed unless the dietary preference says otherwise. Never mention or include prohibited foods, even as optional ingredients.',
    'Use the pantry ingredients where sensible. Other ingredients are allowed and will be marked as missing.',
    'Honor the dietary preference, cuisine, maximum cook time, and servings when provided.',
    'Return only a JSON object matching this shape: {"recipes":[{"title":"...","cookTimeMinutes":20,"ingredients":[{"name":"...","quantity":"..."}],"instructions":["..."]}]}',
    'Use clear quantities and numbered, actionable instruction steps. Do not include markdown.',
    `Ingredients on hand: ${input.ingredients.join(', ')}`,
    `Additional dietary preference: ${input.dietary || 'none'}`,
    `Cuisine: ${input.cuisine || 'any'}`,
    `Maximum cook time in minutes: ${input.maxCookTime ?? 'not specified'}`,
    `Servings: ${input.servings ?? 'not specified'}`,
  ].join('\n');
}

function isTransientStatus(status) {
  return status === 429 || status >= 500;
}

export async function generateRecipes(rawInput, options = {}) {
  const input = validateInput(rawInput);
  const apiKey = options.apiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new RecipeServiceError('GROQ_API_KEY is not set. Add it to your environment or .env file.', 503);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
  const request = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a practical home cook. Follow every recipe and food-safety constraint exactly.',
        },
        { role: 'user', content: buildPrompt(input) },
      ],
    }),
  };

  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', request);
    } catch (error) {
      if (attempt === 0) continue;
      throw new RecipeServiceError(`Could not reach Groq after one retry: ${error.message}`, 502);
    }

    if (response.ok) break;
    if (!isTransientStatus(response.status) || attempt === 1) {
      const detail = await response.text();
      const message = response.status === 401
        ? 'Groq rejected the API key. Check GROQ_API_KEY and try again.'
        : `Groq request failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`;
      throw new RecipeServiceError(message, response.status === 429 ? 503 : 502);
    }
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new RecipeServiceError('Groq returned an unreadable response. Please try again.', 502);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new RecipeServiceError('Groq returned no recipe suggestions. Please try again.', 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new RecipeServiceError('Groq returned recipes in an unexpected format. Please try again.', 502);
  }

  return { recipes: validateRecipes(parsed, input.ingredients) };
}
