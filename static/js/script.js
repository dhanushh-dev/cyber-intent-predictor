document.addEventListener('DOMContentLoaded', () => {
    // Step Sections
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const step4 = document.getElementById('step4');
    const step5 = document.getElementById('step5');

    // UI Controls
    const fetchEmailsBtn = document.getElementById('fetchEmailsBtn');
    const emailList = document.getElementById('emailList');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const progressFill = document.getElementById('progressFill');

    // Inputs
    const usernameInput = document.getElementById('username');
    const loginAttemptsInput = document.getElementById('loginAttempts');
    const pagesAccessedInput = document.getElementById('pagesAccessed');
    const actionsInput = document.getElementById('actions');
    const timeOfDayInput = document.getElementById('timeOfDay');

    // Results Info
    const resUser = document.getElementById('resUser');
    const resIntent = document.getElementById('resIntent');
    const resRisk = document.getElementById('resRisk');
    const resConfidence = document.getElementById('resConfidence');
    const resExplanation = document.getElementById('resExplanation');
    const resSuggestion = document.getElementById('resSuggestion');
    const riskIndicator = document.getElementById('riskIndicator');
    const speakBtn = document.getElementById('speakBtn');

    let riskChart, intentChart, timelineChart;

    // STEP 1 -> STEP 2 Logic
    fetchEmailsBtn.addEventListener('click', async () => {
        fetchEmailsBtn.disabled = true;
        fetchEmailsBtn.innerHTML = '🛡️ SYNCING INTEL...';
        
        try {
            const response = await fetch('/fetch_emails');
            const emails = await response.json();
            
            if (emails.error) throw new Error(emails.error);

            renderEmailFocus(emails);
            
            // Show Step 2
            step2.classList.remove('hidden');
            step2.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.error('Fetch Alert:', error);
            alert('Intelligence Source Unavailable. Check credentials.');
            fetchEmailsBtn.innerHTML = '📥 Fetch Security Emails';
            fetchEmailsBtn.disabled = false;
        }
    });

    function renderEmailFocus(emails) {
        emailList.innerHTML = '';
        if (emails.length === 0) {
            emailList.innerHTML = '<div class="card"><p style="text-align:center;">No high-priority security alerts found in session.</p></div>';
            return;
        }

        emails.forEach(email => {
            const card = document.createElement('div');
            card.className = 'email-item';
            card.innerHTML = `
                <span class="sender">FROM: ${email.sender.split(' ')[0]}</span>
                <h4>🚨 ${email.subject}</h4>
                <p>${email.body.substring(0, 150)}...</p>
            `;
            
            card.addEventListener('click', () => {
                // Remove active from others
                document.querySelectorAll('.email-item').forEach(el => el.classList.remove('active'));
                card.classList.add('active');

                // STEP 3 Expand & Populate
                autoPopulate(email);
                step3.classList.remove('collapsed');
                step3.classList.add('expanded');
                
                setTimeout(() => {
                    step3.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            });
            emailList.appendChild(card);
        });
    }

    function autoPopulate(email) {
        usernameInput.value = email.sender.match(/<(.+)>/)?.[1] || email.sender.split(' ')[0];
        actionsInput.value = `INTEL_REPORT: ${email.subject}\n\nCONTENT: ${email.body}`;
        
        // Mocking some session data for better demo effect
        loginAttemptsInput.value = email.subject.toLowerCase().includes('failed') ? 8 : 1;
        pagesAccessedInput.value = Math.floor(Math.random() * 40) + 5;
    }

    // STEP 3 -> STEP 4 -> STEP 5 Logic
    analyzeBtn.addEventListener('click', async () => {
        // Prepare Step 4
        step4.classList.remove('hidden');
        step4.scrollIntoView({ behavior: 'smooth' });
        
        // Progress bar simulation
        let width = 0;
        const interval = setInterval(() => {
            if (width >= 100) clearInterval(interval);
            else {
                width += 2;
                progressFill.style.width = width + '%';
            }
        }, 30);

        const payload = {
            username: usernameInput.value || 'unknown_node',
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

            // Populate Step 5
            resUser.textContent = data.user;
            resIntent.textContent = data.intent;
            resConfidence.textContent = `${data.confidence}%`;
            resExplanation.textContent = data.explanation;
            resSuggestion.textContent = data.suggestion;
            resRisk.textContent = data.risk_level;

            // Indicator Styles
            resRisk.className = 'risk-text';
            if (data.risk_level === 'High') {
                resRisk.classList.add('risk-high');
                riskIndicator.style.background = 'var(--danger)';
            } else if (data.risk_level === 'Medium') {
                resRisk.classList.add('risk-medium');
                riskIndicator.style.background = 'var(--warning)';
            } else {
                resRisk.classList.add('risk-low');
                riskIndicator.style.background = 'var(--success)';
            }

            // Move to Step 5
            setTimeout(() => {
                step4.classList.add('hidden');
                step5.classList.remove('hidden');
                step5.scrollIntoView({ behavior: 'smooth' });
                
                // Dashboard Update
                syncDashboard();
                
                // Voice Briefing
                speakIntel(data);
            }, 2500); // 2.5s for "Analysis" experience

        } catch (error) {
            console.error('Analysis Fault:', error);
            alert('Analysis Engine Offline.');
            step4.classList.add('hidden');
        }
    });

    function speakIntel(data) {
        const synth = window.speechSynthesis;
        const msg = new SpeechSynthesisUtterance(`Warning. Node ${data.user} shows ${data.risk_level} risk behavior. Intent identified as ${data.intent}. Protocol requested: ${data.suggestion}`);
        msg.rate = 0.9;
        msg.pitch = 0.8;
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

    // Charting Dashboard
    async function initDashboard() {
        const res = await fetch('/analytics');
        const data = await res.json();

        // Standard Bar Chart
        const ctxRisk = document.getElementById('riskChart').getContext('2d');
        riskChart = new Chart(ctxRisk, {
            type: 'bar',
            data: {
                labels: Object.keys(data.risk_distribution),
                datasets: [{
                    data: Object.values(data.risk_distribution),
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                    borderRadius: 10
                }]
            },
            options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } } } }
        });

        // Intent Pie
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

        // Evolution Line
        const ctxTimeline = document.getElementById('timelineChart').getContext('2d');
        timelineChart = new Chart(ctxTimeline, {
            type: 'line',
            data: {
                labels: ['01', '02', '03', '04', '05', '06', '07'],
                datasets: [{
                    data: data.timeline,
                    borderColor: '#00f2fe',
                    tension: 0.4,
                    fill: true,
                    backgroundColor: 'rgba(0, 242, 254, 0.05)'
                }]
            },
            options: { plugins: { legend: { display: false } }, scales: { y: { display: false } } }
        });
    }

    async function syncDashboard() {
        const res = await fetch('/analytics');
        const data = await res.json();
        riskChart.data.datasets[0].data = Object.values(data.risk_distribution);
        intentChart.data.datasets[0].data = Object.values(data.intent_categories);
        riskChart.update();
        intentChart.update();
    }

    // Initial Dashboard Load
    initDashboard();
});
