const form = document.querySelector("#hook-form");
const statementInput = document.querySelector("#statement");
const generateButton = document.querySelector("#generate-button");
const copyAllButton = document.querySelector("#copy-all-button");
const resultsList = document.querySelector("#results");
const statusElement = document.querySelector("#status");
const emptyState = document.querySelector("#empty-state");
const sampleButtons = document.querySelectorAll("[data-sample]");

let currentHooks = [];
let slowRequestTimer;

checkHealth();

sampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    statementInput.value = button.textContent.trim();
    statementInput.focus();
  });
});

statementInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    form.requestSubmit();
  }
});

copyAllButton.addEventListener("click", async () => {
  if (!currentHooks.length) {
    return;
  }

  const payload = currentHooks
    .map((item, index) => `${index + 1}. ${item.hook}`)
    .join("\n\n");

  try {
    await navigator.clipboard.writeText(payload);
    setStatus("Copied all five hooks.");
  } catch {
    setStatus("Clipboard access failed.");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const statement = statementInput.value.trim();

  if (!statement) {
    setStatus("Add a boring statement first.");
    statementInput.focus();
    return;
  }

  setLoadingState(true);
  setStatus("Rewriting your statement into stronger hooks...");
  clearTimeout(slowRequestTimer);
  slowRequestTimer = setTimeout(() => {
    setStatus("Still generating... local Ollama models can take 30-90 seconds.");
  }, 8000);

  try {
    const response = await fetch("/api/generate-hooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ statement }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    currentHooks = data.hooks || [];
    renderHooks(currentHooks);
    setStatus(`Generated 5 hooks with ${data.model}.`);
  } catch (error) {
    currentHooks = [];
    clearResults();
    setStatus(error instanceof Error ? error.message : "Something went wrong.");
  } finally {
    clearTimeout(slowRequestTimer);
    setLoadingState(false);
  }
});

function renderHooks(hooks) {
  resultsList.innerHTML = "";

  hooks.forEach((item, index) => {
    const listItem = document.createElement("li");
    listItem.className = "result-card";
    listItem.style.setProperty("--delay", `${index * 80}ms`);

    const number = document.createElement("span");
    number.className = "result-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const content = document.createElement("div");
    content.className = "result-content";

    const technique = document.createElement("p");
    technique.className = "technique";
    technique.textContent = item.technique || "Hook angle";

    const hook = document.createElement("p");
    hook.className = "hook-text";
    hook.textContent = item.hook;

    const actionRow = document.createElement("div");
    actionRow.className = "card-actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "ghost-button";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(item.hook);
        setStatus(`Copied hook ${index + 1}.`);
      } catch {
        setStatus("Clipboard access failed.");
      }
    });

    actionRow.append(copyButton);
    content.append(technique, hook, actionRow);
    listItem.append(number, content);
    resultsList.append(listItem);
  });

  emptyState.hidden = true;
  resultsList.hidden = false;
  copyAllButton.hidden = false;
}

function clearResults() {
  resultsList.innerHTML = "";
  resultsList.hidden = true;
  copyAllButton.hidden = true;
  emptyState.hidden = false;
}

function setLoadingState(isLoading) {
  generateButton.disabled = isLoading;
  generateButton.textContent = isLoading ? "Generating..." : "Generate 5 hooks";
}

function setStatus(message) {
  statusElement.textContent = message;
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();

    if (!data.reachable) {
      setStatus(`Ollama is not reachable at ${data.host || "http://127.0.0.1:11434"}.`);
      return;
    }

    if (!data.configured) {
      setStatus(`Model ${data.model} is not installed. Run: ollama pull ${data.model}`);
      return;
    }

    setStatus(`Connected to Ollama with ${data.model}.`);
  } catch {
    setStatus("The server is not reachable yet.");
  }
}
