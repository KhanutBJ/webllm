let contextData = [];
let pastUserInputs = [];
let generatedResponses = [];
let contextHistory = [];

// Initial welcome message
document.addEventListener('DOMContentLoaded', function() {
  const welcomeMessage = document.createElement('div');
  welcomeMessage.className = 'message bot';
  welcomeMessage.innerHTML = '<div class="icon">🤖</div><div class="chat-bubble">Welcome! How can I assist you today?</div>';
  document.getElementById('messages').appendChild(welcomeMessage);
});

function toggleChat() {
  const chatPopup = document.getElementById('chat-popup');
  const chatContainer = document.getElementById('chat-container');
  chatPopup.style.display = chatPopup.style.display === 'none' || chatPopup.style.display === '' ? 'flex' : 'none';
  chatContainer.style.opacity = 1;
}

// Add event listener to detect scroll and adjust opacity
window.addEventListener('scroll', function() {
  const scrollY = window.scrollY;
  const chatContainer = document.getElementById('chat-container');
  chatContainer.style.opacity = Math.max(1 - scrollY / 300, 0.5);
});

// Add event listener to detect click outside of chat window
document.addEventListener('click', function(event) {
  const chatContainer = document.getElementById('chat-container');
  const chatPopup = document.getElementById('chat-popup');
  if (!chatContainer.contains(event.target)) {
    chatPopup.style.display = 'none';
    chatContainer.style.opacity = 0.5;
  } else {
    chatContainer.style.opacity = 1;
  }
});

// Load context data from multiple JSON files
async function loadContextData() {
  const files = ['context.json', 'background.json', 'blogs.json', 'project.json'];
  try {
    for (const file of files) {
      const response = await fetch(file);
      if (!response.ok) {
        throw new Error(`Failed to load ${file}`);
      }
      const data = await response.json();
      contextData.push(...data.map(item => ({ ...item, source: file })));
    }
  } catch (error) {
    console.error('Error loading context data:', error);
  }
}

// Initialize Fuse.js for title, description, and info matching
let fuse;
async function initializeFuse() {
  if (contextData.length === 0) {
    await loadContextData();
  }
  const options = {
    keys: ['title', 'description', 'info'], // Fields to search
    threshold: 0.72, // Sensitivity of the search
    // distance: 100, // Maximum distance between the search term and the match
    // minMatchCharLength: 3, // Minimum number of characters that must match
  };
  fuse = new Fuse(contextData, options);
}

// Retrieve context based on user input
async function loadAndRetrieveContext(userInput) {
  // Load context data if not already loaded
  if (contextData.length === 0) {
    await loadContextData();
  }

  // Initialize Fuse.js if not already initialized
  if (!fuse) {
    await initializeFuse();
  }

  // Use Fuse.js to search by title, description, and info
  const fuseResults = fuse.search(userInput);
  // Sort results by score
  const sortedResults = fuseResults.sort((a, b) => a.score - b.score);
  const fuseMatches = sortedResults.map(result => result.item);

  console.log(fuseMatches);
  
  // Retrieve relevant context based on user input
  const matchedContexts = [];
  
  contextData.forEach(context => {
    // Extract file name without extension
    const fileName = context.source.replace('.json', '');
    const fileNameMatches = new RegExp(`\\b${fileName.toLowerCase()}\\b`, 'i').test(userInput.toLowerCase());

    const tagMatches = context.tags.filter(tag => {
      const tagPattern = new RegExp(`\\b${tag.toLowerCase()}\\b`, 'i');
      return tagPattern.test(userInput.toLowerCase());
    });

    const categoryName = context.category || '';
    const categoryMatches = new RegExp(`\\b${categoryName.toLowerCase()}\\b`, 'i').test(userInput.toLowerCase());

    // Check if the context matches by file name, tags, category, or Fuse.js search
    if (fileNameMatches || tagMatches.length > 0 || categoryMatches || fuseMatches.includes(context)) {
      matchedContexts.push(context);
    }
  });

  // Format relevant contexts for inclusion in the query
  const formattedContexts = matchedContexts.map(context => {
    let contentValues;

    if (Array.isArray(context.content)) {
      contentValues = context.content
        .map(item => {
          if (item.type === 'text') {
            return item.value;
          } else {
            return item.value;
          }
        })
        .join('\n');
    } else if (context.content) {
      contentValues = context.content;
    } else if (context.info) {
      contentValues = context.info;
    } else {
      contentValues = 'No content';
    }
  

    // Build the formatted context string with conditional checks
    const formattedContext = `
      Source: ${context.source}
      ID: ${context.id}
      ${context.title ? `Title: ${context.title}` : ''}
      ${context.date ? `Date: ${context.date}` : ''}
      ${context.tags ? `Tags: ${context.tags.join(', ')}` : ''}
      ${context.category ? `Category: ${context.category}` : ''}
      ${context.description ? `Description: ${context.description}` : ''}
      ${context.info ? `Info: ${context.info}` : ''}
      Content: ${contentValues}
    `.trim();

    return formattedContext;
  }).join('\n\n');

  return { formattedContexts, matchedContexts };
}


const models = [
  "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
  "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
  "https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1",
  "https://api-inference.huggingface.co/models/microsoft/Phi-3-mini-4k-instruct"
];

async function decrypt(content, iv, tag, key) {
  const algorithm = { name: 'AES-GCM', iv: iv, tagLength: 128 };
  const cryptoKey = await crypto.subtle.importKey('raw', key, algorithm, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(algorithm, cryptoKey, new Uint8Array([...content, ...tag]));
  return new TextDecoder().decode(decrypted);
}

async function getApiKey() {
  const response = await fetch('encrypted_key.json');
  if (!response.ok) {
    throw new Error('Failed to load encrypted key');
  }

  const encryptedKey = await response.json();

  const iv = Uint8Array.from(atob(encryptedKey.iv), c => c.charCodeAt(0));
  const content = Uint8Array.from(atob(encryptedKey.content), c => c.charCodeAt(0));
  const tag = Uint8Array.from(atob(encryptedKey.tag), c => c.charCodeAt(0));
  const key = Uint8Array.from(atob(encryptedKey.key), c => c.charCodeAt(0));

  return decrypt(content, iv, tag, key);
}

async function query(data, modelUrl, apiKey) {
  const response = await fetch(modelUrl, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const result = await response.json();
  return result;
}

function secureQuery(data, modelUrl) {
  return getApiKey()
    .then(apiKey => {
      return query(data, modelUrl, apiKey)
        .then(result => {
          // Clean up the API key after use
          apiKey = null;
          return result;
        });
    })
    .catch(error => {
      console.error('Error during API key retrieval or query execution:', error);
      throw error;
    });
}

async function sendMessage() {
  const userInput = document.getElementById('user-input').value;
  if (userInput.trim() === '') return;

  // Display user message
  const userMessage = document.createElement('div');
  userMessage.className = 'message user';
  userMessage.innerHTML = `<div class="chat-bubble">You: ${userInput}</div><div class="icon">👤</div>`;
  document.getElementById('messages').appendChild(userMessage);
  const messagesContainer = document.getElementById('messages');
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Update conversation history
  pastUserInputs.push(userInput);
  if (pastUserInputs.length > 10) pastUserInputs.shift();
  generatedResponses = generatedResponses.slice(-9); // Maintain max 10 conversations

  // Format the previous conversation
  let conversationHistory = '';
  for (let i = 0; i < pastUserInputs.length; i++) {
    conversationHistory += `User: ${pastUserInputs[i]}\n`;
    if (generatedResponses[i]) {
      conversationHistory += `You: ${generatedResponses[i]}\n`;
    }
  }

  // Retrieve relevant context from the JSON files
  const { formattedContexts, matchedContexts } = await loadAndRetrieveContext(userInput);
  contextHistory.push(formattedContexts);
  if (contextHistory.length > 3) contextHistory.shift();

  const contextHistoryString = contextHistory.join('\n\n');

  const queryStatement = `[INST] You are a helpful and engaging chatbot assistant.\nKeep the conversation natural. You can use the context provided (if relevant) to answer the user's questions. If the user asks a question that is not related to the context, you can politely ask for clarification or provide a general response. Keep answers concise within 50 words.\n<Context>\n${contextHistoryString}\n<Conversation>\n${conversationHistory}[/INST]`;
  console.log(queryStatement);

  // Try different models in order
  for (let modelUrl of models) {
    try {
      const response = await secureQuery({
        "inputs": queryStatement,
        "parameters": {
          "return_full_text": false
        }
      }, modelUrl);

      // Update conversation history with the response
      let botResponse = response[0].generated_text;
      
      // Append context ID if relevant context found
      if (matchedContexts.length > 0) {
        const contextSourcesIds = matchedContexts.map(context => `${context.source.replace('.json', '')}/${context.id}`).join(', ');
        botResponse += ` (source: ${contextSourcesIds})`;
      }         

      generatedResponses.push(botResponse);

      // Display Hugging Face API response
      const botMessage = document.createElement('div');
      botMessage.className = 'message bot';
      botMessage.innerHTML = `<div class="icon">🤖</div><div class="chat-bubble">Bot: ${botResponse}</div>`;
      document.getElementById('messages').appendChild(botMessage);
      const messagesContainer = document.getElementById('messages');
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      break; // Exit loop if the query was successful
    } catch (error) {
      console.error(`Error with model ${modelUrl}:`, error);
      if (modelUrl === models[models.length - 1]) {
        const errorMessage = document.createElement('div');
        errorMessage.textContent = 'Error';
        document.getElementById('messages').appendChild(errorMessage);
      }
    }
  }

  // Clear input field
  document.getElementById('user-input').value = '';
}

// Event listeners for "Enter" key and send button click
document.getElementById('user-input').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') {
    sendMessage();
  }
});
document.getElementById('send-btn').addEventListener('click', sendMessage);

// Prevent dev tool
function detectDevTools() {
  const threshold = 160;
  const widthThreshold = window.outerWidth - window.innerWidth > threshold;
  const heightThreshold = window.outerHeight - window.innerHeight > threshold;
  if (widthThreshold || heightThreshold) {
    alert('Developer tools are open. Please close them to continue.');
    setInterval(() => {
      window.blur();
      window.focus();
    }, 100);
    setTimeout(() => {
      location.reload();
    }, 500); 
  }
}

setInterval(detectDevTools, 1000);