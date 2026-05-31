// ── Config ──────────────────────────────────────────────────
// Paste your Anthropic API key here (for local use only)
// For production, move API calls to a backend server
const ANTHROPIC_API_KEY = "YOUR_API_KEY_HERE";
const MODEL = "claude-sonnet-4-20250514";

// ── State ───────────────────────────────────────────────────
const docs = [];
let isLoading = false;

// ── PDF.js worker ────────────────────────────────────────────
if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// ── DOM refs ─────────────────────────────────────────────────
const dropZone    = document.getElementById("drop-zone");
const fileInput   = document.getElementById("file-input");
const docList     = document.getElementById("doc-list");
const messagesEl  = document.getElementById("messages");
const userInput   = document.getElementById("user-input");
const sendBtn     = document.getElementById("send-btn");
const statusBar   = document.getElementById("status-bar");

// ── Drag & Drop ──────────────────────────────────────────────
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener("change", () => handleFiles(fileInput.files));

// ── Auto-resize textarea ─────────────────────────────────────
userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 100) + "px";
});
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ── File Handling ─────────────────────────────────────────────
function handleFiles(files) {
  Array.from(files).forEach((file) => {
    if (!file.name.match(/\.(pdf|txt|md)$/i)) {
      setStatus("Only PDF, TXT, and MD files are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus("File too large — max 5MB.");
      return;
    }
    const reader = new FileReader();
    if (file.name.endsWith(".pdf")) {
      reader.onload = (e) => extractPdfText(e.target.result, file.name, file.size);
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => addDoc(file.name, file.size, e.target.result);
      reader.readAsText(file);
    }
  });
}

// ── PDF Text Extraction ───────────────────────────────────────
async function extractPdfText(arrayBuffer, name, size) {
  setStatus("Reading PDF...");
  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(" ") + "\n";
    }
    addDoc(name, size, text);
  } catch (err) {
    setStatus("Could not parse PDF. Try a text-based (non-scanned) PDF.");
  }
}

// ── Add Document ──────────────────────────────────────────────
function addDoc(name, size, content) {
  if (docs.find((d) => d.name === name)) {
    setStatus(`"${name}" is already loaded.`);
    return;
  }
  const chunks = chunkText(content);
  docs.push({ name, size, content, chunks });
  renderDocList();
  setStatus(`Loaded "${name}" — ${chunks.length} chunks indexed.`);
  document.getElementById("no-docs")?.remove();
}

// ── Remove Document ───────────────────────────────────────────
function removeDoc(index) {
  const name = docs[index].name;
  docs.splice(index, 1);
  renderDocList();
  setStatus(`Removed "${name}".`);
}

// ── Render Document List ──────────────────────────────────────
function renderDocList() {
  docList.innerHTML = "";
  if (docs.length === 0) {
    docList.innerHTML = '<p id="no-docs">No documents yet</p>';
    return;
  }
  docs.forEach((doc, i) => {
    const size =
      doc.size < 1024
        ? doc.size + "B"
        : doc.size < 1048576
        ? Math.round(doc.size / 1024) + "KB"
        : (doc.size / 1048576).toFixed(1) + "MB";

    const el = document.createElement("div");
    el.className = "doc-item";
    el.innerHTML = `
      <i class="fa-solid fa-file-lines"></i>
      <span class="doc-name" title="${doc.name}">${doc.name}</span>
      <span class="doc-size">${size}</span>
      <button class="del-btn" onclick="removeDoc(${i})" aria-label="Remove">
        <i class="fa-solid fa-xmark"></i>
      </button>`;
    docList.appendChild(el);
  });
}

// ── Text Chunking ─────────────────────────────────────────────
// Splits document into ~600-char segments for context retrieval
function chunkText(text) {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/);

  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).length > 600 && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }
  if (current) chunks.push(current.trim());

  return chunks.filter((c) => c.length > 30);
}

// ── Context Retrieval (RAG) ───────────────────────────────────
// Scores chunks by keyword overlap with the user's question,
// returns the top-K most relevant ones as context for the LLM
function retrieveContext(query, topK = 6) {
  if (docs.length === 0) return { context: "", sources: [] };

  const queryWords = new Set(
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );

  const scored = [];
  docs.forEach((doc) => {
    doc.chunks.forEach((chunk) => {
      const chunkWords = chunk.toLowerCase().split(/\W+/);
      const score = chunkWords.filter((w) => queryWords.has(w)).length;
      if (score > 0) scored.push({ chunk, score, docName: doc.name });
    });
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topK);
  const sources = [...new Set(top.map((t) => t.docName))];
  const context = top
    .map((t) => `[From: ${t.docName}]\n${t.chunk}`)
    .join("\n\n---\n\n");

  return { context, sources };
}

// ── Send Message ──────────────────────────────────────────────
async function sendMessage() {
  const question = userInput.value.trim();
  if (!question || isLoading) return;

  if (docs.length === 0) {
    setStatus("Please upload a document first.");
    return;
  }

  isLoading = true;
  sendBtn.disabled = true;
  userInput.value = "";
  userInput.style.height = "auto";
  document.getElementById("welcome")?.remove();

  addMessage("user", question);
  addThinking();
  setStatus("Searching document...");

  const { context, sources } = retrieveContext(question);

  if (!context) {
    removeThinking();
    addMessage(
      "assistant",
      "I couldn't find anything relevant in your document for that question. Try rephrasing it.",
      []
    );
    setStatus("No matching context found.");
    isLoading = false;
    sendBtn.disabled = false;
    return;
  }

  setStatus("Generating answer...");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-allow-browser": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: `You are a helpful document assistant. Answer the user's question using ONLY the context provided below. Be concise and accurate. If the answer isn't in the context, say so honestly — never make things up.\n\nDOCUMENT CONTEXT:\n${context}`,
        messages: [{ role: "user", content: question }],
      }),
    });

    const data = await response.json();
    removeThinking();

    if (data.content && data.content[0]) {
      addMessage("assistant", data.content[0].text, sources);
      setStatus(`Answer generated from ${sources.length} source(s).`);
    } else {
      addMessage("assistant", "Something went wrong. Please try again.", []);
      setStatus("Error generating answer.");
    }
  } catch (err) {
    removeThinking();
    addMessage("assistant", "Network error. Check your API key and try again.", []);
    setStatus("Error: " + err.message);
  }

  isLoading = false;
  sendBtn.disabled = false;
}

// ── UI Helpers ────────────────────────────────────────────────
function addMessage(role, text, sources) {
  const div = document.createElement("div");
  div.className = "msg " + role;

  const srcHtml =
    sources && sources.length
      ? `<div class="source-chips">${sources
          .map(
            (s) =>
              `<span class="source-chip"><i class="fa-solid fa-file-lines"></i>${s}</span>`
          )
          .join("")}</div>`
      : "";

  div.innerHTML = `
    <div class="avatar">${role === "user" ? "You" : "AI"}</div>
    <div class="bubble">${escapeHtml(text)}${srcHtml}</div>`;

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addThinking() {
  const div = document.createElement("div");
  div.className = "msg assistant";
  div.id = "thinking-msg";
  div.innerHTML = `
    <div class="avatar">AI</div>
    <div class="bubble">
      <div class="thinking"><span></span><span></span><span></span></div>
    </div>`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeThinking() {
  document.getElementById("thinking-msg")?.remove();
}

function fillQ(q) {
  userInput.value = q;
  userInput.focus();
}

function setStatus(msg) {
  statusBar.textContent = msg;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}
