// Content Script - 处理视觉惩罚和恢复

let isPunishing = false;
let punishmentTimeout;

// 初始化
function init() {
    console.log('Blink or Die Content Script 已加载');
    
    // 监听来自Background的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('Content Script 收到消息:', request.type);
        
        switch (request.type) {
            case 'PUNISH_MODE':
                applyPunishment();
                break;
                
            case 'RESTORE_VISION':
                restoreVision();
                break;
            case 'BLINK_DETECTED':
                window.postMessage({ source: 'blink-or-die', type: 'BOD_BLINK_DETECTED' }, '*');
                break;
            case 'DETECTION_STARTED':
                window.postMessage({ source: 'blink-or-die', type: 'BOD_DETECTION_STARTED' }, '*');
                break;
            case 'DETECTION_STOPPED':
                window.postMessage({ source: 'blink-or-die', type: 'BOD_DETECTION_STOPPED' }, '*');
                break;
            case 'DETECTION_ERROR':
                window.postMessage({ source: 'blink-or-die', type: 'BOD_ERROR', payload: request.payload }, '*');
                break;
        }
        
        return true;
    });
    
    // 添加CSS类到页面
    addPunishmentStyles();

    window.addEventListener('message', (event) => {
        const d = event.data;
        if (!d) return;
        if (d.source === 'test-page' && d.type === 'BOD_PING') {
            window.postMessage({ source: 'blink-or-die', type: 'BOD_PONG' }, '*');
        } else if (d.source === 'test-page' && d.type === 'BOD_START_DETECTION') {
            chrome.runtime.sendMessage({ type: 'START_DETECTION' });
        } else if (d.source === 'test-page' && d.type === 'BOD_STOP_DETECTION') {
            chrome.runtime.sendMessage({ type: 'STOP_DETECTION' });
        } else if (d.source === 'test-page' && d.type === 'BOD_REQUEST_PERMISSION') {
            chrome.runtime.sendMessage({ type: 'REQUEST_PERMISSION' });
        }
    });
}

// 应用视觉惩罚
function applyPunishment() {
    if (isPunishing) return;
    
    isPunishing = true;
    
    // 向body添加惩罚类
    document.body.classList.add('bod-punishment-mode');
    
    // 创建视觉提示
    createVisualWarning();
    
    console.log('视觉惩罚已应用');
}

// 恢复视力
function restoreVision() {
    if (!isPunishing) return;
    
    isPunishing = false;
    
    // 移除惩罚类
    document.body.classList.remove('bod-punishment-mode');
    
    // 移除视觉提示
    removeVisualWarning();
    
    // 清除超时
    if (punishmentTimeout) {
        clearTimeout(punishmentTimeout);
        punishmentTimeout = null;
    }
    
    console.log('视力已恢复');
}

// 添加惩罚样式
function addPunishmentStyles() {
    // 检查是否已存在样式
    if (document.getElementById('bod-punishment-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'bod-punishment-styles';
    style.textContent = `
        .bod-punishment-mode {
            filter: blur(6px) sepia(80%) hue-rotate(-50deg) brightness(0.7) !important;
            transition: filter 2s ease-in-out !important;
            pointer-events: none !important;
            user-select: none !important;
        }
        
        .bod-punishment-mode * {
            pointer-events: none !important;
            user-select: none !important;
        }
        
        .bod-warning-overlay {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(255, 0, 0, 0.1) !important;
            z-index: 999999 !important;
            pointer-events: none !important;
            animation: bod-warning-pulse 2s ease-in-out infinite !important;
        }
        
        @keyframes bod-warning-pulse {
            0%, 100% { opacity: 0.1; }
            50% { opacity: 0.3; }
        }
        
        .bod-blink-reminder {
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            background: rgba(255, 0, 0, 0.9) !important;
            color: white !important;
            padding: 15px 20px !important;
            border-radius: 8px !important;
            font-family: Arial, sans-serif !important;
            font-size: 16px !important;
            font-weight: bold !important;
            z-index: 1000000 !important;
            animation: bod-reminder-bounce 1s ease-in-out infinite !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
        }
        
        @keyframes bod-reminder-bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
        }
    `;
    
    document.head.appendChild(style);
}

// 创建视觉警告
function createVisualWarning() {
    // 创建红色覆盖层
    const overlay = document.createElement('div');
    overlay.className = 'bod-warning-overlay';
    overlay.id = 'bod-warning-overlay';
    document.body.appendChild(overlay);
    
    // 创建眨眼提醒
    const reminder = document.createElement('div');
    reminder.className = 'bod-blink-reminder';
    reminder.id = 'bod-blink-reminder';
    reminder.textContent = '👁️ 请眨眼！否则无法看清屏幕';
    document.body.appendChild(reminder);
    
    // 播放警告音效（可选）
    playWarningSound();
}

// 移除视觉警告
function removeVisualWarning() {
    const overlay = document.getElementById('bod-warning-overlay');
    const reminder = document.getElementById('bod-blink-reminder');
    
    if (overlay) overlay.remove();
    if (reminder) reminder.remove();
}

// 播放警告音效
function playWarningSound() {
    try {
        // 创建简单的警告音
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
        
        console.log('警告音已播放');
    } catch (error) {
        console.log('无法播放警告音:', error);
    }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
