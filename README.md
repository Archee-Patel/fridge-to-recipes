# Good Things in the Fridge

A small recipe finder for turning the ingredients you already have into three dinner ideas. Suggestions are always vegetarian and egg-free: no eggs, meat, fish, or seafood. Use the browser interface or the command-line tool.

## Setup

Requirements: Node.js 18 or newer and a Groq API key.

```sh
cd recipe-app
cp .env
```

Add your key to `.env`:

```dotenv
GROQ_API_KEY=your_groq_api_key_here
```

The key is read by the local server or CLI only and is never sent to the browser. Both commands load `recipe-app/.env` automatically at startup; if you change `.env` while the server is running, restart it. `.env` is ignored by Git. You can optionally set `GROQ_MODEL` (defaults to `openai/gpt-oss-120b`) and `PORT` (defaults to `3000`). No package installation is needed; the app uses Node.js built-ins.

| Environment variable | Required | Description |
| --- | --- | --- |
| `GROQ_API_KEY` | Yes | Your Groq API key. The temporary key used for this setup is valid for 7 days; create a replacement when it expires, update `.env`, and restart the app. |
| `GROQ_MODEL` | No | Groq model ID; defaults to `openai/gpt-oss-120b`. |
| `PORT` | No | Web server port; defaults to `3000`. |

## Web app

```sh
npm start
```

Open <http://localhost:3000>, add ingredients separated by commas, and optionally choose a dietary preference, cuisine, maximum cook time, or serving count. Each suggestion includes quantities, step-by-step instructions, cook time, and a clear label for ingredients you may need to pick up.

For development with automatic server restarts:

```sh
npm run dev
```

## CLI

```sh
npm run cli -- --ingredients "chickpeas, spinach, cherry tomatoes, rice" \
  --dietary "dairy-free" --cuisine "Mediterranean" \
  --max-cook-time 30 --servings 2
```

Ingredients are required and can be separated by commas or new lines. All constraints are optional. The app retries once when Groq returns a transient error (rate limit, server error, or network failure); configuration, input, and other API errors are reported directly.

### Example run

Invocation:

```sh
npm run cli -- --ingredients "chickpeas, spinach, cherry tomatoes, rice" --cuisine "Mediterranean" --max-cook-time 30 --servings 2
```

Example output (recipe wording may vary between runs):

```text
1. Smoky Chickpea & Tomato Rice Bowls — 25 minutes
Ingredients:
  - [have] 1 can chickpeas, drained
  - [have] 1 cup cherry tomatoes, halved
  - [have] 2 cups spinach
  - [have] 1 cup rice
  - [missing] 1 tablespoon olive oil
  - [missing] 1 teaspoon smoked paprika
Instructions:
  1. Cook the rice according to its package directions.
  2. Warm the olive oil in a skillet, add the chickpeas and smoked paprika, and cook until golden.
  3. Stir in the tomatoes and spinach until the spinach wilts, then serve over rice.

2. Mediterranean Chickpea & Spinach Skillet — 20 minutes
Ingredients:
  - [have] 1 can chickpeas, drained
  - [have] 2 cups spinach
  - [have] 1 cup cherry tomatoes
  - [missing] 1 tablespoon olive oil
  - [missing] 1 lemon
Instructions:
  1. Heat the olive oil in a skillet and add the chickpeas.
  2. Add the tomatoes and cook until they soften, then fold in the spinach.
  3. Finish with lemon juice and serve warm.

3. Tomato Chickpea Rice Pilaf — 30 minutes
Ingredients:
  - [have] 1 cup rice
  - [have] 1 can chickpeas, drained
  - [have] 1 cup cherry tomatoes, halved
  - [have] 2 cups spinach
  - [missing] 1 small onion
  - [missing] 2 cups vegetable broth
  - [missing] 1 tablespoon olive oil
Instructions:
  1. Soften the chopped onion in a splash of olive oil.
  2. Stir in the rice, chickpeas, tomatoes, and vegetable broth.
  3. Cover and simmer until the rice is tender, then fold through the spinach and serve.
```

## Tests

```sh
npm test
```
