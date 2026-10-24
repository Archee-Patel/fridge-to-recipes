const form = document.querySelector('#recipe-form');
const errorMessage = document.querySelector('#form-error');
const results = document.querySelector('#results');
const recipeList = document.querySelector('#recipe-list');
const submitButton = form.querySelector('button[type="submit"]');

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderRecipe(recipe, index) {
  const card = makeElement('article', 'recipe-card');
  const top = makeElement('div', 'recipe-card-top');
  top.append(makeElement('span', 'recipe-number', `IDEA 0${index + 1}`));
  top.append(makeElement('h3', '', recipe.title));
  top.append(makeElement('span', 'recipe-time', `◷  ${recipe.cookTimeMinutes} minutes`));

  const body = makeElement('div', 'recipe-card-body');
  body.append(makeElement('h4', '', 'What you’ll need'));
  const ingredients = makeElement('ul', 'ingredient-list');
  for (const item of recipe.ingredients) {
    const row = makeElement('li', 'ingredient-row');
    row.append(makeElement('span', item.inPantry ? 'ingredient-check' : 'ingredient-missing', item.inPantry ? '✓' : '＋'));
    row.append(makeElement('span', '', `${item.quantity} ${item.name}${item.inPantry ? '' : ' · pick up'}`));
    ingredients.append(row);
  }
  body.append(ingredients);

  body.append(makeElement('h4', '', 'A few simple steps'));
  const steps = makeElement('ol', 'recipe-steps');
  recipe.instructions.forEach((instruction) => steps.append(makeElement('li', '', instruction)));
  body.append(steps);
  card.append(top, body);
  return card;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.hidden = true;
  results.hidden = true;
  recipeList.replaceChildren();

  const formData = new FormData(form);
  const ingredients = String(formData.get('ingredients'))
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  submitButton.disabled = true;
  submitButton.querySelector('.button-label').textContent = 'Finding a little inspiration…';

  try {
    const response = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredients,
        dietary: formData.get('dietary'),
        cuisine: formData.get('cuisine'),
        maxCookTime: formData.get('maxCookTime'),
        servings: formData.get('servings'),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'We couldn’t find recipes just now. Please try again.');

    data.recipes.forEach((recipe, index) => recipeList.append(renderRecipe(recipe, index)));
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector('.button-label').textContent = 'Find my dinner ideas';
  }
});
