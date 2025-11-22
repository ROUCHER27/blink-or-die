// Offscreen JavaScript - 眨眼检测和倒计时逻辑

let videoElement;
let faceLandmarker;
let filesetResolver;
let lastBlinkTime = Date.now();
let isPunishing = false;
let isDetecting = false;
let detectionInterval;

// EAR计算参数
const BLINK_THRESHOLD = 0.3;
const EAR_CONSECUTIVE_FRAMES = 1;
let earConsecutiveCounter = 0;

// MediaPipe配置（本地模型与wasm）
const MP_OPTIONS = {
    baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'CPU'
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false
};

// 初始化
async function init() {
    videoElement = document.getElementById('video');
    
    // 绑定按钮事件
    document.getElementById('startBtn').addEventListener('click', startDetection);
    document.getElementById('stopBtn').addEventListener('click', stopDetection);
    
    // 监听来自background的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'START_DETECTION') {
            startDetection();
        } else if (request.type === 'STOP_DETECTION') {
            stopDetection();
        }
    });
    
    updateStatus('初始化完成，等待启动检测...');
    try {
        chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });
        console.log('[Offscreen] 已发送 OFFSCREEN_READY');
    } catch (e) {
        console.warn('[Offscreen] 发送 OFFSCREEN_READY 失败', e);
    }
    try {
        chrome.storage.session.get(['shouldDetect'], (res) => {
            if (res && res.shouldDetect) {
                startDetection();
            }
        });
    } catch (e) {}
}

// 开始检测
async function startDetection() {
    if (isDetecting) return;
    
    try {
        // 获取摄像头权限
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: 640, 
                height: 480,
                facingMode: 'user' // 使用前置摄像头
            } 
        });
        videoElement.srcObject = stream;
        
        // 等待视频加载
        await new Promise(resolve => {
            videoElement.onloadedmetadata = () => {
                console.log('视频流已加载');
                resolve();
            };
        });
        try {
            await videoElement.play();
        } catch (e) {
            console.warn('视频播放启动失败，尝试静音自动播放', e);
            videoElement.muted = true;
            await videoElement.play().catch(() => {});
        }
        if (videoElement.videoWidth && videoElement.videoHeight) {
            videoElement.width = videoElement.videoWidth;
            videoElement.height = videoElement.videoHeight;
        }
        
        // 初始化MediaPipe
        await initMediaPipe();
        
        isDetecting = true;
        lastBlinkTime = Date.now();
        
        // 更新UI
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        updateStatus('检测中...');
        
        // 开始检测循环
        detectionInterval = setInterval(detectBlink, 100);
        
        console.log('眨眼检测已启动');
        try {
            chrome.runtime.sendMessage({ type: 'DETECTION_STARTED' });
            console.log('[Offscreen] 已上报 DETECTION_STARTED');
        } catch (e) {
            console.warn('[Offscreen] 上报 DETECTION_STARTED 失败', e);
        }
        
    } catch (error) {
        console.error('启动检测失败:', error);
        let errorMessage = error.message;
        
        if (error.name === 'NotAllowedError') {
            errorMessage = '摄像头权限被拒绝，请在浏览器设置中允许摄像头访问';
        } else if (error.name === 'NotFoundError') {
            errorMessage = '未找到摄像头设备，请确保摄像头已连接';
        } else if (error.name === 'NotReadableError') {
            errorMessage = '摄像头被其他程序占用，请关闭其他使用摄像头的应用';
        }
        
        updateStatus(`启动失败: ${errorMessage}`);
        try {
            chrome.runtime.sendMessage({ type: 'DETECTION_ERROR', payload: { name: error.name, message: errorMessage } });
            console.log('[Offscreen] 已上报 DETECTION_ERROR', error.name, errorMessage);
        } catch (e) {
            console.warn('[Offscreen] 上报 DETECTION_ERROR 失败', e);
        }
    }
}

// 停止检测
function stopDetection() {
    if (!isDetecting) return;
    
    isDetecting = false;
    clearInterval(detectionInterval);
    
    // 停止视频流
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
    }
    
    // 更新UI
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    updateStatus('检测已停止');
    
    // 发送恢复消息
    if (isPunishing) {
        chrome.runtime.sendMessage({ type: 'RESTORE_VISION' });
        isPunishing = false;
    }
    try {
        chrome.runtime.sendMessage({ type: 'DETECTION_STOPPED' });
        console.log('[Offscreen] 已上报 DETECTION_STOPPED');
    } catch (e) {
        console.warn('[Offscreen] 上报 DETECTION_STOPPED 失败', e);
    }
}

// 初始化MediaPipe（本地文件）
async function initMediaPipe() {
    try {
        const { vision } = window;
        const { FaceLandmarker, FilesetResolver } = vision;
        // 指定lib目录作为wasm与相关资源路径
        const wasmRoot = chrome.runtime.getURL('lib');
        console.log('[Offscreen] 初始化 MediaPipe，wasm root:', wasmRoot);
        filesetResolver = await FilesetResolver.forVisionTasks(wasmRoot);
        console.log('[Offscreen] FilesetResolver 就绪');
        faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, MP_OPTIONS);
        console.log('MediaPipe FaceLandmarker 初始化成功');
    } catch (error) {
        console.error('MediaPipe初始化失败:', error);
        const detail = error && error.message ? error.message : String(error);
        throw new Error('MediaPipe初始化失败: ' + detail);
    }
}

// 检测眨眼
function detectBlink() {
    if (!isDetecting || !faceLandmarker || !videoElement.videoWidth) return;
    if (videoElement.readyState < 2) return;
    
    try {
        // 检测面部关键点
        const results = faceLandmarker.detectForVideo(videoElement, performance.now());
        
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const faceLandmarks = results.faceLandmarks[0];
            
            // 计算EAR (Eye Aspect Ratio)
            const leftEAR = calculateEAR(faceLandmarks, true);
            const rightEAR = calculateEAR(faceLandmarks, false);
            const ear = (leftEAR + rightEAR) / 2;
            
            // 更新调试信息
            updateDebugInfo(ear);
            
            // 检测眨眼
            if (ear < BLINK_THRESHOLD) {
                earConsecutiveCounter++;
                if (earConsecutiveCounter >= EAR_CONSECUTIVE_FRAMES) {
                    handleBlink();
                    earConsecutiveCounter = 0;
                }
            } else {
                earConsecutiveCounter = 0;
            }
            
            // 检查是否需要惩罚
            checkPunishment();
        } else {
            // 没有检测到面部
            updateDebugInfo(0);
        }
        
    } catch (error) {
        console.error('检测过程中出错:', error);
    }
}

// 计算EAR (Eye Aspect Ratio)
function calculateEAR(landmarks, isLeftEye) {
    // MediaPipe关键点索引
    const leftEyeIndices = [33, 160, 158, 133, 153, 144];
    const rightEyeIndices = [362, 385, 387, 263, 373, 380];
    
    const indices = isLeftEye ? leftEyeIndices : rightEyeIndices;
    
    // 获取6个关键点的坐标
    const p1 = landmarks[indices[0]];
    const p2 = landmarks[indices[1]];
    const p3 = landmarks[indices[2]];
    const p4 = landmarks[indices[3]];
    const p5 = landmarks[indices[4]];
    const p6 = landmarks[indices[5]];
    
    // 计算垂直距离
    const vertical1 = Math.sqrt(Math.pow(p2.x - p6.x, 2) + Math.pow(p2.y - p6.y, 2));
    const vertical2 = Math.sqrt(Math.pow(p3.x - p5.x, 2) + Math.pow(p3.y - p5.y, 2));
    
    // 计算水平距离
    const horizontal = Math.sqrt(Math.pow(p1.x - p4.x, 2) + Math.pow(p1.y - p4.y, 2));
    
    // EAR公式
    return (vertical1 + vertical2) / (2 * horizontal);
}

// 处理眨眼事件
function handleBlink() {
    const now = Date.now();
    lastBlinkTime = now;
    
    // 如果在惩罚模式下检测到眨眼，恢复视力
    if (isPunishing) {
        chrome.runtime.sendMessage({ type: 'RESTORE_VISION' });
        isPunishing = false;
        updateCurrentState('恢复正常');
    }
    
    console.log('检测到眨眼');
    chrome.runtime.sendMessage({ type: 'BLINK_DETECTED' });
}

// 检查是否需要惩罚
function checkPunishment() {
    const now = Date.now();
    const timeSinceLastBlink = now - lastBlinkTime;
    
    // 更新倒计时显示
    const countdown = Math.max(0, 8 - Math.floor(timeSinceLastBlink / 1000));
    document.getElementById('countdown').textContent = countdown.toFixed(1);
    
    // 如果超过8秒没有眨眼，进入惩罚模式
    if (timeSinceLastBlink > 8000 && !isPunishing) {
        chrome.runtime.sendMessage({ type: 'PUNISH_MODE' });
        isPunishing = true;
        updateCurrentState('惩罚模式');
        console.log('进入惩罚模式');
    }
}

// 更新状态显示
function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

// 更新调试信息
function updateDebugInfo(ear) {
    document.getElementById('ear-value').textContent = ear.toFixed(3);
    
    const timeSinceLastBlink = Date.now() - lastBlinkTime;
    const lastBlinkText = timeSinceLastBlink > 60000 
        ? `${(timeSinceLastBlink / 60000).toFixed(1)}分钟前`
        : `${(timeSinceLastBlink / 1000).toFixed(1)}秒前`;
    document.getElementById('last-blink').textContent = lastBlinkText;
}

// 更新当前状态
function updateCurrentState(state) {
    document.getElementById('current-state').textContent = state;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);