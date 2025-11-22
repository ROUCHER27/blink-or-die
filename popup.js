// Popup JavaScript - 扩展弹窗控制

let isDetecting = false;
let lastBlinkTime = null;
let isPunishing = false;
let permissionMode = false;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    // 绑定按钮事件
    document.getElementById('start-btn').addEventListener('click', startDetection);
    document.getElementById('stop-btn').addEventListener('click', stopDetection);
    
    // 获取当前状态
    updateStatus();
    
    // 定期更新状态
    setInterval(updateStatus, 1000);

    try {
        chrome.storage.session.get(['shouldDetect'], (res) => {
            isDetecting = !!(res && res.shouldDetect);
            updateUI();
            updateStatus();
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'session' && changes.shouldDetect) {
                isDetecting = !!changes.shouldDetect.newValue;
                updateUI();
                updateStatus();
            }
        });
    } catch (e) {}

    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'permission') {
        permissionMode = true;
        requestCameraAccess().then(() => {
            chrome.runtime.sendMessage({ type: 'PERMISSION_GRANTED' });
            try { window.close(); } catch (e) {}
        }).catch((err) => {
            console.error('权限请求失败:', err);
            alert('需要授予摄像头权限，请选择允许');
        });
    }
});

// 开始检测
async function startDetection() {
    try {
        await requestCameraAccess();
        chrome.runtime.sendMessage({ type: 'PERMISSION_GRANTED' });
        console.log('[Popup] 已通知后台权限授予');
        chrome.runtime.sendMessage({ type: 'START_DETECTION' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('发送消息失败:', chrome.runtime.lastError);
                return;
            }
            
            isDetecting = true;
            updateUI();
            updateStatus();
        });
        
    } catch (error) {
        console.error('开始检测失败:', error);
        alert('开始检测失败，请确保已授权摄像头权限');
    }
}

// 停止检测
function stopDetection() {
    try {
        // 向background发送停止检测的消息
        chrome.runtime.sendMessage({ type: 'STOP_DETECTION' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('发送消息失败:', chrome.runtime.lastError);
                return;
            }
            
            isDetecting = false;
            updateUI();
            updateStatus();
        });
        
    } catch (error) {
        console.error('停止检测失败:', error);
    }
}

async function requestCameraAccess() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop());
        console.log('[Popup] 摄像头权限已授予');
        return true;
    } catch (e) {
        console.warn('[Popup] 摄像头权限请求被拒绝或关闭', e);
        throw e;
    }
}

// 更新UI状态
function updateUI() {
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    if (isDetecting) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

// 更新状态显示
function updateStatus() {
    // 更新检测状态
    document.getElementById('detection-status').textContent = isDetecting ? '运行中' : '已停止';
    
    // 更新惩罚状态
    document.getElementById('punishment-status').textContent = isPunishing ? '惩罚模式' : '正常';
    
    // 更新上次眨眼时间
    if (lastBlinkTime) {
        const timeDiff = Date.now() - lastBlinkTime;
        const seconds = Math.floor(timeDiff / 1000);
        if (seconds < 60) {
            document.getElementById('last-blink-time').textContent = `${seconds}秒前`;
        } else {
            const minutes = Math.floor(seconds / 60);
            document.getElementById('last-blink-time').textContent = `${minutes}分钟前`;
        }
    } else {
        document.getElementById('last-blink-time').textContent = '未检测';
    }
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case 'BLINK_DETECTED':
            lastBlinkTime = Date.now();
            updateStatus();
            break;
            
        case 'PUNISH_MODE':
            isPunishing = true;
            updateStatus();
            break;
            
        case 'RESTORE_VISION':
            isPunishing = false;
            updateStatus();
            break;

        case 'DETECTION_STARTED':
            isDetecting = true;
            updateUI();
            updateStatus();
            break;

        case 'DETECTION_STOPPED':
            isDetecting = false;
            updateUI();
            updateStatus();
            break;
    }
});

// 获取当前状态（从storage或background）
function getCurrentStatus() {
    // 这里可以添加从storage获取状态的功能
    // 简化版本，直接返回当前状态
    return {
        isDetecting: isDetecting,
        lastBlinkTime: lastBlinkTime,
        isPunishing: isPunishing
    };
}