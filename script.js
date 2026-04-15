/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearchInput = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsSection = document.getElementById(
  "selectedProductsSection",
);
const selectedProductsCount = document.getElementById("selectedProductsCount");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsButton = document.getElementById("clearSelections");
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const openAiApiUrl = window.OPENAI_API_URL;
const selectedProductsStorageKey = "loreal-selected-product-ids";
const selectedProductIds = new Set();
const conversationHistory = [];
const assistantSystemPrompt =
  "You are a helpful beauty advisor for L'Oréal. Use full conversation history to answer follow-up questions. Only answer questions about the generated routine or beauty topics such as skincare, haircare, makeup, fragrance, and related self-care. If a question is unrelated, politely refuse and ask the user to keep questions beauty-related.";
let allProducts = [];
let currentDisplayedProducts = [];

/* Save current selected product IDs in localStorage */
function saveSelectedProductsToStorage() {
  try {
    localStorage.setItem(
      selectedProductsStorageKey,
      JSON.stringify([...selectedProductIds]),
    );
  } catch (error) {
    console.warn("Could not save selected products.", error);
  }
}

/* Load selected product IDs from localStorage */
function loadSelectedProductsFromStorage() {
  try {
    const storedValue = localStorage.getItem(selectedProductsStorageKey);

    if (!storedValue) {
      return;
    }

    const parsedIds = JSON.parse(storedValue);

    if (!Array.isArray(parsedIds)) {
      return;
    }

    parsedIds.forEach((id) => {
      if (Number.isInteger(id)) {
        selectedProductIds.add(id);
      }
    });
  } catch (error) {
    console.warn("Could not load saved selected products.", error);
  }
}

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  if (allProducts.length > 0) {
    return allProducts;
  }

  const response = await fetch("products.json");
  const data = await response.json();
  allProducts = data.products;
  return allProducts;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  currentDisplayedProducts = products;
  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProductIds.has(product.id);

      return `
    <button type="button" class="product-card${
      isSelected ? " is-selected" : ""
    }" data-product-id="${product.id}" aria-pressed="${isSelected}">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <p class="product-description">${product.description}</p>
      </div>
    </button>
  `;
    })
    .join("");
}

/* Show the products the user has selected */
function renderSelectedProducts() {
  const selectedProducts = allProducts.filter((product) =>
    selectedProductIds.has(product.id),
  );

  selectedProductsCount.textContent = `(${selectedProducts.length})`;
  selectedProductsSection.classList.toggle(
    "has-selection",
    selectedProducts.length > 0,
  );
  clearSelectionsButton.disabled = selectedProducts.length === 0;

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML =
      '<p class="placeholder-message selected-products-empty">Click a product card to add it here.</p>';
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-product-chip">
          <div>
            <strong>${product.name}</strong>
            <span>${product.brand}</span>
          </div>
          <button
            type="button"
            class="remove-selected-product"
            data-product-id="${product.id}"
            aria-label="Remove ${product.name} from selected products"
          >
            Remove
          </button>
        </div>
      `,
    )
    .join("");
}

/* Toggle a product on or off when the user clicks a card */
function toggleProductSelection(productId) {
  if (selectedProductIds.has(productId)) {
    selectedProductIds.delete(productId);
  } else {
    selectedProductIds.add(productId);
  }

  renderSelectedProducts();
  saveSelectedProductsToStorage();
  if (currentDisplayedProducts.length > 0) {
    displayProducts(currentDisplayedProducts);
  }
}

/* Remove a product directly from the selected list */
function removeSelectedProduct(productId) {
  selectedProductIds.delete(productId);

  renderSelectedProducts();
  saveSelectedProductsToStorage();
  if (currentDisplayedProducts.length > 0) {
    displayProducts(currentDisplayedProducts);
  }
}

/* Clear all selected products at once */
function clearAllSelectedProducts() {
  selectedProductIds.clear();

  renderSelectedProducts();
  saveSelectedProductsToStorage();
  if (currentDisplayedProducts.length > 0) {
    displayProducts(currentDisplayedProducts);
  }
}

/* Add a message bubble to the chat window */
function addChatMessage(message, className) {
  const messageElement = document.createElement("div");
  messageElement.className = `chat-message ${className}`;
  messageElement.textContent = message;
  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return messageElement;
}

/* Send messages to the OpenAI API through the worker */
async function requestOpenAI(messages) {
  if (!openAiApiUrl) {
    throw new Error("OpenAI worker URL is missing.");
  }

  const response = await fetch(openAiApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error("The worker could not reach the OpenAI API.");
  }

  const data = await response.json();
  return (
    data.choices?.[0]?.message?.content ||
    "Sorry, I could not create a response."
  );
}

/* Send a message to the OpenAI API using full chat history */
async function sendMessageWithHistory(userMessage) {
  const messages = [
    {
      role: "system",
      content: assistantSystemPrompt,
    },
    ...conversationHistory,
    {
      role: "user",
      content: userMessage,
    },
  ];

  const assistantReply = await requestOpenAI(messages);

  conversationHistory.push(
    {
      role: "user",
      content: userMessage,
    },
    {
      role: "assistant",
      content: assistantReply,
    },
  );

  return assistantReply;
}

/* Build a routine from only the selected products */
async function generateRoutineFromSelectedProducts(selectedProducts) {
  const selectedProductData = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  const routinePrompt = `Create a clear morning and evening routine using only this selected products JSON:\n${JSON.stringify(
    selectedProductData,
    null,
    2,
  )}`;

  return sendMessageWithHistory(routinePrompt);
}

/* Filter products by selected category and search keyword */
async function applyProductFilters() {
  const products = await loadProducts();
  const selectedCategory = categoryFilter.value;
  const searchQuery = productSearchInput.value.trim().toLowerCase();

  const filteredProducts = products.filter(
    (product) =>
      (selectedCategory ? product.category === selectedCategory : true) &&
      (searchQuery
        ? product.name.toLowerCase().includes(searchQuery) ||
          product.brand.toLowerCase().includes(searchQuery) ||
          product.description.toLowerCase().includes(searchQuery)
        : true),
  );

  if (filteredProducts.length === 0) {
    currentDisplayedProducts = [];
    productsContainer.innerHTML =
      '<div class="placeholder-message">No products match your filters.</div>';
    return;
  }

  displayProducts(filteredProducts);
}

/* Re-apply filters when category changes */
categoryFilter.addEventListener("change", async () => {
  applyProductFilters();
});

/* Re-apply filters as users type in search */
productSearchInput.addEventListener("input", async () => {
  applyProductFilters();
});

/* Let users select or unselect a product by clicking its card */
productsContainer.addEventListener("click", (e) => {
  const productCard = e.target.closest(".product-card");

  if (!productCard || !productsContainer.contains(productCard)) {
    return;
  }

  const productId = Number(productCard.dataset.productId);

  toggleProductSelection(productId);

  productCard.classList.toggle("is-selected");
  productCard.setAttribute(
    "aria-pressed",
    String(selectedProductIds.has(productId)),
  );
});

/* Let users remove products directly from the selected list */
selectedProductsList.addEventListener("click", (e) => {
  const removeButton = e.target.closest(".remove-selected-product");

  if (!removeButton) {
    return;
  }

  const productId = Number(removeButton.dataset.productId);
  removeSelectedProduct(productId);
});

/* Let users clear all selected products */
clearSelectionsButton.addEventListener("click", () => {
  clearAllSelectedProducts();
});

/* Generate an AI routine from selected products */
generateRoutineButton.addEventListener("click", async () => {
  const selectedProducts = allProducts.filter((product) =>
    selectedProductIds.has(product.id),
  );

  if (selectedProducts.length === 0) {
    addChatMessage(
      "Please select at least one product before generating a routine.",
      "assistant-message",
    );
    return;
  }

  const loadingMessage = addChatMessage(
    "Generating your personalized routine...",
    "assistant-message",
  );

  try {
    const routineResponse =
      await generateRoutineFromSelectedProducts(selectedProducts);
    loadingMessage.textContent = routineResponse;
  } catch (error) {
    loadingMessage.textContent =
      "Sorry, there was a problem generating your routine.";
  }
});

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userMessage = userInput.value.trim();

  if (!userMessage) {
    return;
  }

  addChatMessage(userMessage, "user-message");
  userInput.value = "";

  const loadingMessage = addChatMessage("Thinking...", "assistant-message");

  try {
    const assistantReply = await sendMessageWithHistory(userMessage);
    loadingMessage.textContent = assistantReply;
  } catch (error) {
    loadingMessage.textContent =
      "Sorry, there was a problem connecting to the AI worker.";
  }
});

/* Load the products list and the empty selected state on page start */
loadProducts().then(() => {
  loadSelectedProductsFromStorage();

  /* Keep only saved IDs that still exist in products.json */
  const validProductIds = new Set(allProducts.map((product) => product.id));
  selectedProductIds.forEach((id) => {
    if (!validProductIds.has(id)) {
      selectedProductIds.delete(id);
    }
  });

  saveSelectedProductsToStorage();
  renderSelectedProducts();
});
