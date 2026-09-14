// The bundled interview deck: categories and prompts as static typed data.
// No network, no LLM, no randomness. Shipped in a fixed authored order so the
// flow is deterministic and its tests are stable. Later EPICs read from here;
// nothing here is user-editable.

export type CategoryId =
  | "foods"
  | "endearments"
  | "blessings"
  | "for-children"
  | "family-words"
  | "kinship";

export interface Category {
  id: CategoryId;
  label: string; // user-visible; passes the copy sweep
}

export interface Prompt {
  id: string; // stable, unique, e.g. "kinship-grandmother"
  category: CategoryId;
  text: string; // the question shown on screen; user-visible
  defaultMeaning: string; // gloss used as entry.meaning when none is typed; user-visible
}

export const CATEGORIES: Category[] = [
  { id: "foods", label: "Foods" },
  { id: "endearments", label: "Endearments" },
  { id: "blessings", label: "Blessings" },
  { id: "for-children", label: "Words for little ones" },
  { id: "family-words", label: "Family words" },
  { id: "kinship", label: "Family names" },
];

export const DECK: Prompt[] = [
  // Foods
  {
    id: "foods-family-dish",
    category: "foods",
    text: "A dish only your family makes. What is it called?",
    defaultMeaning: "a family dish",
  },
  {
    id: "foods-celebration",
    category: "foods",
    text: "The food you cooked for a celebration. Say its name.",
    defaultMeaning: "celebration food",
  },
  {
    id: "foods-sweet",
    category: "foods",
    text: "A sweet or treat from your childhood. What did you call it?",
    defaultMeaning: "a childhood treat",
  },
  {
    id: "foods-staple",
    category: "foods",
    text: "Your everyday bread or rice. Say its name.",
    defaultMeaning: "an everyday staple",
  },
  {
    id: "foods-drink",
    category: "foods",
    text: "A drink your family shared at the table. What is it called?",
    defaultMeaning: "a family drink",
  },
  {
    id: "foods-kitchen-smell",
    category: "foods",
    text: "The smell from your mother's kitchen. What food was it?",
    defaultMeaning: "a remembered food",
  },

  // Endearments
  {
    id: "endearments-loved-one",
    category: "endearments",
    text: "What you call someone you love. Say it out loud.",
    defaultMeaning: "a word of love",
  },
  {
    id: "endearments-little-one",
    category: "endearments",
    text: "The pet name for a little one in your family.",
    defaultMeaning: "a pet name for a child",
  },
  {
    id: "endearments-sweetheart",
    category: "endearments",
    text: "A name you called your sweetheart.",
    defaultMeaning: "a name for a sweetheart",
  },
  {
    id: "endearments-baby-name",
    category: "endearments",
    text: "What your parents called you as a baby.",
    defaultMeaning: "a baby name",
  },
  {
    id: "endearments-still-use",
    category: "endearments",
    text: "A tender word you still use today.",
    defaultMeaning: "a tender word",
  },

  // Blessings
  {
    id: "blessings-meal",
    category: "blessings",
    text: "What you say before a meal.",
    defaultMeaning: "a mealtime blessing",
  },
  {
    id: "blessings-travel",
    category: "blessings",
    text: "A blessing for someone leaving on a trip.",
    defaultMeaning: "a blessing for travel",
  },
  {
    id: "blessings-new-baby",
    category: "blessings",
    text: "Words you say over a new baby.",
    defaultMeaning: "a blessing for a baby",
  },
  {
    id: "blessings-birthday",
    category: "blessings",
    text: "What you wish someone on their birthday.",
    defaultMeaning: "a birthday wish",
  },
  {
    id: "blessings-family-prayer",
    category: "blessings",
    text: "A prayer or blessing your family repeats.",
    defaultMeaning: "a family blessing",
  },
  {
    id: "blessings-sneeze",
    category: "blessings",
    text: "What you say when someone sneezes.",
    defaultMeaning: "what you say when someone sneezes",
  },

  // Words for little ones
  {
    id: "for-children-wake",
    category: "for-children",
    text: "What you say to wake a child in the morning.",
    defaultMeaning: "waking a child",
  },
  {
    id: "for-children-careful",
    category: "for-children",
    text: "How you tell a child to take care.",
    defaultMeaning: "telling a child to take care",
  },
  {
    id: "for-children-comfort",
    category: "for-children",
    text: "The words you use to comfort a crying child.",
    defaultMeaning: "comforting a child",
  },
  {
    id: "for-children-rhyme",
    category: "for-children",
    text: "A little rhyme or song for a baby.",
    defaultMeaning: "a rhyme for a baby",
  },
  {
    id: "for-children-bedtime",
    category: "for-children",
    text: "What you say at bedtime.",
    defaultMeaning: "a bedtime saying",
  },

  // Family words
  {
    id: "family-words-only-us",
    category: "family-words",
    text: "A word only your family uses. Say it.",
    defaultMeaning: "a family word",
  },
  {
    id: "family-words-place",
    category: "family-words",
    text: "The nickname your family gave a place.",
    defaultMeaning: "a family name for a place",
  },
  {
    id: "family-words-everyday",
    category: "family-words",
    text: "A made-up word for an everyday thing.",
    defaultMeaning: "a made-up everyday word",
  },
  {
    id: "family-words-child-made",
    category: "family-words",
    text: "A funny word a child in the family created.",
    defaultMeaning: "a child's invented word",
  },
  {
    id: "family-words-private",
    category: "family-words",
    text: "A word your family uses that outsiders would miss.",
    defaultMeaning: "a private family word",
  },

  // Family names
  {
    id: "kinship-grandmother",
    category: "kinship",
    text: "What you called your grandmother.",
    defaultMeaning: "grandmother",
  },
  {
    id: "kinship-grandfather",
    category: "kinship",
    text: "What you called your grandfather.",
    defaultMeaning: "grandfather",
  },
  {
    id: "kinship-mother",
    category: "kinship",
    text: "The word for mother in your language.",
    defaultMeaning: "mother",
  },
  {
    id: "kinship-father",
    category: "kinship",
    text: "The word for father in your language.",
    defaultMeaning: "father",
  },
  {
    id: "kinship-aunt-uncle",
    category: "kinship",
    text: "What you call an aunt or uncle.",
    defaultMeaning: "aunt or uncle",
  },
  {
    id: "kinship-sibling",
    category: "kinship",
    text: "The word for a brother or sister.",
    defaultMeaning: "brother or sister",
  },
];

// Look up a category's user-visible label. Falls back to the raw id for values
// with no category (e.g. legacy "uncategorized" entries), so callers never show
// an empty tag; the dictionary hides the tag for those instead.
export function categoryLabel(id: string): string {
  const found = CATEGORIES.find((c) => c.id === id);
  return found ? found.label : id;
}
