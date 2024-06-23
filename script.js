let pastUserInputs = [];
let generatedResponses = [];
let contextData = [];


function toggleChat() {
  const chatPopup = document.getElementById('chat-popup');
  chatPopup.style.display = chatPopup.style.display === 'none' || chatPopup.style.display === '' ? 'flex' : 'none';
}


// Load context data and define the retrieval function
async function loadAndRetrieveContext(userInput) {
  // Load context data if not already loaded
  if (contextData.length === 0) {
    try {
      const response = await fetch('context.json');
      if (!response.ok) {
        throw new Error('Failed to load context data');
      }
      const data = await response.json();
      contextData = data;
    } catch (error) {
      console.error('Error loading context data:', error);
      return '';
    }
  }

  // Retrieve relevant context based on user input
  const matchedContexts = [];

  contextData.forEach(context => {
    const tagMatches = context.tags.filter(tag => {
      const tagPattern = new RegExp(`\\b${tag.toLowerCase()}\\b`, 'i');
      return tagPattern.test(userInput.toLowerCase());
    });
    if (tagMatches.length > 0) {
      matchedContexts.push(context);
    }
  });

  // Format relevant contexts for inclusion in the query
  const formattedContexts = matchedContexts.map(context => {
    const contentValues = context.content
      .filter(item => item.type === 'text')
      .map(item => item.value)
      .join('\n');
    return `ID: ${context.id}\nTitle: ${context.title}\nDate: ${context.date}\nTags: ${context.tags.join(', ')}\nCategory: ${context.category}\nDescription: ${context.description}\nContent:\n${contentValues}`;
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
  userMessage.textContent = 'You: ' + userInput;
  document.getElementById('messages').appendChild(userMessage);

  // Update conversation history
  pastUserInputs.push(userInput);

  // Format the previous conversation
  let conversationHistory = '';
  for (let i = 0; i < pastUserInputs.length; i++) {
    conversationHistory += `User: ${pastUserInputs[i]}\n`;
    if (generatedResponses[i]) {
      conversationHistory += `You: ${generatedResponses[i]}\n`;
    }
  }

  // Retrieve relevant context from the JSON file
  const { formattedContexts, matchedContexts } = await loadAndRetrieveContext(userInput);

  const queryStatement = `[INST] You are a helpful and engaging chatbot assistant.\nKeep the conversation natural. You can use the context provided to answer the user's questions. If the user asks a question that is not related to the context, you can politely ask for clarification or provide a general response.\n<Context>\n${formattedContexts}\n<Conversation>\n${conversationHistory}[/INST]`;
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
        const contextIds = matchedContexts.map(context => context.id).join(', ');
        botResponse += ` (${contextIds})`;
      }

      generatedResponses.push(botResponse);

      // Display Hugging Face API response
      const botMessage = document.createElement('div');
      botMessage.textContent = 'Bot: ' + botResponse;
      document.getElementById('messages').appendChild(botMessage);

      break; // Exit loop if the query was successful
    } catch (error) {
      console.error(`Error with model ${modelUrl}:`, error);
      if (modelUrl === models[models.length - 1]) {
        const errorMessage = document.createElement('div');
        errorMessage.textContent = 'Error: Could not get a response from any model';
        document.getElementById('messages').appendChild(errorMessage);
      }
    }
  }

  // Clear input field
  document.getElementById('user-input').value = '';

};

// Event listeners for "Enter" key and send button click
document.getElementById('user-input').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') {
    sendMessage();
  }
});
document.getElementById('send-btn').addEventListener('click', sendMessage);


// prevent dev tool
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
    }, 100); 
  }
}

setInterval(detectDevTools, 1000);

