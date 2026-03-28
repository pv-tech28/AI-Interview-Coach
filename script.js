
const setupSection = document.getElementById('setup-section');
const interviewSection = document.getElementById('interview-section');
const startBtn = document.getElementById('startBtn');
const companyInput = document.getElementById('companyInput');
const resumeInput = document.getElementById('resumeInput');
const dropZone = document.getElementById('drop-zone');
const fileNameDisplay = document.getElementById('file-name-display');
const chatBox = document.getElementById('chat-box');
const recordBtn = document.getElementById('recordBtn');
const editBtn = document.getElementById('editBtn');
const submitBtn = document.getElementById('submitBtn');
const answerInput = document.getElementById('answerInput');
const transcriptPreview = document.getElementById('transcript-preview');
const inputInstruction = document.getElementById('input-instruction');
const scoreFill = document.getElementById('score-fill');
const scoreText = document.getElementById('score-text');
const feedbackContent = document.getElementById('feedback-content');

let socket;
let recognition;
let isRecording = false;
let selectedFile = null;
let originalSpeechText = ''; // Track original speech for evaluation

// Resume Upload Handling
function handleFileSelect(file) {
    if (file && file.type === 'application/pdf') {
        selectedFile = file;
        fileNameDisplay.innerText = file.name;
        fileNameDisplay.style.fontWeight = 'bold';
        fileNameDisplay.style.color = 'var(--accent-color)';
    } else if (file) {
        alert('Please upload a PDF file.');
        resetFileUpload();
    }
}

function resetFileUpload() {
    selectedFile = null;
    resumeInput.value = '';
    fileNameDisplay.innerText = 'Drag or click to upload resume';
    fileNameDisplay.style.fontWeight = 'normal';
    fileNameDisplay.style.color = '';
}

resumeInput.onchange = (e) => {
    handleFileSelect(e.target.files[0]);
};

// Drag and Drop Handling
dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--accent-color)';
    dropZone.style.background = 'rgba(88, 166, 255, 0.1)';
};

dropZone.ondragleave = (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    dropZone.style.background = '';
};

dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    dropZone.style.background = '';
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
};

// Initialize WebSocket
function initWebSocket() {
    socket = new WebSocket(`ws://${window.location.hostname}:3005`);

    socket.onopen = () => {
        console.log('Connected to server');
        // Send initial setup data
        const setupData = {
            type: 'setup',
            company: companyInput.value || 'General',
            resumeName: selectedFile ? selectedFile.name : 'No resume uploaded'
        };
        socket.send(JSON.stringify(setupData));
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };

    socket.onclose = () => {
        console.log('Disconnected from server');
        addMessage('Connection lost. Please refresh the page.', 'bot');
    };
}

// Handle messages from server
function handleServerMessage(data) {
    switch (data.type) {
        case 'question':
            addMessage(data.text, 'bot');
            break;
        case 'feedback':
            updateFeedbackUI(data);
            break;
        case 'info':
            console.log('Server Info:', data.text);
            break;
    }
}

// UI Functions
function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.innerText = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function updateFeedbackUI(data) {
    // Update Overall Score
    if (data.score !== undefined) {
        scoreFill.style.width = `${data.score}%`;
        scoreText.innerText = `${data.score}%`;
    }

    // Update Feedback List
    feedbackContent.innerHTML = ''; // Clear previous feedback
    
    // 0. Critic's Verdict (Confidence Score Reason)
    if (data.scoreReason) {
        const scoreDiv = document.createElement('div');
        scoreDiv.className = 'feedback-item score-reason-feedback';
        scoreDiv.innerHTML = `
            <h4><i class="fas fa-exclamation-triangle"></i> Critic's Verdict</h4>
            <p><strong>${data.scoreReason}</strong></p>
        `;
        feedbackContent.appendChild(scoreDiv);
    }

    // 1. Relevance Check (The "Why" Test)
    if (data.relevance) {
        const relevanceDiv = document.createElement('div');
        relevanceDiv.className = 'feedback-item relevance-feedback';
        relevanceDiv.innerHTML = `
            <h4><i class="fas fa-chart-line"></i> 1. The "Why" Test (Impact)</h4>
            <p><em>"${data.relevance}"</em></p>
        `;
        feedbackContent.appendChild(relevanceDiv);
    }

    // 2. Grammatical & Structural Audit (The Nitpicker)
    const auditDiv = document.createElement('div');
    auditDiv.className = 'feedback-item audit-feedback';
    let auditHTML = `<h4><i class="fas fa-search-plus"></i> 2. The Nitpicker Audit</h4>`;
    
    if (data.audit.mistakes && data.audit.mistakes.length > 0) {
        auditHTML += `<div class="audit-section"><h5>Flaws Detected:</h5>`;
        data.audit.mistakes.forEach((m) => {
            auditHTML += `
                <div class="grammar-pair">
                    <p class="incorrect"><span>Flaw:</span> ${m.incorrect}</p>
                    <p class="corrected"><span>Requirement:</span> ${m.corrected}</p>
                    <p class="reason"><span>Critic's Note:</span> ${m.reason}</p>
                </div>`;
        });
        auditHTML += `</div>`;
    }

    if (data.audit.weakWords && data.audit.weakWords.length > 0) {
        auditHTML += `<div class="audit-section"><h5>Weak/Lazy Vocabulary:</h5>`;
        data.audit.weakWords.forEach(w => {
            auditHTML += `
                <div class="weak-word-item">
                    <p class="weak-word">Avoid: "<strong>${w.word}</strong>"</p>
                    <p class="synonyms">Elite Synonyms: ${w.synonyms.map(s => `<em>${s}</em>`).join(', ')}</p>
                </div>`;
        });
        auditHTML += `</div>`;
    }

    if (data.audit.fillers && data.audit.fillers.length > 0) {
        auditHTML += `<div class="audit-section"><h5>Filler Word Analysis:</h5>`;
        data.audit.fillers.forEach(f => {
            auditHTML += `<p class="filler-info">Used "<strong>${f.word}</strong>" ${f.count} time(s). Replace with a strategic pause.</p>`;
        });
        auditHTML += `</div>`;
    }
    
    if (auditHTML === `<h4><i class="fas fa-search-plus"></i> 2. The Nitpicker Audit</h4>`) {
        auditHTML += `<p class="corrected">No immediate flaws detected. Rare.</p>`;
    }
    
    auditDiv.innerHTML = auditHTML;
    feedbackContent.appendChild(auditDiv);

    // 3. The "Gold Standard" Response Section
    const modelDiv = document.createElement('div');
    modelDiv.className = 'feedback-item model-feedback';
    modelDiv.innerHTML = `
        <h4><i class="fas fa-award"></i> 3. The "Gold Standard"</h4>
        <div class="model-answer-box">
            <p class="model-text">${data.modelAnswer}</p>
        </div>
    `;
    feedbackContent.appendChild(modelDiv);

    // 4. Real-World Context Section
    const contextDiv = document.createElement('div');
    contextDiv.className = 'feedback-item context-feedback';
    contextDiv.innerHTML = `
        <h4><i class="fas fa-fingerprint"></i> 4. Company DNA</h4>
        <p class="context-text">${data.companyContext}</p>
    `;
    feedbackContent.appendChild(contextDiv);
}

// Start Interview
startBtn.onclick = () => {
    if (!companyInput.value) {
        alert('Please enter a target company name.');
        return;
    }
    
    setupSection.classList.add('hidden');
    interviewSection.classList.remove('hidden');
    initWebSocket();
};

// Voice Recognition Setup
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        // Auto-fill the textarea with the transcription and track original
        if (finalTranscript) {
            originalSpeechText += (originalSpeechText ? ' ' : '') + finalTranscript;
            answerInput.value = originalSpeechText;
            
            // Show action buttons after speech is captured
            editBtn.classList.remove('hidden');
            submitBtn.classList.remove('hidden');
            inputInstruction.innerText = "Speech captured! You can now edit or submit.";
        }
        
        transcriptPreview.classList.remove('hidden');
        transcriptPreview.querySelector('span').innerText = interimTranscript || 'Listening...';
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        stopRecording();
        
        let errorMessage = 'Voice error. Please try again.';
        if (event.error === 'not-allowed') {
            errorMessage = 'Microphone access denied. Please allow it in browser settings.';
        } else if (event.error === 'no-speech') {
            errorMessage = 'No speech detected. Please speak into the mic.';
        } else if (event.error === 'network') {
            errorMessage = 'Network error during speech recognition.';
        }
        
        transcriptPreview.querySelector('span').innerText = errorMessage;
        transcriptPreview.classList.remove('hidden');
        transcriptPreview.style.color = '#da3633'; // Error color
        
        setTimeout(() => {
            transcriptPreview.classList.add('hidden');
            transcriptPreview.style.color = ''; // Reset color
        }, 4000);
    };
}

function startRecording() {
    if (!recognition) {
        alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
        return;
    }
    
    // Clear previous error state
    transcriptPreview.style.color = '';
    transcriptPreview.querySelector('span').innerText = 'Listening...';
    
    try {
        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.querySelector('span').innerText = 'Recording...';
        transcriptPreview.classList.remove('hidden');
        recognition.start();
    } catch (err) {
        console.error("Start recording failed:", err);
        stopRecording();
    }
}

function stopRecording() {
    if (!recognition) return;
    isRecording = false;
    recordBtn.classList.remove('recording');
    recordBtn.querySelector('span').innerText = 'Hold to Speak';
    transcriptPreview.classList.add('hidden');
    recognition.stop();
}

// Record Button Events
recordBtn.onmousedown = startRecording;
recordBtn.onmouseup = stopRecording;
recordBtn.ontouchstart = (e) => { e.preventDefault(); startRecording(); };
recordBtn.ontouchend = (e) => { e.preventDefault(); stopRecording(); };

// Edit Button Logic
editBtn.onclick = () => {
    answerInput.readOnly = false;
    answerInput.focus();
    inputInstruction.innerText = "Editing your response... Correct any mistakes before submitting.";
    editBtn.classList.add('hidden'); // Hide edit button while editing
};

// Submit Answer
submitBtn.onclick = () => {
    const editedText = answerInput.value.trim();
    if (editedText || originalSpeechText) {
        addMessage(editedText || originalSpeechText, 'user');
        socket.send(JSON.stringify({
            type: 'answer',
            originalText: originalSpeechText,
            editedText: editedText
        }));
        
        // Reset Input UI
        resetInputUI();
    }
};

function resetInputUI() {
    answerInput.value = '';
    answerInput.readOnly = true;
    originalSpeechText = '';
    editBtn.classList.add('hidden');
    submitBtn.classList.add('hidden');
    inputInstruction.innerText = "Please speak first, then you can edit your answer";
}
