// ==================== GLOBAL STATE ====================
const state = {
    currentLanguage: 'en',
    currentTheme: 'light',
    recipes: [],
    allRecipes: [], // Store all fetched recipes
    favorites: [],
    recentlyViewed: [],
    groceryList: [],
    mealPlan: {},
    currentServings: 2,
    filterState: {
        searchQuery: '',
        mealType: '',
        cuisine: '',
        diet: '',
        time: '',
        sort: 'popularity'
    },
    timerInterval: null,
    timerSeconds: 0,
    timerRunning: false,
    isLoading: false
};

// ==================== API CONFIGURATION ====================
const API_CONFIG = {
    BASE_URL: 'https://www.themealdb.com/api/json/v1/1',
    ENDPOINTS: {
        SEARCH: '/search.php',
        RANDOM: '/random.php',
        CATEGORY: '/filter.php',
        DETAILS: '/lookup.php',
        CATEGORIES: '/categories.php',
        AREAS: '/list.php?a=list'
    }
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    loadLocalStorage();
    setupEventListeners();
    loadRecipesFromAPI(); // Fetch recipes from API
    initializeMealPlanner();
});

function initializeApp() {
    // Set default theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);

    // Set default language
    const savedLanguage = localStorage.getItem('language') || 'en';
    setLanguage(savedLanguage);
}

function loadLocalStorage() {
    // Load favorites
    const savedFavorites = localStorage.getItem('favorites');
    if (savedFavorites) {
        state.favorites = JSON.parse(savedFavorites);
        updateFavoritesCount();
    }

    // Load recently viewed
    const savedRecentlyViewed = localStorage.getItem('recentlyViewed');
    if (savedRecentlyViewed) {
        state.recentlyViewed = JSON.parse(savedRecentlyViewed);
        displayRecentlyViewed();
    }

    // Load grocery list
    const savedGroceryList = localStorage.getItem('groceryList');
    if (savedGroceryList) {
        state.groceryList = JSON.parse(savedGroceryList);
        displayGroceryList();
    }

    // Load meal plan
    const savedMealPlan = localStorage.getItem('mealPlan');
    if (savedMealPlan) {
        state.mealPlan = JSON.parse(savedMealPlan);
    }
}

// ==================== API FUNCTIONS ====================

// Fetch recipes from MealDB API
async function loadRecipesFromAPI() {
    try {
        state.isLoading = true;
        showLoadingSkeleton(true);

        // Fetch recipes with different search terms to get variety
        const searchTerms = [ 'pasta', 'rice', 'curry', 'dessert', 'cake', 'soup'];
        const promises = searchTerms.map(term => 
            fetchRecipes(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SEARCH}?s=${term}`)
        );
        

        const results = await Promise.all(promises);
        
        // Combine all meals and remove duplicates
        const allMeals = results
            .filter(result => result.meals)
            .flatMap(result => result.meals);

        // Remove duplicates based on idMeal
        const uniqueMeals = Array.from(
            new Map(allMeals.map(meal => [meal.idMeal, meal])).values()
        );

        // Transform API data to our format
        state.allRecipes = uniqueMeals.map(meal => transformMealData(meal));
        state.recipes = [...state.allRecipes];

        showLoadingSkeleton(false);
        displayRecipes(state.recipes);
        
        showToast(`Loaded ${state.recipes.length} delicious recipes!`);
    } catch (error) {
        console.error('Error loading recipes:', error);
        showToast('Failed to load recipes. Please try again.');
        showLoadingSkeleton(false);
    }
}

// Fetch recipes from API
async function fetchRecipes(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching recipes:', error);
        return { meals: [] };
    }
}

// Search recipes by name
async function searchRecipesByName(searchTerm) {
    if (!searchTerm) {
        state.recipes = [...state.allRecipes];
        applyFilters();
        return;
    }

    try {
        showLoadingSkeleton(true);
        const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SEARCH}?s=${searchTerm}`;
        const data = await fetchRecipes(url);
        
        if (data.meals) {
            const newRecipes = data.meals.map(meal => transformMealData(meal));
            
            // Add to allRecipes if not already there
            newRecipes.forEach(recipe => {
                if (!state.allRecipes.find(r => r.id === recipe.id)) {
                    state.allRecipes.push(recipe);
                }
            });
            
            state.recipes = newRecipes;
        } else {
            state.recipes = [];
        }
        
        showLoadingSkeleton(false);
        applyFilters();
    } catch (error) {
        console.error('Error searching recipes:', error);
        showLoadingSkeleton(false);
    }
}

// Get recipe details by ID
async function getRecipeDetails(mealId) {
    try {
        const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DETAILS}?i=${mealId}`;
        const data = await fetchRecipes(url);
        
        if (data.meals && data.meals.length > 0) {
            return transformMealData(data.meals[0]);
        }
        return null;
    } catch (error) {
        console.error('Error fetching recipe details:', error);
        return null;
    }
}

// Transform MealDB data to our recipe format
function transformMealData(meal) {
    // Extract ingredients and measurements
    const ingredients = [];
    for (let i = 1; i <= 20; i++) {
        const ingredient = meal[`strIngredient${i}`];
        const measure = meal[`strMeasure${i}`];
        
        if (ingredient && ingredient.trim()) {
            ingredients.push(`${measure ? measure.trim() : ''} ${ingredient.trim()}`.trim());
        }
    }

    // Parse instructions into steps
    const instructions = meal.strInstructions
        ? meal.strInstructions.split(/\r?\n/).filter(step => step.trim().length > 0)
        : [];

    // Determine diet type
    let diet = 'non-vegetarian';
    const mealLower = (meal.strMeal + ' ' + meal.strCategory + ' ' + ingredients.join(' ')).toLowerCase();
    if (mealLower.includes('vegan')) {
        diet = 'vegan';
    } else if (!mealLower.includes('chicken') && !mealLower.includes('beef') && 
               !mealLower.includes('pork') && !mealLower.includes('fish') && 
               !mealLower.includes('lamb') && !mealLower.includes('meat')) {
        diet = 'vegetarian';
    }

    // Determine meal type based on category
    let mealType = 'dinner';
    const category = meal.strCategory ? meal.strCategory.toLowerCase() : '';
    if (category.includes('breakfast')) mealType = 'breakfast';
    else if (category.includes('dessert')) mealType = 'dessert';
    else if (category.includes('starter') || category.includes('side')) mealType = 'snack';

    // Estimate cooking time (random between 15-60 minutes)
    const cookingTime = Math.floor(Math.random() * 45) + 15;

    // Generate tags
    const tags = [];
    if (diet === 'vegetarian') tags.push('Veg');
    if (diet === 'vegan') tags.push('Vegan');
    if (diet === 'non-vegetarian') tags.push('Non-Veg');
    if (cookingTime <= 20) tags.push('Quick');
    if (meal.strCategory) tags.push(meal.strCategory);

    // Estimate nutrition (simplified)
    const calories = Math.floor(Math.random() * 400) + 250;
    const protein = Math.floor(Math.random() * 30) + 10;
    const carbs = Math.floor(Math.random() * 60) + 20;
    const fats = Math.floor(Math.random() * 25) + 5;

    return {
        id: meal.idMeal,
        name: meal.strMeal,
        description: meal.strInstructions ? meal.strInstructions.substring(0, 120) + '...' : 'Delicious recipe',
        image: meal.strMealThumb,
        rating: (Math.random() * 1.5 + 3.5).toFixed(1), // Random rating between 3.5-5.0
        cookingTime: cookingTime,
        servings: Math.floor(Math.random() * 3) + 2, // 2-4 servings
        cuisine: meal.strArea ? meal.strArea.toLowerCase() : 'international',
        mealType: mealType,
        diet: diet,
        tags: tags,
        calories: calories,
        protein: protein,
        carbs: carbs,
        fats: fats,
        ingredients: ingredients,
        instructions: instructions.length > 0 ? instructions : [meal.strInstructions || 'Follow standard cooking methods'],
        category: meal.strCategory,
        youtubeLink: meal.strYoutube,
        source: meal.strSource
    };
}

function showLoadingSkeleton(show) {
    const skeleton = document.getElementById('loadingSkeleton');
    const grid = document.getElementById('recipesGrid');
    
    if (show) {
        skeleton.style.display = 'grid';
        grid.style.display = 'none';
    } else {
        skeleton.style.display = 'none';
        grid.style.display = 'grid';
    }
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', handleNavigation);
    });

    // Mobile menu
    document.getElementById('mobileMenuToggle')?.addEventListener('click', toggleMobileMenu);

    // Theme toggle
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

    // Language toggle
    document.getElementById('langToggle')?.addEventListener('click', toggleLanguage);

    // Search with API
    document.getElementById('searchInput')?.addEventListener('input', debounce(handleSearchWithAPI, 500));

    // Voice search
    document.getElementById('voiceSearchBtn')?.addEventListener('click', startVoiceSearch);

    // Filters
    document.getElementById('mealTypeFilter')?.addEventListener('change', handleFilterChange);
    document.getElementById('cuisineFilter')?.addEventListener('change', handleFilterChange);
    document.getElementById('dietFilter')?.addEventListener('change', handleFilterChange);
    document.getElementById('timeFilter')?.addEventListener('change', handleFilterChange);
    document.getElementById('sortFilter')?.addEventListener('change', handleFilterChange);

    // Categories
    document.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', handleCategoryClick);
    });

    // Suggestions
    document.querySelectorAll('.suggestion-card').forEach(card => {
        card.addEventListener('click', handleSuggestionClick);
    });

    // Modal
    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    document.getElementById('modalOverlay')?.addEventListener('click', closeModal);

    // Grocery list
    document.getElementById('downloadGroceryList')?.addEventListener('click', downloadGroceryList);
    document.getElementById('printGroceryList')?.addEventListener('click', printGroceryList);
    document.getElementById('clearGroceryList')?.addEventListener('click', clearGroceryList);

    // Meal planner
    document.getElementById('clearMealPlan')?.addEventListener('click', clearMealPlan);

    // Timer
    document.getElementById('timerClose')?.addEventListener('click', closeTimer);
    document.getElementById('startTimer')?.addEventListener('click', startTimer);
    document.getElementById('pauseTimer')?.addEventListener('click', pauseTimer);
    document.getElementById('resetTimer')?.addEventListener('click', resetTimer);

    // Scroll animations
    setupScrollAnimations();
}

// ==================== NAVIGATION ====================
function handleNavigation(e) {
    e.preventDefault();
    const targetId = e.currentTarget.getAttribute('href').substring(1);

    // Update active link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    e.currentTarget.classList.add('active');

    // Show/hide sections
    const sections = ['recipes', 'favorites', 'meal-planner', 'grocery-list'];
    sections.forEach(section => {
        const element = document.getElementById(section);
        if (element) {
            element.style.display = section === targetId ? 'block' : 'none';
        }
    });

    // Special handling
    if (targetId === 'home') {
        document.getElementById('recipes').style.display = 'block';
        document.getElementById('suggestions').style.display = 'block';
        document.getElementById('categories').style.display = 'block';
    } else if (targetId === 'favorites') {
        displayFavorites();
    } else if (targetId === 'meal-planner') {
        displayMealPlanner();
    } else if (targetId === 'grocery-list') {
        displayGroceryList();
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    navLinks.classList.toggle('active');
}

// ==================== THEME & LANGUAGE ====================
function toggleTheme() {
    const newTheme = state.currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

function setTheme(theme) {
    state.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    const themeIcon = document.querySelector('#themeToggle i');
    if (themeIcon) {
        themeIcon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

function toggleLanguage() {
    const newLanguage = state.currentLanguage === 'en' ? 'hi' : 'en';
    setLanguage(newLanguage);
}

function setLanguage(lang) {
    state.currentLanguage = lang;
    localStorage.setItem('language', lang);

    // Update language text
    document.querySelector('.lang-text').textContent = lang.toUpperCase();

    // Update all translatable elements
    document.querySelectorAll('[data-en][data-hi]').forEach(element => {
        const text = element.getAttribute(`data-${lang}`);
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            element.placeholder = text;
        } else {
            element.textContent = text;
        }
    });
}

// ==================== RECIPE LOADING & DISPLAY ====================
function displayRecipes(recipes) {
    const grid = document.getElementById('recipesGrid');
    const noResults = document.getElementById('noResults');

    if (recipes.length === 0) {
        noResults.style.display = 'block';
        grid.style.display = 'none';
    } else {
        noResults.style.display = 'none';
        grid.style.display = 'grid';
        grid.innerHTML = '';

        recipes.forEach((recipe, index) => {
            const card = createRecipeCard(recipe, index);
            grid.appendChild(card);
        });
    }
}

function createRecipeCard(recipe, index) {
    const card = document.createElement('div');
    card.className = 'recipe-card glass';
    card.style.animationDelay = `${index * 0.1}s`;

    const isFavorite = state.favorites.includes(recipe.id);

    card.innerHTML = `
        <div class="recipe-image-container">
            <img src="${recipe.image}" alt="${recipe.name}" class="recipe-image">
            <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-id="${recipe.id}">
                <i class="fas fa-heart"></i>
            </button>
        </div>
        <div class="recipe-info">
            <h3 class="recipe-name">${recipe.name}</h3>
            <p class="recipe-description">${recipe.description}</p>
        </div>
        <div class="recipe-tags">
            ${recipe.tags.map(tag => {
                const tagClass = tag.toLowerCase().includes('veg') && !tag.toLowerCase().includes('non') ? 'veg' :
                                 tag.toLowerCase().includes('non') ? 'non-veg' : '';
                return `<span class="tag ${tagClass}">${tag}</span>`;
            }).join('')}
        </div>
        <div class="recipe-meta">
            <div class="rating">
                <i class="fas fa-star"></i>
                <span>${recipe.rating}</span>
            </div>
            <div class="cooking-time">
                <i class="fas fa-clock"></i>
                <span>${recipe.cookingTime} min</span>
            </div>
        </div>
        <button class="view-recipe-btn" data-id="${recipe.id}">
            <i class="fas fa-eye"></i>
            ${state.currentLanguage === 'en' ? 'View Recipe' : 'विधि देखें'}
        </button>
    `;

    // Event listeners
    card.querySelector('.favorite-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(recipe.id);
    });

    card.querySelector('.view-recipe-btn').addEventListener('click', () => {
        openRecipeModal(recipe);
    });

    return card;
}

// ==================== RECIPE MODAL ====================
function openRecipeModal(recipe) {
    const modal = document.getElementById('recipeModal');
    const modalBody = document.getElementById('modalBody');

    // Add to recently viewed
    addToRecentlyViewed(recipe);

    state.currentServings = recipe.servings;

    modalBody.innerHTML = `
        <div class="modal-header">
            <img src="${recipe.image}" alt="${recipe.name}" class="modal-recipe-image">
            <h2 class="modal-recipe-title">${recipe.name}</h2>
            <div class="modal-meta">
                <div class="modal-meta-item">
                    <i class="fas fa-star"></i>
                    <span>${recipe.rating} Rating</span>
                </div>
                <div class="modal-meta-item">
                    <i class="fas fa-clock"></i>
                    <span>${recipe.cookingTime} minutes</span>
                </div>
                <div class="modal-meta-item">
                    <i class="fas fa-utensils"></i>
                    <span>${recipe.servings} servings</span>
                </div>
                ${recipe.category ? `
                <div class="modal-meta-item">
                    <i class="fas fa-tag"></i>
                    <span>${recipe.category}</span>
                </div>
                ` : ''}
            </div>
            <div class="modal-actions">
                <button class="btn-primary" onclick="toggleFavoriteFromModal('${recipe.id}')">
                    <i class="fas fa-heart"></i>
                    ${state.favorites.includes(recipe.id) ? 'Remove from Favorites' : 'Add to Favorites'}
                </button>
                <button class="btn-secondary" onclick="addIngredientsToGrocery('${recipe.id}')">
                    <i class="fas fa-shopping-cart"></i>
                    Add to Grocery List
                </button>
                <button class="btn-secondary" onclick="shareRecipe('${recipe.id}')">
                    <i class="fas fa-share"></i>
                    Share Recipe
                </button>
                <button class="btn-secondary" onclick="openTimer(${recipe.cookingTime})">
                    <i class="fas fa-hourglass-start"></i>
                    Start Timer
                </button>
                ${recipe.youtubeLink ? `
                <button class="btn-secondary" onclick="window.open('${recipe.youtubeLink}', '_blank')">
                    <i class="fab fa-youtube"></i>
                    Watch Video
                </button>
                ` : ''}
            </div>
        </div>

        <div class="servings-adjuster">
            <span>${state.currentLanguage === 'en' ? 'Servings:' : 'सर्विंग्स:'}</span>
            <button onclick="adjustServings(-1)"><i class="fas fa-minus"></i></button>
            <span id="servingsDisplay">${state.currentServings}</span>
            <button onclick="adjustServings(1)"><i class="fas fa-plus"></i></button>
        </div>

        <div class="modal-section">
            <h3>${state.currentLanguage === 'en' ? 'Ingredients' : 'सामग्री'}</h3>
            <ul class="ingredients-list" id="ingredientsList">
                ${recipe.ingredients.map(ing => `<li>${ing}</li>`).join('')}
            </ul>
        </div>

        <div class="modal-section">
            <h3>${state.currentLanguage === 'en' ? 'Instructions' : 'निर्देश'}</h3>
            <ol class="instructions-list">
                ${recipe.instructions.map(inst => `<li>${inst}</li>`).join('')}
            </ol>
        </div>

        <div class="modal-section">
            <h3>${state.currentLanguage === 'en' ? 'Nutrition Information' : 'पोषण जानकारी'}</h3>
            <div class="nutrition-grid">
                <div class="nutrition-item">
                    <strong>${recipe.calories}</strong>
                    <span>Calories</span>
                </div>
                <div class="nutrition-item">
                    <strong>${recipe.protein}g</strong>
                    <span>Protein</span>
                </div>
                <div class="nutrition-item">
                    <strong>${recipe.carbs}g</strong>
                    <span>Carbs</span>
                </div>
                <div class="nutrition-item">
                    <strong>${recipe.fats}g</strong>
                    <span>Fats</span>
                </div>
            </div>
        </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('recipeModal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// ==================== SERVINGS ADJUSTER ====================
function adjustServings(change) {
    const recipeName = document.querySelector('.modal-recipe-title').textContent;
    const recipe = state.recipes.find(r => r.name === recipeName) || 
                   state.allRecipes.find(r => r.name === recipeName);
    if (!recipe) return;

    state.currentServings = Math.max(1, state.currentServings + change);
    document.getElementById('servingsDisplay').textContent = state.currentServings;

    const multiplier = state.currentServings / recipe.servings;

    // Update ingredient quantities
    const ingredientsList = document.getElementById('ingredientsList');
    ingredientsList.innerHTML = recipe.ingredients.map(ing => {
        return `<li>${adjustIngredientQuantity(ing, multiplier)}</li>`;
    }).join('');
}

function adjustIngredientQuantity(ingredient, multiplier) {
    // Simple regex to find numbers (including fractions and decimals)
    return ingredient.replace(/(\d+\.?\d*|\d*\/\d+)/g, (match) => {
        let num;
        if (match.includes('/')) {
            const [numerator, denominator] = match.split('/').map(Number);
            num = numerator / denominator;
        } else {
            num = parseFloat(match);
        }
        const adjusted = (num * multiplier).toFixed(2).replace(/\.?0+$/, '');
        return adjusted;
    });
}

// ==================== FAVORITES ====================
function toggleFavorite(recipeId) {
    const index = state.favorites.indexOf(recipeId);

    if (index > -1) {
        state.favorites.splice(index, 1);
        showToast('Removed from favorites');
    } else {
        state.favorites.push(recipeId);
        showToast('Added to favorites');
    }

    localStorage.setItem('favorites', JSON.stringify(state.favorites));
    updateFavoritesCount();

    // Update UI
    const favBtn = document.querySelector(`.favorite-btn[data-id="${recipeId}"]`);
    if (favBtn) {
        favBtn.classList.toggle('active');
    }
}

function toggleFavoriteFromModal(recipeId) {
    toggleFavorite(recipeId);

    // Refresh modal to update button text
    const recipe = state.recipes.find(r => r.id === recipeId) || 
                   state.allRecipes.find(r => r.id === recipeId);
    if (recipe) {
        openRecipeModal(recipe);
    }
}

function updateFavoritesCount() {
    const countElement = document.querySelector('.favorites-count');
    if (countElement) {
        countElement.textContent = state.favorites.length;
    }
}

function displayFavorites() {
    const favoriteRecipes = state.allRecipes.filter(r => state.favorites.includes(r.id));
    const grid = document.getElementById('favoritesGrid');
    const noFavorites = document.getElementById('noFavorites');

    if (favoriteRecipes.length === 0) {
        noFavorites.style.display = 'block';
        grid.style.display = 'none';
    } else {
        noFavorites.style.display = 'none';
        grid.style.display = 'grid';
        grid.innerHTML = '';

        favoriteRecipes.forEach((recipe, index) => {
            const card = createRecipeCard(recipe, index);
            grid.appendChild(card);
        });
    }
}

// ==================== RECENTLY VIEWED ====================
function addToRecentlyViewed(recipe) {
    // Remove if already exists
    state.recentlyViewed = state.recentlyViewed.filter(id => id !== recipe.id);

    // Add to beginning
    state.recentlyViewed.unshift(recipe.id);

    // Keep only last 5
    state.recentlyViewed = state.recentlyViewed.slice(0, 5);

    localStorage.setItem('recentlyViewed', JSON.stringify(state.recentlyViewed));
    displayRecentlyViewed();
}

function displayRecentlyViewed() {
    const container = document.getElementById('recentlyViewedContainer');
    const section = document.getElementById('recentlyViewed');

    if (state.recentlyViewed.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = '';
    container.className = 'recipes-grid';

    const recentRecipes = state.recentlyViewed
        .map(id => state.allRecipes.find(r => r.id === id))
        .filter(r => r);

    recentRecipes.forEach((recipe, index) => {
        const card = createRecipeCard(recipe, index);
        container.appendChild(card);
    });
}

// ==================== SEARCH & FILTERS ====================
function handleSearchWithAPI(e) {
    const searchTerm = e.target.value.trim();
    state.filterState.searchQuery = searchTerm.toLowerCase();
    
    if (searchTerm.length > 2) {
        // Search via API if more than 2 characters
        searchRecipesByName(searchTerm);
    } else if (searchTerm.length === 0) {
        // Reset to all recipes
        state.recipes = [...state.allRecipes];
        applyFilters();
    }
}

function handleFilterChange(e) {
    const filterId = e.target.id;
    const value = e.target.value;

    if (filterId === 'mealTypeFilter') state.filterState.mealType = value;
    else if (filterId === 'cuisineFilter') state.filterState.cuisine = value;
    else if (filterId === 'dietFilter') state.filterState.diet = value;
    else if (filterId === 'timeFilter') state.filterState.time = value;
    else if (filterId === 'sortFilter') state.filterState.sort = value;

    applyFilters();
}

function applyFilters() {
    let filtered = [...state.recipes];

    // Meal type
    if (state.filterState.mealType) {
        filtered = filtered.filter(recipe => recipe.mealType === state.filterState.mealType);
    }

    // Cuisine
    if (state.filterState.cuisine) {
        filtered = filtered.filter(recipe => 
            recipe.cuisine.toLowerCase() === state.filterState.cuisine.toLowerCase()
        );
    }

    // Diet
    if (state.filterState.diet) {
        filtered = filtered.filter(recipe => recipe.diet === state.filterState.diet);
    }

    // Cooking time
    if (state.filterState.time) {
        const maxTime = parseInt(state.filterState.time);
        filtered = filtered.filter(recipe => recipe.cookingTime <= maxTime);
    }

    // Sort
    if (state.filterState.sort === 'rating') {
        filtered.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
    } else if (state.filterState.sort === 'newest') {
        filtered.sort((a, b) => b.id - a.id);
    } else {
        // Default: popularity (based on rating)
        filtered.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
    }

    displayRecipes(filtered);
}

// ==================== VOICE SEARCH ====================
function startVoiceSearch() {
    if (!('webkitSpeechRecognition' in window)) {
        showToast('Voice search not supported in this browser');
        return;
    }

    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = state.currentLanguage === 'en' ? 'en-US' : 'hi-IN';

    const voiceBtn = document.getElementById('voiceSearchBtn');
    voiceBtn.classList.add('listening');

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('searchInput').value = transcript;
        
        // Search via API
        searchRecipesByName(transcript);

        voiceBtn.classList.remove('listening');
        showToast(`Searching for: ${transcript}`);
    };

    recognition.onerror = () => {
        voiceBtn.classList.remove('listening');
        showToast('Voice search failed. Please try again.');
    };

    recognition.onend = () => {
        voiceBtn.classList.remove('listening');
    };

    recognition.start();
}

// ==================== CATEGORIES ====================
function handleCategoryClick(e) {
    const category = e.currentTarget.dataset.category;

    // Toggle active state
    document.querySelectorAll('.category-card').forEach(card => {
        card.classList.remove('active');
    });
    e.currentTarget.classList.add('active');

    // Apply category filter
    if (['breakfast', 'lunch', 'dinner', 'dessert', 'snack'].includes(category)) {
        state.filterState.mealType = category;
        document.getElementById('mealTypeFilter').value = category;
    } else if (category === 'indian' || category === 'italian' || category === 'chinese') {
        state.filterState.cuisine = category;
        document.getElementById('cuisineFilter').value = category;
    } else if (category === 'vegetarian' || category === 'vegan') {
        state.filterState.diet = category;
        document.getElementById('dietFilter').value = category;
    } else if (category === 'quick') {
        state.filterState.time = '15';
        document.getElementById('timeFilter').value = '15';
    }

    applyFilters();
}

// ==================== SUGGESTIONS ====================
function handleSuggestionClick(e) {
    const suggestionText = e.currentTarget.querySelector('h3').textContent;

    if (suggestionText.includes('Healthy')) {
        state.filterState.diet = 'vegan';
        document.getElementById('dietFilter').value = 'vegan';
    } else if (suggestionText.includes('Quick')) {
        state.filterState.time = '15';
        document.getElementById('timeFilter').value = '15';
    } else if (suggestionText.includes('Protein')) {
        state.filterState.diet = 'non-vegetarian';
        document.getElementById('dietFilter').value = 'non-vegetarian';
    }

    applyFilters();
    window.scrollTo({ top: document.getElementById('recipes').offsetTop - 100, behavior: 'smooth' });
}

// ==================== GROCERY LIST ====================
function addIngredientsToGrocery(recipeId) {
    const recipe = state.allRecipes.find(r => r.id === recipeId);
    if (!recipe) return;

    recipe.ingredients.forEach(ingredient => {
        if (!state.groceryList.some(item => item.text === ingredient)) {
            state.groceryList.push({
                text: ingredient,
                checked: false,
                recipeId: recipe.id
            });
        }
    });

    localStorage.setItem('groceryList', JSON.stringify(state.groceryList));
    displayGroceryList();
    showToast('Ingredients added to grocery list!');
}

function displayGroceryList() {
    const container = document.getElementById('groceryListItems');

    if (state.groceryList.length === 0) {
        container.innerHTML = `<p class="empty-grocery" data-en="No ingredients added yet. Open a recipe and add ingredients!" data-hi="अभी तक कोई सामग्री नहीं जोड़ी गई। एक रेसिपी खोलें और सामग्री जोड़ें!">
            ${state.currentLanguage === 'en' ? 'No ingredients added yet. Open a recipe and add ingredients!' : 'अभी तक कोई सामग्री नहीं जोड़ी गई। एक रेसिपी खोलें और सामग्री जोड़ें!'}
        </p>`;
        return;
    }

    container.innerHTML = state.groceryList.map((item, index) => `
        <div class="grocery-item ${item.checked ? 'checked' : ''}">
            <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleGroceryItem(${index})">
            <span>${item.text}</span>
            <button class="btn-danger" onclick="removeGroceryItem(${index})" style="margin-left: auto; padding: 0.5rem;">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

function toggleGroceryItem(index) {
    state.groceryList[index].checked = !state.groceryList[index].checked;
    localStorage.setItem('groceryList', JSON.stringify(state.groceryList));
    displayGroceryList();
}

function removeGroceryItem(index) {
    state.groceryList.splice(index, 1);
    localStorage.setItem('groceryList', JSON.stringify(state.groceryList));
    displayGroceryList();
}

function downloadGroceryList() {
    const text = state.groceryList.map(item => `${item.checked ? '✓' : '☐'} ${item.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grocery-list.txt';
    a.click();
    showToast('Grocery list downloaded!');
}

function printGroceryList() {
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>Grocery List</title>');
    printWindow.document.write('<style>body{font-family:Arial;padding:20px;}h1{color:#333;}.item{padding:10px;border-bottom:1px solid #eee;}</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write('<h1>Grocery List</h1>');
    state.groceryList.forEach(item => {
        printWindow.document.write(`<div class="item">${item.checked ? '✓' : '☐'} ${item.text}</div>`);
    });
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}

function clearGroceryList() {
    if (confirm('Are you sure you want to clear the grocery list?')) {
        state.groceryList = [];
        localStorage.setItem('groceryList', JSON.stringify(state.groceryList));
        displayGroceryList();
        showToast('Grocery list cleared!');
    }
}

// ==================== MEAL PLANNER ====================
function initializeMealPlanner() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const daysHindi = ['सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार', 'रविवार'];
    const tbody = document.getElementById('mealPlannerBody');

    if (!tbody) return;

    days.forEach((day, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong data-en="${day}" data-hi="${daysHindi[index]}">${day}</strong></td>
            <td><div class="meal-slot" data-day="${day}" data-meal="breakfast" onclick="selectMealSlot('${day}', 'breakfast')"></div></td>
            <td><div class="meal-slot" data-day="${day}" data-meal="lunch" onclick="selectMealSlot('${day}', 'lunch')"></div></td>
            <td><div class="meal-slot" data-day="${day}" data-meal="dinner" onclick="selectMealSlot('${day}', 'dinner')"></div></td>
        `;
        tbody.appendChild(row);
    });
}

function selectMealSlot(day, meal) {
    const recipeName = prompt('Enter recipe name to search:');
    if (!recipeName) return;

    const recipe = state.allRecipes.find(r => 
        r.name.toLowerCase().includes(recipeName.toLowerCase())
    );

    if (!recipe) {
        showToast('Recipe not found! Try a different name.');
        return;
    }

    if (!state.mealPlan[day]) state.mealPlan[day] = {};
    state.mealPlan[day][meal] = recipe.id;

    localStorage.setItem('mealPlan', JSON.stringify(state.mealPlan));
    displayMealPlanner();
    showToast('Meal added to planner!');
}

function displayMealPlanner() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    days.forEach(day => {
        ['breakfast', 'lunch', 'dinner'].forEach(meal => {
            const slot = document.querySelector(`.meal-slot[data-day="${day}"][data-meal="${meal}"]`);
            if (!slot) return;

            if (state.mealPlan[day] && state.mealPlan[day][meal]) {
                const recipe = state.allRecipes.find(r => r.id === state.mealPlan[day][meal]);
                if (recipe) {
                    slot.classList.add('filled');
                    slot.innerHTML = `<div class="meal-item">${recipe.name}</div>`;
                }
            } else {
                slot.classList.remove('filled');
                slot.innerHTML = '';
            }
        });
    });
}

function clearMealPlan() {
    if (confirm('Are you sure you want to clear the meal plan?')) {
        state.mealPlan = {};
        localStorage.setItem('mealPlan', JSON.stringify(state.mealPlan));
        displayMealPlanner();
        showToast('Meal plan cleared!');
    }
}

// ==================== TIMER ====================
function openTimer(minutes) {
    state.timerSeconds = minutes * 60;
    document.getElementById('timerModal').style.display = 'block';
    updateTimerDisplay();
}

function closeTimer() {
    pauseTimer();
    document.getElementById('timerModal').style.display = 'none';
}

function startTimer() {
    if (state.timerRunning) return;

    state.timerRunning = true;
    state.timerInterval = setInterval(() => {
        if (state.timerSeconds > 0) {
            state.timerSeconds--;
            updateTimerDisplay();
        } else {
            pauseTimer();
            showToast('Time\'s up! Your recipe is ready!');
            playNotificationSound();
        }
    }, 1000);
}

function pauseTimer() {
    state.timerRunning = false;
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

function resetTimer() {
    pauseTimer();
    const minutes = parseInt(prompt('Enter minutes:'));
    if (minutes) {
        state.timerSeconds = minutes * 60;
        updateTimerDisplay();
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(state.timerSeconds / 60);
    const seconds = state.timerSeconds % 60;
    document.getElementById('timerDisplay').textContent =
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function playNotificationSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

// ==================== SHARE ====================
function shareRecipe(recipeId) {
    const recipe = state.allRecipes.find(r => r.id === recipeId);
    if (!recipe) return;

    if (navigator.share) {
        navigator.share({
            title: recipe.name,
            text: recipe.description,
            url: window.location.href
        }).then(() => {
            showToast('Recipe shared successfully!');
        }).catch(() => {
            copyToClipboard(window.location.href);
        });
    } else {
        copyToClipboard(window.location.href);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Link copied to clipboard!');
    });
}

// ===== TOAST NOTIFICATION =====
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    toastMessage.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ==================== SCROLL ANIMATIONS ====================
function setupScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.recipe-card, .suggestion-card, .category-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(el);
    });
}

// ==================== UTILITY FUNCTIONS ====================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==================== WINDOW FUNCTIONS (for onclick handlers) ====================
window.toggleFavoriteFromModal = toggleFavoriteFromModal;
window.addIngredientsToGrocery = addIngredientsToGrocery;
window.shareRecipe = shareRecipe;
window.openTimer = openTimer;
window.adjustServings = adjustServings;
window.selectMealSlot = selectMealSlot;
window.toggleGroceryItem = toggleGroceryItem;
window.removeGroceryItem = removeGroceryItem;




 