/**
 * Curated FoodConcept catalog — the generic foods recipes refer to.
 * Reference nutrition per 100 g/ml from standard composition tables;
 * products carry their own data, these values are the concept-level fallback.
 * Tuple: [slug, en, fr, category, shelfLife, basis, kcal, protein, carb, fat, satFat, fiber, sugars, salt]
 * basis: g = per 100 g, ml = per 100 ml.
 */
export type ConceptRow = [
  string, string, string, string,
  "storable" | "semi" | "fresh", "g" | "ml",
  number, number, number, number, number, number, number, number,
];

export const FOOD_CONCEPTS: ConceptRow[] = [
  // ── Poultry ──────────────────────────────────────────────────────────────
  ["chicken-breast", "Chicken breast", "Blanc de poulet", "poultry", "fresh", "g", 165, 31, 0, 3.6, 1, 0, 0, 0.07],
  ["chicken-thigh", "Chicken thigh", "Cuisse de poulet", "poultry", "fresh", "g", 209, 26, 0, 10.9, 3.2, 0, 0, 0.09],
  ["whole-chicken", "Whole chicken", "Poulet entier", "poultry", "fresh", "g", 190, 27, 0, 8.1, 2.4, 0, 0, 0.08],
  ["ground-turkey", "Ground turkey", "Dinde hachée", "poultry", "fresh", "g", 157, 27, 0, 4.7, 1.3, 0, 0, 0.08],
  ["turkey-cutlet", "Turkey cutlet", "Escalope de dinde", "poultry", "fresh", "g", 135, 29, 0, 1.7, 0.5, 0, 0, 0.09],

  // ── Beef & lamb (halal-relevant) ─────────────────────────────────────────
  ["ground-beef-5", "Ground beef 5%", "Bœuf haché 5%", "beef", "fresh", "g", 137, 21, 0, 5, 2.1, 0, 0, 0.12],
  ["ground-beef-15", "Ground beef 15%", "Bœuf haché 15%", "beef", "fresh", "g", 215, 19.5, 0, 15, 6, 0, 0, 0.13],
  ["beef-steak", "Beef steak", "Steak de bœuf", "beef", "fresh", "g", 187, 26, 0, 8.7, 3.5, 0, 0, 0.1],
  ["lamb-leg", "Lamb leg", "Gigot d'agneau", "lamb", "fresh", "g", 208, 26, 0, 11, 4.3, 0, 0, 0.11],
  ["lamb-shoulder", "Lamb shoulder", "Épaule d'agneau", "lamb", "fresh", "g", 242, 24, 0, 16, 6.6, 0, 0, 0.11],
  ["ground-lamb", "Ground lamb", "Agneau haché", "lamb", "fresh", "g", 235, 22, 0, 16, 6.9, 0, 0, 0.12],
  ["veal-cutlet", "Veal cutlet", "Escalope de veau", "beef", "fresh", "g", 131, 24, 0, 2.4, 0.9, 0, 0, 0.1],

  // ── Pork (catalog completeness; halal filtering happens per product) ──────
  ["pork-chop", "Pork chop", "Côte de porc", "pork", "fresh", "g", 187, 27, 0, 7.3, 2.5, 0, 0, 0.1],
  ["lardons", "Lardons", "Lardons", "pork", "fresh", "g", 297, 14, 0.5, 27, 10, 0, 0, 1.6],
  ["ham", "Cooked ham", "Jambon blanc", "pork", "semi", "g", 108, 18, 1.5, 3.2, 1.1, 0, 1, 1.3],

  // ── Fish & seafood ───────────────────────────────────────────────────────
  ["salmon-fillet", "Salmon fillet", "Filet de saumon", "fish", "fresh", "g", 208, 20, 0, 13, 3.1, 0, 0, 0.11],
  ["cod-fillet", "Cod fillet", "Filet de cabillaud", "fish", "fresh", "g", 82, 18, 0, 0.7, 0.1, 0, 0, 0.1],
  ["tuna-can", "Canned tuna", "Thon en conserve", "fish", "storable", "g", 116, 26, 0, 0.8, 0.2, 0, 0, 0.6],
  ["sardines-can", "Canned sardines", "Sardines en conserve", "fish", "storable", "g", 208, 25, 0, 11, 1.7, 0, 0, 0.5],
  ["shrimp", "Shrimp", "Crevettes", "fish", "fresh", "g", 99, 24, 0.2, 0.3, 0.1, 0, 0, 0.4],
  ["smoked-salmon", "Smoked salmon", "Saumon fumé", "fish", "semi", "g", 117, 18, 0, 4.3, 0.8, 0, 0, 1.8],
  ["white-fish-frozen", "Frozen white fish", "Poisson blanc surgelé", "fish", "storable", "g", 90, 19, 0, 0.8, 0.1, 0, 0, 0.15],

  // ── Eggs & dairy ─────────────────────────────────────────────────────────
  ["eggs", "Eggs", "Œufs", "eggs", "fresh", "g", 143, 12.5, 0.7, 9.5, 3, 0, 0.3, 0.35],
  ["milk", "Milk", "Lait", "dairy", "semi", "ml", 64, 3.3, 4.8, 3.6, 2.3, 0, 4.8, 0.1],
  ["greek-yogurt", "Greek yogurt", "Yaourt grec", "dairy", "semi", "g", 97, 9, 3.6, 5, 3.2, 0, 3.6, 0.08],
  ["natural-yogurt", "Plain yogurt", "Yaourt nature", "dairy", "semi", "g", 62, 4.3, 4.7, 3.2, 2, 0, 4.7, 0.11],
  ["fromage-blanc", "Fromage blanc", "Fromage blanc", "dairy", "semi", "g", 60, 7.5, 3.7, 1.7, 1, 0, 3.7, 0.09],
  ["mozzarella", "Mozzarella", "Mozzarella", "dairy", "semi", "g", 280, 22, 2.2, 21, 13, 0, 1, 0.6],
  ["gruyere", "Gruyère", "Gruyère", "dairy", "semi", "g", 394, 27, 0.4, 32, 19, 0, 0.4, 1.2],
  ["parmesan", "Parmesan", "Parmesan", "dairy", "storable", "g", 402, 33, 0.7, 29, 19, 0, 0.4, 1.6],
  ["feta", "Feta", "Féta", "dairy", "semi", "g", 264, 14, 4.1, 21, 15, 0, 4.1, 2.6],
  ["cream", "Fresh cream", "Crème fraîche", "dairy", "semi", "ml", 293, 2.4, 3, 30, 19, 0, 3, 0.08],
  ["butter", "Butter", "Beurre", "dairy", "storable", "g", 745, 0.7, 0.6, 82, 55, 0, 0.6, 0.02],
  ["cottage-cheese", "Cottage cheese", "Faisselle", "dairy", "semi", "g", 98, 11, 3.4, 4.3, 2.4, 0, 3.4, 0.36],
  ["saint-moret", "Fresh spreadable cheese", "Fromage frais à tartiner", "dairy", "semi", "g", 203, 8, 3.5, 18, 12, 0, 3.5, 0.6],

  // ── Grains, starches, pasta, bread ───────────────────────────────────────
  ["rice-white", "White rice", "Riz blanc", "grains", "storable", "g", 349, 7.1, 77, 0.9, 0.3, 1.3, 0.1, 0.01],
  ["rice-basmati", "Basmati rice", "Riz basmati", "grains", "storable", "g", 350, 8, 77, 0.8, 0.3, 1.8, 0.1, 0.01],
  ["rice-complete", "Wholegrain rice", "Riz complet", "grains", "storable", "g", 348, 7.5, 73, 2.7, 0.6, 3.4, 0.9, 0.01],
  ["pasta", "Pasta", "Pâtes", "grains", "storable", "g", 355, 12, 72, 1.5, 0.3, 3, 2, 0.01],
  ["pasta-wholegrain", "Wholewheat pasta", "Pâtes complètes", "grains", "storable", "g", 342, 13.5, 66, 2.5, 0.5, 8.5, 2.5, 0.01],
  ["couscous", "Couscous semolina", "Semoule de couscous", "grains", "storable", "g", 358, 12, 74, 1.2, 0.2, 5, 1.5, 0.01],
  ["bulgur", "Bulgur", "Boulgour", "grains", "storable", "g", 342, 12, 69, 1.3, 0.2, 18, 0.5, 0.02],
  ["quinoa", "Quinoa", "Quinoa", "grains", "storable", "g", 368, 14, 64, 6.1, 0.7, 7, 0, 0.02],
  ["oats", "Rolled oats", "Flocons d'avoine", "grains", "storable", "g", 375, 13, 60, 7, 1.3, 10, 1, 0.02],
  ["bread-baguette", "Baguette", "Baguette", "bakery", "semi", "g", 274, 9, 55, 1.8, 0.4, 2.5, 2, 1.2],
  ["bread-wholegrain", "Wholegrain bread", "Pain complet", "bakery", "semi", "g", 247, 11, 41, 3.4, 0.7, 6.9, 2.5, 1.1],
  ["tortillas", "Wheat tortillas", "Tortillas de blé", "grains", "storable", "g", 306, 8, 51, 7.5, 1.6, 2.8, 2.2, 0.9],
  ["potatoes", "Potatoes", "Pommes de terre", "vegetables", "semi", "g", 77, 2, 16.7, 0.2, 0.1, 2.1, 0.7, 0.01],
  ["sweet-potatoes", "Sweet potatoes", "Patates douces", "vegetables", "semi", "g", 86, 1.6, 20, 0.2, 0.1, 3, 4.2, 0.03],
  ["flour", "Wheat flour", "Farine de blé", "grains", "storable", "g", 348, 10, 72, 1.2, 0.2, 3, 0.3, 0.01],
  ["potato-gnocchi", "Potato gnocchi", "Gnocchi", "grains", "storable", "g", 168, 4.5, 34, 0.9, 0.2, 2, 1, 0.3],

  // ── Legumes & plant protein ──────────────────────────────────────────────
  ["lentils-green", "Green lentils", "Lentilles vertes", "legumes", "storable", "g", 323, 24, 53, 1.4, 0.2, 11, 2.2, 0.02],
  ["lentils-coral", "Red lentils", "Lentilles corail", "legumes", "storable", "g", 336, 24, 57, 1.2, 0.2, 10.5, 2.3, 0.02],
  ["chickpeas-dry", "Chickpeas (dry)", "Pois chiches (secs)", "legumes", "storable", "g", 353, 20, 58, 6, 0.6, 15, 10.7, 0.05],
  ["chickpeas-can", "Canned chickpeas", "Pois chiches en conserve", "legumes", "storable", "g", 119, 7.5, 17, 2.1, 0.3, 4.8, 0.4, 0.4],
  ["white-beans-can", "Canned white beans", "Haricots blancs en conserve", "legumes", "storable", "g", 100, 6.5, 15, 1.2, 0.2, 4.9, 0.3, 0.5],
  ["red-beans-can", "Canned red kidney beans", "Haricots rouges en conserve", "legumes", "storable", "g", 110, 7.5, 16, 1.1, 0.2, 5.3, 0.4, 0.5],
  ["tofu-firm", "Firm tofu", "Tofu ferme", "plant-protein", "fresh", "g", 127, 15, 1.9, 6.8, 1, 1, 0.5, 0.06],
  ["tofu-silken", "Silken tofu", "Tofu soyeux", "plant-protein", "semi", "g", 62, 6.5, 1.5, 3.2, 0.5, 0.3, 0.5, 0.05],
  ["halloumi", "Halloumi", "Halloumi", "dairy", "semi", "g", 321, 22, 1.5, 25, 16, 0, 1, 2.2],
  ["frozen-veggie-burger", "Veggie burger", "Steak végétal", "plant-protein", "storable", "g", 200, 16, 9, 9, 1.5, 4, 1.5, 1],

  // ── Vegetables ───────────────────────────────────────────────────────────
  ["onion", "Onion", "Oignon", "vegetables", "semi", "g", 40, 1.1, 8.4, 0.2, 0, 1.7, 6.8, 0.01],
  ["garlic", "Garlic", "Ail", "vegetables", "semi", "g", 149, 6.4, 30, 0.5, 0.1, 2.1, 1, 0.02],
  ["tomato", "Tomato", "Tomate", "vegetables", "fresh", "g", 18, 0.9, 3.4, 0.2, 0, 1.2, 2.5, 0.01],
  ["cherry-tomatoes", "Cherry tomatoes", "Tomates cerises", "vegetables", "fresh", "g", 20, 1, 3.5, 0.3, 0, 1.2, 2.8, 0.01],
  ["canned-tomatoes", "Canned crushed tomatoes", "Tomates concassées", "vegetables", "storable", "g", 24, 1.2, 4.4, 0.2, 0, 1.2, 3.2, 0.2],
  ["carrot", "Carrot", "Carotte", "vegetables", "semi", "g", 38, 0.9, 8.2, 0.2, 0, 2.8, 4.5, 0.06],
  ["zucchini", "Zucchini", "Courgette", "vegetables", "fresh", "g", 19, 1.2, 2.5, 0.3, 0.1, 1, 2.2, 0.01],
  ["eggplant", "Eggplant", "Aubergine", "vegetables", "fresh", "g", 24, 1, 4.5, 0.2, 0, 3, 3, 0.01],
  ["bell-pepper", "Bell pepper", "Poivron", "vegetables", "fresh", "g", 26, 1, 5.4, 0.3, 0, 1.9, 4.2, 0.01],
  ["broccoli", "Broccoli", "Brocoli", "vegetables", "fresh", "g", 35, 2.4, 4.4, 0.4, 0.1, 2.6, 1.4, 0.03],
  ["cauliflower", "Cauliflower", "Chou-fleur", "vegetables", "fresh", "g", 31, 2, 4.1, 0.3, 0.1, 2.1, 1.9, 0.02],
  ["green-beans", "Green beans", "Haricots verts", "vegetables", "fresh", "g", 31, 1.8, 5.7, 0.2, 0, 2.7, 1.7, 0.01],
  ["spinach", "Spinach", "Épinards", "vegetables", "fresh", "g", 23, 2.9, 2, 0.4, 0.1, 2.2, 0.5, 0.07],
  ["salad-lettuce", "Lettuce", "Salade verte", "vegetables", "fresh", "g", 15, 1.4, 2.1, 0.2, 0, 1.3, 0.8, 0.01],
  ["cucumber", "Cucumber", "Concombre", "vegetables", "fresh", "g", 15, 0.7, 2.2, 0.1, 0, 0.6, 1.7, 0.01],
  ["mushrooms", "Button mushrooms", "Champignons de Paris", "vegetables", "fresh", "g", 22, 3.1, 2.3, 0.3, 0, 1, 0.9, 0.01],
  ["leek", "Leek", "Poireau", "vegetables", "semi", "g", 31, 1.3, 6, 0.2, 0, 1.8, 3, 0.01],
  ["cabbage", "White cabbage", "Chou blanc", "vegetables", "semi", "g", 27, 1.4, 5, 0.2, 0, 2.5, 2.9, 0.02],
  ["pumpkin", "Pumpkin", "Potiron", "vegetables", "semi", "g", 29, 1, 5.7, 0.1, 0, 1.5, 3.2, 0.01],
  ["peas-frozen", "Frozen peas", "Petits pois surgelés", "vegetables", "storable", "g", 69, 5.4, 9.5, 0.4, 0.1, 4.5, 4, 0.03],
  ["mixed-veg-frozen", "Frozen mixed vegetables", "Légumes mélangés surgelés", "vegetables", "storable", "g", 54, 3.2, 8.2, 0.3, 0.1, 3, 2.6, 0.03],
  ["corn-can", "Canned sweet corn", "Maïs en conserve", "vegetables", "storable", "g", 90, 3.2, 17, 1.2, 0.2, 2, 5, 0.3],
  ["ginger", "Fresh ginger", "Gingembre frais", "vegetables", "fresh", "g", 79, 1.8, 17, 0.8, 0.3, 2, 1.6, 0.01],
  ["fresh-herbs", "Fresh herbs (parsley…)", "Herbes fraîches (persil…)", "vegetables", "fresh", "g", 36, 3, 3.7, 0.8, 0.1, 3.3, 0.9, 0.14],

  // ── Fruits ───────────────────────────────────────────────────────────────
  ["banana", "Banana", "Banane", "fruit", "semi", "g", 89, 1.1, 21.8, 0.3, 0.1, 2.1, 15, 0.01],
  ["apple", "Apple", "Pomme", "fruit", "semi", "g", 52, 0.3, 13.4, 0.2, 0, 2.4, 10.4, 0.01],
  ["orange", "Orange", "Orange", "fruit", "fresh", "g", 47, 0.9, 11.5, 0.1, 0, 2.4, 9.4, 0.01],
  ["clementine", "Clementine", "Clémentine", "fruit", "fresh", "g", 47, 0.9, 11.6, 0.2, 0, 1.7, 9.7, 0.01],
  ["strawberries", "Strawberries", "Fraises", "fruit", "fresh", "g", 33, 0.7, 6.7, 0.3, 0, 1.7, 5, 0.01],
  ["blueberries", "Blueberries", "Myrtilles", "fruit", "fresh", "g", 57, 0.7, 13.5, 0.3, 0, 2.7, 9.5, 0.01],
  ["lemon", "Lemon", "Citron", "fruit", "fresh", "g", 29, 1.1, 2.5, 0.3, 0, 2.8, 1.5, 0.01],
  ["pear", "Pear", "Poire", "fruit", "semi", "g", 58, 0.4, 15.2, 0.1, 0, 3.1, 12.4, 0.01],
  ["mango", "Mango", "Mangue", "fruit", "fresh", "g", 60, 0.8, 14, 0.4, 0.1, 1.6, 13.7, 0.01],
  ["dates", "Dates", "Dattes", "fruit", "storable", "g", 282, 2.5, 69, 0.4, 0.1, 7, 63, 0.02],
  ["raisins", "Raisins (dried)", "Raisins secs", "fruit", "storable", "g", 299, 3.1, 71, 0.5, 0.1, 3.7, 65, 0.1],
  ["apple-compote", "Applesauce", "Compote de pommes", "fruit", "storable", "g", 68, 0.2, 16, 0.1, 0, 1.7, 14, 0.01],
  ["frozen-red-fruits", "Frozen red fruits", "Fruits rouges surgelés", "fruit", "storable", "g", 48, 0.9, 9.5, 0.4, 0, 3.2, 7, 0.01],

  // ── Nuts & seeds ─────────────────────────────────────────────────────────
  ["almonds", "Almonds", "Amandes", "nuts", "storable", "g", 596, 21, 9.5, 53, 4, 12.5, 4.4, 0.01],
  ["walnuts", "Walnuts", "Noix", "nuts", "storable", "g", 654, 15, 13.7, 65, 6.1, 6.7, 2.6, 0.01],
  ["peanut-butter", "Peanut butter", "Beurre de cacahuète", "nuts", "storable", "g", 588, 25, 12, 50, 10, 6, 9, 0.4],
  ["tahini", "Tahini", "Purée de sésame", "nuts", "storable", "g", 639, 17.7, 0.7, 60, 8.6, 9.8, 0.4, 0.6],
  ["sunflower-seeds", "Sunflower seeds", "Graines de tournesol", "nuts", "storable", "g", 584, 21, 20, 51, 4.5, 8.6, 2.6, 0.01],
  ["chia-seeds", "Chia seeds", "Graines de chia", "nuts", "storable", "g", 486, 17, 42, 31, 3.3, 34, 0, 0.01],

  // ── Oils & fats ──────────────────────────────────────────────────────────
  ["olive-oil", "Olive oil", "Huile d'olive", "oils", "storable", "ml", 824, 0, 0, 92, 13, 0, 0, 0],
  ["rapeseed-oil", "Rapeseed oil", "Huile de colza", "oils", "storable", "ml", 824, 0, 0, 92, 7, 0, 0, 0],
  ["sunflower-oil", "Sunflower oil", "Huile de tournesol", "oils", "storable", "ml", 824, 0, 0, 92, 9, 0, 0, 0],

  // ── Condiments & pantry ──────────────────────────────────────────────────
  ["salt", "Salt", "Sel", "pantry", "storable", "g", 0, 0, 0, 0, 0, 0, 0, 38.758],
  ["black-pepper", "Black pepper", "Poivre noir", "pantry", "storable", "g", 251, 10, 39, 3.3, 1.4, 25, 0.6, 0.02],
  ["cumin", "Ground cumin", "Cumin en poudre", "pantry", "storable", "g", 375, 18, 44, 22, 1.5, 10.5, 2.3, 0.2],
  ["paprika", "Paprika", "Paprika", "pantry", "storable", "g", 282, 14, 34, 13, 2.1, 15.9, 7.3, 0.3],
  ["curry-powder", "Curry powder", "Curry en poudre", "pantry", "storable", "g", 325, 14, 39, 15, 2, 21, 3, 0.4],
  ["cinnamon", "Cinnamon", "Cannelle", "pantry", "storable", "g", 247, 4, 55, 1.2, 0.3, 33, 2.2, 0.02],
  ["honey", "Honey", "Miel", "pantry", "storable", "g", 304, 0.3, 75, 0, 0, 0.2, 75, 0.01],
  ["sugar", "Sugar", "Sucre", "pantry", "storable", "g", 400, 0, 100, 0, 0, 0, 100, 0],
  ["soy-sauce", "Soy sauce", "Sauce soja", "pantry", "storable", "ml", 53, 8, 4.9, 0.6, 0.1, 0.8, 0.4, 5.5],
  ["mustard", "Mustard", "Moutarde", "pantry", "storable", "g", 66, 4.4, 5.8, 3.3, 0.2, 3.3, 1.1, 1.4],
  ["tomato-paste", "Tomato paste", "Concentré de tomates", "pantry", "storable", "g", 82, 4.3, 12.9, 0.5, 0.1, 2.9, 10.3, 0.9],
  ["vegetable-broth", "Vegetable stock", "Bouillon de légumes", "pantry", "storable", "ml", 5, 0.2, 0.7, 0.1, 0, 0, 0.1, 0.3],
  ["vinegar", "Vinegar", "Vinaigre", "pantry", "storable", "ml", 21, 0, 0.9, 0, 0, 0, 0, 0.01],
  ["hummus", "Hummus", "Houmous", "prepared", "semi", "g", 236, 8, 14.3, 17.8, 2.5, 6, 0.3, 0.6],
  ["chocolate-dark", "Dark chocolate 70%", "Chocolat noir 70 %", "treats", "storable", "g", 572, 8, 33, 41, 24, 10, 24, 0.02],
  ["protein-powder", "Whey protein powder", "Protéine en poudre (whey)", "supplement", "storable", "g", 380, 78, 8, 4, 1.8, 1, 4, 0.35],
  ["maple-syrup", "Maple syrup", "Sirop d'érable", "pantry", "storable", "ml", 260, 0, 67, 0.1, 0, 0, 60, 0.02],
  ["coconut-milk", "Coconut milk", "Lait de coco", "pantry", "storable", "ml", 197, 2, 2.8, 20, 17.5, 0, 2.8, 0.03],
  ["baking-powder", "Baking powder", "Levure chimique", "pantry", "storable", "g", 53, 0, 27, 0, 0, 0.2, 0, 21],
  ["yeast", "Dry yeast", "Levure de boulanger sèche", "pantry", "storable", "g", 325, 40, 35, 5, 1.2, 20, 0.1, 0.05],
  ["cornstarch", "Cornstarch", "Maïzena", "pantry", "storable", "g", 350, 0.3, 85, 0.1, 0, 0.9, 0, 0.01],
];
