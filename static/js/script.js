document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const analyzeBtn = document.getElementById('analyzeBtn');
    const fetchEmailsBtn = document.getElementById('fetchEmailsBtn');
    const emailList = document.getElementById('emailList');
    const resultContent = document.getElementById('resultContent');
    const loader = document.getElementById('loader');
    const placeholderText = document.getElementById('placeholderText');
    const resultCard = document.getElementById('resultCard');
    const riskIndicator = document.getElementById('riskIndicator');

    // Input Elements
    const usernameInput = document.getElementById('username');
    const loginAttemptsInput = document.getElementById('loginAttempts');
    const pagesAccessedInput = document.getElementById('pagesAccessed');
    const actionsInput = document.getElementById('actions');
    const timeOfDayInput = document.getElementById('timeOfDay');

    // Result Nodes
    const resUser = document.getElementById('resUser');
    const resIntent = document.getElementById('resIntent');
    const resRisk = document.getElementById('resRisk');
    const resConfidence = document.getElementById('resConfidence');
    const resExplanation = document.getElementById('resExplanation');
    const resSuggestion = document.getElementById('resSuggestion');
    const speakBtn = document.getElementById('speakBtn');

    let riskChart, intentChart, timelineChart;

    // Initialization
    initDashboard();
    
    // Auto-fetch intelligence every 30 seconds
    setInterval(() => {
        fetchEmails(true); // silent fetch
    }, 30000);

    // Manual Fetch
    fetchEmailsBtn.addEventListener('click', () => fetchEmails(false));

    async function fetchEmails(isSilent) {
        if (!isSilent) {
            fetchEmailsBtn.innerHTML = '<span class="spinner"></span> SYNCING INTEL...';
            fetchEmailsBtn.disabled = true;
        }

        try {
            const response = await fetch('/fetch_emails');
            const emails = await response.json();
            if (emails.error) throw new Error(emails.error);

            renderEmailList(emails);
        } catch (error) {
            console.error('Fetch Alert:', error);
            if (!isSilent) alert('Connection to Intelligence Server Failed.');
        } finally {
            if (!isSilent) {
                fetchEmailsBtn.innerHTML = '📥 Fetch Security Emails';
                fetchEmailsBtn.disabled = false;
            }
        }
    }

    function renderEmailList(emails) {
        emailList.innerHTML = '';
        if (emails.length === 0) {
            emailList.innerHTML = '<p class="placeholder-small">No current threats in queue.</p>';
            return;
        }

        emails.forEach(email => {
            const card = document.createElement('div');
            card.className = 'email-item';
            card.innerHTML = `
                <h4>🚨 ${email.subject}</h4>
                <p>${email.body.substring(0, 80)}...</p>
            `;
            
            card.addEventListener('click', () => {
                // Auto-populate form with intelligence
                actionsInput.value = `INTEL: ${email.subject}\nBODY: ${email.body}`;
                usernameInput.value = email.sender.match(/<(.+)>/)?.[1] || email.sender.split(' ')[0];
                
                // Visual feedback
                card.style.borderColor = 'var(--accent)';
                
                // Scroll to analysis section
                document.getElementById('analysisTarget').scrollIntoView({ behavior: 'smooth' });
                
                // Trigger auto-analysis
                runAnalysis();
            });
            emailList.appendChild(card);
        });
    }

    analyzeBtn.addEventListener('click', runAnalysis);

    async function runAnalysis() {
        // Toggle UI
        placeholderText.classList.add('hidden');
        resultContent.classList.add('hidden');
        loader.classList.remove('hidden');
        resultCard.classList.remove('high-alert');
        
        const payload = {
            username: usernameInput.value || 'system_node',
            login_attempts: loginAttemptsInput.value || 0,
            pages_accessed: pagesAccessedInput.value || 0,
            suspicious_actions: actionsInput.value || 'NONE',
            time_input: timeOfDayInput.value
        };

        try {
            const response = await fetch('/predict_intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            // Populate Results
            resUser.textContent = data.user;
            resIntent.textContent = data.intent;
            resConfidence.textContent = `${data.confidence}%`;
            resExplanation.textContent = data.explanation;
            resSuggestion.textContent = data.suggestion;
            resRisk.textContent = data.risk_level;

            // Update Indicators & Styles
            resRisk.className = 'level-badge';
            riskIndicator.style.background = 'var(--success)';
            
            if (data.risk_level === 'High') {
                resRisk.classList.add('risk-high');
                riskIndicator.style.background = 'var(--danger)';
                resultCard.classList.add('high-alert');
            } else if (data.risk_level === 'Medium') {
                resRisk.classList.add('risk-medium');
                riskIndicator.style.background = 'var(--warning)';
            } else {
                resRisk.classList.add('risk-low');
            }

            // Reveal results
            loader.classList.add('hidden');
            resultContent.classList.remove('hidden');

            // Audio Synthesis
            speakIntel(data);

            // Dashboard Sync
            updateDashboard();

        } catch (error) {
            console.error('Analysis Fault:', error);
            loader.classList.add('hidden');
            placeholderText.classList.remove('hidden');
        }
    }

    function speakIntel(data) {
        const synth = window.speechSynthesis;
        const msg = new SpeechSynthesisUtterance(`Intel Briefing for node ${data.user}. Priority is ${data.risk_level}. Predicted intent: ${data.intent}. ${data.suggestion}`);
        msg.rate = 0.95;
        msg.pitch = 0.9;
        synth.speak(msg);
    }

    speakBtn.addEventListener('click', () => {
        speakIntel({
            user: resUser.textContent,
            risk_level: resRisk.textContent,
            intent: resIntent.textContent,
            suggestion: resSuggestion.textContent
        });
    });

    // Dashboard Engine
    async function initDashboard() {
        const res = await fetch('/analytics');
        const data = await res.json();

        const ctxRisk = document.getElementById('riskChart').getContext('2d');
        riskChart = new Chart(ctxRisk, {
            type: 'bar',
            data: {
                labels: Object.keys(data.risk_distribution),
                datasets: [{
                    data: Object.values(data.risk_distribution),
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                    borderRadius: 8
                }]
            },
            options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } } } }
        });

        const ctxIntent = document.getElementById('intentChart').getContext('2d');
        intentChart = new Chart(ctxIntent, {
            type: 'doughnut',
            data: {
                labels: Object.keys(data.intent_categories),
                datasets: [{
                    data: Object.values(data.intent_categories),
                    backgroundColor: ['#3b82f6', '#8b5cf6', '#ef4444', '#10b981'],
                    borderWidth: 0
                }]
            },
            options: { plugins: { legend: { position: 'bottom', labels: { color: '#64748b' } } } }
        });

        const ctxTimeline = document.getElementById('timelineChart').getContext('2d');
        timelineChart = new Chart(ctxTimeline, {
            type: 'line',
            data: {
                labels: ['01', '02', '03', '04', '05', '06', '07'],
                datasets: [{
                    data: data.timeline,
                    borderColor: '#3b82f6',
                    tension: 0.4,
                    fill: false
                }]
            },
            options: { plugins: { legend: { display: false } }, scales: { y: { grid: { display: false } }, x: { grid: { display: false } } } }
        });
    }

    async function updateDashboard() {
        const res = await fetch('/analytics');
        const data = await res.json();
        riskChart.data.datasets[0].data = Object.values(data.risk_distribution);
        intentChart.data.datasets[0].data = Object.values(data.intent_categories);
        riskChart.update();
        intentChart.update();
    }
});
