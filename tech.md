# **"Blink or Die" 技术实现方案**

**架构:** Chrome Extension Manifest V3

**核心库:** MediaPipe Face Landmarker

**开发耗时预估:** \< 2 Hours

## **1\. 系统架构设计**

由于 Chrome Manifest V3 的安全限制，Content Script 无法直接访问摄像头，Service Worker (Background) 无法访问 DOM (Canvas)。因此必须采用 **Offscreen Document** 架构。

### **1.1 模块划分**

* **Background (Service Worker):** \* 作为指挥中心，负责创建/销毁 Offscreen 文档。  
  * 转发消息（Relay）: Offscreen \-\> Background \-\> Content Script。  
* **Offscreen Document (核心运算):** \* 是一个不可见的 HTML 页面。  
  * 负责：navigator.mediaDevices.getUserMedia 获取视频流。  
  * 负责：运行 MediaPipe 模型，计算 EAR，判断眨眼。  
  * 发送指令：PUNISH 或 RESTORE。  
* **Content Script (表现层):** \* 监听消息。  
  * 操作 DOM，向 \<html\> 或 \<body\> 注入 CSS Class 实现模糊效果。

### **1.2 数据流向图**

graph LR  
    A\[Webcam\] \--\>|视频流| B(Offscreen: MediaPipe)  
    B \--\>|计算 EAR \< 0.2| C{逻辑判断}  
    C \--\>|超过15s未眨眼| D\[Background\]  
    C \--\>|检测到眨眼| D  
    D \--\>|发送消息: PUNISH/RESTORE| E(Content Script)  
    E \--\>|修改 CSS Filter| F\[当前网页\]

## **2\. 核心算法：EAR (Eye Aspect Ratio)**

为了快速判断眨眼，我们使用简单的几何计算，不需要深度学习分类器。

公式:

$$EAR \= \\frac{||p\_2 \- p\_6|| \+ ||p\_3 \- p\_5||}{2 \\times ||p\_1 \- p\_4||}$$

* $p\_1, p\_4$: 眼角的关键点（水平距离）。  
* $p\_2, p\_6, p\_3, p\_5$: 上下眼睑对应的关键点（垂直距离）。

**MediaPipe 关键点索引 (Landmark Index):**

* **左眼:** \[33, 160, 158, 133, 153, 144\] (对应 p1-p6)  
* **右眼:** \[362, 385, 387, 263, 373, 380\]

**阈值设定:**

* BLINK\_THRESHOLD: **0.25** (低于此值视为闭眼)。  
* 为了防抖，可以要求连续检测到 2 帧闭眼才算一次有效眨眼。

## **3\. 目录结构 (File Structure)**

blink-or-die/  
├── manifest.json          // 配置文件 (权限: offscreen, scripting)  
├── icons/                 // 图标  
├── background.js          // SW: 管理 Offscreen 生命周期  
├── content/  
│   ├── content.js         // 接收消息，控制 CSS  
│   └── style.css          // 定义 .blur-vision 类  
├── offscreen/  
│   ├── offscreen.html     // 加载 MediaPipe 的容器  
│   └── offscreen.js       // 视觉算法与倒计时逻辑  
└── lib/  
    └── vision\_bundle.js   // MediaPipe Tasks Vision (下载本地版以加快加载)

## **4\. 关键代码片段**

### **4.1 manifest.json 权限配置**

{  
  "manifest\_version": 3,  
  "permissions": \["offscreen", "scripting", "activeTab"\],  
  "background": { "service\_worker": "background.js" },  
  "content\_scripts": \[{  
    "matches": \["\<all\_urls\>"\],  
    "js": \["content/content.js"\],  
    "css": \["content/style.css"\]  
  }\]  
}

### **4.2 Offscreen 消息发送 (offscreen.js)**

// 简化的循环逻辑  
setInterval(() \=\> {  
  const now \= Date.now();  
    
  // 1\. 检测眨眼  
  const isBlinking \= detectBlink(videoElement);   
    
  if (isBlinking) {  
    lastBlinkTime \= now;  
    if (isPunishing) {  
      chrome.runtime.sendMessage({ type: 'RESTORE\_VISION' });  
      isPunishing \= false;  
    }  
  }

  // 2\. 检查超时  
  if (\!isPunishing && (now \- lastBlinkTime \> 15000)) {  
    chrome.runtime.sendMessage({ type: 'PUNISH\_MODE' });  
    isPunishing \= true;  
  }  
}, 100); // 每100ms检查一次即可，不必每帧都跑，省电

### **4.3 CSS 滤镜 (content/style.css)**

.bod-blur-effect {  
    transition: filter 2s ease-in; /\* 渐变效果 \*/  
    filter: blur(6px) sepia(80%) hue-rotate(-50deg) \!important;  
}

## **5\. 开发注意事项 (2小时冲刺版)**

1. **模型加载:** MediaPipe 的 FaceLandmarker 需要加载 .task 模型文件。为了避免跨域问题和网络延迟，建议将 face\_landmarker.task 文件下载并放在插件目录内，通过 runtime.getURL 加载。  
2. **调试:** Offscreen 文档默认是隐藏的。调试时必须打开 chrome://extensions \-\> 点击 "Inspect views: offscreen document" 才能看到 console.log。  
3. **首次启动:** 用户安装后，第一次打开网页可能需要点击一下页面或浏览器栏图标来初始化 Offscreen（受 Chrome 自动播放策略限制，获取摄像头流可能需要用户交互）。为了 MVP，可以在 Popup 打开时初始化。