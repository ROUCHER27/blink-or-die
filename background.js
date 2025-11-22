// Background Service Worker - 管理Offscreen文档生命周期
let offscreenDocument = null;
let offscreenReady = false;
let detectionBlocked = false;
let permissionWindowId = null;
const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';

// 创建Offscreen文档
async function createOffscreenDocument() {
  if (offscreenDocument) {
    return offscreenDocument;
  }
  
  try {
    // 检查是否已存在Offscreen文档
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });
    
    if (existingContexts.length > 0) {
      offscreenDocument = existingContexts[0];
      return offscreenDocument;
    }
    
    // 创建新的Offscreen文档
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['USER_MEDIA'],
      justification: 'Access camera for blink detection'
    });
    
    console.log('Offscreen document created');
    return true;
  } catch (error) {
    console.error('Failed to create offscreen document:', error);
    return false;
  }
}

async function waitForOffscreenReady(maxWaitMs = 2000, intervalMs = 100) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (offscreenReady) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return offscreenReady;
}

// 关闭Offscreen文档
async function closeOffscreenDocument() {
  if (!offscreenDocument) return;
  
  try {
    await chrome.offscreen.closeDocument();
    offscreenDocument = null;
    console.log('Offscreen document closed');
  } catch (error) {
    console.error('Failed to close offscreen document:', error);
  }
}

// 初始化扩展
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Blink or Die extension installed');
  await createOffscreenDocument();
});

// 监听来自Offscreen和Content Script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.type);
  if (request && request.from === 'background_broadcast') {
    return true;
  }
  
  switch (request.type) {
    case 'OFFSCREEN_READY':
      offscreenReady = true;
      console.log('[Background] 收到 OFFSCREEN_READY');
      break;
    case 'PUNISH_MODE':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (tab && tab.id) {
          try {
            chrome.scripting.insertCSS({
              target: { tabId: tab.id },
              files: ['content/style.css']
            }).catch(() => {});
          } catch (e) {}
          chrome.tabs.sendMessage(tab.id, { type: 'PUNISH_MODE' }).catch(() => {});
        }
      });
      try { chrome.runtime.sendMessage({ type: 'PUNISH_MODE', from: 'background_broadcast' }); } catch (e) {}
      break;
      
    case 'RESTORE_VISION':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'RESTORE_VISION' }).catch(() => {});
        }
      });
      try { chrome.runtime.sendMessage({ type: 'RESTORE_VISION', from: 'background_broadcast' }); } catch (e) {}
      break;

    case 'BLINK_DETECTED':
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'BLINK_DETECTED' }).catch(() => {});
          }
        });
      });
      try { chrome.runtime.sendMessage({ type: 'BLINK_DETECTED', from: 'background_broadcast' }); } catch (e) {}
      break;
      
    case 'START_DETECTION':
      try { chrome.storage.session.set({ shouldDetect: true }); } catch (e) {}
      if (detectionBlocked) {
        console.warn('[Background] 检测被权限阻止，忽略 START_DETECTION');
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, { type: 'DETECTION_ERROR', payload: { name: 'NotAllowedError', message: '摄像头权限被拒绝，请在浏览器设置中允许摄像头访问' } }).catch(() => {});
            }
          });
        });
        try { chrome.runtime.sendMessage({ type: 'DETECTION_ERROR', payload: { name: 'NotAllowedError', message: '摄像头权限被拒绝，请在浏览器设置中允许摄像头访问' }, from: 'background_broadcast' }); } catch (e) {}
        break;
      }
      createOffscreenDocument().then(async success => {
        if (success) {
          const ready = await waitForOffscreenReady(3000, 100);
          if (ready) {
            console.log('[Background] Offscreen 就绪，发送 START_DETECTION');
            chrome.runtime.sendMessage({ type: 'START_DETECTION' }).catch((e) => {
              console.warn('[Background] 发送 START_DETECTION 失败', e);
            });
          } else {
            console.warn('[Background] Offscreen 未就绪，直接尝试发送 START_DETECTION');
            chrome.runtime.sendMessage({ type: 'START_DETECTION' }).catch((e) => {
              console.warn('[Background] 发送失败', e);
            });
          }
          try { sendResponse({ ok: true }); } catch (e) {}
        } else {
          console.error('[Background] 创建 Offscreen 失败，无法启动检测');
          try { sendResponse({ ok: false, error: 'create_offscreen_failed' }); } catch (e) {}
        }
      });
      break;
      
    case 'STOP_DETECTION':
      // 停止眨眼检测
      try { chrome.storage.session.set({ shouldDetect: false }); } catch (e) {}
      closeOffscreenDocument();
      try { sendResponse({ ok: true }); } catch (e) {}
      break;

    case 'REQUEST_PERMISSION':
      if (permissionWindowId) {
        console.log('[Background] 权限窗口已打开');
        break;
      }
      const url = chrome.runtime.getURL('popup.html?mode=permission');
      chrome.windows.create({ url, type: 'popup', width: 360, height: 520 }, (win) => {
        permissionWindowId = win.id || null;
        console.log('[Background] 打开权限窗口');
      });
      break;

    case 'PERMISSION_GRANTED':
      detectionBlocked = false;
      console.log('[Background] 权限已授予，解除阻止标记');
      if (permissionWindowId) {
        try { chrome.windows.remove(permissionWindowId); } catch (e) {}
        permissionWindowId = null;
      }
      chrome.runtime.sendMessage({ type: 'START_DETECTION' }).catch(() => {});
      break;

    case 'DETECTION_STARTED':
      try { chrome.storage.session.set({ shouldDetect: true }); } catch (e) {}
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'DETECTION_STARTED' }).catch(() => {});
          }
        });
      });
      try { chrome.runtime.sendMessage({ type: 'DETECTION_STARTED', from: 'background_broadcast' }); } catch (e) {}
      break;

    case 'DETECTION_STOPPED':
      try { chrome.storage.session.set({ shouldDetect: false }); } catch (e) {}
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'DETECTION_STOPPED' }).catch(() => {});
          }
        });
      });
      try { chrome.runtime.sendMessage({ type: 'DETECTION_STOPPED', from: 'background_broadcast' }); } catch (e) {}
      break;

    case 'DETECTION_ERROR':
      if (request.payload && request.payload.name === 'NotAllowedError') {
        detectionBlocked = true;
        console.warn('[Background] 检测被用户拒绝，设置阻止标记');
      }
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'DETECTION_ERROR', payload: request.payload }).catch(() => {});
          }
        });
      });
      try { chrome.runtime.sendMessage({ type: 'DETECTION_ERROR', payload: request.payload, from: 'background_broadcast' }); } catch (e) {}
      break;
  }
  
  return true; // 保持消息通道开放
});

// 扩展启动时创建Offscreen文档
chrome.runtime.onStartup.addListener(async () => {
  await createOffscreenDocument();
});