document.addEventListener('DOMContentLoaded', () => {
    // API Configuration - REPLACE THIS with your Render URL after deployment
    // Example: const API_BASE_URL = 'https://cyber-predictor-backend.onrender.com';
    const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://127.0.0.1:5000' 
        : ''; // Vercel will use relative paths by default, which we rewrite in vercel.json if using serverless. 
              // But since we are moving to Render, we should eventually hardcode the Render URL here.

    // Step Containers
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const step4 = document.getElementById('step4');
    const step5 = document.getElementById('step5');

    // Controls
    const fetchEmailsBtn = document.getElementById('fetchEmailsBtn');
    const emailList = document.getElementById('emailList');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const speakBtn = document.getElementById('speakBtn');

    // Inputs
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
    const resultCard = document.getElementById('resultCard');

    let riskChart, intentChart, timelineChart;

    // Initialization
    initDashboard();

    // STEP 1 -> STEP 2: Fetch and Show Emails
    fetchEmailsBtn.addEventListener('click', async () => {
        fetchEmailsBtn.innerText = 'Synchronizing Intelligence...';
        fetchEmailsBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/fetch_emails`);
            if (!response.ok) throw new Error("Email fetch failed. Check server or credentials.");
            
            const emails = await response.json();
            if (emails.error) throw new Error(emails.error);

            renderEmails(emails);
            
            step1.classList.add('hidden');
            setTimeout(() => {
                step1.style.display = 'none';
                step2.classList.remove('hidden');
                step2.classList.add('visible');
            }, 600);

        } catch (error) {
            console.error('Fetch Error:', error);
            alert(error.message || 'Failed to establish connection with Gmail.');
            fetchEmailsBtn.innerText = 'Fetch Security Emails';
            fetchEmailsBtn.disabled = false;
        }
    });

    function renderEmails(emails) {
        emailList.innerHTML = '';
        if (emails.length === 0) {
            emailList.innerHTML = '<div class="email-card"><h3>No security alerts found in session.</h3></div>';
            return;
        }

        emails.forEach(email => {
            const card = document.createElement('div');
            card.className = 'email-card';
            card.innerHTML = `
                <div class="card-meta">
                    <span class="sender">${email.sender.split('<')[0]}</span>
                    <span class="status-badge badge-alert">⚠️ ALERT</span>
                </div>
                <h3>${email.subject}</h3>
                <p>${email.body.substring(0, 100)}...</p>
            `;

            card.addEventListener('click', () => {
                const senderEmail = email.sender.match(/<(.+)>/)?.[1] || email.sender;
                usernameInput.value = senderEmail;
                actionsInput.value = `Subject: ${email.subject}\n\n${email.body}`;
                
                step3.classList.remove('collapsed-section');
                step3.classList.add('expanded-section');
                step3.scrollIntoView({ behavior: 'smooth' });
                
                const badge = step3.querySelector('.status-badge');
                badge.innerText = 'DATA INJECTED';
                badge.style.background = 'var(--success)';
            });

            emailList.appendChild(card);
        });
    }

    analyzeBtn.addEventListener('click', async () => {
        step3.classList.add('hidden');
        step4.classList.remove('hidden');
        step4.classList.add('visible');
        
        const payload = {
            username: usernameInput.value || 'unknown_node',
            login_attempts: loginAttemptsInput.value || 0,
            pages_accessed: pagesAccessedInput.value || 0,
            suspicious_actions: actionsInput.value || 'NONE',
            time_input: timeOfDayInput.value
        };

        try {
            const response = await fetch(`${API_BASE_URL}/predict_intent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Analysis engine failed.");
            const data = await response.json();

            resUser.textContent = data.user;
            resIntent.textContent = data.intent;
            resConfidence.textContent = `${data.confidence}%`;
            resExplanation.textContent = data.explanation;
            resSuggestion.textContent = data.suggestion;
            resRisk.textContent = data.risk_level;

            resultCard.className = 'card result-summary';
            resRisk.className = 'risk-pill';
            if (data.risk_level === 'High') {
                resultCard.classList.add('high-glow');
                resRisk.style.color = 'var(--danger)';
            } else if (data.risk_level === 'Medium') {
                resRisk.style.color = 'var(--warning)';
            } else {
                resRisk.style.color = 'var(--success)';
            }

            if (!riskChart) {
                await initDashboard(data);
            } else {
                 await updateDashboard();
            }

            setTimeout(() => {
                step4.classList.add('hidden');
                step5.classList.remove('hidden');
                step5.classList.add('visible');
                step5.scrollIntoView({ behavior: 'smooth' });
                speakIntel(data);
            }, 2000);

        } catch (error) {
            console.error('Analysis Fault:', error);
            alert(error.message || 'Analysis Engine Timeout.');
            step4.classList.add('hidden');
            step3.classList.remove('hidden');
        }
    });

    function speakIntel(data) {
        const msg = new SpeechSynthesisUtterance(`Intel confirmed for ${data.user}. Risk level: ${data.risk_level}. Intent: ${data.intent}. Recommendation: ${data.suggestion}`);
        msg.rate = 1; msg.pitch = 0.85;
        window.speechSynthesis.speak(msg);
    }

    speakBtn.addEventListener('click', () => {
        speakIntel({
            user: resUser.textContent,
            risk_level: resRisk.textContent,
            intent: resIntent.textContent,
            suggestion: resSuggestion.textContent
        });
    });

    async function initDashboard() {
        try {
            const res = await fetch(`${API_BASE_URL}/analytics`);
            const data = await res.json();

            const ctxRisk = document.getElementById('riskChart').getContext('2d');
            riskChart = new Chart(ctxRisk, {
                type: 'bar',
                data: {
                    labels: Object.keys(data.risk_distribution),
                    datasets: [{ data: Object.values(data.risk_distribution), backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], borderRadius: 10 }]
                },
                options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } } } }
            });

            const ctxIntent = document.getElementById('intentChart').getContext('2d');
            intentChart = new Chart(ctxIntent, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(data.intent_categories),
                    datasets: [{ data: Object.values(data.intent_categories), backgroundColor: ['#3b82f6', '#8b5cf6', '#ef4444', '#10b981'], borderWidth: 0 }]
                },
                options: { plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', boxWidth: 10 } } } }
            });

            const ctxTimeline = document.getElementById('timelineChart').getContext('2d');
            timelineChart = new Chart(ctxTimeline, {
                type: 'line',
                data: {
                    labels: ['01', '02', '03', '04', '05', '06', '07'],
                    datasets: [{ data: data.timeline, borderColor: '#3b82f6', tension: 0.4, fill: false }]
                },
                options: { plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false } } } }
            });
        } catch (e) { console.error("Dashboard Dashboard Error", e); }
    }

    async function updateDashboard() {
        try {
            const res = await fetch(`${API_BASE_URL}/analytics`);
            const data = await res.json();
            riskChart.data.datasets[0].data = Object.values(data.risk_distribution);
            intentChart.data.datasets[0].data = Object.values(data.intent_categories);
            riskChart.update();
            intentChart.update();
        } catch (e) { console.error("Dashboard Update Error", e); }
    }
});
