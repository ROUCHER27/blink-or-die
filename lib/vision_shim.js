import * as visionModule from './vision_bundle.js';

// 将ESM导出的API挂载到window，供非模块脚本使用
window.vision = visionModule;

// 可选：初始化SIMD支持探测所需的文件路径前缀（由FilesetResolver使用）
// 不在此处做更多初始化，具体初始化放在 offscreen.js 中