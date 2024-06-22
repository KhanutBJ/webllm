let pastUserInputs = [];
let generatedResponses = [];

// Load context data from a JSON file
let contextData = [];
fetch('context.json')
  .then(response => response.json())
  .then(data => {
    contextData = data.contexts;
  })
  .catch(error => console.error('Error loading context data:', error));

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

document.getElementById('send-btn').addEventListener('click', async () => {
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
  const relevantContext = contextData.join('\n');

  const queryStatement = `[INST] You are a helpful and engaging chatbot assistant.\nKeep the conversation natural. You can use the context provided to answer the user's questions. If the user asks a question that is not related to the context, you can politely ask for clarification or provide a general response.\n<Context>\n${relevantContext}\n<Conversation>\n${conversationHistory}[/INST]`;
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
      const botResponse = response[0].generated_text;
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
});
