#!/bin/bash

# Blink or Die - 依赖下载脚本
# 下载MediaPipe Tasks Vision库到本地

echo "正在下载MediaPipe Tasks Vision库..."

# 创建lib目录
mkdir -p lib

# 下载MediaPipe Tasks Vision bundle
MEDIAPIPE_URL="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js"
OUTPUT_FILE="lib/vision_bundle.js"

echo "从CDN下载: $MEDIAPIPE_URL"

# 使用curl下载
if command -v curl &> /dev/null; then
    curl -L "$MEDIAPIPE_URL" -o "$OUTPUT_FILE"
    echo "✅ 下载完成: $OUTPUT_FILE"
# 或者使用wget
elif command -v wget &> /dev/null; then
    wget -O "$OUTPUT_FILE" "$MEDIAPIPE_URL"
    echo "✅ 下载完成: $OUTPUT_FILE"
else
    echo "❌ 错误: 需要安装curl或wget来下载依赖"
    echo "请手动下载: $MEDIAPIPE_URL"
    echo "并保存为: $OUTPUT_FILE"
    exit 1
fi

# 验证文件大小
if [ -f "$OUTPUT_FILE" ]; then
    FILE_SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE" 2>/dev/null || echo "未知")
    echo "文件大小: $FILE_SIZE 字节"
    
    if [ "$FILE_SIZE" -lt 1000 ]; then
        echo "⚠️ 警告: 文件大小异常，可能下载失败"
        echo "建议手动下载并替换文件"
    fi
else
    echo "❌ 错误: 文件下载失败"
    exit 1
fi

echo ""
echo "📦 依赖下载完成！"
echo "下一步："
echo "1. 打开Chrome浏览器"
echo "2. 访问 chrome://extensions/"
echo "3. 开启开发者模式"
echo "4. 点击'加载已解压的扩展程序'"
echo "5. 选择当前目录"
echo ""
echo "🚀 开始使用Blink or Die保护你的视力！"